/* =========================================================
   LÓGICA DEL PANEL DEL SASTRE — no toques nada aquí 🪡
   Aquí entran el modista principal Y los asistentes.
   ========================================================= */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, onSnapshot, updateDoc, getDoc,
  serverTimestamp, query, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (sel) => document.querySelector(sel);

const CONF = {
  monedas: [
    { nombre: "Cobre", emoji: "🥉", equivale: 1 },
    { nombre: "Plata", emoji: "🥈", equivale: 50 },
    { nombre: "Oro", emoji: "🥇", equivale: 50 },
    { nombre: "Diamante", emoji: "💎", equivale: 50 }
  ]
};

const conf = (typeof TIENDA !== "undefined" && TIENDA && TIENDA.firebase) ? TIENDA.firebase : null;
const firebaseListo = !!conf && !String(conf.apiKey || "").includes("PEGA_AQUÍ");

const app = firebaseListo ? initializeApp(conf) : null;
const auth = firebaseListo ? getAuth(app) : null;
const db = firebaseListo ? getFirestore(app) : null;

let primeraCarga = true;
let cancelarPedidos = null;
let audioCtx = null;
let configCargada = false;
let MONEDAS = [];

function esAsistente(usuario) {
  return !!(usuario && usuario.email && usuario.email.toLowerCase().includes("@asistentes"));
}

function toast(texto) {
  const caja = $("#toasts");
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = texto;
  caja.appendChild(t);
  setTimeout(() => t.remove(), 4200);
}

/* ---------- monedas (para las estadísticas) ---------- */
function valorAbsolutoMonedas() {
  const lista = CONF.monedas || [];
  const salida = [];
  let abs = 1;
  lista.forEach((m, i) => {
    if (i > 0) abs = abs * (Number(m.equivale) || 1);
    salida.push({ nombre: m.nombre, absoluto: abs });
  });
  return salida;
}
function desglose(total) {
  let resto = Math.max(0, Math.round(total));
  const partes = [];
  for (let i = MONEDAS.length - 1; i >= 0; i--) {
    const cant = Math.floor(resto / MONEDAS[i].absoluto);
    if (cant > 0) { partes.push(`${cant} ${MONEDAS[i].nombre}`); resto -= cant * MONEDAS[i].absoluto; }
  }
  if (!partes.length && MONEDAS.length) partes.push(`0 ${MONEDAS[0].nombre}`);
  return partes;
}
function textoMonedas(total) {
  const partes = desglose(total);
  if (partes.length === 1) return partes[0];
  return partes.slice(0, -1).join(", ") + " y " + partes[partes.length - 1];
}

/* ---------- login ---------- */
if (!firebaseListo) {
  const err = $("#login-error");
  if (err) {
    err.hidden = false;
    err.textContent = "⚠️ Falta conectar Firebase: completa config.js con los datos de tu proyecto.";
  }
} else {
  $("#form-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const correo = $("#login-correo").value.trim();
    const clave = $("#login-clave").value;
    const err = $("#login-error");
    err.hidden = true;
    if (!audioCtx) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e2) {} }
    try {
      await signInWithEmailAndPassword(auth, correo, clave);
    } catch (e2) {
      err.textContent = traducirError(e2 && e2.code);
      err.hidden = false;
    }
  });

  onAuthStateChanged(auth, async (usuario) => {
    const enlaceEditor = document.getElementById("enlace-editor");
    if (usuario) {
      await cargarConfig();
      $("#seccion-login").hidden = true;
      $("#seccion-panel").hidden = false;
      if (enlaceEditor) enlaceEditor.hidden = esAsistente(usuario);
      escucharPedidos();
    } else {
      $("#seccion-login").hidden = false;
      $("#seccion-panel").hidden = true;
      if (enlaceEditor) enlaceEditor.hidden = false;
      if (cancelarPedidos) { cancelarPedidos(); cancelarPedidos = null; }
      primeraCarga = true;
    }
  });

  $("#boton-salir").addEventListener("click", async () => {
    try { await signOut(auth); toast("Has salido del atelier 🚪"); } catch (e) {}
  });
}

async function cargarConfig() {
  if (configCargada) return;
  configCargada = true;
  try {
    const snap = await getDoc(doc(db, "configuracion", "tienda"));
    if (snap.exists() && snap.data().monedas && snap.data().monedas.length) {
      CONF.monedas = snap.data().monedas;
    }
  } catch (e) {}
  MONEDAS = valorAbsolutoMonedas();
}

function traducirError(codigo) {
  if (!codigo) return "Error desconocido 😿";
  if (codigo.includes("invalid-credential") || codigo.includes("wrong-password") || codigo.includes("user-not-found")) return "Correo o contraseña incorrectos 🥀";
  if (codigo.includes("too-many-requests")) return "Demasiados intentos, espera un momento ⏳";
  if (codigo.includes("network")) return "Problema de conexión 🕸️";
  return "Error: " + codigo;
}

/* ---------- campanita / notificaciones ---------- */
 $("#boton-campanita").addEventListener("click", async () => {
  if (!audioCtx) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  if (!("Notification" in window)) { toast("Tu navegador no soporta notificaciones 😿"); return; }
  const permiso = await Notification.requestPermission();
  if (permiso === "granted") {
    $("#boton-campanita").textContent = "🔔 Notificaciones activadas";
    toast("¡Listo! Te avisaré mientras esta pestaña esté abierta 🔔");
    try { new Notification("¡Perfecto!", { body: "Así te avisaré de cada encargo 🧵" }); } catch (e) {}
  } else {
    toast("No se activaron. Igual sonará una campanita aquí 🛎️");
  }
});
if ("Notification" in window && Notification.permission === "granted") {
  $("#boton-campanita").textContent = "🔔 Notificaciones activadas";
}

/* ---------- escuchar pedidos ---------- */
function escucharPedidos() {
  if (cancelarPedidos) return;
  const q = query(collection(db, "pedidos"), orderBy("creado", "desc"), limit(100));
  cancelarPedidos = onSnapshot(q, (snap) => {
    const pedidos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    detectarNuevos(snap);
    pintarPedidos(pedidos);
    primeraCarga = false;
  }, (err) => {
    console.error(err);
    toast("⚠️ Error al leer pedidos: " + (err.message || err));
  });
}

function detectarNuevos(snap) {
  if (primeraCarga) return;
  snap.docChanges().forEach(cambio => {
    const d = cambio.doc.data();
    if (cambio.type === "added" && d.estado === "pendiente" && d.nombreSkin) {
      avisarNuevoPedido(d);
    }
  });
}

function avisarNuevoPedido(d) {
  ding();
  const frase = `${d.jugador} quiere comprar «${d.nombreSkin}» por ${d.precioTexto}`;
  if ("Notification" in window && Notification.permission === "granted") {
    try { new Notification("🛎️ ¡Nuevo encargo!", { body: frase }); } catch (e) {}
  }
  toast(`🛎️ ${frase}`);
}

/* ---------- pintar la lista ---------- */
function pintarPedidos(pedidos) {
  const validos = pedidos.filter(p => p.nombreSkin);
  const viejos = pedidos.filter(p => !p.nombreSkin);
  const pendientes = validos.filter(p => p.estado === "pendiente");
  const decididos = validos.filter(p => p.estado !== "pendiente");

  document.title = pendientes.length ? `(${pendientes.length}) 🪡 Panel del Sastre` : "🪡 Panel del Sastre";

  const aceptados = validos.filter(p => p.estado === "aceptado");
  const totalCobre = aceptados.reduce((s, p) => s + (p.precioCobre || 0), 0);
  $("#estadisticas").innerHTML = `
    <div class="stat"><b>${pendientes.length}</b><span>Sin responder</span></div>
    <div class="stat"><b>${aceptados.length}</b><span>Aceptados</span></div>
    <div class="stat"><b>${textoMonedas(totalCobre)}</b><span>Vendido (rol)</span></div>
  `;

  const notaViejos = viejos.length
    ? `<p class="sin-pedidos">📦 Hay ${viejos.length} pedido(s) viejo(s) de pruebas — bórralos en Firebase → Firestore → Datos.</p>`
    : "";

  const contP = $("#lista-pendientes");
  if (!pendientes.length) {
    contP.innerHTML = notaViejos + `<p class="sin-pedidos">No hay encargos pendientes… momento perfecto para bordar 🧵</p>`;
  } else {
    contP.innerHTML = notaViejos;
    pendientes.forEach(p => contP.appendChild(tarjetaPedido(p, true)));
  }

  const contH = $("#lista-historial");
  if (!decididos.length) {
    contH.innerHTML = `<p class="sin-pedidos">El historial está vacío… por ahora 📜</p>`;
  } else {
    contH.innerHTML = "";
    decididos.forEach(p => contH.appendChild(tarjetaPedido(p, false)));
  }
}

function tarjetaPedido(p, pendiente) {
  const el = document.createElement("article");
  el.className = "pedido" + (pendiente ? " sin-responder" : "");
  const hora = p.creado && p.creado.toMillis ? new Date(p.creado.toMillis()).toLocaleString() : "hace un momento";
  el.innerHTML = `
    <div class="pedido-franja">
      ${p.imagen ? `<img class="pedido-mini" src="${p.imagen}" alt="">` : ""}
      <div class="pedido-frase">🧙 <b>${p.jugador || "Desconocido"}</b> quiere comprar <b>«${p.nombreSkin}»</b> por <b>${p.precioTexto}</b></div>
    </div>
    <div class="pedido-cabecera">
      <span class="pedido-hora">🗓️ ${hora}</span>
      ${pendiente
        ? `<div class="pedido-botones">
             <button class="boton boton-destacado" data-accion="aceptar">✅ Aceptar</button>
             <button class="boton boton-peligro" data-accion="rechazar">🚫 Rechazar</button>
           </div>`
        : `<span class="pedido-estado ${p.estado === "aceptado" ? "estado-aceptado" : "estado-rechazado"}">${p.estado === "aceptado" ? "✅ Aceptado" : "🚫 Rechazado"}</span>`}
    </div>
  `;
  if (pendiente) {
    el.querySelectorAll("[data-accion]").forEach(b => {
      b.addEventListener("click", () => decidir(p, b.dataset.accion, b));
    });
  }
  return el;
}

async function decidir(p, accion, boton) {
  boton.disabled = true;
  try {
    await updateDoc(doc(db, "pedidos", p.id), {
      estado: accion === "aceptar" ? "aceptado" : "rechazado",
      decidido: serverTimestamp()
    });
    toast(accion === "aceptar" ? `Encargo de ${p.jugador} aceptado ✅` : `Encargo de ${p.jugador} rechazado 🚫`);
  } catch (err) {
    boton.disabled = false;
    toast("⚠️ No se pudo guardar: " + (err.message || err));
  }
}

/* ---------- campanita (sonido) ---------- */
function ding() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const now = audioCtx.currentTime;
    const notas = [[880, 0], [1174.66, 0.14]];
    notas.forEach(([f, t]) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, now + t);
      g.gain.exponentialRampToValueAtTime(0.35, now + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.6);
      o.connect(g);
      g.connect(audioCtx.destination);
      o.start(now + t);
      o.stop(now + t + 0.65);
    });
  } catch (e) {}
}
