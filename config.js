/* ============================================================
   ✏️ CONFIGURACIÓN DE LA TIENDA — este archivo SÍ es tuyo
   ============================================================ */

const TIENDA = {

  // Nombre de tu tienda (sale en el cartel de madera)
  nombre: "El Sastre del Reino",

  // Frase decorativa bajo el nombre
  subtitulo: "Atelier de pieles finas para viajeros distinguidos ✨",

  /* ---------------------------------------------------------
     🪙 MONEDAS DEL REINO (solo informativas — la página NUNCA
     cobra nada: el pago se hace dentro de Minecraft)

     - La primera moneda es la base y vale 1
     - "equivale" = cuántas de la moneda ANTERIOR vale 1 de esta
     Puedes cambiar nombres, emojis y valores a tu gusto.
  --------------------------------------------------------- */
  monedas: [
    { nombre: "Cobre",    emoji: "🥉", equivale: 1  },  // moneda base
    { nombre: "Plata",    emoji: "🥈", equivale: 50 },  // 1 Plata    = 50 Cobre
    { nombre: "Oro",      emoji: "🥇", equivale: 50 },  // 1 Oro      = 50 Plata
    { nombre: "Diamante", emoji: "💎", equivale: 50 }   // 1 Diamante = 50 Oro
  ],

  // --- CONEXIÓN CON FIREBASE (paso 3 de la guía) ---
  // ⚠️ Si aún tienes PEGA_AQUÍ, reemplázalos con los datos
  // de TU proyecto de Firebase (Configuración del proyecto).
  firebase: {
    apiKey: "PEGA_AQUÍ",
    authDomain: "PEGA_AQUÍ",
    projectId: "PEGA_AQUÍ",
    storageBucket: "PEGA_AQUÍ",
    messagingSenderId: "PEGA_AQUÍ",
    appId: "PEGA_AQUÍ"
  }
};
