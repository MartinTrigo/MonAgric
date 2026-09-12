// MonAgric — service worker: deja la app usable sin conexión.
//
// Estrategia "red primero, caché de respaldo": con señal siempre se usa la
// última versión publicada (así las mejoras llegan solas a los celulares) y sin
// señal se sirve la última copia guardada, que es lo que importa en el campo.
const CACHE = "monagric-v18";
const ARCHIVOS = [
  ".",
  "index.html",
  "styles.css",
  "app.js",
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

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;                  // los envíos no se cachean
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;         // las planillas van siempre a la red

  // Se le pide a la red que revalide siempre. Sin esto, fetch() respeta la
  // cache del navegador y GitHub manda max-age=600: el telefono podia seguir
  // sirviendo su copia vieja sin preguntar, aunque el service worker estuviera
  // al dia. Con "no-cache" viaja el ETag y el servidor responde 304 si no
  // cambio nada, asi que no cuesta datos de mas.
  let pedido = e.request;
  try { pedido = new Request(e.request, { cache: "no-cache" }); } catch (_) { /* navegadores viejos */ }

  e.respondWith(
    fetch(pedido)
      .then((resp) => {
        if (resp.ok) {
          const copia = resp.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copia));
        }
        return resp;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match("index.html")))
  );
});
