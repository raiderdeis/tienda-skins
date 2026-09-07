/* ============================================================
   ✏️ CATÁLOGO DE SKINS — añade y quita prendas aquí
   ============================================================
   Cada bloque { ... } es una skin. Cópialo, pégalo y edita:

   id:        nombre corto y ÚNICO, sin espacios ni tildes
   nombre:    nombre bonito que verán los jugadores
   precio:    mira abajo cómo se escribe 👇
   archivo:   el nombre EXACTO del PNG que subiste a GitHub
   categoria: sección donde aparece (ej: "Magos")
   nuevo:     true = cinta ¡NUEVO! / false = sin cinta
   slim:      true = modelo "Alex" (brazos finos) /
              false = modelo "Steve" (clásico)

   🪙 CÓMO ESCRIBIR EL PRECIO (con las monedas de tu reino):
     precio: "80"               → 🥉 80
     precio: "1 oro"            → 🥇 1
     precio: "1 oro 25 plata"   → 🥇 1  🥈 25
     precio: "2 diamantes"      → 💎 2
   La página desglosa el cambio sola: "150" → 🥈 2 🥉 50
   ============================================================ */

const CATALOGO = [
  {
    id: "guardia-real",
    nombre: "Guardia Real",
    precio: "1 oro",
    archivo: "guardia-real.png",
    categoria: "Caballeros",
    nuevo: true,
    slim: false
  },
  {
    id: "caballero-rosa",
    nombre: "Caballero de la Rosa",
    precio: "1 oro 25 plata",
    archivo: "caballero-rosa.png",
    categoria: "Caballeros",
    nuevo: false,
    slim: false
  },
  {
    id: "maga-nieves",
    nombre: "Maga de las Nieves",
    precio: "1 oro 50 plata",
    archivo: "maga-nieves.png",
    categoria: "Magos",
    nuevo: true,
    slim: true
  },
  {
    id: "hechicero-bosque",
    nombre: "Hechicero del Bosque",
    precio: "75 plata",
    archivo: "hechicero-bosque.png",
    categoria: "Magos",
    nuevo: false,
    slim: false
  },
  {
    id: "vestido-verano",
    nombre: "Vestido de Verano",
    precio: "30 plata",
    archivo: "vestido-verano.png",
    categoria: "Vestidos",
    nuevo: false,
    slim: true
  },
  {
    id: "princesa-alba",
    nombre: "Princesa del Alba",
    precio: "2 diamantes",
    archivo: "princesa-alba.png",
    categoria: "Vestidos",
    nuevo: true,
    slim: true
  },
  {
    id: "aldeana-humilde",
    nombre: "Aldeana Humilde",
    precio: "20 plata",
    archivo: "aldeana-humilde.png",
    categoria: "Aldeanos",
    nuevo: false,
    slim: true
  },
  {
    id: "monje-errante",
    nombre: "Monje Errante",
    precio: "25 plata",
    archivo: "monje-errante.png",
    categoria: "Aldeanos",
    nuevo: false,
    slim: false
  }
];
