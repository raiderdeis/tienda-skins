/* =========================================================
   LÓGICA DE LA TIENDA — no necesitas tocar nada aquí 🙌
   ========================================================= */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, addDoc, doc, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (sel) => document.querySelector(sel);

/* --- ¿Ya se conectó Firebase? --- */
const conf = (typeof TIENDA !== "undefined" && TIENDA.firebase) ? TIENDA.firebase : null;
const firebaseListo = !!conf && !String(conf.apiKey || "").includes("PEGA_AQUÍ");
let db = null;
if (firebaseListo) db = getFirestore(initializeApp(conf));

/* --- Estado --- */
const CLAVES = {
  nombre: "sastre_nombre",
  carrito: "sastre_carrito",
  pedido: "sastre_pedido"
};
let nombre = localStorage.getItem(CLAVES.nombre) || "";
let carrito = [];
try { carrito = JSON.parse(localStorage.getItem(CLAVES.carrito) || "[]"); } catch (e) { carrito = []; }
let pedidoId = localStorage.getItem(CLAVES.pedido) || null;
let categoriaActiva = "Todo";
let cancelarEscucha = null;
let ultimoEstado = null;

const ICONOS_CATEGORIA = {
  "Todo": "🛍️", "Caballeros": "⚔️", "Magos": "🧙", "Vestidos": "👗",
  "Aldeanos": "🧑‍🌾", "Disfraces": "🎭", "Nobles": "👑", "Aventureros": "🗺️"
};

/* ---------- utilidades ---------- */
function toast(texto) {
  const caja = $("#toasts");
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = texto;
  caja.appendChild(t);
  setTimeout(() => t.remove(), 3400);
}

function totalCarrito() { return carrito.reduce((s, i) => s + (i.precio || 0), 0); }
function formatoTotal(n) { return `${TIENDA.iconoMoneda} ${n} ${TIENDA.moneda}`; }
function guardarCarrito() { localStorage.setItem(CLAVES.carrito, JSON.stringify(carrito)); }
function abrirVelo(sel) { $(sel).hidden = false; }
function cerrarVelo(sel) { $(sel).hidden = true; }

/* ---------- arranque ---------- */
function iniciar() {
  document.title = `${TIENDA.nombre} — Tienda de pieles`;
  $("#titulo-tienda").textContent = TIENDA.nombre;
  $("#subtitulo-tienda").textContent = TIENDA.subtitulo;
  $("#input-nombre").value = nombre;
  $("#input-nombre").addEventListener("change", (e) => {
    nombre = e.target.value.trim();
    localStorage.setItem(CLAVES.nombre, nombre);
  });

  pintarCategorias();
  pintarRejilla();
  actualizarBarra();
  conectarEventos();

  if (!firebaseListo) {
    const aviso = $("#aviso-pedido");
    aviso.hidden = false;
    aviso.className = "aviso aviso-rechazado";
    aviso.style.cursor = "default";
    aviso.textContent = "⚠️ La tienda aún no está conectada. El modista debe completar el paso de Firebase de la guía.";
  } else if (pedidoId) {
    escucharPedido();
  }
}
document.addEventListener("DOMContentLoaded", iniciar);

/* ---------- categorías ---------- */
function pintarCategorias() {
  const categorias = ["Todo", ...new Set(CATALOGO.map(p => p.categoria))];
  const nav = $("#categorias");
  nav.innerHTML = "";
  categorias.forEach(cat => {
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

/* ---------- tarjetas ---------- */
function pintarRejilla() {
  const rejilla = $("#rejilla");
  // liberar los visores 3D viejos para no gastar memoria
  rejilla.querySelectorAll(".escenario").forEach(caja => {
    observadorVisores.unobserve(caja);
    if (caja._visor) { try { caja._visor.dispose(); } catch (e) {} caja._visor = null; }
  });
  rejilla.innerHTML = "";

  const lista = CATALOGO.filter(p => categoriaActiva === "Todo" || p.categoria === categoriaActiva);
  if (!lista.length) {
    rejilla.innerHTML = `<p class="vacio">Nada por aquí aún… el sastre cose despacio 🧵</p>`;
    return;
  }
  lista.forEach(p => {
    const tarjeta = document.createElement("article");
    tarjeta.className = "tarjeta";
    tarjeta.innerHTML = `
      ${p.nuevo ? '<span class="cinta-nuevo">¡NUEVO!</span>' : ""}
      <div class="escenario" data-id="${p.id}" title="Arrastra para girar la figura"></div>
      <h3 class="prenda-nombre">${p.nombre}</h3>
      <p class="prenda-precio">${TIENDA.iconoMoneda} ${p.precio} <small>${TIENDA.moneda}</small></p>
      <button class="boton boton-anadir">🧺 Añadir al zurrón</button>
    `;
    tarjeta.querySelector(".boton-anadir").addEventListener("click", () => añadirAlCarrito(p));
    rejilla.appendChild(tarjeta);
  });
  observarEscenarios();
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
  const producto = CATALOGO.find(p => p.id === caja.dataset.id);
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

/* ---------- zurrón (carrito) ---------- */
function añadirAlCarrito(p) {
  if (carrito.some(i => i.id === p.id)) {
    toast("Esa prenda ya está en tu zurrón 🧺");
    return;
  }
  carrito.push({ id: p.id, nombre: p.nombre, precio: p.precio, archivo: p.archivo });
  guardarCarrito();
  actualizarBarra();
  toast(`«${p.nombre}» añadida al zurrón 🧺`);
}

function quitarDelCarrito(id) {
  carrito = carrito.filter(i => i.id !== id);
  guardarCarrito();
  actualizarBarra();
  pintarZurronModal();
}

function actualizarBarra() {
  const n = carrito.length;
  $("#zurron-texto").textContent = `${n} ${n === 1 ? "prenda" : "prendas"}`;
  $("#zurron-total").textContent = `Total: ${formatoTotal(totalCarrito())}`;
  $("#boton-tramitar").disabled = n === 0;
}

function pintarZurronModal() {
  const ul = $("#lista-zurron");
  ul.innerHTML = "";
  if (!carrito.length) {
    ul.innerHTML = `<li><span class="zurron-item-nombre">Tu zurrón está vacío…</span></li>`;
  }
  carrito.forEach(i => {
    const li = document.createElement("li");
    li.innerHTML = `
      <span class="zurron-item-nombre">${i.nombre}</span>
      <span class="zurron-item-precio">${formatoTotal(i.precio)}</span>
      <button class="zurron-quitar" title="Quitar">✕</button>
    `;
    li.querySelector(".zurron-quitar").addEventListener("click", () => quitarDelCarrito(i.id));
    ul.appendChild(li);
  });
  $("#zurron-total-modal").textContent = `Total: ${formatoTotal(totalCarrito())}`;
  $("#boton-tramitar-2").disabled = carrito.length === 0;
}

/* ---------- eventos de botones ---------- */
function conectarEventos() {
  $("#boton-tramitar").addEventListener("click", tramitarPedido);
  $("#boton-tramitar-2").addEventListener("click", () => { cerrarVelo("#velo-zurron"); tramitarPedido(); });
  $("#boton-ver-zurron").addEventListener("click", () => { pintarZurronModal(); abrirVelo("#velo-zurron"); });
  $("#boton-seguir").addEventListener("click", () => cerrarVelo("#velo-zurron"));
  document.querySelectorAll(".velo").forEach(v => {
    v.addEventListener("click", (e) => { if (e.target === v) cerrarVelo("#" + v.id); });
  });
}

/* ---------- tramitar el encargo ---------- */
async function tramitarPedido() {
  if (!firebaseListo) { toast("⚠️ La tienda no está conectada a Firebase todavía"); return; }
  if (!carrito.length) { toast("Tu zurrón está vacío 🧺"); return; }
  nombre = ($("#input-nombre").value || "").trim();
  if (!nombre) { toast("✍️ Escribe tu nombre de Minecraft primero"); $("#input-nombre").focus(); return; }
  localStorage.setItem(CLAVES.nombre, nombre);

  const cuerpo = $("#cuerpo-pedido");
  cuerpo.innerHTML = `
    <div class="estado-pedido">
      <div class="estado-grande girando">🧵</div>
      <p class="estado-texto">Enviando tu encargo por paloma mensajera…</p>
    </div>`;
  abrirVelo("#velo-pedido");

  try {
    const ref = await addDoc(collection(db, "pedidos"), {
      jugador: nombre,
      items: carrito.slice(),
      total: totalCarrito(),
      estado: "pendiente",
      creado: serverTimestamp()
    });
    pedidoId = ref.id;
    localStorage.setItem(CLAVES.pedido, pedidoId);
    carrito = [];
    ultimoEstado = null;
    guardarCarrito();
    actualizarBarra();
    cerrarVelo("#velo-zurron");
    escucharPedido();
  } catch (err) {
    cuerpo.innerHTML = `
      <div class="estado-pedido">
        <div class="estado-grande">😱</div>
        <p class="estado-texto">¡Oh no! La paloma se perdió (error de conexión con Firebase).<br>Revisa la guía de instalación.</p>
        <p class="detalle-error">${err && err.message ? err.message : ""}</p>
        <button class="boton" id="boton-cerrar-error">Volver</button>
      </div>`;
    const be = cuerpo.querySelector("#boton-cerrar-error");
    if (be) be.addEventListener("click", () => cerrarVelo("#velo-pedido"));
  }
}

/* ---------- escuchar la respuesta del sastre ---------- */
function escucharPedido() {
  if (!firebaseListo || !pedidoId) return;
  if (cancelarEscucha) { cancelarEscucha(); cancelarEscucha = null; }
  cancelarEscucha = onSnapshot(
    doc(db, "pedidos", pedidoId),
    (snap) => {
      if (!snap.exists()) {
        pintarAviso(null);
        $("#cuerpo-pedido").innerHTML = `
          <div class="estado-pedido">
            <div class="estado-grande">🌫️</div>
            <p class="estado-texto">Tu último encargo desapareció de los archivos…</p>
            <button class="boton boton-nuevo">Hacer un nuevo encargo</button>
          </div>`;
        vincularBotonNuevo();
        return;
      }
      const datos = snap.data();
      if (ultimoEstado !== null && datos.estado !== ultimoEstado) {
        abrirVelo("#velo-pedido");
        toast("📬 ¡El sastre ha respondido!");
      }
      ultimoEstado = datos.estado;
      pintarEstadoPedido(datos);
      pintarAviso(datos);
    },
    (err) => toast("⚠️ Error escuchando el pedido: " + err.message)
  );
}

function pintarEstadoPedido(datos) {
  const cuerpo = $("#cuerpo-pedido");
  const items = datos.items || [];
  const lista = items.map(i => `<li>• ${i.nombre} — ${formatoTotal(i.precio)}</li>`).join("");
  let contenido = "";

  if (datos.estado === "pendiente") {
    contenido = `
      <div class="estado-pedido">
        <div class="estado-grande girando">⏳</div>
        <p class="estado-texto">Encargo recibido, <b>${datos.jugador}</b>.<br>El sastre está decidiendo si acepta tu encargo… 🧵</p>
        <ul class="detalle-items">${lista}<li style="text-align:right;font-weight:800;">Total: ${formatoTotal(datos.total)}</li></ul>
        <p class="estado-texto" style="font-size:.85rem;color:#8a6c3a;">(Puedes cerrar esta ventana. Volverá a abrirse sola cuando el sastre responda.)</p>
        <button class="boton" id="boton-cerrar-estado">Esperar en silencio</button>
      </div>`;
  } else if (datos.estado === "aceptado") {
    contenido = `
      <div class="estado-pedido">
        <div class="estado-grande">🎉✨</div>
        <p class="estado-texto">¡<b>Encargo aceptado!</b> El sastre te entrega tus prendas:<br>¡Descárgalas y vístete con orgullo!</p>
        <div class="descargables">
          ${items.map(i => `<a class="boton-descarga" href="${encodeURI(i.archivo)}" download="${encodeURI(i.archivo)}">⬇️ Descargar «${i.nombre}»</a>`).join("")}
        </div>
        <button class="boton boton-nuevo">Hacer otro encargo</button>
      </div>`;
  } else if (datos.estado === "rechazado") {
    contenido = `
      <div class="estado-pedido">
        <div class="estado-grande">🥀</div>
        <p class="estado-texto">El sastre <b>rechazó</b> este encargo…<br>Quizá sus manos estaban ocupadas. ¡Vuelve a intentarlo!</p>
        <ul class="detalle-items">${lista}</ul>
        <button class="boton boton-nuevo">Hacer otro encargo</button>
      </div>`;
  }

  cuerpo.innerHTML = contenido;
  const cerrar = cuerpo.querySelector("#boton-cerrar-estado");
  if (cerrar) cerrar.addEventListener("click", () => cerrarVelo("#velo-pedido"));
  vincularBotonNuevo();
}

function vincularBotonNuevo() {
  const b = document.querySelector(".boton-nuevo");
  if (b) {
    b.addEventListener("click", () => {
      if (cancelarEscucha) { cancelarEscucha(); cancelarEscucha = null; }
      pedidoId = null;
      ultimoEstado = null;
      localStorage.removeItem(CLAVES.pedido);
      $("#aviso-pedido").hidden = true;
      cerrarVelo("#velo-pedido");
    });
  }
}

/* ---------- aviso superior ---------- */
function pintarAviso(datos) {
  const aviso = $("#aviso-pedido");
  aviso.style.cursor = "pointer";
  if (!pedidoId || !datos) { aviso.hidden = true; return; }
  aviso.hidden = false;
  aviso.className = "aviso";
  if (datos.estado === "pendiente") {
    aviso.classList.add("aviso-pendiente");
    aviso.textContent = "⏳ Tu encargo viaja hacia el sastre… toca para ver el estado";
  } else if (datos.estado === "aceptado") {
    aviso.classList.add("aviso-aceptado");
    aviso.textContent = "✅ ¡El sastre aceptó tu encargo! Toca aquí para descargar tus pieles";
  } else if (datos.estado === "rechazado") {
    aviso.classList.add("aviso-rechazado");
    aviso.textContent = "🥀 El sastre rechazó tu último encargo… toca para ver más";
  } else {
    aviso.hidden = true;
    return;
  }
  aviso.onclick = () => { pintarEstadoPedido(datos); abrirVelo("#velo-pedido"); };
}
