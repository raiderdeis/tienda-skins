/* =========================================================
   LÓGICA DE LA TIENDA — no toques nada aquí 🙌
   Todo se edita desde editor.html 🎮
   ========================================================= */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, doc, addDoc, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (sel) => document.querySelector(sel);

/* --- valores de respaldo (se sobreescriben con lo del editor) --- */
const BASE = {
  nombre: "El Sastre del Reino",
  subtitulo: "Atelier de pieles finas para viajeros distinguidos ✨",
  monedas: [
    { nombre: "Cobre", emoji: "🥉", equivale: 1 },
    { nombre: "Plata", emoji: "🥈", equivale: 50 },
    { nombre: "Oro", emoji: "🥇", equivale: 50 },
    { nombre: "Diamante", emoji: "💎", equivale: 50 }
  ]
};

const conf = (typeof TIENDA !== "undefined" && TIENDA && TIENDA.firebase) ? TIENDA.firebase : null;
const firebaseListo = !!conf && !String(conf.apiKey || "").includes("PEGA_AQUÍ");
let db = null;
if (firebaseListo) db = getFirestore(initializeApp(conf));

let CONF = { ...BASE };
let MONEDAS = [];

/* --- estado --- */
const CLAVES = { nombre: "sastre_nombre", pedidos: "sastre_pedidos" };
let nombre = localStorage.getItem(CLAVES.nombre) || "";
let misPedidos = {};
try { misPedidos = JSON.parse(localStorage.getItem(CLAVES.pedidos) || "{}") || {}; } catch (e) { misPedidos = {}; }
let categoriaActiva = null;
let crudos = [];
let catalogo = [];
const escuchas = {};

const ICONOS_CATEGORIA = {
  "Outfit completo": "🧵", "Cuerpo completo": "🧵",
  "Camisas": "👕", "Polerones": "🧥", "Chaquetas": "🧥", "Capas": "🧣",
  "Pantalones": "👖", "Zapatos": "👞", "Sombreros": "🎩",
  "Caballeros": "⚔️", "Magos": "🧙", "Vestidos": "👗",
  "Aldeanos": "🧑‍🌾", "Disfraces": "🎭", "Nobles": "👑", "Aventureros": "🗺️"
};

/* ---------- monedas ---------- */
function normalizar(t) {
  return String(t).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function prepararMonedas(lista) {
  const salida = [];
  let abs = 1;
  (lista || []).forEach((m, i) => {
    if (i > 0) abs = abs * (Number(m.equivale) || 1);
    salida.push({
      nombre: m.nombre || "Moneda",
      emoji: m.emoji || "✨",
      singular: normalizar(m.nombre || "moneda"),
      absoluto: abs
    });
  });
  return salida;
}

function interpretarPrecio(precio, monedas) {
  if (typeof precio === "number" && isFinite(precio)) return Math.max(0, Math.round(precio));
  const texto = normalizar(precio == null ? "" : precio);
  if (!texto) return 0;
  const alt = monedas.map(m => m.singular).join("|");
  if (alt) {
    const re = new RegExp("(\\d+)\\s*(?:monedas?\\s+)?(?:de\\s+)?(" + alt + ")", "g");
    let total = 0, encontro = false, m;
    while ((m = re.exec(texto)) !== null) {
      encontro = true;
      const mon = monedas.find(x => x.singular === m[2]);
      if (mon) total += parseInt(m[1], 10) * mon.absoluto;
    }
    if (encontro) return total;
  }
  const solo = parseInt(texto.replace(/[^0-9]/g, ""), 10);
  return isNaN(solo) ? 0 : solo;
}

function desglose(total, monedas) {
  let resto = Math.max(0, Math.round(total));
  const partes = [];
  for (let i = monedas.length - 1; i >= 0; i--) {
    const cant = Math.floor(resto / monedas[i].absoluto);
    if (cant > 0) { partes.push({ cant, moneda: monedas[i] }); resto -= cant * monedas[i].absoluto; }
  }
  if (!partes.length && monedas.length) partes.push({ cant: 0, moneda: monedas[0] });
  return partes;
}

function textoMonedas(total, monedas) {
  const partes = desglose(total, monedas).map(p => `${p.cant} ${p.moneda.nombre}`);
  if (partes.length === 1) return partes[0];
  return partes.slice(0, -1).join(", ") + " y " + partes[partes.length - 1];
}

/* ---------- descargas (la imagen vive en la base de datos) ---------- */
function urlDescarga(imagen) {
  try {
    const partes = String(imagen).split(",");
    const meta = partes[0];
    const b64 = partes.slice(1).join(",");
    const mime = (meta.match(/:(.*?);/) || [null, "image/png"])[1];
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return URL.createObjectURL(new Blob([arr], { type: mime }));
  } catch (e) {
    return imagen;
  }
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
function piezasDe(producto) {
  const lista = [];
  if (producto && producto.piezas && producto.piezas.length) {
    producto.piezas.forEach(pid => {
      const pz = productoDe(pid);
      if (pz && pz.imagen) lista.push(pz);
    });
  }
  return lista;
}

/* ---------- arranque ---------- */
function iniciar() {
  MONEDAS = prepararMonedas(CONF.monedas);
  $("#input-nombre").value = nombre;
  $("#input-nombre").addEventListener("change", (e) => {
    nombre = e.target.value.trim();
    localStorage.setItem(CLAVES.nombre, nombre);
  });
  pintarCabecera();
  pintarLeyenda();
  pintarCategorias();
  pintarRejilla();
  pintarAviso();
  conectarEventos();

  if (!firebaseListo) {
    const aviso = $("#aviso-pedido");
    aviso.hidden = false;
    aviso.className = "aviso aviso-rechazado sin-accion";
    aviso.textContent = "⚠️ La tienda aún no está conectada. El modista debe completar el paso de Firebase de la guía.";
    return;
  }

  onSnapshot(doc(db, "configuracion", "tienda"), (snap) => {
    const datos = snap.exists() ? snap.data() : {};
    CONF = {
      ...BASE,
      ...datos,
      monedas: (datos.monedas && datos.monedas.length) ? datos.monedas : BASE.monedas
    };
    MONEDAS = prepararMonedas(CONF.monedas);
    pintarCabecera();
    pintarLeyenda();
    reconstruirCatalogo();
  }, () => {});

  onSnapshot(collection(db, "catalogo"), (snap) => {
    crudos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    reconstruirCatalogo();
  }, (err) => toast("⚠️ No pude leer el catálogo: " + (err.message || err)));

  Object.keys(misPedidos).forEach(id => {
    if (misPedidos[id] && misPedidos[id].estado === "pendiente") escuchar(id);
  });
}
document.addEventListener("DOMContentLoaded", iniciar);

function pintarCabecera() {
  document.title = `${CONF.nombre} — Tienda de pieles`;
  $("#titulo-tienda").textContent = CONF.nombre;
  $("#subtitulo-tienda").textContent = CONF.subtitulo || "";
}

/* ---------- leyenda de monedas ---------- */
function pintarLeyenda() {
  if (!MONEDAS.length) return;
  const partes = [];
  for (let i = 1; i < MONEDAS.length; i++) {
    partes.push(`${MONEDAS[i].emoji} 1 ${MONEDAS[i].nombre} = ${MONEDAS[i].absoluto / MONEDAS[i - 1].absoluto} ${MONEDAS[i - 1].nombre}`);
  }
  $("#leyenda-monedas").innerHTML =
    `🪙 Monedas del reino — ${MONEDAS[0].emoji} ${MONEDAS[0].nombre} es la base · ` + partes.join(" · ");
}

/* ---------- catálogo ---------- */
function reconstruirCatalogo() {
  const lista = crudos.slice().sort((a, b) => {
    const oa = typeof a.orden === "number" ? a.orden : 9999;
    const ob = typeof b.orden === "number" ? b.orden : 9999;
    if (oa !== ob) return oa - ob;
    return String(a.nombre || "").localeCompare(String(b.nombre || ""));
  });
  catalogo = lista.map(p => {
    const cobre = interpretarPrecio(p.precio, MONEDAS);
    return { ...p, precioCobre: cobre, precioTexto: textoMonedas(cobre, MONEDAS) };
  });
  const cats = [...new Set(catalogo.map(p => p.categoria))];
  if (!cats.includes(categoriaActiva)) categoriaActiva = cats[0] || null;
  pintarCategorias();
  pintarRejilla();
}

function pintarCategorias() {
  const cats = [...new Set(catalogo.map(p => p.categoria))];
  const nav = $("#categorias");
  nav.innerHTML = "";
  cats.forEach(cat => {
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

function pintarRejilla() {
  const rejilla = $("#rejilla");
  rejilla.querySelectorAll(".escenario").forEach(caja => {
    observadorVisores.unobserve(caja);
    if (caja._visor) { try { caja._visor.dispose(); } catch (e) {} caja._visor = null; }
  });
  rejilla.innerHTML = "";

  const lista = catalogo.filter(p => p.categoria === categoriaActiva);
  if (!lista.length) {
    rejilla.innerHTML = `<p class="vacio">🧵 El sastre aún no ha cosido ninguna prenda…</p>`;
    return;
  }
  lista.forEach(p => {
    const tarjeta = document.createElement("article");
    tarjeta.className = "tarjeta" + (p.agotado ? " tarjeta-agotada" : "");
    tarjeta.dataset.id = p.id;
    const badges = desglose(p.precioCobre, MONEDAS)
      .map(b => `<span class="moneda-badge" title="${b.moneda.nombre}">${b.moneda.emoji} ${b.cant}</span>`)
      .join("");
    const piezasNota = (p.piezas && p.piezas.length)
      ? `<p class="nota-piezas">🧩 Incluye ${p.piezas.length} piezas (también se venden sueltas)</p>`
      : "";
    const maniqui = p.estante
      ? `<p class="estante-badge">📍 ${p.estante}</p>`
      : "";
    tarjeta.innerHTML = `
      ${p.nuevo ? '<span class="cinta-nuevo">¡NUEVO!</span>' : ""}
      ${p.agotado ? '<span class="cinta-agotado">SIN STOCK</span>' : ""}
      <div class="escenario" data-id="${p.id}" title="Arrastra para girar la figura"></div>
      <h3 class="prenda-nombre">${p.nombre || "Sin nombre"}</h3>
      <div class="precio-monedas">${badges}</div>
      ${maniqui}
      ${piezasNota}
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
  const entrada = misPedidos[producto.id];
  const estado = entrada ? entrada.estado : null;

  if (estado === "pendiente") {
    zona.innerHTML = `<button class="boton boton-espera" disabled>⏳ Esperando al sastre…</button>`;
    return;
  }
  if (estado === "aceptado") {
    if (producto.piezas && producto.piezas.length) {
      const b = document.createElement("button");
      b.className = "boton boton-destacado";
      b.textContent = "⬇️ Ver descargas";
      b.addEventListener("click", () => mostrarModalPedido(producto, { estado: "aceptado" }));
      zona.innerHTML = "";
      zona.appendChild(b);
    } else {
      const imagen = (entrada && entrada.imagen) || producto.imagen;
      if (imagen) {
        const enlace = document.createElement("a");
        enlace.className = "boton boton-destacado";
        enlace.href = urlDescarga(imagen);
        enlace.download = `${producto.id}.png`;
        enlace.textContent = "⬇️ ¡Descargar!";
        zona.innerHTML = "";
        zona.appendChild(enlace);
      } else {
        zona.innerHTML = `<button class="boton" disabled>❓ Prenda no disponible</button>`;
      }
    }
    return;
  }
  const b = document.createElement("button");
  if (producto.agotado) {
    b.className = "boton boton-agotado";
    b.textContent = "💔 Sin stock";
    b.disabled = true;
  } else {
    b.className = "boton boton-destacado";
    b.textContent = estado === "rechazado" ? "💔 Reintentar compra" : "🛒 Comprar";
    b.addEventListener("click", () => comprar(producto));
  }
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
  if (!producto || !producto.imagen || typeof skinview3d === "undefined") {
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
      ? visor.loadSkin(producto.imagen, { model: "slim" })
      : visor.loadSkin(producto.imagen);
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
  div.innerHTML = "🖼️<br>Esta prenda no tiene imagen.<br>El modista puede arreglarlo desde el taller 🛠️";
  caja.appendChild(div);
}

/* ---------- comprar ---------- */
async function comprar(producto) {
  if (!firebaseListo) { toast("⚠️ La tienda no está conectada a Firebase todavía"); return; }
  if (producto.agotado) { toast("💔 Esa prenda está agotada… ¡vuelve más tarde!"); return; }
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
      precioCobre: producto.precioCobre,
      precioTexto: producto.precioTexto,
      imagen: producto.imagen || null,
      estado: "pendiente",
      creado: serverTimestamp()
    });
    misPedidos[producto.id] = { id: ref.id, estado: "pendiente", imagen: producto.imagen || null };
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
        misPedidos[skinId] = { ...pedido, estado: datos.estado, imagen: datos.imagen || pedido.imagen };
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
  const piezas = piezasDe(producto);

  if (datos.estado === "pendiente") {
    contenido = `
      <div class="estado-pedido">
        <div class="estado-grande girando">⏳</div>
        <p class="estado-texto">Encargo enviado, <b>${datos.jugador || nombre}</b>.<br>
        Pediste <b>«${producto.nombre}»</b> por <b>${producto.precioTexto}</b>.<br>
        El sastre está decidiendo si lo acepta… 🧵</p>
        ${piezas.length ? `<p class="estado-nota">🧩 Este outfit incluye: ${piezas.map(pz => pz.nombre).join(", ")}<br>(al aceptarlo podrás descargarlo completo y también por piezas)</p>` : ""}
        <p class="estado-nota">(Puedes cerrar esta ventana: el botón de la prenda cambiará solo cuando el sastre responda.)</p>
        <button class="boton" id="boton-cerrar-estado">Esperar en silencio</button>
      </div>`;
  } else if (datos.estado === "aceptado") {
    const imagen = datos.imagen || (misPedidos[producto.id] && misPedidos[producto.id].imagen) || producto.imagen;
    contenido = `
      <div class="estado-pedido">
        <div class="estado-grande">🎉✨</div>
        <p class="estado-texto">¡El sastre <b>aceptó</b> tu encargo de <b>«${producto.nombre}»</b>!<br>Descarga tu prenda y vístete con orgullo.</p>
        ${imagen ? `
        <div class="descargables">
          <a class="boton-descarga" href="${urlDescarga(imagen)}" download="${producto.id}.png">⬇️ Descargar «${producto.nombre}»${piezas.length ? " (completo)" : ""}</a>
          ${piezas.map(pz => `<a class="boton-descarga pieza-descarga" href="${urlDescarga(pz.imagen)}" download="${pz.id}.png">🧩 Descargar «${pz.nombre}»</a>`).join("")}
        </div>
        <p class="estado-nota">💡 Recuerda entregarle al sastre sus <b>${producto.precioTexto}</b> dentro del reino 😄</p>` : `
        <p class="estado-nota">😵 La prenda ya no está disponible para descargar…</p>`}
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
