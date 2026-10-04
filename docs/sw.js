// MonAgric — service worker: deja la app usable sin conexión.
//
// Estrategia "red primero, caché de respaldo": con señal siempre se usa la
// última versión publicada (así las mejoras llegan solas a los celulares) y sin
// señal se sirve la última copia guardada, que es lo que importa en el campo.
// Desde el 01/10, al abrir la app se espera a la red un máximo de 3 segundos:
// con señal débil, la copia (ver abrir()).
const CACHE = "monagric-v75";
const ARCHIVOS = [
  ".",
  "index.html",
  "styles.css",
  "js/base.js",
  "js/catalogo.js",
  "js/servicio.js",
  "js/componentes.js",
  "js/pendientes.js",
  "js/plan-grafico.js",
  "js/plan-mapa.js",
  "js/plan-cultivos.js",
  "js/ficha.js",
  "js/registros.js",
  "js/cuentas.js",
  "js/tareas.js",
  "js/configuracion.js",
  "js/formularios.js",
  "js/vistas.js",
  "js/render.js",
  "js/arranque.js",
  "catalogo.json",
  "manifest.webmanifest",
  "img/icon-192.png",
  "img/icon-512.png",
  "img/pacfarm.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Cuánto se espera a la red al abrir la app. Con señal buena contesta mucho
// antes; con señal débil —no nula: lo típico en el campo— "red primero"
// dejaba la pantalla en blanco hasta que cada pedido fallara o llegara.
const ESPERA_RED_MS = 3000;

// Si la última apertura salió de la copia guardada, todo lo que pida esa
// página sale de la copia también: así no se mezclan archivos de dos
// versiones (el index nuevo con un js viejo, o al revés).
let usarCopia = false;

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;                  // los envíos no se cachean
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;         // las planillas van siempre a la red
  if (e.request.mode === "navigate") e.respondWith(abrir(e.request));
  else e.respondWith(usarCopia ? copiaPrimero(e.request) : redPrimero(e.request));
});

// Se le pide a la red que revalide siempre. Sin esto, fetch() respeta la
// cache del navegador y GitHub manda max-age=600: el telefono podia seguir
// sirviendo su copia vieja sin preguntar, aunque el service worker estuviera
// al dia. Con "no-cache" viaja el ETag y el servidor responde 304 si no
// cambio nada, asi que no cuesta datos de mas. Lo que llega se guarda.
function deLaRed(pedido) {
  let p = pedido;
  try { p = new Request(pedido, { cache: "no-cache" }); } catch (_) { /* navegadores viejos */ }
  return fetch(p).then((resp) => {
    if (resp.ok) {
      const copia = resp.clone();
      caches.open(CACHE).then((c) => c.put(pedido, copia));
    }
    return resp;
  });
}

// Abrir la app: la red, pero no más de ESPERA_RED_MS. Si no llega, la copia
// guardada, y la red sigue por detrás: la próxima apertura ya está al día.
async function abrir(pedido) {
  const red = deLaRed(pedido);
  red.catch(() => {});                                      // si falla más tarde, no importa
  const plazo = new Promise((ok) => setTimeout(() => ok(null), ESPERA_RED_MS));
  let resp = null;
  try { resp = await Promise.race([red, plazo]); } catch (_) { resp = null; }
  if (resp) { usarCopia = false; return resp; }
  const copia = (await caches.match(pedido)) || (await caches.match("index.html"));
  if (copia) { usarCopia = true; return copia; }
  usarCopia = false;
  return red;                                               // sin copia: no queda otra que esperar
}

// Todo lo demás, con señal: la red, y si falla, la copia (como siempre).
function redPrimero(pedido) {
  return deLaRed(pedido).catch(() => caches.match(pedido).then((hit) => hit || caches.match("index.html")));
}

// Después de abrir con la copia: la copia, y la red solo si no hay copia.
async function copiaPrimero(pedido) {
  const hit = await caches.match(pedido);
  if (hit) { deLaRed(pedido).catch(() => {}); return hit; }
  return deLaRed(pedido);
}
