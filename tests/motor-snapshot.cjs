// Saca una "foto" de lo que produce el motor de patrones con un HTML concreto.
// Uso: node tests/motor-snapshot.cjs <archivo.html> > tests/motor-referencia.json
const { pathToFileURL } = require("node:url");
const path = require("node:path");

const CASOS_EXTRA = [
  "Vuelta 1: 6 pb en el anillo. (6)",
  "Vuelta 3: *1 pb, 1 aum* repetir 6 veces. (18)",
  "Vueltas 7 a 20: 3 cad, 1 pa en cada punto, pd. (72)",
  "Rnd 2: 2 sc in each st (12)",
  "Row 3: *ch 3, skip 2, dc in next* repeat 4 times",
  "Vuelta 5: 3 medio punto, 1 aumento x 6 (30)",
  "R4: *2 varetas, 1 cadena* 5 veces (15)",
  "Haz 26 cad (unos 15 cm de ancho).",
];

async function abrir(browser, file) {
  const page = await browser.newPage();
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await page.goto(pathToFileURL(path.resolve(file)).href);
  return page;
}

async function snapshot(browser, file) {
  const page = await abrir(browser, file);
  const out = await page.evaluate((extra) => {
    const r = {};
    r.patrones = BASE.map(p => ({
      id: p.id,
      filas: textoAFilas(p.pasos.join("\n")),
      objetivos: p.pasos.map(objetivoDe),
      porPaso: p.pasos.map(t => lineaAFilas(t).length),
    }));
    r.filaATexto = r.patrones.map(p => p.filas.map(filaATexto));
    r.extra = extra.map(t => ({ t, filas: lineaAFilas(t), obj: objetivoDe(t) }));
    r.repartir = [[30, 36], [36, 30], [12, 18], [18, 12], [6, 12], [10, 25], [7, 7], [24, 18]].map(([a, b]) => repartir(a, b));
    r.circulo = ["pb", "mpa", "pa"].map(k => textoCirculo(k, 8));
    return r;
  }, CASOS_EXTRA);
  await page.close();
  return out;
}

module.exports = { snapshot, abrir };

if (require.main === module) {
  (async () => {
    const { chromium } = require("playwright");
    const browser = await chromium.launch();
    console.log(JSON.stringify(await snapshot(browser, process.argv[2]), null, 1));
    await browser.close();
  })();
}
