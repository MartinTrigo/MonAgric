// MonAgric — service worker: deja la app usable sin conexión.
// Cachea el "cascarón" (HTML/CSS/JS/plan/íconos); los datos viajan aparte.
const CACHE = "monagric-v2";
const ARCHIVOS = [
  ".",
  "index.html",
  "styles.css",
  "app.js",
  "temporada.json",
  "manifest.webmanifest",
  "img/icon-192.png",
  "img/icon-512.png",
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
  if (e.request.method !== "GET") return;                       // los envíos no se cachean
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;              // la planilla siempre va a la red

  // El plan de la temporada cambia: se busca primero en la red y, si no hay
  // señal, se usa la copia guardada.
  if (url.pathname.endsWith("temporada.json")) {
    e.respondWith(
      fetch(e.request)
        .then((resp) => {
          const copia = resp.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copia));
          return resp;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
