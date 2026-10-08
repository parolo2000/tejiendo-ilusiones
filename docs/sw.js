// Service worker de Tejiendo Ilusiones (lo genera tools/construir-web.cjs; no editar docs/sw.js a mano).
// La app se guarda en el móvil al instalarla y funciona sin conexión. Los datos de la usuaria no pasan por aquí:
// siguen en el almacenamiento del navegador.
const VERSION = "62e7195f131a";
const APP = "app-" + VERSION;
const OCR = "ocr-86e1ac103c70";
const FUENTES = "fuentes-1";
const BASE = ["./","index.html","manifest.webmanifest","icono.svg","icono-180.png","icono-192.png","icono-512.png","icono-recortable-512.png","lib/pdf.min.js","lib/pdf.worker.min.js","lib/tesseract.min.js"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(APP).then((c) => c.addAll(BASE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((claves) => Promise.all(claves.filter((k) => ![APP, OCR, FUENTES].includes(k)).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Primero la red (para recibir mejoras) y, sin conexión, lo guardado
async function redPrimero(req) {
  const c = await caches.open(APP);
  try {
    const r = await fetch(req);
    if (r.ok) c.put("./", r.clone());
    return r;
  } catch {
    return (await c.match("./")) || (await c.match("index.html")) || Response.error();
  }
}
// Lo guardado primero; si no está, se descarga y se guarda
async function guardadoPrimero(req, cache) {
  const c = await caches.open(cache);
  const guardado = await c.match(req, { ignoreSearch: true });
  if (guardado) return guardado;
  const r = await fetch(req);
  if (r.ok || r.type === "opaque") c.put(req, r.clone());
  return r;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (req.mode === "navigate" && url.origin === location.origin) return e.respondWith(redPrimero(req));
  if (url.origin === location.origin) {
    if (url.pathname.includes("/ocr/")) return e.respondWith(guardadoPrimero(req, OCR));
    return e.respondWith(guardadoPrimero(req, APP));
  }
  if (/^fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) return e.respondWith(guardadoPrimero(req, FUENTES));
});
