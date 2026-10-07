// Tests de Tejiendo Ilusiones. Uso (desde la carpeta tejiendo-ilusiones):
//   NODE_PATH=$(npm root -g) node tests/app.test.cjs
// Necesita Playwright con Chromium (gratis). Deja capturas en tests/capturas/.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const http = require("node:http");
const { snapshot } = require("./motor-snapshot.cjs");

const APP = path.resolve(__dirname, "..", "tejiendo-ilusiones.html");
const URL = pathToFileURL(APP).href;
const CAPTURAS = path.join(__dirname, "capturas");
fs.mkdirSync(CAPTURAS, { recursive: true });

// Datos tal como los guardaba la versión anterior (sin número de versión)
const LEGADO = {
  patrones: [{ id: "m-1", titulo: "Manta para la nieta", nivel: "Fácil", hilo: "", ganchillo: "4 mm", descripcion: "", notas: "", color: "#8A2F5E",
    pasos: ["Haz 30 cad.", "Vuelta 1: 1 pb en la 2ª cad y en cada cad. (29)", "Vueltas 2 a 4: 1 cad, 1 pb en cada punto. (29)", "Repite la vuelta 2 hasta que mida 80 cm.", "Corta el hilo."] }],
  progreso: { "m-1": { paso: 1, vueltas: 3, puntos: 7, notas: "voy por aquí", tiempo: 1200, ult: 1700000000000 }, "b-gorro": { paso: 2, vueltas: 0, puntos: 0, notas: "", tiempo: 40 } },
  graficos: [{ id: "g-1", nombre: "Mi mandala", cols: 12, vista: "redondo", modo: "simbolos", celdas: [["am", ...Array(11).fill("")], Array(12).fill("pb")] }],
  lanas: [{ id: "l-1", nombre: "Algodón", color: "#C0392B", gramos: 50, ovillos: 3 }],
  conFoto: {}, libre: { vueltas: 4, puntos: 2 }, escala: 1.2, t: 1700000000000,
};

let fallos = 0, pasados = 0;
async function prueba(nombre, fn) {
  try { await fn(); pasados++; console.log("  ✓ " + nombre); }
  catch (e) { fallos++; console.log("  ✗ " + nombre + "\n    " + (e.stack || e).toString().split("\n").slice(0, 4).join("\n    ")); }
}

async function nuevaPagina(browser, opts = {}, datos = null) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, ...opts });
  if (datos) await ctx.addInitScript(d => { if (!sessionStorage.getItem("sembrado")) { localStorage.clear(); localStorage.setItem("rincon-ganchillo-v1", d); sessionStorage.setItem("sembrado", "1"); } }, JSON.stringify(datos));
  const page = await ctx.newPage();
  page.errores = [];
  page.on("pageerror", e => page.errores.push(e.message));
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource|net::ERR/.test(m.text())) page.errores.push(m.text()); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await page.goto(URL);
  return page;
}
const estado = page => page.evaluate(() => JSON.parse(localStorage.getItem("rincon-ganchillo-v1")));

(async () => {
  const browser = await chromium.launch();

  console.log("Motor de patrones");
  await prueba("lee los patrones igual que la versión de referencia", async () => {
    const ref = JSON.parse(fs.readFileSync(path.join(__dirname, "motor-referencia.json"), "utf8"));
    assert.deepEqual(await snapshot(browser, APP), ref);
  });

  console.log("Datos");
  await prueba("migra los datos antiguos sin perder nada y guarda una copia", async () => {
    const page = await nuevaPagina(browser, {}, LEGADO);
    const st = await estado(page);
    assert.equal(st.v, 3);
    assert.deepEqual(st.patrones, LEGADO.patrones);
    assert.deepEqual(st.graficos, LEGADO.graficos);
    assert.deepEqual(st.lanas, LEGADO.lanas);
    assert.deepEqual(st.libre, LEGADO.libre);
    assert.equal(st.escala, 1.2);
    assert.equal(st.progreso["m-1"].notas, "voy por aquí");
    assert.equal(st.progreso["m-1"].puntos, 7);
    assert.equal(st.progreso["m-1"].rep, 0);
    assert.deepEqual(st.prefs, { tejer: "sofa", sonido: true, vibrar: true, auto: true, avisoApp: true });
    const copia = await page.evaluate(() => localStorage.getItem("rincon-ganchillo-v1-copia-v1"));
    assert.deepEqual(JSON.parse(copia), LEGADO);
    // Al volver a abrir no se migra otra vez ni se toca la copia
    await page.reload();
    assert.equal((await estado(page)).v, 3);
    assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem("rincon-ganchillo-v1-copia-v1"))), LEGADO);
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });
  await prueba("recuperar una copia de seguridad antigua también la migra", async () => {
    const page = await nuevaPagina(browser);
    const st = await page.evaluate(d => { state = Object.assign({ patrones: [], progreso: {}, graficos: [], lanas: [], conFoto: {}, libre: { vueltas: 0, puntos: 0 }, escala: 1 }, d); normalizarEstado(); return state; }, LEGADO);
    assert.equal(st.v, 3); assert.equal(st.progreso["m-1"].rep, 0); assert.equal(st.prefs.auto, true);
    // una copia tocada a mano no puede meter estilos raros por el color
    const limpio = await page.evaluate(d => { const c = JSON.parse(JSON.stringify(d)); c.patrones[0].color = "red;position:fixed;inset:0"; c.lanas[0].color = "url(x)"; state = Object.assign({ patrones: [], progreso: {}, graficos: [], lanas: [], conFoto: {}, libre: { vueltas: 0, puntos: 0 }, escala: 1 }, c); normalizarEstado(); return [state.patrones[0].color, state.lanas[0].color]; }, LEGADO);
    assert.match(limpio[0], /^#[0-9A-F]{6}$/i); assert.equal(limpio[1], "#8A9594");
    assert.deepEqual(st.labores, [], "sin nada terminado, el cuaderno empieza vacío");
    await page.context().close();
  });

  console.log("Modo sofá: lógica");
  await prueba("reconoce el tipo de cada paso", async () => {
    const page = await nuevaPagina(browser);
    const r = await page.evaluate(() => [
      "Haz un anillo mágico.", "Vuelta 3: *1 pb, 1 aum* repetir 6 veces. (18)", "Vueltas 7 a 20: 3 cad, 1 pa en cada punto, pd. (72)",
      "Repite la vuelta 2 hasta que mida unos 150 cm. Usa el contador de vueltas.", "Vuelta 1: 3 cad (cuentan como 1 pa), 2 pa en el anillo, 2 cad. *3 pa en el anillo, 2 cad* repetir 3 veces. Cierra con 1 pd en la 3ª cad del principio. (4 grupos)",
      "Haz 26 cad (unos 15 cm de ancho).", "Teje una tira (20 cm)", "Vueltas 21 y 22: 1 cad, 1 pb en cada punto, pd. (72)", "Rnd 2: 2 sc in each st (12)",
    ].map(infoPaso));
    assert.deepEqual(r.map(x => x.modo), ["accion", "puntos", "puntos", "hasta", "puntos", "accion", "accion", "puntos", "puntos"]);
    assert.deepEqual(r.map(x => x.objetivo), [0, 18, 72, 0, 4, 0, 0, 72, 12]);
    assert.deepEqual(r.map(x => x.reps), [1, 1, 14, 1, 1, 1, 1, 2, 1]);
    assert.deepEqual(r.map(x => x.vuelta), [0, 3, 7, 0, 1, 0, 0, 21, 2]);
    assert.equal(r[4].unidad, "grupos");
    await page.context().close();
  });
  await prueba("teje el gorro entero a toques: vueltas que se repiten y paso final", async () => {
    const page = await nuevaPagina(browser);
    const r = await page.evaluate(() => {
      const p = BASE.find(x => x.id === "b-gorro"), pr = { paso: 0, puntos: 0, vueltas: 0, rep: 0 };
      const eventos = {}; let toques = 0;
      while (pr.paso < p.pasos.length && toques < 5000) { const ev = sofaTocar(pr, p.pasos, { auto: true }); eventos[ev] = (eventos[ev] || 0) + 1; toques++; }
      return { pr, eventos, toques };
    });
    // 12+24+36+48+60+72 puntos + 14×72 + 2×72 + 2 pasos sin cuenta (anillo y cortar)
    assert.equal(r.toques, 12 + 24 + 36 + 48 + 60 + 72 + 14 * 72 + 2 * 72 + 2);
    assert.equal(r.pr.vueltas, 6 + 14 + 2);
    assert.equal(r.eventos.vuelta, 13 + 1);
    assert.equal(r.eventos.fin, 1);
    assert.ok(r.pr.fin > 0);
    await page.context().close();
  });
  await prueba("sin pasar sola: sigue contando y la vuelta se pasa a mano", async () => {
    const page = await nuevaPagina(browser);
    const r = await page.evaluate(() => {
      const pasos = ["Vuelta 1: 6 pb. (6)", "Vuelta 2: 12 pb. (12)"], pr = { paso: 0, puntos: 0, vueltas: 0, rep: 0 };
      for (let i = 0; i < 8; i++) sofaTocar(pr, pasos, { auto: false });
      const antes = { ...pr }; const ev = sofaVueltaHecha(pr, pasos);
      return { antes, ev, pr };
    });
    assert.equal(r.antes.puntos, 8); assert.equal(r.antes.paso, 0);
    assert.equal(r.ev, "paso"); assert.equal(r.pr.paso, 1); assert.equal(r.pr.puntos, 0);
    await page.context().close();
  });

  console.log("Modo sofá: pantalla");
  await prueba("móvil: un toque suma, pasa sola, deshace y no hay que bajar", async () => {
    const page = await nuevaPagina(browser);
    await page.evaluate(() => go({ name: "patron", id: "b-posavasos" }));
    await page.getByRole("button", { name: "Empezar a tejer" }).click();
    await page.waitForSelector(".sofa");
    assert.equal(await page.evaluate(() => view.name), "sofa");
    // Ni pestañas ni barra de arriba, y nada que bajar
    assert.equal(await page.locator("nav.tabs").isVisible(), false);
    assert.ok(await page.evaluate(() => document.scrollingElement.scrollHeight <= innerHeight + 1));
    const caja = await page.locator(".sofa-big").boundingBox();
    assert.ok(caja.height >= 844 * 0.4, "el botón ocupa casi media pantalla: " + caja.height);
    await page.screenshot({ path: path.join(CAPTURAS, "sofa-movil-paso1.png") });
    // Paso 1 (anillo mágico): un toque y al paso 2
    await page.locator(".sofa-big").tap();
    await page.waitForTimeout(200);
    assert.match(await page.locator(".sofa-paso").textContent(), /Paso 2 de 8/);
    for (let i = 0; i < 5; i++) { await page.locator(".sofa-big").tap(); await page.waitForTimeout(170); }
    assert.equal(await page.locator(".sofa-num").textContent(), "5");
    assert.match(await page.locator(".sofa-goal").textContent(), /faltan 1/);
    await page.screenshot({ path: path.join(CAPTURAS, "sofa-movil-contando.png") });
    await page.locator(".sofa-big").tap(); await page.waitForTimeout(200);
    assert.match(await page.locator(".sofa-paso").textContent(), /Paso 3 de 8/);
    assert.equal(await page.locator(".sofa-flash").isVisible(), true);
    // El aviso se quita al seguir contando, para no tapar el paso
    await page.waitForTimeout(160); await page.locator(".sofa-big").tap();
    assert.equal(await page.locator(".sofa-flash").isVisible(), false);
    await page.getByRole("button", { name: "Deshacer el último toque" }).tap();
    await page.screenshot({ path: path.join(CAPTURAS, "sofa-movil-vuelta-hecha.png") });
    // Deshacer devuelve al paso 2 con 5 puntos
    await page.getByRole("button", { name: "Deshacer el último toque" }).tap();
    assert.match(await page.locator(".sofa-paso").textContent(), /Paso 2 de 8/);
    assert.equal(await page.locator(".sofa-num").textContent(), "5");
    // Pedal / teclado
    await page.locator("body").focus();
    await page.evaluate(() => document.activeElement.blur());
    await page.waitForTimeout(200); // los toques a menos de 150 ms se ignoran (rebote del dedo)
    await page.keyboard.press("ArrowRight");
    assert.match(await page.locator(".sofa-paso").textContent(), /Paso 3 de 8/);
    await page.keyboard.press("ArrowLeft");
    assert.match(await page.locator(".sofa-paso").textContent(), /Paso 2 de 8/);
    // Se guarda: al recargar sigue igual y vuelve al modo sofá desde Inicio
    await page.reload();
    await page.locator(".continue").click();
    await page.waitForSelector(".sofa");
    assert.equal(await page.locator(".sofa-num").textContent(), "5");
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });
  await prueba("vueltas repetidas del gorro y paso «hasta que mida» de la bufanda", async () => {
    const page = await nuevaPagina(browser);
    await page.evaluate(() => { prog("b-gorro").paso = 7; prog("b-gorro").rep = 2; save(); go({ name: "sofa", id: "b-gorro" }); });
    assert.equal(await page.locator(".sofa-info .eyebrow").textContent(), "Vuelta 9 · repetición 3 de 14");
    await page.screenshot({ path: path.join(CAPTURAS, "sofa-movil-repeticiones.png") });
    await page.evaluate(() => { prog("b-bufanda").paso = 3; save(); go({ name: "sofa", id: "b-bufanda" }); });
    assert.equal(await page.locator(".sofa-info .eyebrow").textContent(), "Repite hasta que esté");
    // Entre toques más de 150 ms: la app ignora los toques dobles más rápidos (dedo que rebota)
    await page.waitForTimeout(200);
    await page.locator(".sofa-big").tap(); await page.waitForTimeout(250); await page.locator(".sofa-big").tap();
    await page.waitForFunction(() => document.querySelector(".sofa-num").textContent === "2", null, { timeout: 2000 }).catch(() => {});
    assert.equal(await page.locator(".sofa-num").textContent(), "2");
    await page.getByRole("button", { name: "Ya está →" }).tap();
    assert.match(await page.locator(".sofa-paso").textContent(), /Paso 5 de 5/);
    await page.screenshot({ path: path.join(CAPTURAS, "sofa-movil-ultimo-paso.png") });
    await page.locator(".sofa-big").tap(); await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => view.name), "tejer");
    assert.match(await page.locator(".stepbox").textContent(), /Terminado/);
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });
  await prueba("opciones: vista completa se recuerda y se puede volver", async () => {
    const page = await nuevaPagina(browser);
    await page.evaluate(() => go({ name: "sofa", id: "b-bola" }));
    await page.getByRole("button", { name: "Opciones" }).tap();
    await page.screenshot({ path: path.join(CAPTURAS, "sofa-movil-opciones.png") });
    await page.getByRole("button", { name: /Pasar de vuelta sola/ }).tap();
    assert.equal((await estado(page)).prefs.auto, false);
    await page.getByRole("button", { name: /Vista completa/ }).tap();
    assert.equal(await page.evaluate(() => view.name), "tejer");
    await page.evaluate(() => tejer("b-bola"));
    assert.equal(await page.evaluate(() => view.name), "tejer");
    await page.screenshot({ path: path.join(CAPTURAS, "vista-completa-movil.png"), fullPage: true });
    await page.getByRole("button", { name: /Modo sofá/ }).tap();
    assert.equal(await page.evaluate(() => view.name), "sofa");
    assert.equal((await estado(page)).prefs.tejer, "sofa");
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });
  await prueba("modo oscuro, móvil tumbado, pantalla pequeña y escritorio", async () => {
    const casos = [
      ["oscuro", { colorScheme: "dark" }],
      ["tumbado", { viewport: { width: 844, height: 390 } }],
      ["pequeno", { viewport: { width: 320, height: 568 } }],
      ["escritorio", { viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false }],
    ];
    for (const [nombre, opts] of casos) {
      const page = await nuevaPagina(browser, opts);
      await page.evaluate(() => { state.escala = 1.3; applyScale(); prog("b-granny").paso = 1; go({ name: "sofa", id: "b-granny" }); });
      await page.waitForTimeout(150);
      assert.ok(await page.evaluate(() => document.scrollingElement.scrollHeight <= innerHeight + 1), nombre + ": hay que bajar");
      const txt = await page.locator(".sofa-txt").evaluate(e => ({ sh: e.scrollHeight, ch: e.clientHeight }));
      await page.screenshot({ path: path.join(CAPTURAS, "sofa-" + nombre + ".png") });
      // En pantallas muy bajas el texto largo puede necesitar desplazarse dentro de su caja
      assert.ok(txt.ch >= 60, nombre + ": casi no se ve el texto del paso " + JSON.stringify(txt));
      if (["oscuro", "escritorio"].includes(nombre)) assert.ok(txt.sh <= txt.ch + 1, nombre + ": el texto no cabe " + JSON.stringify(txt));
      assert.deepEqual(page.errores, []);
      await page.context().close();
    }
  });

  console.log("Importar un patrón");
  const BOLA_EN = `Easy Amigurumi Ball
Materials: worsted cotton, 3.5 mm hook, stuffing.
Rnd 1: 6 sc in magic ring (6)
Rnd 2: inc in each st around (12)
Rnd 3: (sc, inc) x6 (18)
Rnd 4: *sc in next 2 sts, inc; rep from * 5 more times. [24]
Rnds 5-8: sc in each st around. (24 sts)
Rnd 9: (2 sc, dec) x 6 – 18 sts
Stuff the ball.
Rnd 10: [sc, dec] 6 times (12) Rnd 11: dec 6 times (6)
Fasten off and weave in ends.`;
  await prueba("traduce un patrón en inglés y todas las vueltas cuadran", async () => {
    const page = await nuevaPagina(browser);
    const r = await page.evaluate(t => importarTexto(t), BOLA_EN);
    assert.equal(r.ingles, true); assert.equal(r.uk, false);
    assert.equal(r.titulo, "Easy Amigurumi Ball"); assert.equal(r.ganchillo, "3,5 mm");
    assert.match(r.notas, /^Materials/);
    assert.equal(r.pasos.length, 10, "la vuelta 11 pegada a la 10 se separa");
    assert.equal(r.pasos[0], "Vuelta 1: 6 pb en anillo mágico (6)");
    assert.equal(r.pasos[4], "Vueltas 5 al 8: pb en cada punto alrededor. (24)");
    assert.equal(r.revision.filter(x => x.estado === "cuadra").length, 8);
    assert.equal(r.revision.filter(x => ["distinto", "duda"].includes(x.estado)).length, 0);
    // y el modo sofá entiende lo importado: 4 repeticiones en «Vueltas 5 al 8»
    assert.equal(await page.evaluate(t => infoPaso(t).reps, r.pasos[4]), 4);
    await page.context().close();
  });
  await prueba("términos del Reino Unido: dc es punto bajo y tr punto alto", async () => {
    const page = await nuevaPagina(browser);
    const r = await page.evaluate(() => [traducirIngles("Rnd 2: 2 dc in each st (12)", false), traducirIngles("Rnd 2: 2 dc in each st (12)", true),
      traducirIngles("Round 1: ch 3 (counts as 1 tr), 11 tr into ring, join with ss. (12)", true), esUK("Round 1: ch 3, 2 tr, htr"), esUK("Rnd 1: 6 sc, 2 dc")]);
    assert.equal(r[0], "Vuelta 2: 2 pa en cada punto (12)");
    assert.equal(r[1], "Vuelta 2: 2 pb en cada punto (12)");
    assert.equal(r[2], "Vuelta 1: 3 cad (cuenta como 1 pa), 11 pa en anillo, cierra con pd. (12)");
    assert.equal(r[3], true); assert.equal(r[4], false);
    await page.context().close();
  });
  await prueba("los patrones en español no cambian y los incluidos no dan falsos avisos", async () => {
    const page = await nuevaPagina(browser);
    const r = await page.evaluate(() => ({
      base: BASE.flatMap(p => p.pasos.map(revisarLinea).filter(x => ["distinto", "duda"].includes(x.estado))),
      igual: BASE.every(p => { const i = importarTexto(p.titulo + "\n" + p.pasos.join("\n")); return !i.ingles && JSON.stringify(i.pasos) === JSON.stringify(p.pasos) && i.titulo === p.titulo; }),
    }));
    assert.deepEqual(r.base, []); assert.equal(r.igual, true);
    await page.context().close();
  });
  await prueba("«1 pb en la 2ª cad y en cada cad» cuenta todos los puntos de la vuelta", async () => {
    const page = await nuevaPagina(browser);
    const r = await page.evaluate(() => ["Vuelta 1: 1 pb en la 2ª cad y en cada cad. (29)", "Vuelta 1: 1 pb en la 2ª cad y en cada cad hasta el final (19)"].map(revisarLinea));
    assert.deepEqual(r.map(x => [x.estado, x.n]), [["cuadra", 29], ["cuadra", 19]]);
    await page.context().close();
  });
  await prueba("pantalla: pegar, revisar, guardar y tejer en modo sofá", async () => {
    const page = await nuevaPagina(browser);
    await page.evaluate(() => go({ name: "patrones" }));
    await page.getByRole("button", { name: "Añadir un patrón" }).tap();
    await page.getByRole("button", { name: "Leer el patrón" }).tap();
    assert.match(await page.locator(".empty").textContent(), /Pega aquí/);
    await page.locator("#im-texto").fill(BOLA_EN);
    await page.getByRole("button", { name: "Leer el patrón" }).tap();
    assert.match(await page.locator(".note:not(.leyendo)").first().textContent(), /inglés/);
    assert.equal(await page.locator("ol.importados li").count(), 10);
    await page.screenshot({ path: path.join(CAPTURAS, "importar-movil.png"), fullPage: true });
    await page.getByRole("button", { name: "Reino Unido" }).tap();
    assert.match(await page.locator("ol.importados li").first().textContent(), /6 sc/, "en R. U. «sc» no existe y no se traduce");
    await page.getByRole("button", { name: "EE. UU." }).tap();
    await page.locator("#im-nombre").fill("");
    await page.getByRole("button", { name: "Guardar y tejer" }).tap();
    assert.match(await page.locator("p[style*=danger]").textContent(), /nombre/);
    await page.locator("#im-nombre").fill("Bola en inglés");
    await page.getByRole("button", { name: "Guardar y tejer" }).tap();
    assert.equal(await page.evaluate(() => view.name), "sofa");
    const st = await estado(page);
    assert.equal(st.patrones[0].titulo, "Bola en inglés");
    assert.equal(st.patrones[0].pasos.length, 10);
    assert.equal(st.patrones[0].original, BOLA_EN);
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });

  console.log("Importar desde PDF y foto");
  // Servidor local: el lector de fotos necesita abrir la app desde una dirección web, como en el artifact
  const RAIZ = path.resolve(__dirname, "..");
  const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".gz": "application/gzip", ".pdf": "application/pdf", ".png": "image/png" };
  const servidor = http.createServer((req, res) => {
    const f = path.join(RAIZ, decodeURIComponent(new globalThis.URL(req.url, "http://x").pathname));
    if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": TIPOS[path.extname(f)] || "application/octet-stream" });
    res.end(req.method === "HEAD" ? undefined : fs.readFileSync(f));
  });
  await new Promise(ok => servidor.listen(0, "127.0.0.1", ok));
  const WEB = "http://127.0.0.1:" + servidor.address().port + "/tejiendo-ilusiones.html";
  const VENDOR = path.join(RAIZ, "lib");
  async function paginaWeb(opts = {}, datos = null) {
    const page = await nuevaPagina(browser, opts, datos);
    // Las librerías de los CDN, desde copias locales idénticas (el contenedor de pruebas no sale a internet)
    await page.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/pdf\.js\/3\.11\.174\/(pdf(\.worker)?\.min\.js)$/, (r) => r.fulfill({ path: path.join(VENDOR, r.request().url().split("/").pop()), contentType: "text/javascript" }));
    await page.route(/cdn\.jsdelivr\.net\/npm\/tesseract\.js@5\.1\.1\/dist\/tesseract\.min\.js$/, (r) => r.fulfill({ path: path.join(VENDOR, "tesseract.min.js"), contentType: "text/javascript" }));
    await page.goto(WEB);
    return page;
  }
  // Ficheros de prueba hechos con el propio Chromium: un PDF con texto, una foto del patrón y un PDF escaneado
  const PATRON_PDF = `<style>body{font:15px Georgia;margin:40px} h1{font-size:22px}</style>
<h1>Posavasos de colores</h1><p>Materiales: algodón de 4 mm y ganchillo de 3,5 mm.</p>
<p>Vuelta 1: 6 pb en anillo mágico (6)</p><p>Vuelta 2: 2 pb en cada punto (12)</p>
<p>Vuelta 3: *1 pb, 1 aum* repetir 6 veces (18)</p><p>Vuelta 4: *2 pb, 1 aum* repetir 6 veces (24)</p><p>Remata y esconde las hebras.</p>`;
  const PATRON_FOTO = `<body style="margin:0;background:#f3efe6"><div style="font:30px Arial;line-height:1.5;padding:40px;color:#222">
<b>Bola amigurumi</b><br>Rnd 1: 6 sc in magic ring (6)<br>Rnd 2: 2 sc in each st (12)<br>Rnd 3: (sc, inc) x6 (18)<br>Rnds 4-6: sc in each st around (18)<br>Fasten off.</div></body>`;
  const fx = await browser.newPage();
  await fx.setContent(PATRON_PDF); const pdfTexto = await fx.pdf({ format: "A5" });
  await fx.setViewportSize({ width: 700, height: 420 }); await fx.setContent(PATRON_FOTO);
  const foto = await fx.screenshot({ type: "png" });
  await fx.setContent(`<img src="data:image/png;base64,${foto.toString("base64")}" style="width:100%">`); const pdfEscaneado = await fx.pdf({ format: "A5" });
  await fx.close();
  const subir = async (page, id, nombre, mimeType, buffer) => page.setInputFiles(id, { name: nombre, mimeType, buffer });
  const esperarLectura = page => page.waitForFunction(() => document.querySelector("ol.importados li") || document.querySelector(".leyendo:not([hidden])")?.textContent.match(/No he podido|Necesito|contraseña/), null, { timeout: 120000 });

  await prueba("PDF con texto: lee el patrón, cuadran las vueltas y se guarda", async () => {
    const page = await paginaWeb();
    await page.evaluate(() => go({ name: "importar" }));
    await subir(page, "#im-pdf", "posavasos.pdf", "application/pdf", pdfTexto);
    await esperarLectura(page);
    const r = await page.evaluate(() => importarTexto(document.querySelector("#im-texto").value));
    assert.equal(r.titulo, "Posavasos de colores");
    assert.equal(r.ganchillo, "3,5 mm");
    assert.deepEqual(r.pasos.slice(0, 2), ["Vuelta 1: 6 pb en anillo mágico (6)", "Vuelta 2: 2 pb en cada punto (12)"]);
    assert.equal(r.revision.filter(x => x.estado === "cuadra").length, 4);
    assert.equal(await page.locator("#im-nombre").inputValue(), "Posavasos de colores");
    await page.screenshot({ path: path.join(CAPTURAS, "importar-pdf-movil.png"), fullPage: true });
    await page.getByRole("button", { name: "Guardar patrón" }).tap();
    assert.equal((await estado(page)).patrones[0].pasos.length, 5);
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });
  await prueba("foto de un patrón en inglés: lo lee en el móvil y lo traduce", async () => {
    const page = await paginaWeb();
    await page.evaluate(() => go({ name: "importar" }));
    await subir(page, "#im-foto", "foto.png", "image/png", foto);
    await page.waitForFunction(() => /Leyendo/.test(document.querySelector(".leyendo").textContent), null, { timeout: 120000 });
    await page.screenshot({ path: path.join(CAPTURAS, "importar-foto-leyendo.png") });
    await esperarLectura(page);
    const r = await page.evaluate(() => importarTexto(document.querySelector("#im-texto").value));
    assert.equal(r.ingles, true);
    assert.deepEqual(r.pasos.slice(0, 3), ["Vuelta 1: 6 pb en anillo mágico (6)", "Vuelta 2: 2 pb en cada punto (12)", "Vuelta 3: *pb, aum* repetir 6 veces (18)"], "leído: " + JSON.stringify(r.pasos));
    assert.equal(r.revision.filter(x => x.estado === "cuadra").length, 4);
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });
  await prueba("PDF escaneado (sin texto): lo lee como una foto", async () => {
    const page = await paginaWeb();
    await page.evaluate(() => go({ name: "importar" }));
    await subir(page, "#im-pdf", "escaneado.pdf", "application/pdf", pdfEscaneado);
    await esperarLectura(page);
    const r = await page.evaluate(() => importarTexto(document.querySelector("#im-texto").value));
    assert.equal(r.pasos.length, 5);
    assert.equal(r.revision.filter(x => x.estado === "cuadra").length, 4);
    await page.context().close();
  });
  await prueba("archivos que no se pueden leer: avisa claro y no se rompe", async () => {
    const page = await paginaWeb();
    await page.evaluate(() => go({ name: "importar" }));
    await subir(page, "#im-pdf", "roto.pdf", "application/pdf", Buffer.from("esto no es un pdf"));
    await esperarLectura(page);
    assert.match(await page.locator(".leyendo").textContent(), /No he podido abrir este archivo/);
    // Sin los datos del lector publicados (o sin red), la foto da la alternativa de copiar el texto
    await page.route(/\/ocr\//, r => r.fulfill({ status: 404 }));
    await subir(page, "#im-foto", "foto.png", "image/png", foto);
    await page.waitForFunction(() => /No he podido leer la foto/.test(document.querySelector(".leyendo").textContent));
    assert.match(await page.locator(".leyendo").textContent(), /copiarlo y pegarlo/);
    assert.equal(await page.getByRole("button", { name: /Foto del patrón/ }).isEnabled(), true);
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });
  await prueba("los arreglos de lectura corrigen números confundidos con letras", async () => {
    const page = await nuevaPagina(browser);
    const r = await page.evaluate(() => arreglarLectura("Rnd l: 6 sc (6)\nRnd 2: 2 sc in each st (l2)\nRnd 5: sc (3O)\nRow I. 10 ch (Iast)"));
    assert.equal(r, "Rnd 1: 6 sc (6)\nRnd 2: 2 sc in each st (12)\nRnd 5: sc (30)\nRow 1. 10 ch (Iast)");
    await page.context().close();
  });
  console.log("Mis labores");
  await prueba("lo ya terminado pasa al cuaderno al actualizar, sin tocar el progreso ni la foto", async () => {
    const TERMINADO = JSON.parse(JSON.stringify(LEGADO));
    TERMINADO.progreso["m-1"] = { paso: 5, vueltas: 9, puntos: 0, notas: "con lana azul", tiempo: 4000, fin: 1700000500000 };
    const page = await nuevaPagina(browser, {}, TERMINADO);
    const st = await estado(page);
    assert.equal(st.labores.length, 1);
    assert.equal(st.labores[0].titulo, "Manta para la nieta");
    assert.equal(st.labores[0].fin, 1700000500000);
    assert.equal(st.labores[0].tiempo, 4000);
    assert.equal(st.labores[0].fotoDe, "m-1", "la labor apunta a la foto del patrón, no se mueve nada");
    assert.deepEqual(st.progreso["m-1"], { ...TERMINADO.progreso["m-1"], rep: 0 }, "el progreso se queda igual (solo el campo rep de la v2)");
    // y no se duplica al volver a abrir
    await page.reload();
    assert.equal((await estado(page)).labores.length, 1);
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });
  await prueba("al terminar un patrón se guarda con para quién y aparece en el cuaderno", async () => {
    const page = await nuevaPagina(browser, {}, LEGADO);
    await page.evaluate(() => { const pr = prog("m-1"); pr.paso = 4; pr.tiempo = 3700; save(); go({ name: "tejer", id: "m-1" }); });
    await page.getByRole("button", { name: /Terminar/ }).tap();
    await page.locator("#labor-para").fill("mi nieta Lucía");
    await page.getByRole("button", { name: "Guardar en mis labores" }).tap();
    assert.equal(await page.evaluate(() => view.name), "labores");
    const st = await estado(page);
    assert.equal(st.labores.length, 1);
    assert.equal(st.labores[0].para, "mi nieta Lucía");
    assert.equal(st.labores[0].titulo, "Manta para la nieta");
    assert.match(await page.locator(".labor").first().textContent(), /Para mi nieta Lucía/);
    assert.match(await page.locator(".labor").first().textContent(), /1 h 01 min/);
    await page.screenshot({ path: path.join(CAPTURAS, "labores-movil.png"), fullPage: true });
    // se puede cambiar para quién y quitarla del cuaderno
    await page.getByRole("button", { name: "Cambiar" }).first().tap();
    await page.locator(".labor input").fill("mi vecina");
    await page.getByRole("button", { name: "Guardar", exact: true }).tap();
    assert.equal((await estado(page)).labores[0].para, "mi vecina");
    await page.getByRole("button", { name: "Cambiar" }).first().tap();
    await page.getByRole("button", { name: "Quitar del cuaderno" }).tap();
    await page.getByRole("button", { name: /Toca otra vez/ }).tap();
    assert.deepEqual((await estado(page)).labores, []);
    assert.equal(await page.evaluate(() => state.patrones.length), LEGADO.patrones.length, "el patrón sigue estando");
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });
  await prueba("el cuaderno enseña lo que está a medias y se llega desde la pestaña", async () => {
    const page = await nuevaPagina(browser, {}, LEGADO);
    await page.getByRole("button", { name: "Mis labores" }).first().tap();
    assert.equal(await page.evaluate(() => view.name), "labores");
    assert.match(await page.locator(".continue").first().textContent(), /Manta para la nieta/);
    assert.match(await page.locator(".empty").textContent(), /Aquí irá lo que termines/);
    await page.locator(".continue").first().tap();
    assert.equal(await page.evaluate(() => view.name), "sofa", "desde el cuaderno se sigue tejiendo");
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });

  await prueba("compartir una labor hace una tarjeta con la foto, el nombre y para quién", async () => {
    const page = await nuevaPagina(browser, {}, LEGADO);
    const r = await page.evaluate(async () => {
      const l = { id: "l-1", patron: "m-1", titulo: "Manta para la nieta", para: "mi nieta Lucía", nota: "", fin: 1700000500000, tiempo: 7300 };
      state.labores = [l]; save();
      const cv = await tarjetaLaborImagen(l);
      const d = cv.getContext("2d").getImageData(0, 0, 1, 1).data;
      return { ancho: cv.width, alto: cv.height, fondo: [d[0], d[1], d[2]], url: cv.toDataURL("image/png").slice(0, 21) };
    });
    assert.equal(r.ancho, 1080); assert.equal(r.alto, 1350);
    assert.deepEqual(r.fondo, [242, 244, 239], "el fondo es el color de la app");
    assert.equal(r.url, "data:image/png;base64");
    // y desde la pantalla, sin poder compartir ni descargar, enseña la imagen para guardarla con el dedo
    await page.evaluate(() => go({ name: "labores" }));
    await page.getByRole("button", { name: "Compartir" }).first().tap();
    await page.waitForSelector(".overlay img");
    assert.match(await page.locator(".overlay").textContent(), /Mantén el dedo/);
    assert.ok((await page.locator(".overlay img").getAttribute("src")).startsWith("data:image/png"));
    await page.screenshot({ path: path.join(CAPTURAS, "compartir-labor.png") });
    await page.goBack(); await page.waitForTimeout(150);
    assert.equal(await page.locator(".overlay").count(), 0, "atrás cierra la imagen");
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });

  console.log("Enviar un patrón con un enlace");
  await prueba("el enlace lleva el patrón entero y se lee igual, con tildes y todo", async () => {
    const page = await paginaWeb();
    const r = await page.evaluate(async () => {
      const p = buscar("b-gorro");
      const url = await enlaceDePatron(p);
      const leido = await leerEnlace(new URL(url).hash);
      return { url, leido, titulo: p.titulo, pasos: p.pasos };
    });
    assert.ok(r.url.startsWith("https://parolo2000.github.io/tejiendo-ilusiones/#patron="), "desde claude.ai el enlace lleva a la app instalable");
    assert.match(r.url, /#patron=1[A-Za-z0-9_-]+$/);
    assert.ok(r.url.length < 3000, "comprimido ocupa poco: " + r.url.length);
    assert.equal(r.leido.titulo, r.titulo);
    assert.deepEqual(r.leido.pasos, r.pasos);
    await page.context().close();
  });
  await prueba("un enlace manipulado no guarda nada raro ni se rompe", async () => {
    const page = await paginaWeb();
    const r = await page.evaluate(async () => {
      const cod = async d => "#patron=" + await comprimirTexto(JSON.stringify(d));
      return {
        sinPasos: await leerEnlace(await cod({ t: "Hola", p: [] })),
        tipos: await leerEnlace(await cod({ t: { x: 1 }, p: ["Vuelta 1: 6 pb"] })),
        basura: await leerEnlace("#patron=1%%%"),
        noJson: await leerEnlace("#patron=0" + btoa("no es json")),
        largo: await leerEnlace("#patron=1" + "A".repeat(70000)),
        script: await leerEnlace(await cod({ t: "<img src=x onerror=alert(1)>", p: ["<script>alert(1)</script>", 5, null], color: "red;background:url(x)" })),
      };
    });
    assert.equal(r.sinPasos, null); assert.equal(r.tipos, null); assert.equal(r.basura, null); assert.equal(r.noJson, null); assert.equal(r.largo, null);
    assert.equal(r.script.titulo, "<img src=x onerror=alert(1)>", "se guarda como texto, no como HTML");
    assert.deepEqual(r.script.pasos, ["<script>alert(1)</script>"], "solo textos");
    assert.equal(r.script.color, undefined, "no se acepta nada que no sea del patrón");
    await page.context().close();
  });
  await prueba("abrir un enlace: se enseña, se guarda solo si se quiere y se puede tejer", async () => {
    const page = await paginaWeb({}, LEGADO);
    const url = WEB + (await page.evaluate(() => enlaceDePatron({ titulo: "Posavasos de Carmen <b>", pasos: ["Vuelta 1: 6 pb en anillo mágico (6)", "Vuelta 2: 2 pb en cada punto (12)"], ganchillo: "3 mm", notas: "Con algodón" }))).replace(/^[^#]*/, "");
    const antes = (await estado(page)).patrones.length;
    await page.goto(url);
    await page.waitForFunction(() => view.name === "recibido");
    assert.equal(await page.locator("h1").textContent(), "Posavasos de Carmen <b>");
    assert.equal(await page.evaluate(() => location.hash), "", "el enlace se limpia de la barra");
    assert.equal((await estado(page)).patrones.length, antes, "no se guarda nada sin pedirlo");
    await page.screenshot({ path: path.join(CAPTURAS, "patron-recibido.png"), fullPage: true });
    await page.getByRole("button", { name: "Guardar y tejer" }).tap();
    assert.equal(await page.evaluate(() => view.name), "sofa");
    const st = await estado(page);
    assert.equal(st.patrones.length, antes + 1);
    assert.equal(st.patrones[0].titulo, "Posavasos de Carmen <b>");
    assert.equal(st.patrones[0].ganchillo, "3 mm");
    // abrir el mismo enlace otra vez no lo duplica
    await page.goto(url);
    await page.waitForFunction(() => view.name === "recibido");
    assert.match(await page.locator(".note").first().textContent(), /Ya lo tienes/);
    // un enlace roto avisa y deja la app normal
    await page.goto(url.replace(/#patron=.*/, "#patron=1xyz"));
    await page.waitForTimeout(300);
    assert.notEqual(await page.evaluate(() => view.name), "recibido");
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });
  await prueba("enviar un patrón: sin el botón de compartir del móvil, enseña el enlace para copiarlo", async () => {
    const page = await paginaWeb({}, LEGADO);
    await page.evaluate(() => go({ name: "patron", id: "b-gorro" }));
    await page.getByRole("button", { name: "Enviar a una amiga" }).tap();
    await page.waitForSelector("#enlace-patron");
    assert.match(await page.locator("#enlace-patron").inputValue(), /Gorro[\s\S]*#patron=/);
    await page.screenshot({ path: path.join(CAPTURAS, "enviar-patron.png") });
    await page.getByRole("button", { name: "Cerrar" }).tap();
    assert.equal(await page.locator(".overlay").count(), 0);
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });

  console.log("Botón atrás del móvil");
  await prueba("atrás vuelve a la pantalla anterior y no cierra la app", async () => {
    const page = await paginaWeb({}, LEGADO);
    await page.getByRole("button", { name: "Patrones", exact: true }).tap();
    await page.getByRole("button", { name: /Manta para la nieta/ }).first().tap();
    assert.equal(await page.evaluate(() => view.name), "patron");
    await page.getByRole("button", { name: /Seguir tejiendo|Empezar a tejer/ }).first().tap();
    assert.equal(await page.evaluate(() => view.name), "sofa");
    await page.goBack(); await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => view.name), "patron", "atrás desde el modo sofá vuelve al patrón");
    await page.goBack(); await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => view.name), "patrones");
    await page.goBack(); await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => view.name), "inicio");
    // «← Volver» no alarga el historial: atrás sigue saliendo de la app, no se queda dando vueltas
    await page.evaluate(() => go({ name: "patron", id: "m-1" }));
    await page.locator("button.back").first().tap();
    assert.equal(await page.evaluate(() => view.name), "patrones");
    assert.equal(await page.evaluate(() => history.state.ti.name), "patrones");
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });
  await prueba("atrás cierra la ventana de opciones sin salir del modo sofá", async () => {
    const page = await paginaWeb({}, LEGADO);
    await page.evaluate(() => go({ name: "patron", id: "m-1" }));
    await page.evaluate(() => go({ name: "sofa", id: "m-1" }));
    await page.getByRole("button", { name: "Opciones" }).tap();
    await page.waitForSelector(".overlay");
    await page.goBack(); await page.waitForTimeout(150);
    assert.equal(await page.locator(".overlay").count(), 0, "atrás cierra la ventana");
    assert.equal(await page.evaluate(() => view.name), "sofa", "y se queda tejiendo");
    // y sigue contando puntos después de cerrarla
    await page.locator(".sofa-big").tap();
    assert.ok(await page.evaluate(() => prog("m-1").puntos) > 0);
    await page.getByRole("button", { name: "Opciones" }).tap();
    await page.getByRole("button", { name: "Seguir tejiendo" }).tap();
    assert.equal(await page.locator(".overlay").count(), 0);
    await page.goBack(); await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => view.name), "patron", "con la ventana cerrada, atrás sale del modo sofá");
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });

  servidor.close();

  console.log("Versión instalable (PWA)");
  // La carpeta docs/ la genera tools/construir-web.cjs; aquí se comprueba que se instala y funciona sin conexión
  const WEBDIR = path.join(RAIZ, "docs");
  if (!fs.existsSync(path.join(WEBDIR, "sw.js"))) {
    console.log("  · sin probar: falta docs/. Genérala con: NODE_PATH=$(npm root -g) node tools/construir-web.cjs");
  } else {
    const servidorWeb = http.createServer((req, res) => {
      const f = path.join(WEBDIR, decodeURIComponent(new globalThis.URL(req.url, "http://x").pathname));
      const real = fs.existsSync(f) && fs.statSync(f).isDirectory() ? path.join(f, "index.html") : f;
      if (!real.startsWith(WEBDIR) || !fs.existsSync(real)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "Content-Type": TIPOS[path.extname(real)] || (path.extname(real) === ".webmanifest" ? "application/manifest+json" : "application/octet-stream") });
      res.end(req.method === "HEAD" ? undefined : fs.readFileSync(real));
    });
    await new Promise(ok => servidorWeb.listen(0, "127.0.0.1", ok));
    const RAIZ_WEB = "http://127.0.0.1:" + servidorWeb.address().port + "/";

    await prueba("se instala, guarda la app y sigue funcionando sin conexión", async () => {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
      const page = await ctx.newPage();
      const errores = [];
      page.on("pageerror", e => errores.push(e.message));
      await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
      await page.goto(RAIZ_WEB);
      assert.equal(await page.evaluate(() => window.TI_LOCAL), true);
      assert.doesNotMatch(await page.locator("main").textContent(), /Ponla en tu móvil/, "la instalada no invita a instalarse");
      await page.waitForFunction(() => navigator.serviceWorker.controller || navigator.serviceWorker.ready, null, { timeout: 30000 });
      await page.evaluate(() => navigator.serviceWorker.ready);
      // Un patrón nuevo guardado antes de quedarse sin conexión
      await page.evaluate(() => { const p = { id: "m-sin", titulo: "Sin conexión", pasos: ["Vuelta 1: 6 pb en anillo mágico (6)"], color: "#8A2F5E" }; state.patrones.unshift(p); save(); });
      await page.waitForTimeout(500);
      await ctx.setOffline(true);
      await page.reload();
      await page.waitForSelector("nav.tabs .in button");
      assert.equal(await page.evaluate(() => state.patrones[0].titulo), "Sin conexión");
      await page.evaluate(() => go({ name: "sofa", id: "m-sin" }));
      assert.equal(await page.evaluate(() => view.name), "sofa");
      // pdf.js también está guardado: el PDF se puede abrir sin conexión
      const leido = await page.evaluate(async () => { await cargarScript(PDFJS + "pdf.min.js"); return !!window.pdfjsLib; });
      assert.equal(leido, true);
      await page.screenshot({ path: path.join(CAPTURAS, "instalada-sin-conexion.png") });
      assert.deepEqual(errores, []);
      await ctx.close();
    });
    await prueba("el manifiesto y los iconos están completos", async () => {
      const m = JSON.parse(fs.readFileSync(path.join(WEBDIR, "manifest.webmanifest"), "utf8"));
      assert.equal(m.display, "standalone");
      assert.equal(m.start_url, "./");
      assert.ok(m.icons.some(i => i.purpose === "maskable"), "falta el icono recortable de Android");
      for (const i of m.icons) assert.ok(fs.existsSync(path.join(WEBDIR, i.src)), "falta " + i.src);
      assert.ok(fs.statSync(path.join(WEBDIR, "icono-512.png")).size > 1000);
    });
    servidorWeb.close();
  }

  await prueba("en claude.ai invita a instalar la app y se puede quitar el aviso", async () => {
    const page = await nuevaPagina(browser, {}, LEGADO);
    assert.match(await page.locator("main").textContent(), /Ponla en tu móvil como una app/);
    assert.equal(await page.locator(".pasos-instalar a").getAttribute("href"), "https://parolo2000.github.io/tejiendo-ilusiones/");
    await page.screenshot({ path: path.join(CAPTURAS, "aviso-instalar.png"), fullPage: true });
    await page.getByRole("button", { name: "No volver a mostrar" }).tap();
    await page.reload();
    assert.doesNotMatch(await page.locator("main").textContent(), /Ponla en tu móvil/);
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });

  console.log("Resto de la app");
  await prueba("todas las pantallas se abren sin errores, con datos reales", async () => {
    const page = await nuevaPagina(browser, {}, LEGADO);
    const vistas = [["inicio"], ["patrones"], ["patron", "m-1"], ["patron", "b-gorro"], ["tejer", "m-1"], ["sofa", "m-1"], ["importar"], ["editar"], ["editar", "m-1"],
      ["graficos"], ["grafico", "g-1"], ["foto"], ["lanas"], ["lana", "l-1"], ["mas"], ["contador"], ["ayuda"], ["copia"], ["herramientas"]];
    for (const [name, id] of vistas) {
      await page.evaluate(([name, id]) => go({ name, id }), [name, id]);
      await page.waitForTimeout(60);
      assert.equal(await page.evaluate(() => view.name), name, "no se abrió " + name);
    }
    await page.evaluate(() => go({ name: "inicio" }));
    await page.screenshot({ path: path.join(CAPTURAS, "inicio-movil.png") });
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });

  await browser.close();
  console.log(`\n${pasados} bien, ${fallos} mal`);
  process.exit(fallos ? 1 : 0);
})();
