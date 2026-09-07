/* =========================================================
   LÓGICA DE LA TIENDA — no toques nada aquí 🙌
   (para editar cosas usa config.js, skins.js y el
    bloque :root de estilos.css)
   ========================================================= */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, addDoc, doc, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (sel) => document.querySelector(sel);

/* --- configuración con respaldo por si algo falla --- */
const CONF = (typeof TIENDA !== "undefined" && TIENDA) ? TIENDA : {
  nombre: "El Sastre del Reino",
  subtitulo: "Tienda de pieles",
  monedas: [
    { nombre: "Cobre", emoji: "🥉", equivale: 1 },
    { nombre: "Plata", emoji: "🥈", equivale: 50 },
    { nombre: "Oro", emoji: "🥇", equivale: 50 },
    { nombre: "Diamante", emoji: "💎", equivale: 50 }
  ],
  firebase: null
};

/* --- ¿Firebase ya está conectado? --- */
const conf = CONF.firebase || null;
const firebaseListo = !!conf && !String(conf.apiKey || "").includes("PEGA_AQUÍ");
let db = null;
if (firebaseListo) db = getFirestore(initializeApp(conf));

/* --- estado --- */
const CLAVES = { nombre: "sastre_nombre", pedidos: "sastre_pedidos" };
let nombre = localStorage.getItem(CLAVES.nombre) || "";
let misPedidos = {};
try { misPedidos = JSON.parse(localStorage.getItem(CLAVES.pedidos) || "{}") || {}; } catch (e) { misPedidos = {}; }
let categoriaActiva = "Todo";
let catalogo = [];
const escuchas = {};

const ICONOS_CATEGORIA = {
  "Todo": "🛍️", "Caballeros": "⚔️", "Magos": "🧙", "Vestidos": "👗",
  "Aldeanos": "🧑‍🌾", "Disfraces": "🎭", "Nobles": "👑", "Aventureros": "🗺️"
};

/* ---------- monedas ---------- */
function normalizar(t) {
  return String(t).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function valorAbsolutoMonedas() {
  const lista = (CONF.monedas || []).map(m => ({ ...m, singular: normalizar(m.nombre) }));
  const salida = [];
  let abs = 1;
  lista.forEach((m, i) => {
    if (i > 0) abs = abs * (Number(m.equivale) || 1);
    salida.push({ nombre: m.nombre, emoji: m.emoji, singular: m.singular, absoluto: abs });
  });
  return salida;
}
const MONEDAS = valorAbsolutoMonedas();

function interpretarPrecio(precio) {
  if (typeof precio === "number" && isFinite(precio)) return Math.max(0, Math.round(precio));
  const texto = normalizar(precio == null ? "" : precio);
  if (!texto) return 0;
  const alt = MONEDAS.map(m => m.singular).join("|");
  if (alt) {
    const re = new RegExp("(\\d+)\\s*(?:monedas?\\s+)?(?:de\\s+)?(" + alt + ")", "g");
    let total = 0, encontro = false, m;
    while ((m = re.exec(texto)) !== null) {
      encontro = true;
      const mon = MONEDAS.find(x => x.singular === m[2]);
      if (mon) total += parseInt(m[1], 10) * mon.absoluto;
    }
    if (encontro) return total;
  }
  const solo = parseInt(texto.replace(/[^0-9]/g, ""), 10);
  return isNaN(solo) ? 0 : solo;
}

function desglose(total) {
  let resto = Math.max(0, Math.round(total));
  const partes = [];
  for (let i = MONEDAS.length - 1; i >= 0; i--) {
    const cant = Math.floor(resto / MONEDAS[i].absoluto);
    if (cant > 0) { partes.push({ cant, moneda: MONEDAS[i] }); resto -= cant * MONEDAS[i].absoluto; }
  }
  if (!partes.length) partes.push({ cant: 0, moneda: MONEDAS[0] });
  return partes;
}

function textoMonedas(total) {
  const partes = desglose(total).map(p => `${p.cant} ${p.moneda.nombre}`);
  if (partes.length === 1) return partes[0];
  return partes.slice(0, -1).join(", ") + " y " + partes[partes.length - 1];
}

/* ---------- utilidades ---------- */
function toast(texto) {
  const caja = $("#toasts");
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = texto;
  caja.appendChild(t);
  setTimeout(() => t.remove(), 3400);
}
function abrirVelo(sel) { $(sel).hidden = false; }
function cerrarVelo(sel) { $(sel).hidden = true; }
function guardarPedidos() { localStorage.setItem(CLAVES.pedidos, JSON.stringify(misPedidos)); }
function productoDe(id) { return catalogo.find(p => p.id === id) || null; }

/* ---------- arranque ---------- */
function iniciar() {
  document.title = `${CONF.nombre} — Tienda de pieles`;
  $("#titulo-tienda").textContent = CONF.nombre;
  $("#subtitulo-tienda").textContent = CONF.subtitulo || "";
  $("#input-nombre").value = nombre;
  $("#input-nombre").addEventListener("change", (e) => {
    nombre = e.target.value.trim();
    localStorage.setItem(CLAVES.nombre, nombre);
  });

  pintarLeyenda();
  const ok = prepararCatalogo();
  pintarCategorias();

  if (!ok) {
    $("#rejilla").innerHTML = `<p class="vacio">⚠️ Hay un error en <b>skins.js</b>. Revisa que cada bloque tenga sus comas y comillas bien cerradas.</p>`;
    return;
  }

  pintarRejilla();
  pintarAviso();
  conectarEventos();

  if (!firebaseListo) {
    const aviso = $("#aviso-pedido");
    aviso.hidden = false;
    aviso.className = "aviso aviso-rechazado sin-accion";
    aviso.textContent = "⚠️ La tienda aún no está conectada. El modista debe completar el paso de Firebase de la guía.";
  } else {
    // retomar encargos que quedaron esperando respuesta
    Object.keys(misPedidos).forEach(id => {
      if (misPedidos[id] && misPedidos[id].estado === "pendiente") escuchar(id);
    });
  }
}
document.addEventListener("DOMContentLoaded", iniciar);

/* ---------- leyenda de monedas ---------- */
function pintarLeyenda() {
  if (!MONEDAS.length) return;
  const partes = [];
  for (let i = 1; i < MONEDAS.length; i++) {
    partes.push(`${MONEDAS[i].emoji} 1 ${MONEDAS[i].nombre} = ${CONF.monedas[i].equivale} ${MONEDAS[i - 1].nombre}`);
  }
  $("#leyenda-monedas").innerHTML =
    `🪙 Monedas del reino — ${MONEDAS[0].emoji} ${MONEDAS[0].nombre} es la base · ` + partes.join(" · ");
}

/* ---------- categorías ---------- */
function pintarCategorias() {
  const lista = catalogo.length ? ["Todo", ...new Set(catalogo.map(p => p.categoria))] : ["Todo"];
  const nav = $("#categorias");
  nav.innerHTML = "";
  lista.forEach(cat => {
    const b = document.createElement("button");
    b.className = "chip" + (cat === categoriaActiva ? " activo" : "");
    b.textContent = `${ICONOS_CATEGORIA[cat] || "✨"} ${cat}`;
    b.addEventListener("click", () => {
      categoriaActiva = cat;
      pintarCategorias();
      pintarRejilla();
    });
    nav.appendChild(b);
  });
}

/* ---------- catálogo ---------- */
function prepararCatalogo() {
  if (typeof CATALOGO === "undefined" || !Array.isArray(CATALOGO)) return false;
  catalogo = CATALOGO.map(p => {
    const cobre = interpretarPrecio(p.precio);
    return { ...p, precioCobre: cobre, precioTexto: textoMonedas(cobre) };
  });
  return true;
}

function pintarRejilla() {
  const rejilla = $("#rejilla");
  // liberar los muñecos 3D viejos para no gastar memoria
  rejilla.querySelectorAll(".escenario").forEach(caja => {
    observadorVisores.unobserve(caja);
    if (caja._visor) { try { caja._visor.dispose(); } catch (e) {} caja._visor = null; }
  });
  rejilla.innerHTML = "";

  const lista = catalogo.filter(p => categoriaActiva === "Todo" || p.categoria === categoriaActiva);
  if (!lista.length) {
    rejilla.innerHTML = `<p class="vacio">Nada por aquí aún… el sastre cose despacio 🧵</p>`;
    return;
  }
  lista.forEach(p => {
    const tarjeta = document.createElement("article");
    tarjeta.className = "tarjeta";
    tarjeta.dataset.id = p.id;
    const badges = desglose(p.precioCobre)
      .map(b => `<span class="moneda-badge" title="${b.moneda.nombre}">${b.moneda.emoji} ${b.cant}</span>`)
      .join("");
    tarjeta.innerHTML = `
      ${p.nuevo ? '<span class="cinta-nuevo">¡NUEVO!</span>' : ""}
      <div class="escenario" data-id="${p.id}" title="Arrastra para girar la figura"></div>
      <h3 class="prenda-nombre">${p.nombre}</h3>
      <div class="precio-monedas">${badges}</div>
      <div class="zona-accion"></div>
    `;
    rejilla.appendChild(tarjeta);
    pintarAccion(p);
  });
  observarEscenarios();
}

/* ---------- botón de cada tarjeta según su estado ---------- */
function pintarAccion(producto) {
  const tarjeta = document.querySelector(`.tarjeta[data-id="${producto.id}"]`);
  if (!tarjeta) return;
  const zona = tarjeta.querySelector(".zona-accion");
  const estado = misPedidos[producto.id] ? misPedidos[producto.id].estado : null;

  if (estado === "pendiente") {
    zona.innerHTML = `<button class="boton boton-espera" disabled>⏳ Esperando al sastre…</button>`;
    return;
  }
  if (estado === "aceptado") {
    zona.innerHTML = `<a class="boton boton-destacado" href="${encodeURI(producto.archivo)}" download="${encodeURI(producto.archivo)}">⬇️ ¡Descargar!</a>`;
    return;
  }
  const b = document.createElement("button");
  b.className = "boton boton-destacado";
  b.textContent = estado === "rechazado" ? "💔 Reintentar compra" : "🛒 Comprar";
  b.addEventListener("click", () => comprar(producto));
  zona.innerHTML = "";
  zona.appendChild(b);
}

/* ---------- muñecos 3D ---------- */
const observadorVisores = new IntersectionObserver((entradas) => {
  entradas.forEach(en => {
    const caja = en.target;
    if (en.isIntersecting) {
      if (!caja._visor) caja._visor = crearVisor(caja);
      if (caja._visor) caja._visor.renderPaused = false;
    } else if (caja._visor) {
      caja._visor.renderPaused = true;
    }
  });
}, { rootMargin: "150px" });

function observarEscenarios() {
  document.querySelectorAll(".escenario").forEach(caja => {
    if (!caja._observado) { caja._observado = true; observadorVisores.observe(caja); }
  });
}

function crearVisor(caja) {
  const producto = productoDe(caja.dataset.id);
  if (!producto || typeof skinview3d === "undefined") {
    mostrarErrorPiel(caja);
    return null;
  }
  const canvas = document.createElement("canvas");
  caja.appendChild(canvas);
  try {
    const visor = new skinview3d.SkinViewer({
      canvas: canvas,
      width: caja.clientWidth || 160,
      height: caja.clientHeight || 200
    });
    const carga = producto.slim
      ? visor.loadSkin(producto.archivo, { model: "slim" })
      : visor.loadSkin(producto.archivo);
    if (carga && typeof carga.catch === "function") {
      carga.catch(() => {
        mostrarErrorPiel(caja);
        try { visor.renderPaused = true; } catch (e) {}
      });
    }
    try {
      visor.controls.enableZoom = false;
      visor.controls.enablePan = false;
      visor.controls.enableRotate = true;
    } catch (e) {}
    try {
      visor.animation = new skinview3d.WalkingAnimation();
      visor.animation.speed = 0.7;
    } catch (e) {}
    // giro automático (se detiene si el jugador arrastra para mirar)
    let girando = true;
    canvas.addEventListener("pointerdown", () => { girando = false; });
    (function girar() {
      if (girando && visor.player) visor.player.rotation.y += 0.011;
      requestAnimationFrame(girar);
    })();
    return visor;
  } catch (e) {
    mostrarErrorPiel(caja);
    return null;
  }
}

function mostrarErrorPiel(caja) {
  if (caja.querySelector(".piel-error")) return;
  const div = document.createElement("div");
  div.className = "piel-error";
  div.innerHTML = "🖼️<br>No encuentro el archivo de esta skin.<br>Revisa que exista en GitHub y que su nombre coincida en <b>skins.js</b>";
  caja.appendChild(div);
}

/* ---------- comprar ---------- */
async function comprar(producto) {
  if (!firebaseListo) { toast("⚠️ La tienda no está conectada a Firebase todavía"); return; }
  nombre = ($("#input-nombre").value || "").trim();
  if (!nombre) { toast("✍️ Escribe el nombre de tu personaje primero"); $("#input-nombre").focus(); return; }
  localStorage.setItem(CLAVES.nombre, nombre);

  const actual = misPedidos[producto.id];
  if (actual && actual.estado === "pendiente") { toast("⏳ Ya pediste esa prenda, ¡paciencia!"); return; }

  try {
    const ref = await addDoc(collection(db, "pedidos"), {
      jugador: nombre,
      skinId: producto.id,
      nombreSkin: producto.nombre,
      archivo: producto.archivo,
      precioCobre: producto.precioCobre,
      precioTexto: producto.precioTexto,
      estado: "pendiente",
      creado: serverTimestamp()
    });
    misPedidos[producto.id] = { id: ref.id, estado: "pendiente" };
    guardarPedidos();
    pintarAccion(producto);
    pintarAviso();
    mostrarModalPedido(producto, { estado: "pendiente", jugador: nombre });
    escuchar(producto.id);
    toast("🧵 ¡Encargo enviado al sastre!");
  } catch (e) {
    toast("⚠️ No se pudo enviar el encargo: " + (e.message || e));
  }
}

/* ---------- escuchar la respuesta del sastre ---------- */
function escuchar(skinId) {
  if (!firebaseListo) return;
  const pedido = misPedidos[skinId];
  if (!pedido || !pedido.id) return;
  if (escuchas[skinId]) escuchas[skinId]();
  let ultimo = pedido.estado;
  escuchas[skinId] = onSnapshot(
    doc(db, "pedidos", pedido.id),
    (snap) => {
      const producto = productoDe(skinId);
      if (!producto) return;
      if (!snap.exists()) {
        delete misPedidos[skinId];
        guardarPedidos();
        pintarAccion(producto);
        pintarAviso();
        return;
      }
      const datos = snap.data();
      if (datos.estado && datos.estado !== ultimo) {
        ultimo = datos.estado;
        misPedidos[skinId] = { id: pedido.id, estado: datos.estado };
        guardarPedidos();
        pintarAccion(producto);
        pintarAviso();
        mostrarModalPedido(producto, datos);
        toast(datos.estado === "aceptado" ? "📬 ¡El sastre aceptó tu encargo!" : "🥀 El sastre rechazó tu encargo…");
        if (datos.estado !== "pendiente" && escuchas[skinId]) {
          escuchas[skinId]();
          delete escuchas[skinId];
        }
      }
    },
    (err) => toast("⚠️ " + (err.message || err))
  );
}

/* ---------- modal del encargo ---------- */
function mostrarModalPedido(producto, datos) {
  const cuerpo = $("#cuerpo-pedido");
  let contenido = "";

  if (datos.estado === "pendiente") {
    contenido = `
      <div class="estado-pedido">
        <div class="estado-grande girando">⏳</div>
        <p class="estado-texto">Encargo enviado, <b>${datos.jugador}</b>.<br>
        Pediste <b>«${producto.nombre}»</b> por <b>${producto.precioTexto}</b>.<br>
        El sastre está decidiendo si lo acepta… 🧵</p>
        <p class="estado-nota">(Puedes cerrar esta ventana: el botón de la prenda cambiará solo cuando el sastre responda.)</p>
        <button class="boton" id="boton-cerrar-estado">Esperar en silencio</button>
      </div>`;
  } else if (datos.estado === "aceptado") {
    contenido = `
      <div class="estado-pedido">
        <div class="estado-grande">🎉✨</div>
        <p class="estado-texto">¡El sastre <b>aceptó</b> tu encargo de <b>«${producto.nombre}»</b>!<br>Descarga tu prenda y vístete con orgullo.</p>
        <div class="descargables">
          <a class="boton-descarga" href="${encodeURI(producto.archivo)}" download="${encodeURI(producto.archivo)}">⬇️ Descargar «${producto.nombre}»</a>
        </div>
        <p class="estado-nota">💡 Recuerda entregarle al sastre sus <b>${producto.precioTexto}</b> dentro del reino 😄</p>
        <button class="boton" id="boton-cerrar-estado">¡Listo!</button>
      </div>`;
  } else if (datos.estado === "rechazado") {
    contenido = `
      <div class="estado-pedido">
        <div class="estado-grande">🥀</div>
        <p class="estado-texto">El sastre <b>rechazó</b> tu encargo de <b>«${producto.nombre}»</b>…<br>Quizá estaba muy ocupado cosiendo. ¡Puedes volver a intentarlo!</p>
        <div class="modal-botones">
          <button class="boton" id="boton-cerrar-estado">Cerrar</button>
          <button class="boton boton-destacado" id="boton-reintentar">💔 Reintentar compra</button>
        </div>
      </div>`;
  }

  cuerpo.innerHTML = contenido;
  const cerrar = cuerpo.querySelector("#boton-cerrar-estado");
  if (cerrar) cerrar.addEventListener("click", () => cerrarVelo("#velo-pedido"));
  const reintentar = cuerpo.querySelector("#boton-reintentar");
  if (reintentar) reintentar.addEventListener("click", () => { cerrarVelo("#velo-pedido"); comprar(producto); });
  abrirVelo("#velo-pedido");
}

/* ---------- aviso superior ---------- */
function pintarAviso() {
  const aviso = $("#aviso-pedido");
  const pendientes = Object.values(misPedidos).filter(p => p.estado === "pendiente").length;
  if (!pendientes) { aviso.hidden = true; return; }
  aviso.hidden = false;
  aviso.className = "aviso aviso-pendiente sin-accion";
  aviso.textContent = pendientes === 1
    ? "⏳ El sastre está revisando tu encargo… el botón de la prenda cambiará solo cuando responda 🧵"
    : `⏳ El sastre está revisando tus ${pendientes} encargos… los botones cambiarán solos cuando responda 🧵`;
}

/* ---------- eventos ---------- */
function conectarEventos() {
  document.querySelectorAll(".velo").forEach(v => {
    v.addEventListener("click", (e) => { if (e.target === v) cerrarVelo("#" + v.id); });
  });
}
