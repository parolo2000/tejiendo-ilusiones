// Construye la versión instalable (PWA) de Tejiendo Ilusiones en la carpeta docs/.
// Uso (desde la carpeta tejiendo-ilusiones):
//   NODE_PATH=$(npm root -g) node tools/construir-web.cjs
// La fuente sigue siendo tejiendo-ilusiones.html: este script solo la envuelve con lo que necesita una app
// instalable (manifiesto, iconos, service worker para funcionar sin conexión) y copia lib/ y ocr/.
// docs/ se puede subir tal cual a cualquier alojamiento estático gratuito (GitHub Pages, Netlify, Cloudflare Pages).
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const RAIZ = path.resolve(__dirname, "..");
const WEB = path.join(RAIZ, "docs"); // GitHub Pages publica la carpeta docs/ de la rama main
const COLOR_FONDO = "#F2F4EF", COLOR_FONDO_OSCURO = "#141A18", COLOR_MARCA = "#8A2F5E";

// El mismo ovillo de la cabecera de la app, sobre fondo claro y con margen para los iconos recortados de Android
const ICONO_SVG = (margen) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 34 34">
<rect width="34" height="34" fill="${COLOR_FONDO}"/>
<g transform="translate(${17 - 17 * margen} ${17 - 17 * margen}) scale(${margen})">
<circle cx="16" cy="16" r="13" fill="${COLOR_MARCA}"/>
<path d="M5 12c7 3 15 3 22 0M4 18c8 3 16 3 24 0M9 6c5 7 6 14 4 22M19 4c3 8 3 16 0 24" stroke="#fff" stroke-width="1.6" fill="none" opacity=".75"/>
<path d="M26 26l5 5" stroke="#2C6A63" stroke-width="3" stroke-linecap="round"/></g></svg>`;

function copiarCarpeta(origen, destino, filtro = () => true) {
  fs.mkdirSync(destino, { recursive: true });
  for (const f of fs.readdirSync(origen)) {
    const o = path.join(origen, f);
    if (fs.statSync(o).isFile() && filtro(f)) fs.copyFileSync(o, path.join(destino, f));
  }
}
const huella = (archivos) => {
  const h = crypto.createHash("sha256");
  for (const f of archivos) h.update(f).update(fs.readFileSync(path.join(WEB, f)));
  return h.digest("hex").slice(0, 12);
};

async function iconosPNG() {
  let chromium;
  try { ({ chromium } = require("playwright")); }
  catch { throw new Error("Hace falta Playwright para dibujar los iconos: NODE_PATH=$(npm root -g) node tools/construir-web.cjs"); }
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const [nombre, lado, margen] of [["icono-180.png", 180, 0.92], ["icono-192.png", 192, 0.92], ["icono-512.png", 512, 0.92], ["icono-recortable-512.png", 512, 0.7]]) {
    await page.setViewportSize({ width: lado, height: lado });
    await page.setContent(`<style>html,body{margin:0}svg{display:block;width:${lado}px;height:${lado}px}</style>${ICONO_SVG(margen)}`);
    await page.screenshot({ path: path.join(WEB, nombre) });
  }
  await browser.close();
}

(async () => {
  fs.rmSync(WEB, { recursive: true, force: true });
  fs.mkdirSync(WEB, { recursive: true });

  const app = fs.readFileSync(path.join(RAIZ, "tejiendo-ilusiones.html"), "utf8");
  const cabecera = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="theme-color" content="${COLOR_FONDO}" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="${COLOR_FONDO_OSCURO}" media="(prefers-color-scheme: dark)">
<meta name="description" content="Tu libreta de ganchillo: patrones vuelta a vuelta, contador y gráficos. Funciona sin conexión.">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icono.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="icono-180.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Tejiendo">
<script>window.TI_LOCAL = true;</script>
`;
  const registro = `
<script>
if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
</script>
</html>
`;
  fs.writeFileSync(path.join(WEB, "index.html"), cabecera + app + registro);
  fs.writeFileSync(path.join(WEB, "icono.svg"), ICONO_SVG(0.92));
  await iconosPNG();

  fs.writeFileSync(path.join(WEB, "manifest.webmanifest"), JSON.stringify({
    name: "Tejiendo Ilusiones",
    short_name: "Tejiendo",
    description: "Tu libreta de ganchillo: patrones vuelta a vuelta, contador y gráficos.",
    lang: "es",
    start_url: "./",
    scope: "./",
    display: "standalone",
    orientation: "any",
    background_color: COLOR_FONDO,
    theme_color: COLOR_FONDO,
    icons: [
      { src: "icono-192.png", sizes: "192x192", type: "image/png" },
      { src: "icono-512.png", sizes: "512x512", type: "image/png" },
      { src: "icono-recortable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "icono.svg", sizes: "any", type: "image/svg+xml" },
    ],
  }, null, 2));

  copiarCarpeta(path.join(RAIZ, "lib"), path.join(WEB, "lib"), f => f.endsWith(".js"));
  copiarCarpeta(path.join(RAIZ, "ocr"), path.join(WEB, "ocr"), f => !f.endsWith(".txt"));
  fs.writeFileSync(path.join(WEB, ".nojekyll"), "");

  // Lo que se guarda al instalar (pequeño). El lector de fotos (13 MB) se guarda la primera vez que se usa.
  const BASE = ["index.html", "manifest.webmanifest", "icono.svg", "icono-180.png", "icono-192.png", "icono-512.png", "icono-recortable-512.png",
    "lib/pdf.min.js", "lib/pdf.worker.min.js", "lib/tesseract.min.js"];
  const OCR = fs.readdirSync(path.join(WEB, "ocr")).map(f => "ocr/" + f).sort();
  const sw = fs.readFileSync(path.join(__dirname, "sw-plantilla.js"), "utf8")
    .replace("__VERSION__", huella(BASE))
    .replace("__VERSION_OCR__", huella(OCR))
    .replace("__BASE__", JSON.stringify(["./", ...BASE]));
  fs.writeFileSync(path.join(WEB, "sw.js"), sw);

  const total = (dir) => fs.readdirSync(dir, { recursive: true }).map(f => path.join(dir, f)).filter(f => fs.statSync(f).isFile()).reduce((a, f) => a + fs.statSync(f).size, 0);
  console.log(`docs/ lista: ${(total(WEB) / 1e6).toFixed(1)} MB (se instala con ${(BASE.reduce((a, f) => a + fs.statSync(path.join(WEB, f)).size, 0) / 1e6).toFixed(1)} MB)`);
})().catch(e => { console.error(e.message); process.exit(1); });
