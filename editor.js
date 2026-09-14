/* =========================================================
   🛠️ TALLER DEL SASTRE — no toques nada aquí
   ¡Todo se controla con los botones de la página! 🎮
   Solo el modista principal (sin @asistentes) entra aquí.
   ========================================================= */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, setDoc, getDoc,
  onSnapshot, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (sel) => document.querySelector(sel);

const BASE = {
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

let crudos = [];
let editandoId = null;
let imagenPendiente = null;
let visorModal = null;
let listenerCatalogo = null;
let piezasSeleccionadas = new Set();
let tokenVista = 0;
let outfitDeNuevaPieza = null; // id del outfit cuando creas una pieza desde su carpeta

/* 📂 carpetas abiertas en el catálogo (se recuerdan) */
let carpetasAbiertas = new Set();
try { carpetasAbiertas = new Set(JSON.parse(localStorage.getItem("sastre_carpetas") || "[]")); } catch (e) {}
function guardarCarpetas() {
  try { localStorage.setItem("sastre_carpetas", JSON.stringify([...carpetasAbiertas])); } catch (e) {}
}

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

/* ---------- 🩹 análisis de skins (arreglo de píxeles) ---------- */
function analizarSkin(dataUrl) {
  return new Promise((resolver) => {
    const img = new Image();
    img.onload = () => {
      const ancho = img.width, alto = img.height;
      const escala = ancho / 64;
      const valida = Number.isInteger(escala) && escala >= 1;
      let lienzo = null, ctx = null, legado = false;

      if (valida && ancho === alto * 2) {
        legado = true;
        lienzo = document.createElement("canvas");
        lienzo.width = ancho;
        lienzo.height = alto * 2;
        ctx = lienzo.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0);
        ctx.drawImage(img, 0, 16 * escala, 16 * escala, 16 * escala, 16 * escala, 48 * escala, 16 * escala, 16 * escala);
        ctx.drawImage(img, 40 * escala, 16 * escala, 16 * escala, 16 * escala, 32 * escala, 48 * escala, 16 * escala, 16 * escala);
      } else if (valida && ancho === alto) {
        lienzo = document.createElement("canvas");
        lienzo.width = ancho;
        lienzo.height = alto;
        ctx = lienzo.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0);
      } else {
        resolver({ imagen: dataUrl, slim: false, legado: false, formatoRaro: true });
        return;
      }

      const t = escala;
      const vacio = (x, y) => {
        try { return ctx.getImageData(Math.round(x * t), Math.round(y * t), 1, 1).data[3] === 0; }
        catch (e) { return false; }
      };
      const slim = vacio(50, 16) && vacio(54, 20) && vacio(42, 48) && vacio(46, 52);

      resolver({
        imagen: legado ? lienzo.toDataURL("image/png") : dataUrl,
        slim, legado, formatoRaro: false
      });
    };
    img.onerror = () => resolver({ imagen: dataUrl, slim: false, legado: false, formatoRaro: true });
    img.src = dataUrl;
  });
}

/* ---------- orden ---------- */
function porOrden(a, b) {
  const oa = typeof a.orden === "number" ? a.orden : 9999;
  const ob = typeof b.orden === "number" ? b.orden : 9999;
  if (oa !== ob) return oa - ob;
  return String(a.nombre || "").localeCompare(String(b.nombre || ""));
}

/* ---------- login ---------- */
if (!firebaseListo) {
  const err = $("#login-error");
  if (err) {
    err.hidden = false;
    err.textContent = "⚠️ Falta conectar Firebase: completa config.js.";
  }
} else {
  $("#form-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const correo = $("#login-correo").value.trim();
    const clave = $("#login-clave").value;
    const err = $("#login-error");
    err.hidden = true;
    try {
      await signInWithEmailAndPassword(auth, correo, clave);
    } catch (e2) {
      const codigo = e2 && e2.code ? e2.code : "";
      err.textContent = codigo.includes("invalid-credential") || codigo.includes("wrong-password") || codigo.includes("user-not-found")
        ? "Correo o contraseña incorrectos 🥀"
        : "Error: " + (codigo || "desconocido");
      err.hidden = false;
    }
  });

  onAuthStateChanged(auth, (usuario) => {
    if (usuario && esAsistente(usuario)) {
      $("#seccion-login").hidden = true;
      $("#seccion-editor").hidden = true;
      $("#seccion-sin-acceso").hidden = false;
      if (listenerCatalogo) { listenerCatalogo(); listenerCatalogo = null; }
      return;
    }
    if (usuario) {
      $("#seccion-login").hidden = true;
      $("#seccion-sin-acceso").hidden = true;
      $("#seccion-editor").hidden = false;
      cargarTodo();
    } else {
      $("#seccion-login").hidden = false;
      $("#seccion-sin-acceso").hidden = true;
      $("#seccion-editor").hidden = true;
      if (listenerCatalogo) { listenerCatalogo(); listenerCatalogo = null; }
    }
  });

  $("#boton-salir").addEventListener("click", async () => {
    try { await signOut(auth); toast("Has salido del taller 🚪"); } catch (e) {}
  });

  const botonSalirAsistente = document.getElementById("boton-salir-asistente");
  if (botonSalirAsistente) {
    botonSalirAsistente.addEventListener("click", async () => {
      try { await signOut(auth); } catch (e) {}
    });
  }
}

async function cargarTodo() {
  if (listenerCatalogo) return;

  if (!document.getElementById("pista-carpetas")) {
    const p = document.createElement("p");
    p.id = "pista-carpetas";
    p.className = "pista";
    p.style.textAlign = "center";
    p.innerHTML = "📂 Los outfits con piezas se muestran como carpetas: pulsa «Ver piezas» para desplegarlas, editarlas, moverlas o añadir más.";
    $("#lista-editor").insertAdjacentElement("beforebegin", p);
  }

  try {
    const snap = await getDoc(doc(db, "configuracion", "tienda"));
    pintarFormularioConfig(snap.exists() ? snap.data() : {});
  } catch (e) {
    pintarFormularioConfig({});
  }
  listenerCatalogo = onSnapshot(collection(db, "catalogo"), (snap) => {
    crudos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    pintarCatalogo();
  }, (err) => toast("⚠️ No pude leer el catálogo: " + (err.message || err)));
}

/* ---------- configuración ---------- */
function pintarFormularioConfig(datos) {
  $("#conf-nombre").value = datos.nombre || "El Sastre del Reino";
  $("#conf-subtitulo").value = datos.subtitulo || "";
  const monedas = (datos.monedas && datos.monedas.length) ? datos.monedas : BASE.monedas;
  const caja = $("#filas-monedas");
  caja.innerHTML = "";
  monedas.forEach(m => caja.appendChild(crearFilaMoneda(m)));
  actualizarPreviaPrecio();
}

function crearFilaMoneda(m) {
  m = m || {};
  const fila = document.createElement("div");
  fila.className = "fila-moneda";
  fila.innerHTML = `
    <input class="entrada moneda-emoji" type="text" maxlength="4" title="Emoji de la moneda">
    <input class="entrada" type="text" maxlength="16" placeholder="Nombre" title="Nombre de la moneda">
    <input class="entrada entrada-num" type="number" min="1" title="1 de esta = ¿cuántas de la moneda de arriba?">
    <button class="quitar-moneda" title="Quitar esta moneda">✕</button>
  `;
  const inputs = fila.querySelectorAll("input");
  inputs[0].value = m.emoji || "✨";
  inputs[1].value = m.nombre || "";
  inputs[2].value = m.equivale || 50;
  fila.querySelector(".quitar-moneda").addEventListener("click", () => {
    if ($("#filas-monedas").children.length > 1) fila.remove();
    else toast("Necesitas al menos una moneda 😄");
    actualizarPreviaPrecio();
  });
  return fila;
}

function monedasDesdeFormulario() {
  const filas = [...$("#filas-monedas").querySelectorAll(".fila-moneda")];
  return filas.map((f, i) => {
    const inputs = f.querySelectorAll("input");
    return {
      emoji: (inputs[0].value || "✨").trim(),
      nombre: (inputs[1].value || "").trim() || "Moneda",
      equivale: i === 0 ? 1 : Math.max(1, parseInt(inputs[2].value, 10) || 1)
    };
  });
}

 $("#boton-anadir-moneda").addEventListener("click", () => {
  $("#filas-monedas").appendChild(crearFilaMoneda({ emoji: "✨", nombre: "", equivale: 50 }));
});

 $("#filas-monedas").addEventListener("input", actualizarPreviaPrecio);

 $("#boton-guardar-config").addEventListener("click", async () => {
  const nombreT = $("#conf-nombre").value.trim();
  if (!nombreT) { toast("⚠️ Ponle un nombre a la tienda"); return; }
  try {
    await setDoc(doc(db, "configuracion", "tienda"), {
      nombre: nombreT,
      subtitulo: $("#conf-subtitulo").value.trim(),
      monedas: monedasDesdeFormulario()
    });
    toast("💾 ¡Configuración guardada! La tienda ya se está actualizando ✨");
  } catch (e) {
    toast("⚠️ No se pudo guardar: " + (e.message || e));
  }
});

/* ---------- catálogo (con carpetas de outfits 📂) ---------- */
function pintarCatalogo() {
  const cont = $("#lista-editor");
  cont.querySelectorAll(".escenario").forEach(caja => {
    observador.unobserve(caja);
    caja._destruido = true;
    if (caja._visor) { try { caja._visor.dispose(); } catch (e) {} caja._visor = null; }
  });
  cont.innerHTML = "";

  const monedas = prepararMonedas(monedasDesdeFormulario());
  const lista = crudos.slice().sort(porOrden);

  if (!lista.length) {
    cont.innerHTML = `<p class="vacio">Aún no hay prendas… ¡pulsa «✨ Añadir nueva prenda» para crear la primera! 🧵</p>`;
    return;
  }

  // prendas que son pieza de algún outfit (no se muestran sueltas)
  const enOutfit = new Set();
  lista.forEach(p => {
    if (p.piezas && p.piezas.length) {
      p.piezas.forEach(id => { if (lista.some(x => x.id === id)) enOutfit.add(id); });
    }
  });

  lista.forEach(p => {
    if (p.piezas && p.piezas.length) {
      cont.appendChild(crearGrupoOutfit(p, monedas));
    } else if (!enOutfit.has(p.id)) {
      cont.appendChild(crearTarjetaEditor(p, monedas, "suelta", null));
    }
  });
  observarLista();
}

function crearGrupoOutfit(outfit, monedas) {
  const grupo = document.createElement("section");
  grupo.className = "grupo-outfit";

  const piezas = (outfit.piezas || [])
    .map(id => crudos.find(c => c.id === id))
    .filter(Boolean)
    .sort(porOrden);

  const abierta = carpetasAbiertas.has(outfit.id);

  const cabecera = document.createElement("div");
  cabecera.className = "grupo-cabecera";
  const titulo = document.createElement("span");
  titulo.className = "grupo-titulo";
  titulo.textContent = `🧵 Outfit «${outfit.nombre || "Sin nombre"}» — ${piezas.length} ${piezas.length === 1 ? "pieza" : "piezas"}`;
  const botonCarpeta = document.createElement("button");
  botonCarpeta.type = "button";
  botonCarpeta.className = "boton";
  botonCarpeta.textContent = abierta ? "📂 Ocultar piezas" : `📂 Ver piezas (${piezas.length})`;
  botonCarpeta.addEventListener("click", () => {
    if (carpetasAbiertas.has(outfit.id)) carpetasAbiertas.delete(outfit.id);
    else carpetasAbiertas.add(outfit.id);
    guardarCarpetas();
    pintarCatalogo();
  });
  cabecera.appendChild(titulo);
  cabecera.appendChild(botonCarpeta);
  grupo.appendChild(cabecera);

  const rejilla = document.createElement("div");
  rejilla.className = "rejilla";
  grupo.appendChild(rejilla);

  rejilla.appendChild(crearTarjetaEditor(outfit, monedas, "outfit", null));

  if (abierta) {
    piezas.forEach(pz => rejilla.appendChild(crearTarjetaEditor(pz, monedas, "pieza", outfit.id)));
    rejilla.appendChild(crearTarjetaAnadirPieza(outfit));
  }
  return grupo;
}

function crearTarjetaEditor(p, monedas, modo, outfitId) {
  const esOutfit = modo === "outfit";
  const esPieza = modo === "pieza";
  const cobre = interpretarPrecio(p.precio, monedas);
  const badges = desglose(cobre, monedas)
    .map(b => `<span class="moneda-badge">${b.moneda.emoji} ${b.cant}</span>`)
    .join("");
  const tarjeta = document.createElement("article");
  tarjeta.className = "tarjeta"
    + (p.agotado ? " tarjeta-agotada" : "")
    + (esOutfit ? " tarjeta-outfit" : "")
    + (esPieza ? " tarjeta-pieza" : "");
  tarjeta.innerHTML = `
    ${esPieza ? '<span class="cinta-pieza">🧩 PIEZA</span>' : (p.nuevo ? '<span class="cinta-nuevo">¡NUEVO!</span>' : "")}
    ${p.agotado ? '<span class="cinta-agotado">SIN STOCK</span>' : ""}
    <div class="escenario escenario-mini" data-id="${p.id}" title="Arrastra para girar"></div>
    <h3 class="prenda-nombre">${p.nombre || "Sin nombre"}</h3>
    <div class="precio-monedas">${badges}</div>
    <p class="etiquetas-editor">
      ${p.categoria || "Sin categoría"}
      ${esOutfit ? " · 🧵 outfit" : ""}
      ${p.estante ? ` · 📍 ${p.estante}` : ""}
    </p>
    <div class="editor-botones">
      <button class="boton" data-mover="-1" title="${esPieza ? "Subir dentro del outfit" : "Subir en la lista"}">⬆️</button>
      <button class="boton" data-mover="1" title="${esPieza ? "Bajar dentro del outfit" : "Bajar en la lista"}">⬇️</button>
      <button class="boton" data-editar="1" title="Editar">✏️</button>
      <button class="boton boton-peligro" data-borrar="1" title="Borrar">🗑️</button>
    </div>
  `;
  tarjeta.querySelector("[data-editar]").addEventListener("click", () => abrirModalPrenda(p));
  tarjeta.querySelector("[data-borrar]").addEventListener("click", () => borrarPrenda(p));
  tarjeta.querySelectorAll("[data-mover]").forEach(b => {
    b.addEventListener("click", () => {
      const dir = parseInt(b.dataset.mover, 10);
      if (esPieza && outfitId) moverPiezaEnOutfit(outfitId, p.id, dir);
      else moverPrenda(p.id, dir);
    });
  });
  return tarjeta;
}

function crearTarjetaAnadirPieza(outfit) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "tarjeta tarjeta-anadir-pieza";
  b.title = "Crear una pieza nueva y añadirla a este outfit";
  b.innerHTML = `<span class="anadir-pieza-texto">➕<br><span>Añadir pieza<br>a este outfit</span></span>`;
  b.addEventListener("click", () => abrirModalPrenda(null, outfit.id));
  return b;
}

/* ---------- visores 3D de la lista (con análisis de skin) ---------- */
const observador = new IntersectionObserver((entradas) => {
  entradas.forEach(en => {
    const caja = en.target;
    if (en.isIntersecting) {
      caja._visible = true;
      if (!caja._visor && !caja._cargando) {
        caja._cargando = true;
        crearVisorLista(caja);
      } else if (caja._visor) {
        caja._visor.renderPaused = false;
      }
    } else {
      caja._visible = false;
      if (caja._visor) caja._visor.renderPaused = true;
    }
  });
}, { rootMargin: "150px" });

function observarLista() {
  document.querySelectorAll("#lista-editor .escenario").forEach(c => {
    if (!c._observado) { c._observado = true; observador.observe(c); }
  });
}

function crearVisorLista(caja) {
  const p = crudos.find(x => x.id === caja.dataset.id);
  if (!p || !p.imagen || typeof skinview3d === "undefined") {
    caja._cargando = false;
    const div = document.createElement("div");
    div.className = "piel-error";
    div.textContent = "🖼️ Sin imagen";
    caja.appendChild(div);
    return;
  }
  const canvas = document.createElement("canvas");
  caja.appendChild(canvas);
  analizarSkin(p.imagen).then(analisis => {
    caja._cargando = false;
    if (caja._destruido || !caja.isConnected) return;
    try {
      const visor = new skinview3d.SkinViewer({
        canvas: canvas,
        width: caja.clientWidth || 160,
        height: caja.clientHeight || 150
      });
      const carga = p.slim ? visor.loadSkin(analisis.imagen, { model: "slim" }) : visor.loadSkin(analisis.imagen);
      if (carga && carga.catch) carga.catch(() => {});
      try { visor.controls.enableZoom = false; visor.controls.enablePan = false; } catch (e) {}
      caja._visor = visor;
      if (!caja._visible) visor.renderPaused = true;
      let girando = true;
      canvas.addEventListener("pointerdown", () => { girando = false; });
      (function girar() {
        if (!caja.isConnected) return;
        if (girando && visor.player && !visor.renderPaused) visor.player.rotation.y += 0.011;
        requestAnimationFrame(girar);
      })();
    } catch (e) {}
  });
}

/* ---------- mover ---------- */
async function moverPrenda(id, dir) {
  const lista = crudos.slice().sort(porOrden);
  const i = lista.findIndex(p => p.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= lista.length) return;
  const temp = lista[i];
  lista[i] = lista[j];
  lista[j] = temp;
  try {
    const lote = writeBatch(db);
    lista.forEach((p, idx) => lote.update(doc(db, "catalogo", p.id), { orden: idx }));
    await lote.commit();
  } catch (e) {
    toast("⚠️ No se pudo mover: " + (e.message || e));
  }
}

async function moverPiezaEnOutfit(outfitId, piezaId, dir) {
  const outfit = crudos.find(x => x.id === outfitId);
  if (!outfit || !outfit.piezas) return;
  const piezas = outfit.piezas
    .map(id => crudos.find(c => c.id === id))
    .filter(Boolean)
    .sort(porOrden);
  const i = piezas.findIndex(x => x.id === piezaId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= piezas.length) return;
  const a = piezas[i], b = piezas[j];
  const oa = typeof a.orden === "number" ? a.orden : 9999;
  const ob = typeof b.orden === "number" ? b.orden : 9999;
  try {
    const lote = writeBatch(db);
    if (oa === ob) {
      lote.update(doc(db, "catalogo", b.id), { orden: ob + (dir > 0 ? -0.5 : 0.5) });
    } else {
      lote.update(doc(db, "catalogo", a.id), { orden: ob });
      lote.update(doc(db, "catalogo", b.id), { orden: oa });
    }
    await lote.commit();
  } catch (e) {
    toast("⚠️ No se pudo mover: " + (e.message || e));
  }
}

/* ---------- borrar ---------- */
async function borrarPrenda(p) {
  const esOutfit = p.piezas && p.piezas.length;
  let msg = `¿Borrar «${p.nombre || "esta prenda"}» de la vitrina?\n\n(Los jugadores con encargos ya ACEPTADOS podrán seguir descargándola.)`;
  if (esOutfit) msg += `\n\n(Sus ${p.piezas.length} piezas quedarán como prendas sueltas en la lista.)`;
  if (!confirm(msg)) return;
  try {
    await deleteDoc(doc(db, "catalogo", p.id));
    // si era pieza de algún outfit, quitar la referencia
    const outfits = crudos.filter(x => x.piezas && x.piezas.includes(p.id));
    for (const o of outfits) {
      try {
        await updateDoc(doc(db, "catalogo", o.id), { piezas: o.piezas.filter(id => id !== p.id) });
      } catch (e2) {}
    }
    toast("🗑️ Prenda borrada de la vitrina");
  } catch (e) {
    toast("⚠️ No se pudo borrar: " + (e.message || e));
  }
}

/* ---------- 🩹 botón de reparación de vistas ---------- */
 $("#boton-reparar-vistas").addEventListener("click", async () => {
  const boton = $("#boton-reparar-vistas");
  boton.disabled = true;
  let revisadas = 0, arregladas = 0;
  try {
    for (const p of crudos) {
      if (!p.imagen) continue;
      revisadas++;
      const a = await analizarSkin(p.imagen);
      if (a.slim !== !!p.slim) {
        await updateDoc(doc(db, "catalogo", p.id), { slim: a.slim });
        arregladas++;
      }
    }
    if (!revisadas) toast("Aún no hay prendas con imagen para revisar 🧵");
    else if (!arregladas) toast(`🩹 Revisé ${revisadas} prendas: ¡todas estaban bien! ✨`);
    else toast(`🩹 ${revisadas} revisadas — ${arregladas} ${arregladas === 1 ? "vista arreglada" : "vistas arregladas"} ✨`);
  } catch (e) {
    toast("⚠️ " + (e.message || e));
  }
  boton.disabled = false;
});

/* ---------- modal de prenda ---------- */
function abrirModalPrenda(p, outfitIdParaPieza) {
  editandoId = p ? p.id : null;
  outfitDeNuevaPieza = (!p && outfitIdParaPieza) ? outfitIdParaPieza : null;
  imagenPendiente = p ? (p.imagen || null) : null;
  piezasSeleccionadas = new Set(p && p.piezas ? p.piezas : []);
  $("#titulo-modal").textContent = p ? "✏️ Editar prenda" : "✨ Nueva prenda";
  $("#prenda-nombre").value = p ? (p.nombre || "") : "";
  $("#prenda-precio").value = p ? (p.precio != null ? String(p.precio) : "") : "";
  $("#prenda-categoria").value = p ? (p.categoria || "") : "";
  $("#prenda-nuevo").checked = !!(p && p.nuevo);
  $("#prenda-slim").checked = !!(p && p.slim);
  $("#prenda-agotado").checked = !!(p && p.agotado);
  $("#prenda-estante").value = p ? (p.estante || "") : "";
  $("#error-prenda").hidden = true;
  const cats = [...new Set(crudos.map(x => x.categoria).filter(Boolean))];
  $("#lista-categorias").innerHTML = cats.map(c => `<option value="${c}">`).join("");
  $("#velo-prenda").hidden = false;
  actualizarZonaTexto();
  recargarVisor();
  pintarListaPiezas();
  actualizarPreviaPrecio();

  if (p && p.imagen) {
    analizarSkin(p.imagen).then(a => {
      if (editandoId !== p.id || $("#velo-prenda").hidden) return;
      if ($("#prenda-slim").checked !== a.slim) {
        $("#prenda-slim").checked = a.slim;
        recargarVisor();
        toast(`🔍 Esta skin es modelo ${a.slim ? "Alex (brazos finos)" : "Steve"} — casilla ajustada, ¡guarda para arreglarla! 💾`);
      }
      if (a.legado) toast("🧵 Esta skin era de formato antiguo: en la tienda ya se ve bien 🎉");
    });
  }
}

function cerrarModalPrenda() {
  tokenVista++;
  $("#velo-prenda").hidden = true;
  if (visorModal) { try { visorModal.dispose(); } catch (e) {} visorModal = null; }
  $("#vista-prenda").innerHTML = "";
  editandoId = null;
  imagenPendiente = null;
  piezasSeleccionadas = new Set();
  outfitDeNuevaPieza = null;
}

function actualizarZonaTexto() {
  const zona = $("#zona-soltar");
  const texto = $("#texto-zona");
  if (imagenPendiente) {
    zona.classList.add("con-imagen");
    texto.innerHTML = "✅ ¡Imagen cargada!<br>Toca o arrastra otro PNG si quieres cambiarla";
  } else {
    zona.classList.remove("con-imagen");
    texto.innerHTML = "🖼️ Arrastra aquí tu PNG de skin<br>o toca para elegir el archivo";
  }
}

function recargarVisor() {
  const caja = $("#vista-prenda");
  tokenVista++;
  if (visorModal) { try { visorModal.dispose(); } catch (e) {} visorModal = null; }
  caja.innerHTML = "";
  if (!imagenPendiente || typeof skinview3d === "undefined") return;
  const canvas = document.createElement("canvas");
  caja.appendChild(canvas);
  const miToken = tokenVista;
  analizarSkin(imagenPendiente).then(analisis => {
    if (miToken !== tokenVista) return;
    try {
      visorModal = new skinview3d.SkinViewer({
        canvas: canvas,
        width: caja.clientWidth || 280,
        height: caja.clientHeight || 150
      });
      const slim = $("#prenda-slim").checked;
      const carga = slim
        ? visorModal.loadSkin(analisis.imagen, { model: "slim" })
        : visorModal.loadSkin(analisis.imagen);
      if (carga && carga.catch) carga.catch(() => toast("⚠️ No pude mostrar esa imagen…"));
      try { visorModal.controls.enableZoom = false; visorModal.controls.enablePan = false; } catch (e) {}
      let girando = true;
      canvas.addEventListener("pointerdown", () => { girando = false; });
      (function girar() {
        if (miToken !== tokenVista) return;
        if (girando && visorModal && visorModal.player) visorModal.player.rotation.y += 0.011;
        requestAnimationFrame(girar);
      })();
    } catch (e) {}
  });
}

/* ---------- lista de piezas del outfit (dentro del modal) ---------- */
function pintarListaPiezas() {
  const cont = $("#lista-piezas");
  cont.innerHTML = "";
  // candidatos: cualquier prenda que no sea este ni otro outfit
  const candidatos = crudos.filter(p => p.id !== editandoId && !(p.piezas && p.piezas.length));
  if (!candidatos.length) {
    cont.innerHTML = `<p class="etiquetas-editor">Aún no hay prendas sueltas para enlazar. Crea primero las piezas (o usa el botón «➕ Añadir pieza» dentro de la carpeta del outfit) 🧩</p>`;
    return;
  }
  const monedas = prepararMonedas(monedasDesdeFormulario());
  candidatos.forEach(p => {
    const cobre = interpretarPrecio(p.precio, monedas);
    const otroOutfit = crudos.find(x => x.id !== editandoId && x.piezas && x.piezas.includes(p.id));
    const nota = otroOutfit ? ` · ya en «${otroOutfit.nombre}»` : "";
    const label = document.createElement("label");
    label.className = "fila-pieza";
    label.innerHTML = `
      <input type="checkbox" ${piezasSeleccionadas.has(p.id) ? "checked" : ""}>
      ${p.imagen ? `<img src="${p.imagen}" alt="">` : ""}
      <span class="nombre-pieza">${p.nombre || "Sin nombre"} <small>(${p.categoria || "sin categoría"}${nota})</small></span>
      <span class="precio-pieza">${textoMonedas(cobre, monedas)}</span>
    `;
    const cb = label.querySelector("input");
    cb.addEventListener("change", () => {
      if (cb.checked) piezasSeleccionadas.add(p.id);
      else piezasSeleccionadas.delete(p.id);
    });
    cont.appendChild(label);
  });
}

 $("#boton-sumar-piezas").addEventListener("click", () => {
  if (!piezasSeleccionadas.size) { toast("⚠️ Marca primero alguna pieza en la lista de abajo"); return; }
  const monedas = prepararMonedas(monedasDesdeFormulario());
  let total = 0;
  piezasSeleccionadas.forEach(id => {
    const p = crudos.find(x => x.id === id);
    if (p) total += interpretarPrecio(p.precio, monedas);
  });
  $("#prenda-precio").value = textoMonedas(total, monedas);
  actualizarPreviaPrecio();
  toast("🧮 Precio = suma de las piezas. ¡Bájalo a mano si quieres darle descuento por pack! 😄");
});

/* zona de arrastre */
const zona = $("#zona-soltar");
const inputArchivo = $("#input-archivo");
zona.addEventListener("click", () => inputArchivo.click());
zona.addEventListener("dragover", (e) => { e.preventDefault(); zona.classList.add("arrastrando"); });
zona.addEventListener("dragleave", () => zona.classList.remove("arrastrando"));
zona.addEventListener("drop", (e) => {
  e.preventDefault();
  zona.classList.remove("arrastrando");
  const f = e.dataTransfer.files && e.dataTransfer.files[0];
  if (f) cargarArchivo(f);
});
inputArchivo.addEventListener("change", () => {
  if (inputArchivo.files && inputArchivo.files[0]) cargarArchivo(inputArchivo.files[0]);
  inputArchivo.value = "";
});

function cargarArchivo(f) {
  if (f.type && !f.type.includes("png")) { toast("⚠️ Tiene que ser un archivo PNG"); return; }
  if (f.size > 900 * 1024) { toast("⚠️ Ese PNG pesa demasiado (máximo ~900 KB)"); return; }
  const lector = new FileReader();
  lector.onload = () => {
    imagenPendiente = lector.result;
    actualizarZonaTexto();
    recargarVisor();
    analizarSkin(imagenPendiente).then(a => {
      if ($("#velo-prenda").hidden || !imagenPendiente) return;
      if ($("#prenda-slim").checked !== a.slim) {
        $("#prenda-slim").checked = a.slim;
        recargarVisor();
        toast(`🔍 Detecté modelo ${a.slim ? "Alex (brazos finos) — casilla marcada solita ✅" : "Steve — casilla desmarcada solita ✅"}`);
      }
      if (a.legado) toast("🧵 ¡Era una skin de formato antiguo! Ya quedó arreglada la vista 🎉");
      else if (a.formatoRaro) toast("🤔 Esa imagen no mide como una skin (64x64, 128x128…). La acepto igual si tú quieres.");
    });
  };
  lector.readAsDataURL(f);
}

 $("#prenda-slim").addEventListener("change", recargarVisor);

/* vista previa del precio */
 $("#prenda-precio").addEventListener("input", actualizarPreviaPrecio);

function actualizarPreviaPrecio() {
  const texto = $("#prenda-precio").value.trim();
  const previa = $("#previa-precio");
  if (!texto) {
    previa.innerHTML = `<span class="etiquetas-editor">Escribe el precio y aquí verás las monedas 🪙</span>`;
    return;
  }
  const monedas = prepararMonedas(monedasDesdeFormulario());
  const cobre = interpretarPrecio(texto, monedas);
  previa.innerHTML = desglose(cobre, monedas)
    .map(b => `<span class="moneda-badge">${b.moneda.emoji} ${b.cant}</span>`)
    .join("");
}

/* guardar prenda */
 $("#boton-nueva-prenda").addEventListener("click", () => abrirModalPrenda(null));
 $("#boton-cancelar-prenda").addEventListener("click", () => {
  if (imagenPendiente || $("#prenda-nombre").value.trim() || $("#prenda-precio").value.trim()) {
    if (!confirm("¿Cerrar sin guardar? Se perderán los cambios de esta ventana.")) return;
  }
  cerrarModalPrenda();
});
 $("#velo-prenda").addEventListener("click", (e) => {
  if (e.target === $("#velo-prenda")) {
    if (imagenPendiente || $("#prenda-nombre").value.trim() || $("#prenda-precio").value.trim()) {
      if (!confirm("¿Cerrar sin guardar? Se perderán los cambios de esta ventana.")) return;
    }
    cerrarModalPrenda();
  }
});

 $("#boton-guardar-prenda").addEventListener("click", async () => {
  const nombreP = $("#prenda-nombre").value.trim();
  const precio = $("#prenda-precio").value.trim();
  const categoria = $("#prenda-categoria").value.trim() || "Varias";
  const err = $("#error-prenda");
  err.hidden = true;

  if (!imagenPendiente) { err.textContent = "⚠️ Falta la imagen: arrastra un PNG arriba."; err.hidden = false; return; }
  if (!nombreP) { err.textContent = "⚠️ Ponle un nombre a la prenda."; err.hidden = false; return; }
  if (!precio) { err.textContent = "⚠️ Ponle un precio (puedes escribir 0 si es un regalo)."; err.hidden = false; return; }

  const datos = {
    nombre: nombreP,
    precio: precio,
    categoria: categoria,
    nuevo: $("#prenda-nuevo").checked,
    slim: $("#prenda-slim").checked,
    agotado: $("#prenda-agotado").checked,
    estante: $("#prenda-estante").value.trim(),
    piezas: Array.from(piezasSeleccionadas),
    imagen: imagenPendiente
  };

  try {
    if (editandoId) {
      await updateDoc(doc(db, "catalogo", editandoId), datos);
      toast("✅ Prenda actualizada");
    } else {
      const maxOrden = crudos.reduce((m, p) => Math.max(m, typeof p.orden === "number" ? p.orden : 0), 0);
      const ref = await addDoc(collection(db, "catalogo"), { ...datos, orden: maxOrden + 1 });
      if (outfitDeNuevaPieza) {
        const outfit = crudos.find(x => x.id === outfitDeNuevaPieza);
        if (outfit) {
          await updateDoc(doc(db, "catalogo", outfit.id), { piezas: [...(outfit.piezas || []), ref.id] });
          carpetasAbiertas.add(outfit.id);
          guardarCarpetas();
          toast(`🧩 Pieza añadida al outfit «${outfit.nombre}» ✨`);
        } else {
          toast("✨ ¡Prenda añadida a la vitrina!");
        }
      } else {
        toast("✨ ¡Prenda añadida a la vitrina!");
      }
    }
    cerrarModalPrenda();
  } catch (e) {
    err.textContent = "⚠️ No se pudo guardar: " + (e.message || e);
    err.hidden = false;
  }
});
