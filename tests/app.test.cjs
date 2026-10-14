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
let URL = pathToFileURL(APP).href;
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
  // SOLO="chino|turco" para pasar solo algunas pruebas
  if (process.env.SOLO && !new RegExp(process.env.SOLO, "i").test(nombre)) return;
  try { await fn(); pasados++; console.log("  ✓ " + nombre); }
  catch (e) { fallos++; console.log("  ✗ " + nombre + "\n    " + (e.stack || e).toString().split("\n").slice(0, 4).join("\n    ")); }
}

async function nuevaPagina(browser, { nube, ...opts } = {}, datos = null) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, ...opts });
  // Con «nube», la app usa un Supabase de prueba (local); si no, funciona solo en el aparato, como siempre
  if (nube) await ctx.addInitScript(n => { window.TI_NUBE = n; }, nube);
  // Los datos se siembran solo al abrir la pestaña, no al recargar. La marca va en window.name, que sigue al
  // recargar: sessionStorage a veces llega vacío al principio de la recarga y se volvían a sembrar los datos.
  if (datos) await ctx.addInitScript(d => { if (window.name !== "sembrado") { localStorage.clear(); localStorage.setItem("rincon-ganchillo-v1", d); window.name = "sembrado"; } }, JSON.stringify(datos));
  const page = await ctx.newPage();
  page.errores = [];
  page.on("pageerror", e => page.errores.push(e.message));
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource|net::ERR/.test(m.text())) page.errores.push(m.text()); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await page.goto(URL);
  return page;
}
const recargar = page => page.reload();
const estado = page => page.evaluate(() => JSON.parse(localStorage.getItem("rincon-ganchillo-v1")));

(async () => {
  const browser = await chromium.launch();
  // Servidor local: la app se prueba desde una dirección web, como en el artifact y en GitHub Pages (con file://
  // el lector de fotos no funciona y Chromium a veces pierde localStorage al recargar)
  const RAIZ = path.resolve(__dirname, "..");
  const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".gz": "application/gzip", ".pdf": "application/pdf", ".png": "image/png", ".wasm": "application/wasm", ".ttf": "font/ttf" };
  const servidor = http.createServer((req, res) => {
    const f = path.join(RAIZ, decodeURIComponent(new globalThis.URL(req.url, "http://x").pathname));
    if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": TIPOS[path.extname(f)] || "application/octet-stream" });
    res.end(req.method === "HEAD" ? undefined : fs.readFileSync(f));
  });
  await new Promise(ok => servidor.listen(0, "127.0.0.1", ok));
  const WEB = "http://127.0.0.1:" + servidor.address().port + "/tejiendo-ilusiones.html";
  URL = WEB;

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
    const { copiaDesde, ...prefs } = st.prefs;
    assert.deepEqual(prefs, { tejer: "sofa", sonido: true, vibrar: true, auto: true, avisoApp: true, ultCopia: 0, copiaPospuesta: 0, leer: false, descanso: true, tema: "auto" });
    assert.ok(Math.abs(copiaDesde - Date.now()) < 60000, "el recordatorio de copia empieza a contar hoy");
    const copia = await page.evaluate(() => localStorage.getItem("rincon-ganchillo-v1-copia-v1"));
    assert.deepEqual(JSON.parse(copia), LEGADO);
    // Al volver a abrir no se migra otra vez ni se toca la copia
    await recargar(page);
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
    await recargar(page);
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
    assert.equal(r.pasos[4], "Vueltas 5 a 8: pb en cada punto alrededor. (24)");
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
    // «Solo las vueltas» viene marcado: las líneas sin «Vuelta N» van a las notas; desmarcado, salen todas
    assert.ok(await page.locator("#im-solo").isChecked());
    assert.ok(await page.locator("ol.importados li").count() < 10);
    await page.locator("#im-solo").tap();
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
  const VENDOR = path.join(RAIZ, "lib");
  async function paginaWeb(opts = {}, datos = null) {
    const page = await nuevaPagina(browser, opts, datos);
    // Las librerías de los CDN, desde copias locales idénticas (el contenedor de pruebas no sale a internet)
    await page.route(/cdn\.jsdelivr\.net\/npm\/pdfjs-dist@3\.11\.174\/legacy\/build\/(pdf(\.worker)?\.min\.js)$/, (r) => r.fulfill({ path: path.join(VENDOR, r.request().url().split("/").pop()), contentType: "text/javascript" }));
    await page.route(/cdn\.jsdelivr\.net\/npm\/tesseract\.js@5\.1\.1\/dist\/tesseract\.min\.js$/, (r) => r.fulfill({ path: path.join(VENDOR, "tesseract.min.js"), contentType: "text/javascript" }));
    await page.route(/cdn\.jsdelivr\.net\/npm\/jspdf@4\.2\.1\/dist\/jspdf\.umd\.min\.js$/, (r) => r.fulfill({ path: path.join(VENDOR, "jspdf.umd.min.js"), contentType: "text/javascript" }));
    await page.route(/cdn\.jsdelivr\.net\/npm\/fflate@0\.8\.2\/umd\/index\.js$/, (r) => r.fulfill({ path: path.join(VENDOR, "fflate.min.js"), contentType: "text/javascript" }));
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
  const esperarLectura = page => page.waitForFunction(() => document.querySelector("ol.importados li") || document.querySelector(".leyendo:not([hidden])")?.textContent.match(/No he podido|Necesito|contraseña|no es un PDF/), null, { timeout: 120000 });

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
    const guardado = (await estado(page)).patrones[0];
    assert.equal(guardado.pasos.length, 4, "solo las vueltas");
    assert.match(guardado.notas, /Otras líneas del patrón/, "lo demás queda en las notas");
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
  await prueba("foto de un patrón en ruso: la lee y la pasa a español", async () => {
    const fx2 = await browser.newPage();
    await fx2.setViewportSize({ width: 700, height: 360 });
    await fx2.setContent(`<body style="margin:0;background:#f3efe6"><div style="font:30px Carlito,Arial;line-height:1.5;padding:40px;color:#222">
Цыплёнок<br>1 ряд: 6 сбн в КА (6)<br>2 ряд: 6 пр (12)<br>3 ряд: (сбн, пр) х 6 (18)<br>Закрепить нить.</div></body>`);
    const fotoRu = await fx2.screenshot({ type: "png" }); await fx2.close();
    const page = await paginaWeb();
    await page.evaluate(() => go({ name: "importar" }));
    await subir(page, "#im-foto", "foto-ru.png", "image/png", fotoRu);
    await esperarLectura(page);
    const r = await page.evaluate(() => importarTexto(document.querySelector("#im-texto").value));
    assert.equal(r.ruso, true, "leído: " + await page.locator("#im-texto").inputValue());
    assert.deepEqual(r.pasos.slice(0, 2), ["Vuelta 1: 6 pb en anillo mágico (6)", "Vuelta 2: 6 aum (12)"], "leído: " + JSON.stringify(r.pasos));
    assert.equal(r.revision.filter(x => x.estado === "cuadra").length, 3);
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
  await prueba("PDF a dos columnas, en tabla y con cabecera y pie en cada hoja: se lee en orden", async () => {
    const fx3 = await browser.newPage();
    const L = ["Ballena", "Ronda 1: 6 pb en anillo mágico (6)", "Ronda 2: 6 aum (12)", "Ronda 3: (1 pb, 1 aum) x 6 (18)", "Rondas 4 a 8: 18 pb (18)", "Ronda 9: (1 pb, 1 dism) x 6 (12)", "Ronda 10: 6 dism (6)"];
    const p = x => `<p style="margin:0 0 6px">${x}</p>`;
    await fx3.setContent(`<style>body{font:12px Arial;margin:30px}</style><h1>${L[0]}</h1><div style="columns:2;column-gap:30px">${L.slice(1).map(p).join("")}</div>`);
    const dosCol = await fx3.pdf({ format: "A5" });
    await fx3.setContent(`<style>body{font:13px Arial;margin:30px} td{border:1px solid #ccc;padding:4px;vertical-align:top}</style><h1>Gorro</h1><table>
<tr><td>Hilera<br>1:</td><td>1 pb en la 2.ª cad desde el ganchillo y 1 pb en cada cad hasta el final, que es una línea larga</td><td>(30)</td></tr>
<tr><td>Hilera 2:</td><td>1 cad, 1 pb en cada punto</td><td>(30)</td></tr></table>`);
    const tabla = await fx3.pdf({ format: "A5" });
    await fx3.setContent(`<style>body{font:24px Verdana} p{margin:0 0 60px}</style>${L.map(x => `<p>${x}</p>`).join("")}`);
    const pies = await fx3.pdf({ format: "A6", displayHeaderFooter: true, margin: { top: "50px", bottom: "50px", left: "30px", right: "30px" },
      headerTemplate: '<div style="font-size:8px;margin-left:30px">© 2024 Estudio de ganchillo · www.ejemplo.com</div>', footerTemplate: '<div style="font-size:8px;margin-left:30px">Página <span class=pageNumber></span> de <span class=totalPages></span></div>' });
    await fx3.close();
    const page = await paginaWeb();
    const leer = async pdf => page.evaluate(async a => { const doc = await abrirPDF(new Uint8Array(a)); const paginas = doc.numPages, t = await textoDePDF(doc); doc.destroy(); const r = importarTexto(t, null, true); return { t, pasos: r.pasos, rev: r.revision.map(x => x.estado), paginas }; }, [...pdf]);
    const ESPERADO = ["Vuelta 1: 6 pb en anillo mágico (6)", "Vuelta 2: 6 aum (12)", "Vuelta 3: *1 pb, 1 aum* repetir 6 veces (18)", "Vueltas 4 a 8: 18 pb (18)", "Vuelta 9: *1 pb, 1 dism* repetir 6 veces (12)", "Vuelta 10: 6 dism (6)"];
    const a = await leer(dosCol);
    assert.deepEqual(a.pasos, ESPERADO, "dos columnas: primero una y luego la otra\n" + a.t);
    const b = await leer(tabla);
    assert.deepEqual(b.pasos, ["Hilera 1: 1 pb en la 2.ª cad desde el ganchillo y 1 pb en cada cad hasta el final, que es una línea larga (30)", "Hilera 2: 1 cad, 1 pb en cada punto (30)"], "tabla, fila a fila\n" + b.t);
    assert.ok(b.rev.every(x => x === "cuadra"), JSON.stringify(b.rev));
    const c = await leer(pies);
    assert.ok(c.paginas >= 2, "ocupa varias hojas");
    assert.deepEqual(c.pasos, ESPERADO, "sin cabeceras ni pies\n" + c.t);
    assert.doesNotMatch(c.t, /©|Página \d/);
    assert.equal(await page.evaluate(() => [textoLegible("Vuelta 1: 6 pb en anillo mágico (6)\nVuelta 2: 6 aum (12)"), textoLegible("   12  ab")].join()), "true,false", "las letras raras de un PDF mal hecho no valen como texto");
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });
  await prueba("PDF con la hoja girada, a tres columnas o con las letras separadas", async () => {
    const fx = await browser.newPage();
    const L = ["Pelotita", "Vta 1: 6 mp en anillo (6)", "Vta 2: 6 au (12)", "Vta 3: (1 mp, 1 au) x 6 (18)", "Vta 4-6: 18 mp (18)", "Vta 7: (1 mp, 1 dis) x 6 (12)", "Vta 8: 6 dis (6)"];
    const p = x => `<p style="margin:0 0 5px">${x}</p>`;
    await fx.setContent(`<style>body{margin:0} .r{position:absolute;top:0;left:0;width:760px;transform-origin:0 0;transform:translate(0,760px) rotate(-90deg);font:13px Arial}</style><div class=r>${L.map(p).join("")}</div>`);
    const girada = await fx.pdf({ format: "A5" });
    await fx.setContent(`<style>body{font:11px Arial;margin:20px}</style><h1>${L[0]}</h1><div style="columns:3;column-gap:24px">${L.slice(1).map(p).join("")}</div>`);
    const tres = await fx.pdf({ format: "A4", landscape: true });
    await fx.close();
    const page = await paginaWeb();
    const leer = pdf => page.evaluate(async a => { const doc = await abrirPDF(new Uint8Array(a)); const t = await textoDePDF(doc); doc.destroy(); return { t, pasos: importarTexto(t, null, true).pasos }; }, [...pdf]);
    const ESPERADO = ["Vuelta 1: 6 pb en anillo (6)", "Vuelta 2: 6 aum (12)", "Vuelta 3: *1 pb, 1 aum* repetir 6 veces (18)", "Vueltas 4 a 6: 18 pb (18)", "Vuelta 7: *1 pb, 1 dism* repetir 6 veces (12)", "Vuelta 8: 6 dism (6)"];
    const a = await leer(girada);
    assert.deepEqual(a.pasos, ESPERADO, "hoja girada\n" + a.t);
    const b = await leer(tres);
    assert.deepEqual(b.pasos, ESPERADO, "tres columnas\n" + b.t);
    // Letras muy separadas: un título se junta y una hoja entera así se manda a leer como foto
    assert.deepEqual(await page.evaluate(() => [juntarEspaciado("B O D Y"), juntarEspaciado("Rnd 1: 6 sc in MR (6)"),
      paginaEspaciada("L i t t l e O c t o p u s\nR n d 1 : 6 s c i n M R ( 6 )\nR n d 2 : i n c x 6 ( 1 2 )"), paginaEspaciada("B O D Y\nRnd 1: 6 sc in MR (6)\nRnd 2: inc x6 (12)")]),
      ["BODY", "Rnd 1: 6 sc in MR (6)", true, false]);
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });
  await prueba("PDF con texto y una hoja escaneada: esa hoja se lee como una foto", async () => {
    const fx4 = await browser.newPage();
    await fx4.setContent(`<style>body{font:14px Georgia;margin:30px}</style><h1>Bola amigurumi</h1><p>Materiales: algodón y ganchillo de 3 mm.</p>
<div style="page-break-before:always"><img src="data:image/png;base64,${foto.toString("base64")}" style="width:100%"></div>`);
    const mixto = await fx4.pdf({ format: "A5" }); await fx4.close();
    const page = await paginaWeb();
    await page.evaluate(() => go({ name: "importar" }));
    await subir(page, "#im-pdf", "bola.pdf", "application/pdf", mixto);
    await page.waitForFunction(() => /escaneadas/.test(document.querySelector(".leyendo").textContent), null, { timeout: 60000 });
    await esperarLectura(page);
    const t = await page.locator("#im-texto").inputValue();
    assert.match(t, /^Bola amigurumi\n+Materiales/, "el texto de la primera hoja va primero: " + t);
    const r = await page.evaluate(() => importarTexto(document.querySelector("#im-texto").value, null, true));
    assert.equal(r.revision.filter(x => x.estado === "cuadra").length, 4, "leído: " + t);
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });
  await prueba("archivos que no se pueden leer: avisa claro y no se rompe", async () => {
    const page = await paginaWeb();
    await page.evaluate(() => go({ name: "importar" }));
    await subir(page, "#im-pdf", "roto.pdf", "application/pdf", Buffer.from("esto no es un pdf"));
    await esperarLectura(page);
    assert.match(await page.locator(".leyendo").textContent(), /Este archivo no es un PDF o está dañado/);
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
    await recargar(page);
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
    assert.equal(await page.evaluate(() => { const n = guardarRecibido({ titulo: "Posavasos de Carmen <b>", pasos: ["Vuelta 1: 6 pb en anillo mágico (6)", "Vuelta 2: 2 pb en cada punto (12)"] }); return state.patrones.length; }), antes + 1, "guardarlo otra vez tampoco");
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
      await page.route(/supabase\.co/, r => r.abort()); // el proyecto de verdad no se toca
      await page.goto(RAIZ_WEB);
      assert.equal(await page.evaluate(() => window.TI_LOCAL), true);
      assert.equal(await page.locator("#en-clave").isVisible(), true, "sin cuenta, solo la pantalla de entrar");
      assert.doesNotMatch(await page.locator("main").textContent(), /Ponla en tu móvil/, "la instalada no invita a instalarse");
      await page.waitForFunction(() => navigator.serviceWorker.controller || navigator.serviceWorker.ready, null, { timeout: 30000 });
      await page.evaluate(() => navigator.serviceWorker.ready);
      // Un patrón nuevo guardado antes de quedarse sin conexión
      // Ya había entrado con su cuenta (la sesión caducada no la echa si no hay conexión)
      await page.evaluate(() => {
        localStorage.setItem(SKEY, JSON.stringify({ access: "a", refresh: "r", uid: "u-prueba", exp: 0, email: "ana@ejemplo.es" })); localStorage.setItem(DUENA, "u-prueba");
        const p = { id: "m-sin", titulo: "Sin conexión", pasos: ["Vuelta 1: 6 pb en anillo mágico (6)"], color: "#8A2F5E" }; state.patrones.unshift(p); save();
      });
      await page.waitForTimeout(500);
      await ctx.setOffline(true);
      await recargar(page);
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

  await prueba("versión web en el móvil: botón para instalarla o, si no se puede, qué tocar exactamente", async () => {
    const UA = {
      android: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
      iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
      whatsapp: "Mozilla/5.0 (Linux; Android 14; SM-A546B Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36 WhatsApp/2.24",
    };
    const abrir = async ua => {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, userAgent: ua });
      await ctx.addInitScript(() => { window.TI_LOCAL = true; });
      const page = await ctx.newPage(); page.errores = []; page.on("pageerror", e => page.errores.push(e.message));
      await page.route(/fonts\.(googleapis|gstatic)\.com|supabase\.co/, r => r.abort());
      await page.goto(URL); return page;
    };
    // Android con Chrome: el navegador avisa de que se puede instalar y el botón lo hace con un toque
    const a = await abrir(UA.android);
    await a.evaluate(() => { const e = new Event("beforeinstallprompt"); e.prompt = () => { window.pedida = true; }; e.userChoice = Promise.resolve({ outcome: "accepted" }); window.dispatchEvent(e); });
    await a.getByRole("button", { name: "Instalar la app" }).tap();
    assert.equal(await a.evaluate(() => window.pedida), true, "abre la ventana de instalar del móvil");
    await a.waitForFunction(() => !document.querySelector(".instalar"));
    assert.deepEqual(a.errores, []); await a.context().close();
    // iPhone: no hay botón posible, dice qué tocar en Safari
    const i = await abrir(UA.iphone);
    assert.match(await i.locator(".instalar").innerText(), /Añadir a pantalla de inicio/);
    await i.screenshot({ path: path.join(CAPTURAS, "instalar-iphone.png") });
    await i.context().close();
    // Dentro de WhatsApp: hay que abrirla en Chrome primero
    const w = await abrir(UA.whatsapp);
    assert.match(await w.locator(".instalar").innerText(), /Abrir en Chrome/);
    await w.getByRole("button", { name: "Ahora no" }).tap();
    assert.equal(await w.locator(".instalar").count(), 0, "se puede quitar");
    await w.context().close();
  });
  await prueba("en claude.ai invita a instalar la app y se puede quitar el aviso", async () => {
    const page = await nuevaPagina(browser, {}, LEGADO);
    assert.match(await page.locator("main").textContent(), /Ponla en tu móvil como una app/);
    assert.equal(await page.locator(".pasos-instalar a").getAttribute("href"), "https://parolo2000.github.io/tejiendo-ilusiones/");
    await page.screenshot({ path: path.join(CAPTURAS, "aviso-instalar.png"), fullPage: true });
    await page.getByRole("button", { name: "No volver a mostrar" }).tap();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem(KEY)).prefs.avisoApp === false);
    await recargar(page);
    assert.doesNotMatch(await page.locator("main").textContent(), /Ponla en tu móvil/);
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });

  console.log("Que no se pierda nada");
  await prueba("recuerda guardar una copia al mes, se puede posponer y se quita al guardarla", async () => {
    const page = await nuevaPagina(browser, {}, LEGADO);
    assert.doesNotMatch(await page.locator("main").textContent(), /copia de tus cosas|días de tu última copia/, "el primer mes no molesta");
    await page.evaluate(() => { state.prefs.copiaDesde = Date.now() - 31 * DIA; save(); render(); });
    assert.match(await page.locator(".aviso-copia").textContent(), /Aún no tienes una copia/);
    await page.waitForTimeout(400);
    await page.locator(".aviso-copia").scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(CAPTURAS, "aviso-copia.png") });
    await page.getByRole("button", { name: "Ahora no" }).tap();
    await recargar(page);
    assert.equal(await page.locator(".aviso-copia").count(), 0, "pospuesto una semana");
    assert.equal(await page.evaluate(() => tocaRecordarCopia(Date.now() + 8 * DIA)), true, "vuelve a la semana");
    await page.evaluate(() => copiaHecha());
    assert.equal(await page.evaluate(() => tocaRecordarCopia(Date.now() + 8 * DIA)), false, "con copia reciente no avisa");
    assert.equal(await page.evaluate(() => tocaRecordarCopia(Date.now() + 31 * DIA)), true, "y al mes de la copia, otra vez");
    // sin nada propio no hay nada que guardar
    const vacia = await nuevaPagina(browser);
    assert.equal(await vacia.evaluate(() => { state.prefs.copiaDesde = 1; return tocaRecordarCopia(); }), false);
    await vacia.context().close();
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });
  await prueba("«¿Cómo se hace?» enlaza a vídeos de los puntos del paso", async () => {
    const page = await nuevaPagina(browser, {}, LEGADO);
    const ks = await page.evaluate(() => puntosDelPaso("Vuelta 3: *1 pb, 1 aum* repetir 6 veces. (18)"));
    assert.deepEqual(ks.sort(), ["aum", "pb"]);
    await page.evaluate(() => { prog("b-gorro").paso = 2; save(); go({ name: "tejer", id: "b-gorro" }); });
    const enlaces = page.locator(".stepbox .videos a");
    assert.ok(await enlaces.count() >= 1);
    const href = await enlaces.first().getAttribute("href");
    assert.match(href, /^https:\/\/www\.youtube\.com\/results\?search_query=/);
    assert.equal(await enlaces.first().getAttribute("target"), "_blank");
    await page.evaluate(() => go({ name: "ayuda" }));
    assert.ok(await page.locator(".gloss a.video").count() >= 8);
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });

  await prueba("modo sofá: lee el paso en voz alta con palabras, no abreviaturas", async () => {
    const page = await nuevaPagina(browser, {}, LEGADO);
    assert.equal(await page.evaluate(() => paraDecir("Vuelta 3: *1 pb, 1 aum* repetir 6 veces. (18)")), "Vuelta 3: 1 punto bajo, 1 aumento repetir 6 veces. . Al final, 18 puntos.");
    // Se sustituye la voz del móvil por una que apunta lo que dice
    await page.evaluate(() => { window.dicho = []; speechSynthesis.speak = u => window.dicho.push(u.text); speechSynthesis.cancel = () => {}; });
    await page.evaluate(() => { prog("b-bola").paso = 1; save(); go({ name: "sofa", id: "b-bola" }); });
    await page.getByRole("button", { name: "Leer el paso en voz alta" }).tap();
    assert.match((await page.evaluate(() => window.dicho))[0], /6 punto bajo en el anillo/);
    await page.screenshot({ path: path.join(CAPTURAS, "sofa-con-voz.png") });
    // Con la opción puesta, lee solo cada paso nuevo
    await page.getByRole("button", { name: "Opciones" }).tap();
    await page.getByRole("button", { name: /Leer cada paso en voz alta/ }).tap();
    await page.getByRole("button", { name: "Seguir tejiendo" }).tap();
    const antes = (await page.evaluate(() => window.dicho)).length;
    for (let i = 0; i < 6; i++) { await page.locator(".sofa-big").tap(); await page.waitForTimeout(170); }
    await page.waitForTimeout(400);
    const dicho = await page.evaluate(() => window.dicho);
    assert.equal(dicho.length, antes + 1, "lee el paso siguiente una sola vez: " + JSON.stringify(dicho));
    assert.match(dicho[dicho.length - 1], /aumento/);
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });

  console.log("Deshacer, volver a tejer y apuntes");
  await prueba("borrar sin querer se puede deshacer: progreso, patrón y labor", async () => {
    const page = await nuevaPagina(browser, {}, LEGADO);
    await page.evaluate(() => go({ name: "patron", id: "m-1" }));
    await page.getByRole("button", { name: "Volver a empezar" }).tap();
    await page.getByRole("button", { name: /Toca otra vez/ }).tap();
    assert.equal((await estado(page)).progreso["m-1"], undefined);
    await page.locator(".toast-btn").tap();
    assert.equal((await estado(page)).progreso["m-1"].notas, "voy por aquí", "vuelve el progreso tal cual");
    await page.evaluate(() => go({ name: "editar", id: "m-1" }));
    await page.getByRole("button", { name: "Borrar patrón" }).tap();
    await page.getByRole("button", { name: /Toca otra vez/ }).tap();
    assert.equal((await estado(page)).patrones.length, 0);
    await page.screenshot({ path: path.join(CAPTURAS, "deshacer-borrado.png") });
    await page.locator(".toast-btn").tap();
    const st = await estado(page);
    assert.equal(st.patrones[0].titulo, "Manta para la nieta");
    assert.equal(st.progreso["m-1"].puntos, 7);
    assert.equal(await page.evaluate(() => view.name), "patron");
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });
  await prueba("tejerlo otra vez: la labor guardada conserva su foto aunque el patrón tenga otra", async () => {
    const page = await nuevaPagina(browser, {}, LEGADO);
    const r = await page.evaluate(async () => {
      const p = buscar("m-1"), pr = prog("m-1"); pr.paso = p.pasos.length; pr.fin = Date.now();
      await fotoSet("m-1", "data:image/png;base64,UNO");
      const l = guardarLabor(p, "Lucía");
      state.progreso["m-1"] = { paso: 0, vueltas: 0, puntos: 0, notas: "", tiempo: 0, rep: 0 };
      await fotoSet("m-1", "data:image/png;base64,DOS");
      return { foto: fotoDeLabor(l), estado: estadoDe(p) };
    });
    assert.equal(r.foto, "data:image/png;base64,UNO");
    assert.equal(r.estado, "nuevo");
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });
  await prueba("un apunte en un paso sale en el modo sofá y se guarda para la próxima vez", async () => {
    const page = await nuevaPagina(browser, {}, LEGADO);
    await page.evaluate(() => { prog("b-bola").paso = 2; save(); go({ name: "tejer", id: "b-bola" }); });
    await page.locator("#apunte-2").fill("aquí cambio a lana rosa");
    await page.locator("#apunte-2").press("Enter");
    await page.locator("#apunte-2").blur();
    assert.equal((await estado(page)).apuntes["b-bola"]["2"], "aquí cambio a lana rosa");
    await page.evaluate(() => go({ name: "sofa", id: "b-bola" }));
    assert.match(await page.locator(".sofa-apunte").textContent(), /lana rosa/);
    await page.screenshot({ path: path.join(CAPTURAS, "sofa-apunte.png") });
    await page.evaluate(() => { prog("b-bola").paso = 3; save(); render(); });
    assert.equal(await page.locator(".sofa-apunte").isVisible(), false, "en otro paso no sale");
    // borrar el texto quita el apunte
    await page.evaluate(() => ponerApunte("b-bola", 2, ""));
    assert.equal((await estado(page)).apuntes["b-bola"], undefined);
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });

  console.log("Imprimir y tu semana");
  await prueba("imprimir un patrón saca una hoja limpia con casillas y apuntes", async () => {
    const page = await nuevaPagina(browser, {}, LEGADO);
    await page.evaluate(() => { ponerApunte("m-1", 1, "ojo con la primera"); window.print = () => dispatchEvent(new Event("beforeprint")); go({ name: "patron", id: "m-1" }); });
    await page.getByRole("button", { name: "Imprimir" }).tap();
    const hoja = page.locator("#imprimir");
    assert.equal(await hoja.locator("h1").textContent(), "Manta para la nieta");
    assert.equal(await hoja.locator("li").count(), 5);
    assert.match(await hoja.locator("li").nth(1).textContent(), /Mi apunte: ojo con la primera/);
    await page.emulateMedia({ media: "print" });
    assert.equal(await page.locator("nav.tabs").isVisible(), false, "al imprimir solo sale la hoja");
    assert.equal(await hoja.isVisible(), true);
    await page.screenshot({ path: path.join(CAPTURAS, "imprimir.png"), fullPage: true });
    await page.emulateMedia({ media: "screen" });
    await page.waitForTimeout(1400);
    assert.equal(await page.locator("#toast").isVisible(), false, "si se pudo imprimir, no avisa");
    // Donde el navegador no deja imprimir, avisa en vez de no hacer nada
    await page.evaluate(() => { window.print = () => {}; });
    await page.getByRole("button", { name: "Imprimir" }).tap();
    await page.waitForTimeout(1400);
    assert.match(await page.locator("#toast").textContent(), /no se puede imprimir/);
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });
  await prueba("tu semana: cuenta el tiempo de cada día y lo enseña en Inicio", async () => {
    const page = await nuevaPagina(browser, {}, LEGADO);
    assert.equal(await page.locator(".semana").count(), 0, "sin tiempo no sale");
    await page.evaluate(() => { for (let i = 0; i < 1800; i++) unSegundo(prog("m-1")); state.diario[diaClave(Date.now() - 2 * 864e5)] = 3600; state.diario["2020-01-01"] = 99; save(); });
    assert.equal((await estado(page)).diario[await page.evaluate(() => diaClave(Date.now()))], 1800);
    await recargar(page);
    assert.equal(await page.evaluate(() => state.diario["2020-01-01"]), undefined, "lo de hace más de un año se borra");
    await page.evaluate(() => go({ name: "inicio" }));
    assert.match(await page.locator(".semana").textContent(), /1 h 30 min tejiendo · 2 días/);
    assert.equal(await page.locator(".barra").count(), 7);
    await page.locator(".semana").scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(CAPTURAS, "tu-semana.png") });
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });

  await prueba("recuperar una copia equivocada se puede deshacer, fotos incluidas", async () => {
    const page = await nuevaPagina(browser, {}, LEGADO);
    await page.evaluate(() => fotoSet("m-1", "data:image/png;base64,MIA"));
    const copia = { app: "rincon-ganchillo", version: 1, state: { patrones: [{ id: "m-9", titulo: "Otra cosa", pasos: ["Haz 5 cad."], color: "x;background:url(//mal)" }] },
      fotos: { "m-1": "data:image/png;base64,AJENA", "m-9": "javascript:alert(1)" } };
    await page.evaluate(() => go({ name: "copia" }));
    const [fc] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: "Recuperar una copia" }).tap()]);
    await fc.setFiles({ name: "copia.txt", mimeType: "text/plain", buffer: Buffer.from(JSON.stringify(copia)) });
    await page.getByRole("button", { name: "Recuperar esta copia" }).tap();
    let st = await estado(page);
    assert.deepEqual(st.patrones.map(p => p.titulo), ["Otra cosa"]);
    assert.match(st.patrones[0].color, /^#[0-9a-f]+$/i, "un color raro no entra");
    assert.equal(await page.evaluate(() => localStorage.getItem(FKEY + "m-9")), null, "solo se aceptan imágenes");
    await page.locator(".toast-btn").tap();
    st = await estado(page);
    assert.deepEqual(st.patrones.map(p => p.titulo), ["Manta para la nieta"]);
    assert.equal(await page.evaluate(() => fotoGet("m-1")), "data:image/png;base64,MIA", "vuelve su foto");
    assert.ok(await page.evaluate(() => localStorage.getItem(KEY + "-antes-de-recuperar")), "queda apartado lo de antes");
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });

  console.log("Descanso y buscar");
  await prueba("en el modo sofá avisa cada hora seguida para descansar, y se puede quitar", async () => {
    const page = await nuevaPagina(browser, {}, LEGADO);
    const r = await page.evaluate(() => {
      const t0 = Date.now(); tejiendoSeguido = DESCANSO_SG - 2; ultSegundoTejido = t0;
      contarSeguido(t0 + 1000); const antes = !document.getElementById("toast").hidden;
      contarSeguido(t0 + 2000); const aviso = document.getElementById("toast").textContent;
      // tras parar más de 10 minutos, empieza de nuevo
      contarSeguido(t0 + 15 * 60 * 1000); const reinicio = tejiendoSeguido;
      return { antes, aviso, reinicio };
    });
    assert.equal(r.antes, false);
    assert.match(r.aviso, /Llevas una hora tejiendo/);
    assert.equal(r.reinicio, 1);
    await page.evaluate(() => go({ name: "sofa", id: "m-1" }));
    await page.getByRole("button", { name: "Opciones", exact: true }).tap();
    await page.getByRole("button", { name: /descansar las manos/ }).tap();
    assert.equal((await estado(page)).prefs.descanso, false);
    const sin = await page.evaluate(() => { document.getElementById("toast").hidden = true; tejiendoSeguido = DESCANSO_SG - 1; ultSegundoTejido = Date.now(); contarSeguido(); return document.getElementById("toast").hidden; });
    assert.equal(sin, true, "con la opción quitada no avisa");
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });
  await prueba("buscar un patrón sin tildes y por lo que dicen sus pasos", async () => {
    const page = await nuevaPagina(browser, {}, LEGADO);
    await page.evaluate(() => go({ name: "patrones" }));
    await page.locator("#buscar").fill("MANTA PARA LA NIETA");
    assert.equal(await page.locator(".pitem").count(), 1);
    await page.locator("#buscar").fill("hasta que mida 80");
    assert.match(await page.locator(".pitem h3").first().textContent(), /Manta/);
    await page.evaluate(() => { state.patrones.push({ id: "m-2", titulo: "Muñeco de nieve", pasos: ["Haz 6 pb"], color: "#8A2F5E" }); });
    await page.locator("#buscar").fill("muneco");
    assert.equal(await page.locator(".pitem h3").first().textContent(), "Muñeco de nieve");
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });

  await prueba("colores oscuros a mano, aunque el móvil esté en claro", async () => {
    const page = await nuevaPagina(browser, { colorScheme: "light" }, LEGADO);
    await page.evaluate(() => go({ name: "mas" }));
    await page.getByRole("button", { name: "Oscuros" }).tap();
    const fondo = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert.equal(await fondo(), "rgb(20, 26, 24)");
    await recargar(page);
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark", "se acuerda");
    await page.evaluate(() => go({ name: "sofa", id: "m-1" }));
    await page.screenshot({ path: path.join(CAPTURAS, "sofa-oscuro.png") });
    await page.evaluate(() => go({ name: "mas" }));
    await page.getByRole("button", { name: "Automáticos" }).tap();
    assert.equal(await page.evaluate(() => document.documentElement.hasAttribute("data-theme")), false);
    assert.notEqual(await fondo(), "rgb(20, 26, 24)");
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });

  console.log("Dibujo en el modo sofá, gráfico y foto, importar del ruso");
  await prueba("modo sofá: el dibujo de la vuelta se marca al tocar (aumentos cuentan 2)", async () => {
    const page = await nuevaPagina(browser, {}, LEGADO);
    assert.equal(await page.evaluate(() => simbolosHechos(["aum", "aum", "aum"], 3, 6)), 1, "3 puntos = 1 aumento y medio");
    assert.equal(await page.evaluate(() => simbolosHechos(["cad", "pb", "pb"], 0, 2)), 0, "la cadeneta de subida no se marca antes de empezar");
    assert.equal(await page.evaluate(() => simbolosHechos(["cad", "pb", "pb"], 1, 2)), 2);
    await page.evaluate(() => { state.patrones.unshift({ id: "m-buf", titulo: "Bufanda", pasos: ["Haz 11 cad.", "Vuelta 1: 1 pb en la 2ª cad y en cada cad. (10)", "Vuelta 2: 1 cad, 10 pb (10)"], color: "#8A2F5E" }); prog("m-buf").paso = 2; save(); go({ name: "sofa", id: "m-buf" }); });
    await page.waitForTimeout(200);
    for (let i = 0; i < 3; i++) { await page.locator(".sofa-big").tap(); await page.waitForTimeout(180); }
    await page.waitForTimeout(100);
    assert.equal(await page.locator(".sofa-tira .pt.hecho").count(), 4, "cadeneta de subida + 3 puntos");
    assert.equal(await page.locator(".sofa-tira .pt.siguiente").count(), 1);
    // En pantalla ancha, el gráfico entero con la vuelta marcada
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(250);
    assert.ok(await page.locator(".sofa-graf svg").isVisible());
    assert.equal(await page.locator(".sofa-graf .marca.hecho").count(), 4);
    await page.screenshot({ path: path.join(CAPTURAS, "sofa-dibujo-ancho.png") });
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });
  await prueba("en el patrón se ve el gráfico y al lado el hueco para la foto de tu creación", async () => {
    const page = await nuevaPagina(browser, {}, LEGADO);
    await page.evaluate(() => go({ name: "patron", id: "m-1" }));
    assert.equal(await page.locator(".hero-par figure").count(), 2);
    assert.ok(await page.locator(".hero-par svg.chart").first().isVisible(), "sale el gráfico");
    assert.match(await page.locator(".hueco-foto").textContent(), /Añadir foto/);
    await page.evaluate(() => fotoSet("m-1", "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==").then(render));
    assert.equal(await page.locator(".hero-par img").count(), 1, "con foto, la foto al lado del gráfico");
    assert.ok(await page.locator(".hero-par svg.chart").first().isVisible());
    await page.screenshot({ path: path.join(CAPTURAS, "patron-grafico-y-foto.png") });
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });
  await prueba("escribir un patrón: se puede dibujar en el gráfico y guardarlo como patrón", async () => {
    const page = await nuevaPagina(browser);
    await page.evaluate(() => go({ name: "editar" }));
    await page.locator("#ed-titulo").fill("Cuadradito");
    await page.getByRole("button", { name: "Dibujarlo en un gráfico" }).tap();
    assert.equal(await page.evaluate(() => view.name), "grafico");
    await page.evaluate(() => { const g = state.graficos[0]; g.celdas[0] = Array(g.cols).fill("cad"); g.celdas[1] = Array(g.cols).fill("pb"); save(); });
    await page.getByRole("button", { name: "Guardar como patrón" }).first().tap();
    const st = await estado(page);
    assert.equal(await page.evaluate(() => view.name), "patron");
    assert.equal(st.patrones[0].titulo, "Cuadradito");
    assert.ok(st.patrones[0].pasos.length >= 2);
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });
  await prueba("patrones rusos escritos de muchas formas: «1.», «1-й ряд», «Р.1», «ст. с/н», «= 6 п.», partes sin mayúsculas", async () => {
    const page = await nuevaPagina(browser);
    const casos = [
      ["Мишка\nГОЛОВА:\n1. 6 сбн в кольцо амигуруми\n2. 6 прибавок (12)\n3. (сбн, пр) х 6 (18)\n5-9. 18 сбн\n10. (сбн, уб) х 6 (12)",
        ["Parte: ГОЛОВА", "Vuelta 1: 6 pb en anillo mágico", "Vuelta 2: 6 aum (12)", "Vuelta 3: *pb, aum* repetir 6 veces (18)", "Vueltas 5 a 9: 18 pb", "Vuelta 10: *pb, dism* repetir 6 veces (12)"]],
      ["Котик\nТело\n1-й ряд: 6 сбн в кольцо амигуруми = 6 п.\n2-й ряд: 6 прибавок = 12 п.\n3-й ряд: (1 сбн, 1 прибавка) повторить 6 раз = 18 п.\n4-6-й ряды: 18 сбн = 18 п.\nХвост\n1 круг: 5 сбн в КА (5)",
        ["Parte: Тело", "Vuelta 1: 6 pb en anillo mágico (6)", "Vuelta 2: 6 aum (12)", "Vuelta 3: *1 pb, 1 aum* repetir 6 veces (18)", "Vueltas 4 a 6: 18 pb (18)", "Parte: Хвост", "Vuelta 1: 5 pb en anillo mágico (5)"]],
      ["Шапочка\nКрючок № 3.\nР1: 3 в.п. (считаются за 1 ст. с/н), 11 ст. с/н в 3-ю петлю от крючка, соед. ст. (12)\nР2-Р4: 3 в.п., 1 ст. с/н в каждую петлю (12)",
        ["Vuelta 1: 3 cad (cuentan como 1 pa), 11 pa en la 3ª cad, pd (12)", "Vueltas 2 a 4: 3 cad, 1 pa en cada punto (12)"]],
      ["Шарик\n1р: 6сбн в КА\n2р: 6пр (12)\n3р: (сбн, пр)х6 =18\nР.4-7: за заднюю стенку 18 сбн (18)",
        ["Vuelta 1: 6 pb en anillo mágico", "Vuelta 2: 6 aum (12)", "Vuelta 3: *pb, aum* repetir 6 veces (18)", "Vueltas 4 a 7: por la hebra de atrás 18 pb (18)"]],
    ];
    for (const [txt, esperado] of casos) {
      const r = await page.evaluate(t => importarTexto(t, null, true), txt);
      assert.equal(r.ruso, true, txt);
      assert.deepEqual(r.pasos, esperado);
      assert.ok(r.revision.every(x => !["distinto", "duda"].includes(x.estado)), JSON.stringify(r.revision));
    }
    assert.equal(await page.evaluate(() => importarTexto("Шапочка\nКрючок № 3.\nР1: 6 сбн в КА (6)\nР2: 6 пр (12)").ganchillo), "3 mm");
    // En español y en inglés: «V1:», «Ronda 3:», «(1 pb, 1 aum) x 6», «R5 - R14:», «1.» numeradas y «= 18»
    const es = await page.evaluate(() => importarTexto("Bola\nV1: 6 pb en AM (6)\nRonda 2: 6 aum (12)\nV.3: (1 pb, 1 aum) x 6 = 18\nV4-V7: 18 pb (18)", null, true).pasos);
    assert.deepEqual(es, ["Vuelta 1: 6 pb en AM (6)", "Vuelta 2: 6 aum (12)", "Vuelta 3: *1 pb, 1 aum* repetir 6 veces (18)", "Vueltas 4 a 7: 18 pb (18)"]);
    const num = await page.evaluate(() => importarTexto("Posavasos\n1. Haz un anillo mágico y teje 8 pb dentro (8)\n2. 2 pb en cada punto (16)\n3. *1 pb, 1 aum* repetir 8 veces (24)\n4. 1 pd en cada punto (24)", null, true));
    assert.equal(num.pasos[0], "Vuelta 1: Haz un anillo mágico y teje 8 pb dentro (8)");
    assert.ok(num.revision.every(x => x.estado === "cuadra"), "una vuelta solo de pd también cuadra");
    const en = await page.evaluate(() => importarTexto("Hat\nR4: Ch 1, sc in each st around (48 sts)\nR5 - R14: Ch 1, sc in each st around (48 sts)\nRnds 15-16: sc around (48)", null, true).pasos);
    assert.deepEqual(en, ["Vuelta 4: 1 cad, pb en cada punto alrededor (48)", "Vueltas 5 a 14: 1 cad, pb en cada punto alrededor (48)", "Vueltas 15 a 16: pb en cada punto alrededor (48)"]);
    await page.context().close();
  });
  await prueba("más formas de escribir las vueltas: «R1 6 sc», «Vuelta 1 →», «1pb», «<18>», «sc across»", async () => {
    const page = await nuevaPagina(browser);
    const pasos = t => page.evaluate(t => { const r = importarTexto(t, null, true); return r.pasos.map((l, i) => r.revision[i].estado + " | " + l); }, t);
    assert.deepEqual(await pasos("Ball\nR1 6 sc in MR (6)\nR2 inc x6 (12)\nR3 (sc, inc) x6 (18)"),
      ["cuadra | Vuelta 1: 6 pb en anillo mágico (6)", "cuadra | Vuelta 2: aum x6 (12)", "cuadra | Vuelta 3: *pb, aum* repetir 6 veces (18)"]);
    assert.deepEqual(await pasos("Bola\nVuelta 1 → 6 pb en anillo (6)\nVuelta 2 → 6 aum (12)"), ["cuadra | Vuelta 1: 6 pb en anillo (6)", "cuadra | Vuelta 2: 6 aum (12)"]);
    assert.deepEqual(await pasos("Bola\nV1: 6 pb en AM (6)\nV2: 6aum (12)\nV3: (1pb, 1aum)x6 (18)"),
      ["cuadra | Vuelta 1: 6 pb en AM (6)", "cuadra | Vuelta 2: 6 aum (12)", "cuadra | Vuelta 3: *1 pb, 1 aum* repetir 6 veces (18)"]);
    assert.deepEqual(await pasos("Ball\nRnd 1: 6 sc in MR <6>\nRnd 2: inc x6 <12>"), ["cuadra | Vuelta 1: 6 pb en anillo mágico (6)", "cuadra | Vuelta 2: aum x6 (12)"]);
    assert.equal((await pasos("Scarf\nRow 1: ch 11, sc in 2nd ch from hook and across, turn. (10)\nRow 2: ch 1, sc across, turn. (10)"))[1], "cuadra | Fila 2: 1 cad, pb en cada punto, gira. (10)");
    // «Round 1 (6):» no se toca: el total va antes de los dos puntos
    assert.equal((await pasos("Ball\nRound 1 (6): 6 sc in MR\nRound 2 (12): inc in each st"))[0], "cuadra | Vuelta 1 (6): 6 pb en anillo mágico");
    await page.context().close();
  });
  await prueba("gráfico: se escriba como se escriba, sale entero y con los puntos que dice cada vuelta", async () => {
    const page = await nuevaPagina(browser);
    const casos = [
      ["Vuelta 1: 6 pb en anillo mágico (6)\nVuelta 2: 6 aum (12)\nVuelta 3: (1 pb, 1 aum) x 6 (18)\nVuelta 4: (2 pb, 1 aum) x 6 (24)\nVueltas 5 a 8: 24 pb (24)\nVuelta 9: (2 pb, 1 dism) x 6 (18)\nVuelta 10: (1 pb, 1 dism) x 6 (12)", "redondo", [6, 12, 18, 24, 24, 24, 24, 24, 18, 12]],
      ["Anillo mágico\nV1: 6pb (6)\nV2: 6aum (12)\nV3: (1pb, 1aum)x6 (18)\nV4: [2pb, 1aum] x6 (24)", "redondo", [6, 12, 18, 24]],
      ["Rnd 1: 6 sc in MR (6)\nRnd 2: inc x6 (12)\nRnd 3: (sc, inc) x6 (18)\nRnd 4: [2 sc, inc] around (24)", "redondo", [6, 12, 18, 24]],
      ["Ряд 1: 6 сбн в КА (6)\nРяд 2: 6 пр (12)\nРяд 3: (1 сбн, пр) х 6 (18)", "redondo", [6, 12, 18]],
      ["Vta 1: 6 mp en anillo (6)\nVta 2: 6 au (12)\nVta 3: (1 mp, 1 au) x 6 (18)", "redondo", [6, 12, 18]],
      ["Vuelta 1: 6 pb en anillo mágico\nVuelta 2: aumentar en todos los puntos\nVuelta 3: 1 pb, 1 aum, repetir 6 veces", "redondo", [6, 12, 18]],
      ["Vuelta 1: 3 cad (cuenta como 1 pa), 11 pa en anillo, cierra con pd (12)\nVuelta 2: 3 cad, 1 pa en el mismo punto, 2 pa en cada punto (24)", "redondo", [12, 24]],
      ["Monta 21 cad.\nFila 1: 1 pb en la 2ª cad y en cada cad, gira. (20)\nFila 2: 1 cad, 20 pb, gira. (20)\nFilas 3 a 5: igual que la fila 2. (20)", "filas", [0, 20, 20, 20, 20, 20]],
    ];
    for (const [t, vista, puntos] of casos) {
      const r = await page.evaluate(t => { const g = { cols: 10, celdas: [], vista: "filas" }; graficoDesdeTexto(g, t, true);
        return { vista: g.vista, puntos: g.celdas.filter(f => hayPunto(f) && !soloAnillo(f)).map(f => f.map(pk).filter(Boolean).reduce((a, k) => a + anchoDe(k), 0)) }; }, t);
      assert.deepEqual(r, { vista, puntos }, t);
    }
    // Escribir un patrón: el gráfico aparece solo mientras se escribe, sin tocar ningún botón
    await page.evaluate(() => go({ name: "editar" }));
    await page.locator("#ed-pasos").fill(casos[0][0]);
    await page.waitForFunction(() => document.querySelector(".previa svg.chart"));
    assert.match(await page.locator(".previa").innerText(), /10 vueltas/);
    // Añadir un patrón: al pegar, sale el gráfico de cada parte
    await page.evaluate(() => go({ name: "importar" }));
    await page.locator("#im-texto").fill("Osito\nCABEZA\nVuelta 1: 6 pb en anillo mágico (6)\nVuelta 2: 6 aum (12)\nOREJAS (hacer 2)\nVuelta 1: 6 pb en anillo mágico (6)\nVuelta 2: (1 pb, 1 aum) x 3 (9)");
    await page.waitForFunction(() => document.querySelectorAll(".previa .chip-parte").length === 2);
    await page.locator(".previa .chip-parte").nth(1).tap();
    assert.match(await page.locator(".previa").innerText(), /2 vueltas · de 6 a 9 puntos/);
    // Editor de gráficos: escribir arriba lo dibuja al momento
    await page.evaluate(() => { const g = nuevoGrafico(); go({ name: "grafico", id: g.id }); });
    await page.locator("#gr-texto").fill(casos[2][0]);
    await page.waitForFunction(() => state.graficos[0].vista === "redondo" && state.graficos[0].celdas.filter(f => hayPunto(f) && !soloAnillo(f)).length === 4);
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });
  await prueba("para personas mayores: botones para escribir, tocar una vuelta del gráfico y verlo con letras", async () => {
    const page = await nuevaPagina(browser);
    await page.evaluate(() => go({ name: "editar" }));
    const B = n => page.locator(".ayudas-escribir button", { hasText: n }).first();
    await B("Nueva vuelta").tap(); await page.keyboard.type("6"); await B("pb").tap(); await B("anillo").tap(); await B("Poner el total").tap();
    await B("Nueva vuelta").tap(); await page.keyboard.type("6"); await B("aum").tap(); await B("Poner el total").tap();
    assert.equal(await page.locator("#ed-pasos").inputValue(), "Vuelta 1: 6 pb en anillo mágico (6)\nVuelta 2: 6 aum (12)");
    await page.waitForFunction(() => document.querySelector(".previa svg.chart"));
    // Tocar el dibujo dice qué hay que hacer en esa vuelta
    const svg = page.locator(".previa svg.chart");
    const caja = await svg.boundingBox();
    await svg.tap({ position: { x: caja.width / 2, y: caja.height * 0.06 } });
    assert.match(await page.locator(".previa .info-vuelta").innerText(), /^Vuelta 2: 6 aum \(12\)/);
    // Con letras se escribe «aum» en vez del símbolo, y se recuerda
    await page.locator(".previa button", { hasText: "Letras" }).tap();
    assert.ok(await page.locator(".previa svg.chart text.letra", { hasText: "aum" }).count() >= 6);
    assert.equal(await page.evaluate(() => state.prefs.grafLetras), true);
    // Una vuelta que no cuadra se dice claro
    await page.locator("#ed-pasos").fill("Vuelta 1: 6 pb en anillo mágico (6)\nVuelta 2: 5 aum (12)");
    await page.waitForFunction(() => /Vuelta 2.*cuento 10 puntos, pero el patrón dice 12/.test(document.querySelector(".previa").innerText));
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });
  await prueba("la app abre en iPhone antiguos: sin «lookbehind» en las expresiones (iOS anterior al 16.4 no lo entiende)", async () => {
    const html = fs.readFileSync(path.join(__dirname, "..", "tejiendo-ilusiones.html"), "utf8");
    const codigo = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join("\n").replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(codigo, /\(\?<[!=]/, "hay un (?<! o (?<= en el código");
    // y la versión de pdf.js es la «legacy», que funciona en móviles antiguos
    assert.match(html, /pdfjs-dist@3\.11\.174\/legacy\/build\//);
  });
  await prueba("importa un patrón en ruso y coge el color de la lana", async () => {
    const page = await nuevaPagina(browser);
    const r = await page.evaluate(() => importarTexto("Мишка\nПряжа: хлопок розовый, крючок 2,5 мм\n1 ряд: 6 сбн в КА (6)\n2 ряд: 6 пр (12)\n3 ряд: (сбн, пр) х 6 (18)\n4-6 ряды: 18 сбн (18)\nЗакрепить нить, набить.", null, true));
    assert.equal(r.ruso, true);
    assert.equal(r.titulo, "Мишка");
    assert.equal(r.ganchillo, "2,5 mm");
    assert.deepEqual(r.pasos, ["Vuelta 1: 6 pb en anillo mágico (6)", "Vuelta 2: 6 aum (12)", "Vuelta 3: *pb, aum* repetir 6 veces (18)", "Vueltas 4 a 6: 18 pb (18)"]);
    assert.ok(r.revision.every(x => x.estado === "cuadra"), "todas las vueltas cuadran");
    assert.deepEqual(r.colorLana, { nombre: "rosa", hex: "#E07AA8" });
    const es = await page.evaluate(() => importarTexto("Gorrito\nLana: algodón azul marino, ganchillo 4 mm\nVuelta 1: 6 pb en el anillo. (6)\nFoto del modelo terminado\nVuelta 2: 1 aum en cada punto. (12)", null, true));
    assert.equal(es.hilo, "algodón azul marino");
    assert.equal(es.colorLana.nombre, "azul");
    assert.deepEqual(es.apartadas, ["Foto del modelo terminado"], "el texto que no es una vuelta no entra en los pasos");
    // Al guardarlo, la ficha lleva el color de la lana
    await page.evaluate(() => go({ name: "importar" }));
    await page.locator("#im-texto").fill("Gorrito\nLana: algodón azul marino, ganchillo 4 mm\nVuelta 1: 6 pb en el anillo. (6)\nVuelta 2: 1 aum en cada punto. (12)");
    await page.getByRole("button", { name: "Leer el patrón" }).tap();
    assert.match(await page.locator(".color-lana").textContent(), /azul/);
    await page.getByRole("button", { name: "Guardar patrón" }).tap();
    const p = (await estado(page)).patrones[0];
    assert.equal(p.color, "#2C6FB7");
    assert.equal(p.hilo, "algodón azul marino");
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });

  await prueba("patrón con partes y colores: «1ª vuelta», CUERPO/PIES/ALAS, con gris y con blanco", async () => {
    const page = await nuevaPagina(browser);
    const TXT = ["Pingüino", "Materiales: lana gris, blanca y anaranjada. Ganchillo 3 mm", "Pto = punto", "pb = punto bajo", "CUERPO", "Con gris",
      "1ª vuelta: 20 cad, por el otro lado de la cadeneta 1 pb en cada cad (40)", "16ª vuelta: 2 cad, 3 pa, con blanco: 10 pa, con gris: 3 pa,", "pd en el primer pa (16)",
      "PIES (hacer 2)", "Con anaranjado", "1ª vuelta: Hacer una anillo mágico de 6 pb (6)", "2ª vuelta: 6 aum (12)",
      "ALAS (hacer 2)", "Con gris", "1ª vuelta: hacer un anillo mágico, 2 cad, 6 pa en el anillo, 1 pd en el primer pa (6)"].join("\n");
    const r = await page.evaluate(t => importarTexto(t, null, true), TXT);
    assert.deepEqual(r.pasos, ["Parte: CUERPO · con gris", "Vuelta 1: 20 cad, por el otro lado de la cadeneta 1 pb en cada cad (40)",
      "Vuelta 16: 2 cad, 3 pa, con blanco: 10 pa, con gris: 3 pa, pd en el primer pa (16)",
      "Parte: PIES (hacer 2) · con anaranjado", "Vuelta 1: Hacer una anillo mágico de 6 pb (6)", "Vuelta 2: 6 aum (12)",
      "Parte: ALAS (hacer 2) · con gris", "Vuelta 1: hacer un anillo mágico, 2 cad, 6 pa en el anillo, 1 pd en el primer pa (6)"]);
    assert.ok(!r.pasos.some(l => /=/.test(l)), "las leyendas no son pasos");
    assert.equal(r.colorLana.nombre, "gris", "el primer color de los materiales");
    assert.equal(r.revision[7].estado, "cuadra", "«en el primer pa» es un sitio, no un punto");
    await page.evaluate(() => go({ name: "importar" }));
    await page.locator("#im-texto").fill(TXT);
    await page.getByRole("button", { name: "Leer el patrón" }).tap();
    assert.equal(await page.locator("ol.importados li.parte").count(), 3);
    await page.getByRole("button", { name: "Guardar patrón" }).tap();
    const id = await page.evaluate(() => state.patrones[0].id);
    assert.equal(await page.locator("ol.steps li.parte").count(), 3);
    // Modo sofá: la parte nueva avisa de que se empieza otra vez, con su lana; el gráfico es solo el de esa parte
    await page.evaluate(id => { prog(id).paso = 3; save(); go({ name: "sofa", id }); }, id);
    await page.waitForTimeout(200);
    assert.match(await page.locator(".sofa-eye .eyebrow").textContent(), /Nueva parte/);
    assert.match(await page.locator(".sofa-lana").textContent(), /anaranjado/);
    assert.match(await page.locator(".sofa-goal").textContent(), /Empezar esta parte/);
    await page.locator(".sofa-big").tap();
    await page.waitForTimeout(200);
    assert.match(await page.locator(".sofa-txt").textContent(), /Vuelta 1: Hacer una anillo/);
    assert.equal(await page.evaluate(id => { const ge = graficoEnCurso(buscar(id), prog(id)); return ge.graf.vista + ":" + ge.ahora.length; }, id), "redondo:1", "los pies van en redondo, desde su vuelta 1");
    // En el cuerpo, la vuelta con «con blanco» lo enseña
    await page.evaluate(id => { prog(id).paso = 2; save(); render(); }, id);
    await page.waitForTimeout(150);
    assert.match(await page.locator(".sofa-lana").textContent(), /gris.*blanco/);
    await page.screenshot({ path: path.join(CAPTURAS, "sofa-partes-lana.png") });
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });

  await prueba("cada punto del gráfico sale del color de su lana, también dentro de una vuelta", async () => {
    const page = await nuevaPagina(browser);
    const filas = await page.evaluate(() => {
      const p = { id: "m-col", titulo: "Pingüino", color: "#8A9594", pasos: ["Parte: CUERPO · con gris", "Vuelta 1: 18 cad, 1 pd en la primera cad (18)",
        "Vuelta 2: 2 cad, 3 pa, con blanco: 10 pa, con gris: 5 pa, 1 pd en el primer pa (18)", "Parte: PIES (hacer 2) · con anaranjado", "Vuelta 1: 6 pb en anillo mágico (6)"] };
      state.patrones.unshift(p);
      const cuerpo = graficoEnCurso(p, { paso: 1, rep: 0 }).graf.celdas.map(f => f.filter(v => pk(v)).map(pcol));
      const pies = graficoEnCurso(p, { paso: 4, rep: 0 }).graf.celdas.map(f => f.filter(v => pk(v)).map(pcol));
      const sinColores = graficoDePatron({ id: "m-x", pasos: ["Vuelta 1: 6 pb en anillo mágico (6)"] }).celdas.flat().filter(v => pk(v)).map(pcol);
      return { cuerpo, pies, sinColores };
    });
    const GRIS = 8, BLANCO = 9, NARANJA = 1;
    assert.ok(filas.cuerpo[0].every(c => c === GRIS));
    assert.deepEqual(filas.cuerpo[1], [...Array(5).fill(GRIS), ...Array(10).fill(BLANCO), ...Array(6).fill(GRIS)], "2 cad y 3 pa grises, 10 blancos, 5 pa y el pd grises");
    assert.ok(filas.pies.flat().every(c => c === NARANJA), "los pies, naranjas");
    assert.ok(filas.sinColores.every(c => c === -1), "si el patrón no dice colores, no se pinta nada");
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });

  await prueba("patrón por partes: se elige la parte, se ve su gráfico y si va en redondo o en filas", async () => {
    const page = await nuevaPagina(browser);
    await page.evaluate(() => { state.patrones.unshift({ id: "m-par", titulo: "Pingüino", color: "#8A9594", pasos: ["Parte: CUERPO · con gris", "Vuelta 1: 18 cad, 1 pd en la primera cad (18)",
      "Parte: PIES (hacer 2) · con anaranjado", "Vuelta 1: 6 pb en anillo mágico (6)", "Vuelta 2: 6 aum (12)"] }); save(); go({ name: "patron", id: "m-par" }); });
    assert.equal(await page.locator(".chip-parte").count(), 2);
    assert.match(await page.locator(".hero-par figcaption").first().textContent(), /CUERPO.*En redondo/);
    await page.locator(".chip-parte", { hasText: "PIES" }).tap();
    assert.match(await page.locator(".hero-par figcaption").first().textContent(), /PIES.*En redondo/);
    await page.getByRole("button", { name: "Ver el gráfico" }).tap();
    const g = await page.evaluate(() => ({ vista: state.graficos[0].vista, nombre: state.graficos[0].nombre, naranja: state.graficos[0].celdas.flat().filter(v => pk(v)).every(v => pcol(v) === 1) }));
    assert.deepEqual(g, { vista: "redondo", nombre: "Pingüino · PIES (hacer 2)", naranja: true });
    await page.getByRole("button", { name: "← Patrón" }).tap();
    assert.equal(await page.evaluate(() => view.name), "patron");
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });

  await prueba("partes que se hacen 2 veces: al acabar el primer pie vuelve a la vuelta 1 del segundo", async () => {
    const page = await nuevaPagina(browser);
    assert.equal(await page.evaluate(() => [vecesDe("PIES (hacer 2)"), vecesDe("LEGS (make 2)"), vecesDe("Alas (2 piezas)"), vecesDe("НОЖКИ (2 детали)"), vecesDe("CUERPO")].join()), "2,2,2,2,1");
    assert.ok(await page.evaluate(() => !!cabeceraParte("LEGS (make 2)")));
    await page.evaluate(() => { state.patrones.unshift({ id: "m-pie", titulo: "Pollito", color: "#E1B12C", pasos: ["Parte: CUERPO · con amarillo", "Vuelta 1: 6 pb en anillo mágico (6)",
      "Parte: PIES (hacer 2) · con naranja", "Vuelta 1: 6 pb en anillo mágico (6)", "Vuelta 2: 6 aum (12)"] }); Object.assign(prog("m-pie"), { paso: 4 }); save(); go({ name: "sofa", id: "m-pie" }); });
    await page.waitForTimeout(200);
    assert.match(await page.locator(".sofa-eye .eyebrow").textContent(), /^Pieza 1 de 2/);
    assert.match(await page.locator(".sofa-desp").textContent(), /segunda pieza/);
    for (let i = 0; i < 12; i++) { await page.locator(".sofa-big").tap(); await page.waitForTimeout(160); }
    assert.match(await page.locator(".sofa-flash").textContent(), /Pieza 1 hecha · ahora la segunda de 2/);
    await page.waitForTimeout(100);
    assert.match(await page.locator(".sofa-eye .eyebrow").textContent(), /^Pieza 2 de 2/);
    assert.match(await page.locator(".sofa-txt").textContent(), /^Vuelta 1: 6 pb/);
    await page.screenshot({ path: path.join(CAPTURAS, "sofa-segunda-pieza.png") });
    // Deshacer vuelve al final del primer pie; y al acabar el segundo, se termina
    await page.getByRole("button", { name: "Deshacer el último toque" }).tap();
    assert.deepEqual(await page.evaluate(() => [prog("m-pie").paso, prog("m-pie").pieza]), [4, 0]);
    const fin = await page.evaluate(() => { const pr = { paso: 4, pieza: 1, puntos: 0, rep: 0 }; return sofaVueltaHecha(pr, buscar("m-pie").pasos); });
    assert.equal(fin, "fin");
    const atras = await page.evaluate(() => { const pr = { paso: 3, pieza: 1 }; sofaPasoAnterior(pr, buscar("m-pie").pasos); return [pr.paso, pr.pieza]; });
    assert.deepEqual(atras, [4, 0], "atrás desde la vuelta 1 del segundo pie va al final del primero");
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });

  await prueba("modo sofá: avisa justo en el punto en que se cambia de color", async () => {
    const page = await nuevaPagina(browser);
    await page.evaluate(() => { state.patrones.unshift({ id: "m-cc", titulo: "Pingüino", color: "#8A9594", pasos: ["Parte: CUERPO · con gris", "Vuelta 1: 18 cad, 1 pd en la primera cad (18)",
      "Vuelta 2: 2 cad, 3 pa, con blanco: 10 pa, con gris: 5 pa, 1 pd en el primer pa (18)"] }); Object.assign(prog("m-cc"), { paso: 2 }); save(); go({ name: "sofa", id: "m-cc" }); });
    await page.waitForTimeout(200);
    const avisos = [];
    for (let i = 1; i <= 18; i++) {
      await page.locator(".sofa-big").tap(); await page.waitForTimeout(140);
      const f = page.locator(".sofa-flash.cambio:not([hidden])");
      if (await f.count()) { const t = await f.textContent(); if (!avisos.length || avisos[avisos.length - 1][1] !== t) avisos.push([i, t]); }
      if (i === 4 && avisos.length) await page.screenshot({ path: path.join(CAPTURAS, "sofa-cambio-color.png") });
    }
    assert.deepEqual(avisos.map(a => a[1]), ["Ahora cambia a la lana blanca", "Ahora cambia a la lana gris"], JSON.stringify(avisos));
    assert.equal(avisos[1][0] - avisos[0][0], 10, "10 pa blancos entre un aviso y otro");
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });

  await prueba("lanas que pide el patrón frente a «Mis lanas»: dice cuál falta y se puede apuntar", async () => {
    const page = await nuevaPagina(browser);
    await page.evaluate(() => {
      state.lanas = [{ id: "l-g", nombre: "Algodón gris", color: "#8A9594", gramos: 50, ovillos: 1 }, { id: "l-b", nombre: "Algodón", color: "#F2EEE6", gramos: 50, ovillos: 1 }];
      state.patrones.unshift({ id: "m-lan", titulo: "Pingüino", hilo: "lana gris, blanca y anaranjada", color: "#8A9594", pasos: ["Parte: CUERPO · con gris", "Vuelta 1: 2 cad, 3 pa, con blanco: 10 pa (13)", "Parte: PIES (hacer 2) · con anaranjado", "Vuelta 1: 6 pb en anillo mágico (6)"] });
      save(); go({ name: "patron", id: "m-lan" });
    });
    assert.match(await page.locator(".lanas-patron").textContent(), /Necesitas gris, blanco y naranja\. No tienes naranja\./);
    assert.equal(await page.locator(".lanas-patron .lana-chip.falta").count(), 1);
    await page.locator(".lanas-patron").screenshot({ path: path.join(CAPTURAS, "patron-lanas.png") });
    await page.getByRole("button", { name: "＋ Ya tengo naranja" }).tap();
    assert.equal(await page.locator("#la-nombre input, input#la-nombre").first().inputValue(), "Lana naranja");
    await page.getByRole("button", { name: "Guardar", exact: true }).tap();
    assert.equal(await page.evaluate(() => view.name), "patron");
    assert.match(await page.locator(".lanas-patron").textContent(), /Las tienes todas/);
    // Sin lanas apuntadas, solo dice cuáles hacen falta
    await page.evaluate(() => { state.lanas = []; render(); });
    assert.match(await page.locator(".lanas-patron").textContent(), /Necesitas gris, blanco y naranja\. Apunta/);
    assert.equal(await page.evaluate(() => { const p = { id: "x", pasos: ["Vuelta 1: 6 pb (6)"] }; return lanasDelPatron(p).length; }), 0, "sin colores no sale nada");
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });

  await prueba("importar: una vuelta que no cuadra trae el arreglo probable y se aplica con un toque", async () => {
    const page = await nuevaPagina(browser);
    const s = await page.evaluate(() => [sugerirArreglo("Vuelta 3: *1 pb, 1 aum* x 5 (18)"), sugerirArreglo("Vuelta 4: *2 pb, 1 aum* repetir 6 veces (34)"), sugerirArreglo("Vuelta 2: 6 pb (12)"), sugerirArreglo("Vuelta 2: 6 aum (12)")]);
    assert.equal(s[0].texto, "Vuelta 3: *1 pb, 1 aum* x 6 (18)");
    assert.ok(s[1].total && s[1].texto === "Vuelta 4: *2 pb, 1 aum* repetir 6 veces (24)", JSON.stringify(s[1]));
    assert.ok(s[2], "siempre hay algo que proponer"); assert.equal(s[3], null, "si cuadra, nada");
    await page.evaluate(() => go({ name: "importar" }));
    await page.locator("#im-texto").fill("Vuelta 1: 6 pb en anillo mágico (6)\nVuelta 2: 6 aum (12)\nVuelta 3: *1 pb, 1 aum* x 5 (18)");
    await page.getByRole("button", { name: "Leer el patrón" }).tap();
    assert.match(await page.locator(".arreglo").textContent(), /¿Quizás «x 6» en vez de «x 5»\?/);
    await page.screenshot({ path: path.join(CAPTURAS, "importar-arreglo.png"), fullPage: true });
    await page.locator(".arreglo button", { hasText: "Aplicar" }).tap();
    assert.equal(await page.locator("ol.importados .rev.ok", { hasText: "Cuadra" }).count(), 3);
    assert.match(await page.locator(".arreglo").textContent(), /Arreglada por ti/);
    await page.locator("#im-nombre").fill("Bola");
    await page.getByRole("button", { name: "Guardar patrón" }).tap();
    await page.waitForFunction(() => state.patrones.length > 0); // se guarda al terminar de leer (a veces tarda un poco)
    assert.equal(await page.evaluate(() => state.patrones[0].pasos[2]), "Vuelta 3: *1 pb, 1 aum* x 6 (18)");
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });

  await prueba("contadores con nombre: varios, cada uno con lo suyo, y se guardan", async () => {
    const page = await nuevaPagina(browser, {}, LEGADO);
    await page.evaluate(() => go({ name: "contador" }));
    await page.getByRole("button", { name: "＋ Otro contador" }).tap();
    await page.locator("#co-nombre").fill("Manga izquierda"); await page.locator("#co-nombre").press("Enter"); await page.locator("#co-nombre").blur();
    await page.getByRole("button", { name: "Sumar 1 a Vueltas" }).tap();
    await page.getByRole("button", { name: "Sumar 1 a Vueltas" }).tap();
    await page.screenshot({ path: path.join(CAPTURAS, "contadores-nombre.png") });
    await page.locator(".chip-parte", { hasText: "Principal" }).tap();
    assert.equal(await page.locator(".counter .num").first().textContent(), "4", "el principal sigue igual");
    await recargar(page);
    const st = await estado(page);
    assert.deepEqual(st.libre, LEGADO.libre);
    assert.equal(st.contadores.length, 1);
    assert.equal(st.contadores[0].nombre, "Manga izquierda"); assert.equal(st.contadores[0].vueltas, 2);
    // Borrar se puede deshacer
    await page.evaluate(() => go({ name: "contador" }));
    await page.locator(".chip-parte", { hasText: "Manga izquierda" }).tap();
    await page.getByRole("button", { name: "Borrar" }).tap(); await page.getByRole("button", { name: "¿Borrar? Toca otra vez" }).tap();
    assert.equal(await page.evaluate(() => state.contadores.length), 0);
    await page.getByRole("button", { name: "Deshacer" }).tap();
    assert.equal(await page.evaluate(() => state.contadores[0].vueltas), 2);
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });

  await prueba("avisa antes de la vuelta difícil: color, hebra de atrás, punto nuevo", async () => {
    const page = await nuevaPagina(browser);
    const PASOS = ["Parte: CUERPO · con gris", "Vuelta 1: 18 cad, 1 pd en la primera cad (18)", "Vuelta 2: 2 cad, 3 pa, con blanco: 10 pa, con gris: 5 pa, 1 pd en el primer pa (18)",
      "Vuelta 3: 18 pa por la hebra de atrás (18)", "Vuelta 4: 18 pad (18)", "Vuelta 5: 18 pa (18)"];
    const ojos = await page.evaluate(P => [2, 3, 4, 5].map(i => ojoDelPaso(P, i)), PASOS);
    assert.match(ojos[0], /En la vuelta 2 se cambia de color: blanco y gris/);
    assert.match(ojos[1], /En la vuelta 3 se teje por la hebra de atrás/);
    assert.match(ojos[2], /En la vuelta 4 sale un punto nuevo: punto alto doble/i);
    assert.equal(ojos[3], null, "una vuelta normal no avisa");
    await page.evaluate(P => { state.patrones.unshift({ id: "m-ojo", titulo: "Pingüino", color: "#8A9594", pasos: P }); Object.assign(prog("m-ojo"), { paso: 1 }); save(); go({ name: "sofa", id: "m-ojo" }); }, PASOS);
    await page.waitForTimeout(200);
    assert.ok(await page.locator(".sofa-ojo").isVisible());
    assert.match(await page.locator(".sofa-ojo").textContent(), /Ojo: En la vuelta 2 se cambia de color/);
    await page.screenshot({ path: path.join(CAPTURAS, "sofa-ojo.png") });
    await page.evaluate(() => { prog("m-ojo").paso = 4; save(); render(); });
    await page.waitForTimeout(150);
    assert.ok(await page.locator(".sofa-ojo").isHidden());
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });

  await prueba("cuánto te falta: puntos que quedan, piezas repetidas y tiempo a su ritmo", async () => {
    const page = await nuevaPagina(browser);
    const r = await page.evaluate(() => {
      const p = { id: "m-f", titulo: "Bola", pasos: ["Vuelta 1: 6 pb en anillo mágico (6)", "Vuelta 2: 6 aum (12)", "Vueltas 3 a 4: 12 pb (12)"] };
      const pies = ["Parte: PIES (hacer 2) · con naranja", "Vuelta 1: 6 pb en anillo mágico (6)", "Vuelta 2: 6 aum (12)"];
      return [puntosQueQuedan(p.pasos, { paso: 0 }).puntos, puntosQueQuedan(p.pasos, { paso: 1, puntos: 2 }).puntos, cuantoFalta(p, { paso: 2, rep: 1, puntos: 0, tiempo: 600 }),
        cuantoFalta(p, { paso: 1, puntos: 0, tiempo: 5 }), puntosQueQuedan(pies, { paso: 0 }).puntos, puntosQueQuedan(pies, { paso: 2, pieza: 1 }).puntos, puntosQueQuedan(pies, { paso: 1, pieza: 0 }).puntos];
    });
    assert.deepEqual(r, [42, 34, "Te quedan unos 12 puntos, unos 5 minutos a tu ritmo.", "Te quedan unos 36 puntos.", 36, 12, 36]);
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });

  await prueba("fotos de cómo va: se añaden desde la labor, se ven en el patrón y se pueden quitar", async () => {
    const fx3 = await browser.newPage(); await fx3.setViewportSize({ width: 300, height: 300 });
    await fx3.setContent('<body style="margin:0;background:#E07AA8"></body>'); const img = await fx3.screenshot({ type: "png" }); await fx3.close();
    const page = await nuevaPagina(browser);
    await page.evaluate(() => { state.prefs.tejer = "completa"; state.patrones.unshift({ id: "m-av", titulo: "Manta", color: "#8A9594", pasos: ["Haz 30 cad.", "Vuelta 1: 29 pb (29)"] }); Object.assign(prog("m-av"), { paso: 1 }); save(); go({ name: "tejer", id: "m-av" }); });
    const [fc] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: "Foto de cómo va" }).tap()]);
    await fc.setFiles({ name: "avance.png", mimeType: "image/png", buffer: img });
    await page.waitForFunction(() => document.querySelectorAll(".avance").length === 1);
    assert.equal(await page.evaluate(() => state.avances["m-av"][0].paso), 1);
    await page.evaluate(() => go({ name: "patron", id: "m-av" }));
    assert.equal(await page.locator(".avance").count(), 1);
    await page.locator(".avances").screenshot({ path: path.join(CAPTURAS, "patron-avances.png") });
    await page.locator(".avance").tap();
    await page.getByRole("button", { name: "Quitar esta foto" }).tap(); await page.getByRole("button", { name: "¿Quitar? Toca otra vez" }).tap();
    assert.equal(await page.locator(".avance").count(), 0);
    assert.equal(await page.evaluate(() => Object.keys(localStorage).filter(k => k.includes("av-m-av")).length), 0, "la foto se borra del aparato");
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });

  await prueba("al terminar: quitar de Mis lanas los ovillos gastados, primero los del color del patrón", async () => {
    const page = await nuevaPagina(browser);
    await page.evaluate(() => {
      state.lanas = [{ id: "l-r", nombre: "Lana roja", color: "#C0392B", gramos: 50, ovillos: 2 }, { id: "l-g", nombre: "Algodón gris", color: "#8A9594", gramos: 50, ovillos: 3 }];
      state.patrones.unshift({ id: "m-fin", titulo: "Pingüino", hilo: "lana gris", color: "#8A9594", pasos: ["Vuelta 1: 6 pb (6)"] });
      Object.assign(prog("m-fin"), { paso: 1, fin: Date.now() }); save(); go({ name: "tejer", id: "m-fin" });
    });
    assert.match(await page.locator(".gastar .fila-gasto").first().textContent(), /Algodón gris/, "primero la del color del patrón");
    await page.getByRole("button", { name: "Un ovillo más de Algodón gris" }).tap();
    await page.getByRole("button", { name: "Un ovillo más de Algodón gris" }).tap();
    await page.locator(".gastar").screenshot({ path: path.join(CAPTURAS, "terminar-gastar-lana.png") });
    await page.getByRole("button", { name: "Quitar 2 ovillos de Mis lanas" }).tap();
    assert.equal(await page.evaluate(() => state.lanas.find(l => l.id === "l-g").ovillos), 1);
    assert.equal(await page.locator(".gastar").count(), 0, "ya no se vuelve a preguntar");
    await page.getByRole("button", { name: "Deshacer" }).tap();
    assert.equal(await page.evaluate(() => state.lanas.find(l => l.id === "l-g").ovillos), 3);
    // Una lana gastada del todo sale como agotada, no como 1 ovillo
    await page.evaluate(() => { state.lanas[0].ovillos = 0; save(); go({ name: "lanas" }); });
    assert.match(await page.locator(".yarnrow").first().textContent(), /Agotada/);
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });

  await prueba("patrones que dicen «fila» en vez de «vuelta»: se leen, cuadran y el modo sofá dice «Fila»", async () => {
    const page = await nuevaPagina(browser);
    const TXT = ["Bufanda", "Materiales: lana gris", "Monta 21 cad.", "Fila 1: 1 pb en la 2ª cad y en cada cad, gira (20)",
      "Fila 2: 1 cad, 20 pb, gira (20) Fila 3: 2 cad, 20 pa, gira (20)", "Filas 4 a 6: 1 cad, 20 pb, gira (20)", "Filas 7-9: 1 cad, 20 pb (20)",
      "10ª fila: 1 cad, 20 pb (20)", "De la 11ª a la 14ª fila: 1 cad, 20 pb (20)", "Hilera 15: 1 cad, 20 pb (20)", "Corta el hilo."].join("\n");
    const r = await page.evaluate(t => { const r = importarTexto(t, null, true); return { pasos: r.pasos, rev: r.revision.map(x => x.estado), reps: r.pasos.map(t => infoPaso(t).reps) }; }, TXT);
    assert.deepEqual(r.pasos, ["Monta 21 cad.", "Fila 1: 1 pb en la 2ª cad y en cada cad, gira (20)", "Fila 2: 1 cad, 20 pb, gira (20)", "Fila 3: 2 cad, 20 pa, gira (20)",
      "Filas 4 a 6: 1 cad, 20 pb, gira (20)", "Filas 7 a 9: 1 cad, 20 pb (20)", "Fila 10: 1 cad, 20 pb (20)", "Filas 11 a 14: 1 cad, 20 pb (20)", "Hilera 15: 1 cad, 20 pb (20)"],
      "la cadeneta de base se queda aunque solo se cojan las filas");
    assert.ok(r.rev.slice(1).every(e => e === "cuadra"), JSON.stringify(r.rev));
    assert.deepEqual(r.reps.slice(4, 8), [3, 3, 1, 4], "«Filas 4 a 6» son 3 filas");
    // En inglés, «Row» pasa a «Fila» y «Round» sigue siendo «Vuelta»
    const en = await page.evaluate(() => importarTexto("Scarf\nCh 21.\nRow 1: sc in 2nd ch from hook and in each ch across, turn (20)\nRows 2-10: ch 1, sc in each st across, turn (20)\nFasten off.", null, true));
    assert.deepEqual(en.pasos.slice(1), ["Fila 1: pb en la 2ª cad y en cada punto, gira (20)", "Filas 2 al 10: 1 cad, pb en cada punto, gira (20)"]);
    assert.ok(en.revision.slice(1).every(x => x.estado === "cuadra"));
    await page.evaluate(p => { state.patrones.unshift({ id: "m-fila", titulo: "Bufanda", color: "#8A9594", pasos: p }); Object.assign(prog("m-fila"), { paso: 4 }); save(); go({ name: "sofa", id: "m-fila" }); }, r.pasos);
    await page.waitForTimeout(200);
    assert.match(await page.locator(".sofa-eye .eyebrow").textContent(), /^Fila 4 · repetición 1 de 3/);
    assert.equal(await page.locator(".sofa-acc .sofa-sec").textContent(), "Fila hecha →");
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });

  await prueba("PDF latinoamericano (mp, au, dis), partes «X 2», «(continúa)» y pies de página", async () => {
    const page = await nuevaPagina(browser);
    const TXT = ["Manta apego unicornio", "Necesitarás: hilo de algodón, ganchillo de 2,75 mm", "Puntos y abreviaturas", "mp: medio punto", "au: aumento", "dis: disminución",
      "BRAZOS X 2", "Fila 1: En color rosa confite, teje 6 mp en", "un anillo mágico (6 mp)", "Fila 2: Teje 1 au por cada punto (12 mp)", "Fila 3: 1 mp, 1 au x 6 (18 mp)",
      "Fila 4: THT 18 mp", "PATRÓN DE TEJIDO TEJIENDO ILUSIONES", "Filas 5 y 6: 18 mp", "Fila 7: Cambia a color rosa pastel y teje", "18 mp", "Fila 8: 4 mp, 1 dis x 3 (15 mp)",
      "Rellena un poco.", "PATRÓN DE TEJIDO TEJIENDO ILUSIONES", "BRAZOS X 2 (continúa)", "Filas 9 a 12: 15 mp", "CINTAS x 12",
      "Fila 1: En el color que corresponda, levanta una", "cadena base de 31 puntos. Deja 1 cad libre y teje *2 mp", "en el mismo espacio\" x 10, 20 mv.",
      "PATRÓN DE TEJIDO TEJIENDO ILUSIONES"].join("\n");
    const r = await page.evaluate(t => { const r = importarTexto(arreglarLectura(t), null, true); return { latino: r.latino, pasos: r.pasos, rev: r.revision.map(x => x.estado), veces: vecesDe(r.pasos[0]) }; }, TXT);
    assert.equal(r.latino, true);
    assert.deepEqual(r.pasos, ["Parte: BRAZOS X 2 · con rosa confite", "Fila 1: En color rosa confite, teje 6 pb en un anillo mágico (6 pb)", "Fila 2: Teje 1 aum en cada punto (12 pb)",
      "Fila 3: 1 pb, 1 aum x 6 (18 pb)", "Fila 4: por la hebra de atrás 18 pb", "Filas 5 y 6: 18 pb", "Cambia a la lana rosa pastel.", "Fila 7: Cambia a color rosa pastel y teje 18 pb",
      "Fila 8: 4 pb, 1 dism x 3 (15 pb)", "Filas 9 a 12: 15 pb", "Parte: CINTAS x 12",
      "Fila 1: En el color que corresponda, levanta 31 cad de base. Deja 1 cad libre y teje *2 pb en el mismo espacio* x 10, 20 mpa."]);
    assert.equal(r.veces, 2, "«BRAZOS X 2» se teje dos veces");
    assert.ok(r.rev.every(e => ["cuadra", "ok", "texto"].includes(e)), JSON.stringify(r.rev));
    // «Rnd 9: … – 18 sts» ya está cerrada: «Stuff the ball.» no se pega a ella
    const en = await page.evaluate(() => importarTexto("Ball\nRnd 9: (2 sc, dec) x 6 – 18 sts\nStuff the ball.\nRnd 10: dec 6 times (6)").pasos);
    assert.equal(en.length, 3, JSON.stringify(en));
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });

  console.log("Traducir un patrón");
  // Patrones de prueba: uno ruso con foto (imagen) y gráfico de símbolos (líneas), y uno inglés del Reino Unido
  const fxT = await browser.newPage();
  await fxT.setViewportSize({ width: 300, height: 220 });
  await fxT.setContent(`<body style="margin:0;background:#f3e9df"><div style="width:140px;height:140px;border-radius:50%;background:#e9b8c8;margin:40px auto"></div></body>`);
  const fotoMuneco = "data:image/png;base64," + (await fxT.screenshot()).toString("base64");
  let simbolos = ""; for (let r = 1; r <= 3; r++) for (let k = 0; k < r * 6; k++) { const a = k / (r * 6) * 6.283, x = 100 + Math.cos(a) * r * 25, y = 100 + Math.sin(a) * r * 25; simbolos += `<line x1="${x}" y1="${y - 6}" x2="${x}" y2="${y + 6}" stroke="#000"/><line x1="${x - 6}" y1="${y}" x2="${x + 6}" y2="${y}" stroke="#000"/>`; }
  const RUSO = `<style>body{font:13px Arial;margin:36px} h1{font-size:26px} h3{margin:14px 0 4px} p{margin:0 0 4px}</style>
<h1>Зайка Мия</h1><img src="${fotoMuneco}" style="width:200px"><p>Мастер-класс по вязанию игрушки крючком</p>
<h3>Материалы:</h3><p>- пряжа YarnArt Jeans, цвет 62 (молочный);</p><p>- крючок 2,5 мм;</p><p>- глазки на безопасном креплении 8 мм.</p>
<h3>Условные обозначения:</h3><p>КА – кольцо амигуруми</p><p>сбн – столбик без накида</p><p>пр – прибавка</p><p>уб – убавка</p>
<p>Схема головы:</p><svg width="200" height="200"><circle cx="100" cy="100" r="8" fill="none" stroke="#000"/>${simbolos}</svg>
<h3>Голова</h3><p>1 ряд: 6 сбн в КА (6)</p><p>2 ряд: 6 пр (12)</p><p>3 ряд: (1 сбн, пр) х 6 (18)</p><p>4-8 ряды: 18 сбн</p>
<p>Глазки вставить между 6 и 7 рядом.</p><p>9 ряд: (1 сбн, уб) х 6 (12)</p><p>10 ряд: 6 уб (6)</p><p>Набейте голову. Закрепите нить и стяните отверстие.</p>`;
  const INGLES_UK = `<style>body{font:13px Arial;margin:36px} p{margin:0 0 4px}</style><h1>Granny Coaster</h1><p>UK terms</p>
<p>Abbreviations</p><p>ch - chain</p><p>dc - double crochet</p><p>tr - treble crochet</p><p>ss - slip stitch</p>
<p>Round 1: 6 dc into a magic ring, join with ss (6)</p><p>Round 2: 2 dc in each st around (12)</p><p>Round 3: ch 3 (counts as first tr), 2 tr in each st around (24)</p><p>Fasten off and weave in the ends.</p>`;
  await fxT.setViewportSize({ width: 800, height: 600 });
  await fxT.setContent(RUSO); const pdfRuso = await fxT.pdf({ format: "A4" });
  await fxT.setContent(INGLES_UK); const pdfIngles = await fxT.pdf({ format: "A5" });
  // El ruso escaneado: la hoja como una foto dentro del PDF
  await fxT.setViewportSize({ width: 800, height: 1130 }); await fxT.setContent(RUSO.replace("13px Arial", "16px Arial"));
  const hojaRusa = (await fxT.screenshot()).toString("base64");
  await fxT.setContent(`<style>body{margin:0}</style><img src="data:image/png;base64,${hojaRusa}" style="width:100%">`);
  const pdfRusoEscaneado = await fxT.pdf({ format: "A4", margin: { top: 0, bottom: 0, left: 0, right: 0 } });
  await fxT.close();
  const esperarTraduccion = page => page.waitForFunction(() => (traduccion && (traduccion.bloques || traduccion.idioma === "es" || traduccion.idioma === "otro")) || document.querySelector(".leyendo:not([hidden])")?.textContent.match(/No he|Necesito|contraseña|no es un PDF/), null, { timeout: 300000 });
  await prueba("traductor (reglas): las vueltas rusas y los puntos salen bien aunque no haya traductor", async () => {
    const page = await paginaWeb();
    const r = await page.evaluate(async () => {
      const lineas = ["Голова", "1 ряд: 6 сбн в КА (6)", "2-4 ряды: 12 сбн", "Р.5: (1 сбн, уб) х 6 (12)", "", "Набейте голову."];
      return (await traducirBloques(bloquesDeTexto(lineas, "ru"), { idioma: "ru", traductor: null })).map(b => [b.tipo, b.t, !!b.revisar]);
    });
    assert.deepEqual(r.filter(b => b[0] === "vuelta").map(b => b[1]), ["Vuelta 1: 6 pb en el anillo mágico (6)", "Vueltas 2 a 4: 12 pb", "Vuelta 5: (1 pb, dism) x 6 (12)"]);
    assert.ok(r.some(b => /parte|titulo/.test(b[0]) && /^Cabeza/.test(b[1])), JSON.stringify(r));
    assert.ok(r.some(b => b[0] === "texto" && b[2] && /rellena/i.test(b[1])), "sin traductor, las frases se traducen a medias y se marcan para revisar");
    assert.ok(r.filter(b => b[0] === "vuelta").every(b => !b[2]), "las vueltas no hay que revisarlas");
    assert.ok(r.some(b => b[0] === "leyenda" && /^pb – punto bajo/.test(b[1])), "pone la leyenda de las abreviaturas");
    assert.deepEqual(await page.evaluate(() => [idiomaDe("Vuelta 1: 6 pb en el anillo mágico (6)\nVuelta 2: 6 aum (12)\nRemata y esconde las hebras con la aguja lanera de la labor"), idiomaDe("Round 1: 6 sc in the magic ring (6)\nRound 2: inc in each st around (12)\nFasten off and weave in the ends with your hook"), idiomaDe("1 ряд: 6 сбн в кольцо амигуруми, затем вяжем по кругу без прибавок до конца")]), ["es", "en", "ru"]);
    assert.equal(await page.evaluate(() => arreglarLecturaRusa("2 ряд; (3 cóH, np) х 6, y6")), "2 ряд; (3 сбн, пр) х 6, уб", "letras que el lector de fotos confunde");
    await page.context().close();
  });
  await prueba("traducir un PDF ruso: texto en español, fotos y gráfico en su sitio, y un PDF para descargar", async () => {
    const page = await paginaWeb({ acceptDownloads: true });
    await page.evaluate(() => go({ name: "traducir" }));
    await subir(page, "#tr-pdf", "zaika.pdf", "application/pdf", pdfRuso);
    await esperarTraduccion(page);
    const tr = await page.evaluate(() => ({ idioma: traduccion.idioma, sinMotor: traduccion.sinMotor, bloques: traduccion.bloques.map(b => ({ tipo: b.tipo, t: b.t, revisar: !!b.revisar })) }));
    const textos = tr.bloques.filter(b => b.tipo !== "imagen");
    assert.equal(tr.idioma, "ru"); assert.equal(tr.sinMotor, undefined, "el traductor de Mozilla funciona");
    assert.equal(tr.bloques[0].tipo, "titulo"); assert.match(tr.bloques[0].t, /Conejit/);
    assert.deepEqual(tr.bloques.filter(b => b.tipo === "vuelta").map(b => b.t), ["Vuelta 1: 6 pb en el anillo mágico (6)", "Vuelta 2: 6 aum (12)", "Vuelta 3: (1 pb, aum) x 6 (18)", "Vueltas 4 a 8: 18 pb", "Vuelta 9: (1 pb, dism) x 6 (12)", "Vuelta 10: 6 dism (6)"]);
    assert.ok(textos.every(b => !/[а-яё]/i.test(b.t)), "no queda nada en ruso:\n" + textos.map(b => b.t).join("\n"));
    assert.ok(textos.some(b => /ojos/i.test(b.t) && /6 y 7/.test(b.t)), "traduce las notas");
    assert.ok(textos.some(b => b.tipo === "parte" && /^Cabeza/.test(b.t)));
    const fotos = tr.bloques.map((b, i) => b.tipo === "imagen" ? i : -1).filter(i => i >= 0);
    assert.equal(fotos.length, 2, "la foto y el gráfico");
    assert.equal(fotos[0], 1, "la foto va debajo del título");
    assert.ok(fotos[1] < tr.bloques.findIndex(b => b.tipo === "vuelta"), "el gráfico va antes de las vueltas");
    assert.ok(!textos.some(b => /^\+/.test(b.t)), "los símbolos del gráfico no salen como texto");
    await page.screenshot({ path: path.join(CAPTURAS, "traducir-movil.png"), fullPage: true });
    // Corregir una frase a mano antes de hacer el PDF
    await page.getByRole("button", { name: "Corregir el texto" }).tap();
    const area = page.locator(".tr-doc textarea").nth(1);
    await area.fill("Patrón de conejito a ganchillo");
    await page.getByRole("button", { name: "Ya está" }).first().tap();
    assert.ok(await page.locator(".tr-doc", { hasText: "Patrón de conejito a ganchillo" }).count());
    const espera = page.waitForEvent("download");
    await page.getByRole("button", { name: /Descargar el PDF/ }).tap();
    const d = await espera, archivo = path.join(CAPTURAS, "traducido.pdf");
    await d.saveAs(archivo);
    assert.match(d.suggestedFilename(), /^Conejit.* \(en espanol\)\.pdf$/);
    const pdf = fs.readFileSync(archivo);
    const leido = await page.evaluate(async a => { const doc = await abrirPDF(new Uint8Array(a)); const t = await textoDePDF(doc); const n = doc.numPages; const p1 = await doc.getPage(1); const imgs = (await cajasDeImagenes(p1)).cajas.length; doc.destroy(); return { t, n, imgs }; }, [...pdf]);
    assert.ok(leido.n >= 2, "el PDF traducido y al final la hoja original");
    assert.match(leido.t, /Vuelta 1:\s*6 pb en el anillo mágico \(6\)/);
    assert.match(leido.t, /Traducido del ruso al español/);
    assert.match(leido.t, /Patrón de conejito a ganchillo/, "lleva lo corregido a mano");
    assert.match(leido.t, /El patrón original/);
    assert.ok(leido.imgs >= 2, "con la foto y el gráfico");
    assert.deepEqual(page.errores, []);
    // y «Guardar en Mis patrones» lo guarda de verdad, ya en español, y abre el patrón (sin volver a pulsar «Guardar»)
    await page.getByRole("button", { name: "Guardar en Mis patrones" }).tap();
    await page.waitForFunction(() => view.name === "patron" && state.patrones.length > 0);
    const r = await page.evaluate(() => ({ p: state.patrones[0], distintas: state.patrones[0].pasos.map(revisarLinea).filter(x => x.estado === "distinto").length, guardado: JSON.parse(localStorage.getItem("rincon-ganchillo-v1")).patrones.length }));
    assert.equal(r.p.pasos.filter(p => /^Vueltas? \d/.test(p)).length, 6, JSON.stringify(r.p.pasos));
    assert.equal(r.distintas, 0);
    assert.equal(r.p.descripcion, "Traducido del ruso."); assert.ok(r.p.titulo, "con título"); assert.equal(r.guardado, 1, "guardado en el móvil");
    await page.reload(); assert.equal(await page.evaluate(() => state.patrones.length), 1, "sigue ahí al volver a abrir la app");
    await page.context().close();
  });
  await prueba("traducir un PDF inglés del Reino Unido: «dc» es punto bajo y se puede cambiar a EE. UU.", async () => {
    const page = await paginaWeb();
    await page.evaluate(() => go({ name: "traducir" }));
    await subir(page, "#tr-pdf", "coaster.pdf", "application/pdf", pdfIngles);
    await esperarTraduccion(page);
    const vueltas = () => page.evaluate(() => traduccion.bloques.filter(b => b.tipo === "vuelta").map(b => b.t));
    assert.equal(await page.evaluate(() => traduccion.uk), true);
    const uk = await vueltas();
    assert.match(uk[0], /^Vuelta 1: 6 pb en el anillo mágico, cierra con pd \(6\)$/, uk[0]);
    assert.match(uk[2], /^Vuelta 3: 3 cad \(cuenta como (el )?primer pa\), 2 pa en cada punto \(24\)$/, uk[2]);
    await page.getByRole("button", { name: "EE. UU." }).tap();
    await page.waitForFunction(() => traduccion.uk === false && /pa/.test(traduccion.bloques.find(b => b.tipo === "vuelta").t));
    assert.match((await vueltas())[0], /^Vuelta 1: 6 pa /, "con términos de EE. UU. «dc» es punto alto");
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });
  await prueba("traducir un PDF ruso escaneado: lo lee como una foto y lo traduce", async () => {
    const page = await paginaWeb();
    await page.evaluate(() => go({ name: "traducir" }));
    await subir(page, "#tr-pdf", "zaika-escaneado.pdf", "application/pdf", pdfRusoEscaneado);
    await esperarTraduccion(page);
    const tr = await page.evaluate(() => ({ idioma: traduccion.idioma, originales: traduccion.originales.length, bloques: traduccion.bloques.map(b => ({ tipo: b.tipo, t: b.t })) }));
    assert.equal(tr.idioma, "ru");
    assert.deepEqual(tr.bloques.filter(b => b.tipo === "vuelta").map(b => b.t), ["Vuelta 1: 6 pb en el anillo mágico (6)", "Vuelta 2: 6 aum (12)", "Vuelta 3: (1 pb, aum) x 6 (18)", "Vueltas 4 a 8: 18 pb", "Vuelta 9: (1 pb, dism) x 6 (12)", "Vuelta 10: 6 dism (6)"]);
    assert.ok(tr.bloques.some(b => /ojos/.test(b.t) && /6 y 7/.test(b.t)), "traduce las notas");
    assert.equal(tr.originales, 1, "la hoja escaneada va al final del PDF");
    assert.deepEqual(page.errores.filter(e => !/Estimating resolution|diacritics|Empty page/.test(e)), []);
    await page.context().close();
  });
  await prueba("traducir: sin conexión para el traductor, las vueltas salen igual y lo demás se marca para revisar", async () => {
    const page = await paginaWeb();
    await page.route(/\/traductor\//, r => r.abort());
    await page.evaluate(() => go({ name: "traducir" }));
    await subir(page, "#tr-pdf", "zaika.pdf", "application/pdf", pdfRuso);
    await esperarTraduccion(page);
    const tr = await page.evaluate(() => ({ sinMotor: traduccion.sinMotor, bloques: traduccion.bloques.map(b => ({ tipo: b.tipo, t: b.t, revisar: !!b.revisar })) }));
    assert.ok(tr.sinMotor, "avisa de que no hay traductor");
    assert.equal(tr.bloques.filter(b => b.tipo === "vuelta")[0].t, "Vuelta 1: 6 pb en el anillo mágico (6)");
    assert.ok(tr.bloques.some(b => b.revisar), "lo que no se ha podido traducir se marca");
    await page.getByText(/Sin internet no he podido preparar el traductor/).waitFor();
    await page.context().close();
  });
  await prueba("traducir un patrón que ya está en español: lo dice y deja guardarlo", async () => {
    const page = await paginaWeb();
    await page.evaluate(() => go({ name: "traducir" }));
    await subir(page, "#tr-pdf", "posavasos.pdf", "application/pdf", pdfTexto);
    await esperarTraduccion(page);
    await page.getByText("Este patrón ya está en español.").waitFor();
    await page.getByRole("button", { name: "Guardar en Mis patrones" }).tap();
    await page.waitForFunction(() => view.name === "patron" && state.patrones.length === 1 && state.patrones[0].pasos.some(p => /Vuelta 1: 6 pb/.test(p)));
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });
  // Portugués (de Brasil), turco y chino: los mismos puntos escritos como los escribe cada país
  const PT = ["Coelhinho", "Materiais", "- Agulha de crochê 2,5 mm", "Cabeça", "C1: 6 pb no anel mágico (6)", "C2: 6 aum (12)", "C3: (1 pb, 1 aum) x 6 (18)", "C4 a C8: 18 pb (18)",
    "Coloque os olhos de segurança entre a carreira 5 e a 6, com 6 pontos de distância.", "C9: (1 pb, 1 dim) x 6 (12)", "C10: 6 dim (6)", "Encha a cabeça com fibra siliconada. Arremate e feche o buraco."];
  const TR = ["Ayıcık", "Malzemeler", "- 2,5 mm tığ", "Kafa", "1. tur: SH içine 6 sı (6)", "2. tur: 6 art (12)", "3. tur: (1 sı, 1 art) x 6 (18)", "4-8. tur: her ilmeğe 1 sı (18)",
    "Güvenlik gözlerini 5. ve 6. turlar arasına takın.", "9. tur: (1 sı, 1 az) x 6 (12)", "10. tur: 6 az (6)", "Kafayı elyaf ile sıkıca doldurun. İpi kesin ve kalan ilmekleri toplayarak kapatın."];
  const ZH = ["小熊", "材料", "- 2.5毫米钩针", "头部", "R1：环起6X（6）", "R2：6V（12）", "R3：（1X，1V）*6（18）", "R4-R8：18X（18）",
    "在第5圈和第6圈之间安装安全眼睛，两眼之间相隔6针。", "R9：（1X，1A）*6（12）", "R10：6A（6）", "开始塞棉，要塞得结实一些。断线，留一段线收口。"];
  const VUELTAS_3 = ["Vuelta 1: 6 pb en el anillo mágico (6)", "Vuelta 2: 6 aum (12)", "Vuelta 3: (1 pb, 1 aum) x 6 (18)", "Vueltas 4 a 8: 18 pb (18)", "Vuelta 9: (1 pb, 1 dism) x 6 (12)", "Vuelta 10: 6 dism (6)"];
  // (el turco dice «her ilmeğe 1 sı»: un punto bajo en cada punto)
  const vueltasDe = k => k === "tr" ? VUELTAS_3.map(v => v.replace("18 pb (18)", "1 pb en cada punto (18)")) : VUELTAS_3;
  await prueba("portugués, turco y chino: se reconocen, y las vueltas y los puntos salen bien con reglas (también al añadir el patrón)", async () => {
    const page = await paginaWeb();
    const r = await page.evaluate(async ([PT, TR, ZH]) => {
      const out = {};
      for (const [k, ls] of [["pt", PT], ["tr", TR], ["zh", ZH]]) {
        const texto = ls.join("\n"), idioma = idiomaDe(texto);
        const bs = await traducirBloques(bloquesDeTexto(ls, idioma), { idioma, traductor: null });
        const imp = importarTexto(texto, null, true);
        out[k] = { idioma, vueltas: bs.filter(b => b.tipo === "vuelta").map(b => b.t), revisarVueltas: bs.filter(b => b.tipo === "vuelta" && b.revisar).length,
          partes: bs.filter(b => b.tipo === "parte").map(b => b.t), leyenda: bs.filter(b => b.tipo === "leyenda").map(b => b.t),
          imp: imp.pasos.filter(p => /^Vueltas? \d/.test(p)), cuadran: imp.revision.filter(x => x.estado === "cuadra").length, otro: imp.otroIdioma, gan: imp.ganchillo };
      }
      return out;
    }, [PT, TR, ZH]);
    for (const k of ["pt", "tr", "zh"]) {
      assert.equal(r[k].idioma, k);
      assert.deepEqual(r[k].vueltas, vueltasDe(k), k);
      assert.equal(r[k].revisarVueltas, 0, k + ": las vueltas no hay que revisarlas");
      assert.ok(r[k].partes.includes("Cabeza"), k + " " + JSON.stringify(r[k].partes));
      assert.ok(r[k].leyenda.some(l => /^pb – punto bajo/.test(l)), k + ": pone la leyenda");
      assert.deepEqual(r[k].imp.map(p => p.replace(/^Vuelta (\d+): \*(.+)\* repetir (\d+) veces/, "Vuelta $1: ($2) x $3")), vueltasDe(k), k + " al añadirlo a Mis patrones");
      assert.equal(r[k].cuadran, 6, k + ": todas las vueltas cuadran");
      assert.equal(r[k].otro, k); assert.equal(r[k].gan, "2,5 mm", k);
    }
    // No confunde un patrón en español o en inglés con portugués
    assert.deepEqual(await page.evaluate(() => [idiomaDe("Vuelta 1: 6 pb en el anillo mágico (6)\nVuelta 2: 6 aum (12)\nRemata y esconde las hebras con la aguja lanera de la labor. Cose la cabeza al cuerpo con la hebra larga"), idiomaDe("Round 1: 6 sc in the magic ring (6)\nRound 2: inc in each st around (12)\nFasten off and weave in the ends with your hook")]), ["es", "en"]);
    // Turco con las letras chinas (X, V, A) y lo que confunde el lector de fotos («1s1» es «1 sı»)
    const tr2 = await page.evaluate(async () => (await traducirBloques(bloquesDeTexto(["1. tur: SH içine 6 X (6)", "2. tur: 6 V (12)", "3. tur: (1 X, 1 V) x 6 (18)", "4. tur: (1s1, Laz) x 6 (12)"], "tr"), { idioma: "tr", traductor: null })).filter(b => b.tipo === "vuelta").map(b => b.t));
    assert.deepEqual(tr2, ["Vuelta 1: 6 pb en el anillo mágico (6)", "Vuelta 2: 6 aum (12)", "Vuelta 3: (1 pb, 1 aum) x 6 (18)", "Vuelta 4: (1 pb, 1 dism) x 6 (12)"]);
    // Portugués como se escribe de verdad: número pegado al punto («6pb»), «Carr 1 - …» (no es un tramo del 1 al 6),
    // «(6 pts)», «[30]», «1ª volta», «V6-V11»
    const pt2 = await page.evaluate(async () => { const ls = ["Carr 1 - 6pb no anel mágico (6 pts)", "Carr 2 - aum em todos (12 pts)", "Carr 5 a 9 - 24pb (24 pts)", "4ª volta: *2pb, 1aum* repetir 6x (24)", "V6-V11: pb em todas as malhas [30]", "Coloque os olhos entre a 10ª e 11ª volta.", "V12: (3 pb, dim) repetir 6 vezes [24]", "16ª volta: *3pb, 1dim* 6x (24)", "Arremate e esconda o fio."];
      const bs = await traducirBloques(bloquesDeTexto(ls, "pt"), { idioma: "pt", traductor: null });
      return { t: bs.filter(b => b.tipo !== "leyenda" && b.tipo !== "parte").map(b => b.t), imp: importarTexto(ls.join("\n"), null, false).pasos }; });
    assert.deepEqual(pt2.t.slice(0, 5), ["Vuelta 1: 6 pb en el anillo mágico (6)", "Vuelta 2: aum en cada punto (12)", "Vueltas 5 a 9: 24 pb (24)", "Vuelta 4: *2 pb, 1 aum* repite 6x (24)", "Vueltas 6 a 11: pb en cada punto (30)"]);
    assert.match(pt2.t[5], /entre las vueltas 10 y 11/);
    assert.deepEqual(pt2.t.slice(6), ["Vuelta 12: (3 pb, 1 dism) repite 6 veces (24)", "Vuelta 16: *3 pb, 1 dism* 6x (24)", "Remata y esconde las hebras."]);
    assert.ok(pt2.imp.includes("Vuelta 12: *3 pb, 1 dism* repetir 6 veces (24)") && pt2.imp.includes("Vuelta 1: 6 pb en el anillo mágico (6)"), JSON.stringify(pt2.imp));
    // En «Añadir un patrón» avisa del idioma
    await page.evaluate(() => go({ name: "importar" }));
    await page.locator("#im-texto").fill(PT.join("\n"));
    await page.getByRole("button", { name: "Leer el patrón" }).tap();
    assert.match(await page.locator(".note:not(.leyendo)").first().textContent(), /Está en portugués y lo he pasado a español/);
    assert.equal(await page.locator("ol.importados li").count(), 7, "la parte y sus 6 vueltas");
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });
  const fxI = await browser.newPage();
  const hojaDe = ls => `<style>body{font:13px Arial;margin:36px} h1{font-size:26px} h3{margin:14px 0 4px} p{margin:0 0 4px}</style><h1>${ls[0]}</h1>` + ls.slice(1).map(l => /^(Materiais|Malzemeler|材料|Cabeça|Kafa|头部)$/.test(l) ? `<h3>${l}</h3>` : `<p>${l}</p>`).join("");
  const pdfsIdiomas = {};
  for (const [k, ls] of [["pt", PT], ["tr", TR], ["zh", ZH]]) { await fxI.setContent(hojaDe(ls)); pdfsIdiomas[k] = await fxI.pdf({ format: "A4" }); }
  await fxI.setViewportSize({ width: 800, height: 1130 }); await fxI.setContent(hojaDe(ZH).replace("13px Arial", "17px Arial"));
  const hojaChina = (await fxI.screenshot()).toString("base64");
  await fxI.setContent(`<style>body{margin:0}</style><img src="data:image/png;base64,${hojaChina}" style="width:100%">`);
  const pdfChinoEscaneado = await fxI.pdf({ format: "A4", margin: { top: 0, bottom: 0, left: 0, right: 0 } });
  await fxI.close();
  await prueba("traducir PDF en portugués, turco y chino con el traductor de Mozilla, y descargar el PDF en español", async () => {
    const page = await paginaWeb({ acceptDownloads: true });
    for (const [k, nombre, archivo] of [["pt", "portugués", "coelhinho.pdf"], ["tr", "turco", "ayicik.pdf"], ["zh", "chino", "xiaoxiong.pdf"]]) {
      await page.evaluate(() => go({ name: "traducir" }));
      await subir(page, "#tr-pdf", archivo, "application/pdf", pdfsIdiomas[k]);
      await esperarTraduccion(page);
      const tr = await page.evaluate(() => ({ idioma: traduccion.idioma, sinMotor: traduccion.sinMotor, bloques: traduccion.bloques.map(b => ({ tipo: b.tipo, t: b.t, revisar: !!b.revisar })) }));
      assert.equal(tr.idioma, k); assert.equal(tr.sinMotor, undefined, k + ": el traductor funciona");
      assert.deepEqual(tr.bloques.filter(b => b.tipo === "vuelta").map(b => b.t), vueltasDe(k), k);
      const textos = tr.bloques.filter(b => b.tipo === "texto").map(b => b.t);
      assert.ok(textos.some(t => /ojos de seguridad/i.test(t) && /5 y 6/.test(t)), k + ": " + textos.join(" | "));
      assert.ok(textos.some(t => /rellen/i.test(t)), k + ": " + textos.join(" | "));
      assert.ok(tr.bloques.every(b => !/[㐀-鿿]/.test(b.t)), "no queda nada en chino");
      await page.getByText("✓ Traducido del " + nombre + " al español").waitFor();
      const espera = page.waitForEvent("download");
      await page.getByRole("button", { name: /Descargar el PDF/ }).tap();
      const d = await espera, destino = path.join(CAPTURAS, "traducido-" + k + ".pdf");
      await d.saveAs(destino);
      const leido = await page.evaluate(async a => { const doc = await abrirPDF(new Uint8Array(a)); const t = await textoDePDF(doc); doc.destroy(); return t; }, [...fs.readFileSync(destino)]);
      assert.match(leido, new RegExp("Traducido del " + nombre + " al español"));
      assert.match(leido, /Vuelta 3:\s*\(1 pb, 1 aum\) x 6 \(18\)/);
    }
    // Una frase que queda en chino (para revisar) va en el PDF como imagen, no como letras perdidas
    const pdfConChino = await page.evaluate(async () => {
      const b = await hacerPDFTraducido({ idioma: "zh", archivo: "x.pdf", tituloArchivo: "小熊", originales: [], bloques: [{ tipo: "titulo", t: "小熊" }, { tipo: "texto", t: "Cose las orejas.", original: "把耳朵缝在头顶。", revisar: true }] }, false);
      const doc = await abrirPDF(new Uint8Array(await b.arrayBuffer())); const p1 = await doc.getPage(1); const n = (await cajasDeImagenes(p1)).cajas.length; const t = await textoDePDF(doc); doc.destroy(); return { n, t };
    });
    assert.ok(pdfConChino.n >= 1, "el original chino va como imagen");
    assert.match(pdfConChino.t, /Patrón traducido|Cose las orejas/);
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });
  await prueba("traducir un PDF chino escaneado: el lector de fotos se da cuenta de que es chino y lo lee con letras chinas", async () => {
    const page = await paginaWeb();
    await page.evaluate(() => go({ name: "traducir" }));
    await subir(page, "#tr-pdf", "xiaoxiong-escaneado.pdf", "application/pdf", pdfChinoEscaneado);
    await esperarTraduccion(page);
    const tr = await page.evaluate(() => ({ idioma: traduccion.idioma, bloques: traduccion.bloques.map(b => ({ tipo: b.tipo, t: b.t })) }));
    assert.equal(tr.idioma, "zh");
    assert.deepEqual(tr.bloques.filter(b => b.tipo === "vuelta").map(b => b.t), VUELTAS_3, JSON.stringify(tr.bloques.map(b => b.t)));
    assert.deepEqual(page.errores.filter(e => !/Estimating resolution|diacritics|Empty page|Parameter not found/.test(e)), []);
    await page.context().close();
  });
  await prueba("se llega a «Traducir un patrón» desde Inicio, Más y Añadir un patrón", async () => {
    const page = await nuevaPagina(browser);
    for (const [desde, boton] of [["inicio", /Traducir un patrón de otro idioma/], ["mas", /Traducir un patrón/], ["importar", /Traducir un patrón/]]) {
      await page.evaluate(n => go({ name: n }), desde);
      await page.getByRole("button", { name: boton }).first().tap();
      assert.equal(await page.evaluate(() => view.name), "traducir", "desde " + desde);
    }
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });

  console.log("Biblioteca de PDF");
  await prueba("biblioteca: mete muchos PDF de una vez, sin repetidos, y se buscan en cualquier idioma", async () => {
    const DATOS_ANTES = { patrones: [{ id: "m-1", titulo: "Mi bufanda", pasos: ["Vuelta 1: 20 pb"] }], progreso: {}, graficos: [], lanas: [], v: 3, t: 1 };
    const page = await paginaWeb({}, DATOS_ANTES);
    await page.evaluate(() => go({ name: "mas" }));
    await page.getByRole("button", { name: /Biblioteca de PDF/ }).tap();
    await page.getByText("Aún no hay ningún PDF").waitFor();
    // Varios PDF elegidos en el móvil: uno repetido con otro nombre, uno escaneado y uno que no es un PDF de verdad
    const archivos = [
      { name: "Posavasos.pdf", mimeType: "application/pdf", buffer: pdfTexto },
      { name: "copia de posavasos.pdf", mimeType: "application/pdf", buffer: pdfTexto },
      { name: "Zayka Mia.pdf", mimeType: "application/pdf", buffer: pdfRuso },
      { name: "Granny coaster UK.pdf", mimeType: "application/pdf", buffer: pdfIngles },
      { name: "Bola escaneada.pdf", mimeType: "application/pdf", buffer: pdfEscaneado },
      { name: "roto.pdf", mimeType: "application/pdf", buffer: Buffer.from("esto no es un pdf") }];
    await page.setInputFiles("#bib-pdfs", archivos);
    await page.waitForFunction(() => bib.trabajo && bib.trabajo.fin, null, { timeout: 120000 });
    const t = await page.evaluate(() => ({ ...bib.trabajo, fichas: bib.fichas.map(f => ({ t: f.titulo, i: f.idioma, temas: f.temas, esc: f.escaneado, err: f.error || "" })) }));
    assert.equal(t.total, 6); assert.equal(t.nuevos, 5); assert.equal(t.repetidos, 1, "el posavasos repetido no se mete dos veces"); assert.equal(t.fallos, 1);
    const de = n => t.fichas.find(f => f.t === n) || assert.fail(n + " " + JSON.stringify(t.fichas));
    assert.equal(de("Zayka Mia").i, "ru"); assert.ok(de("Zayka Mia").temas.includes("conejo"), JSON.stringify(de("Zayka Mia")));
    assert.equal(de("Granny coaster UK").i, "en"); assert.ok(de("Granny coaster UK").temas.includes("granny"));
    assert.equal(de("Posavasos de colores").i, "es", "un nombre de archivo de una palabra: el título sale de la hoja"); assert.equal(de("Bola escaneada").esc, true); assert.equal(de("roto").err, "dañado");
    await page.getByText("5 patrones en la biblioteca").waitFor();
    // Buscar «conejo» encuentra el ruso («зайка»), y el filtro de idioma
    await page.locator("#bib-buscar").fill("conejo");
    await page.getByText("1 de 5 patrones").waitFor();
    assert.equal(await page.locator(".plist .pitem h3").first().textContent(), "Zayka Mia");
    await page.locator("#bib-buscar").fill("");
    await page.getByRole("button", { name: "Inglés", exact: true }).tap();
    await page.getByText("1 de 5 patrones").waitFor();
    await page.getByRole("button", { name: "Inglés", exact: true }).tap();
    await page.screenshot({ path: path.join(CAPTURAS, "biblioteca.png"), fullPage: true });
    // Abrir uno y pasarlo a Mis patrones (el PDF está guardado en el móvil, no hace falta elegirlo otra vez)
    await page.locator(".plist .pitem", { hasText: "Posavasos" }).tap();
    await page.getByRole("button", { name: "Añadir a Mis patrones" }).tap();
    await page.waitForFunction(() => view.name === "patron" && state.patrones.length === 2, null, { timeout: 60000 });
    const p = await page.evaluate(() => state.patrones[0]);
    assert.equal(p.titulo, "Posavasos de colores"); assert.ok(p.pasos.some(x => /^Vuelta 4: \*2 pb, 1 aum\*/.test(x)), JSON.stringify(p.pasos));
    assert.equal(await page.evaluate(() => state.patrones[1].titulo), "Mi bufanda", "lo de antes sigue ahí");
    // Uno en ruso: «Traducir al español» abre el traductor con ese PDF
    await page.evaluate(() => go({ name: "biblioteca" }));
    await page.locator(".plist .pitem", { hasText: "Zayka Mia" }).tap();
    await page.getByRole("button", { name: "Traducir al español" }).tap();
    await page.waitForFunction(() => view.name === "traducir" && traduccion && traduccion.archivo === "Zayka Mia.pdf", null, { timeout: 120000 });
    // Las fichas siguen al volver a abrir la app; volver a elegir los mismos no los repite
    await page.reload();
    await page.evaluate(() => go({ name: "biblioteca" }));
    await page.getByText("5 patrones en la biblioteca").waitFor();
    await page.setInputFiles("#bib-pdfs", archivos.slice(0, 3));
    await page.waitForFunction(() => bib.trabajo && bib.trabajo.fin, null, { timeout: 60000 });
    assert.equal(await page.evaluate(() => bib.trabajo.yaEstaban + bib.trabajo.repetidos), 3);
    assert.equal(await page.evaluate(() => bib.fichas.length), 5);
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });

  console.log("Vídeo de YouTube a patrón");
  const TRANS_ES = "0:00\nhola a todas bienvenidas a mi canal hoy\n0:03\nvamos a tejer un conejito amigurumi muy\n0:06\nfácil necesitamos lana de algodón y un\n0:09\nganchillo de tres coma cinco milímetros\n0:14\nvamos a empezar por la cabeza hacemos un\n0:17\nanillo mágico y dentro metemos seis\n0:20\npuntos bajos cerramos el anillo vale\n0:25\nahora la segunda vuelta hacemos un\n0:28\naumento en cada punto nos tienen que\n0:31\nquedar doce puntos\n0:40\nvuelta número tres un punto bajo y un\n0:44\naumento un punto bajo un aumento y así\n0:47\nlo repetimos seis veces tenemos\n0:50\ndieciocho puntos\n1:02\nen la cuarta vuelta dos puntos bajos y un\n1:05\naumento hasta el final nos quedan\n1:08\nveinticuatro puntos\n1:20\nde la vuelta cinco a la vuelta diez\n1:23\nhacemos todo punto bajo sin aumentos\n1:30\ncomo en la vuelta 2 no hay que aumentar\n1:40\nvuelta once dos puntos bajos una\n1:43\ndisminución seis veces dieciocho puntos\n1:50\nahora rellenamos la cabeza y ponemos los ojos de seguridad\n2:00\nvuelta doce un punto bajo una disminución\n2:03\nrepetimos seis veces nos quedan doce\n2:10\ncortamos el hilo y cosemos\n2:30\nahora vamos a hacer las orejas\n2:33\nanillo mágico con seis puntos bajos\n2:40\nvuelta dos seis aumentos doce puntos\n2:50\nvuelta tres de la tres a la ocho\n2:55\npunto bajo en todos los puntos\n";
  const TRANS_EN = "0:01 hi everyone welcome back today we're making a little octopus\n0:05 you'll need a 3.5 mm hook\n0:10 start with a magic ring and put six single crochets into the ring\n0:15 round two we're going to do an increase in every stitch so you should have twelve\n0:25 round three single crochet increase single crochet increase repeat six times for a total of eighteen\n0:40 round four two single crochet and one increase all the way around you should have 24\n0:55 rounds five to twelve single crochet in each stitch\n1:10 round thirteen one single crochet one decrease repeat six times we have 12 stitches\n1:20 now stuff the head and fasten off\n";
  await prueba("lo que dice un vídeo en español se pasa a vueltas, con partes y minutos", async () => {
    const page = await nuevaPagina(browser);
    const r = await page.evaluate(t => transcripcionAPatron(t), TRANS_ES);
    assert.equal(r.idioma, "es"); assert.equal(r.ganchillo, "3,5 mm");
    const pasos = r.pasos.map(p => p.texto);
    assert.deepEqual(pasos.slice(0, 7), ["Parte: Cabeza", "Vuelta 1: 6 pb en el anillo mágico", "Vuelta 2: 1 aum en cada punto (12)",
      "Vuelta 3: *1 pb, 1 aum* repetir 6 veces (18)", "Vuelta 4: *2 pb, 1 aum* alrededor (24)", "Vueltas 5 a 10: 1 pb en cada punto", "Vuelta 11: *2 pb, 1 dism* repetir 6 veces (18)"]);
    assert.ok(pasos.includes("Rellena la pieza.") && pasos.includes("Parte: Orejas") && pasos.includes("Vueltas 3 a 8: 1 pb en cada punto"));
    // «como en la vuelta 2» no empieza otra vuelta
    assert.equal(pasos.filter(p => /^Vuelta 2:/.test(p)).length, 2);
    assert.equal(r.pasos[3].t, 40);
    // El motor de la app entiende lo que sale: las vueltas con total cuadran
    const rev = await page.evaluate(ps => ps.map(revisarLinea).map(x => x.estado), pasos);
    assert.equal(rev[3], "cuadra"); assert.equal(rev[4], "cuadra"); assert.equal(rev[6], "cuadra");
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });
  await prueba("un vídeo en inglés sale en español; una fila plana y números con letras", async () => {
    const page = await nuevaPagina(browser);
    const r = await page.evaluate(t => transcripcionAPatron(t), TRANS_EN);
    assert.equal(r.idioma, "en"); assert.equal(r.ganchillo, "3,5 mm");
    assert.deepEqual(r.pasos.map(p => p.texto).slice(0, 6), ["Vuelta 1: 6 pb en el anillo mágico", "Vuelta 2: 1 aum en cada punto (12)", "Vuelta 3: *1 pb, 1 aum* repetir 6 veces (18)",
      "Vuelta 4: *2 pb, 1 aum* alrededor (24)", "Vueltas 5 a 12: 1 pb en cada punto", "Vuelta 13: *1 pb, 1 dism* repetir 6 veces (12)"]);
    const f = await page.evaluate(() => transcripcionAPatron("[0:08] Montamos veinte cadenetas.\n[0:15] Fila uno: un punto bajo en la segunda cadeneta desde el ganchillo y un punto bajo en cada cadeneta. Tenemos diecinueve puntos.\n[0:30] Fila dos: una cadeneta, damos la vuelta y punto bajo en todos los puntos.\n[0:45] Repetimos la fila dos hasta la fila cuarenta."));
    assert.deepEqual(f.pasos.map(p => p.texto), ["Monta 20 cad.", "Fila 1: 1 pb, 1 pb en cada punto (19)", "Filas 2 a 40: 1 cad, 1 pb en cada punto"]);
    assert.equal(await page.evaluate(() => revisarLinea("Fila 1: 1 pb, 1 pb en cada punto (19)").estado), "cuadra");
    assert.deepEqual(await page.evaluate(() => [idVideo("https://youtu.be/dQw4w9WgXcQ?si=x"), idVideo("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s"), idVideo("https://m.youtube.com/shorts/dQw4w9WgXcQ"), idVideo("hola")]), ["dQw4w9WgXcQ", "dQw4w9WgXcQ", "dQw4w9WgXcQ", ""]);
    await page.context().close();
  });
  await prueba("pegar la transcripción de un vídeo, guardarlo y ver cada paso en su minuto", async () => {
    const page = await nuevaPagina(browser);
    await page.route(/youtube(-nocookie)?\.com/, r => r.abort());
    await page.evaluate(() => go({ name: "importar" }));
    await page.click("#ir-video");
    await page.fill("#vi-enlace", "https://youtu.be/dQw4w9WgXcQ");
    await page.fill("#vi-texto", TRANS_ES);
    await page.getByRole("button", { name: "Pasarlo a papel" }).click();
    await page.getByText("cuadran").first().waitFor();
    assert.equal(await page.locator(".video-marco iframe").count(), 1);
    // Tocar el minuto de un paso pone el vídeo en ese momento
    await page.getByRole("button", { name: "Ver en el 0:40" }).click();
    assert.match(await page.locator(".video-marco iframe").getAttribute("src"), /start=40&autoplay=1/);
    await page.screenshot({ path: path.join(CAPTURAS, "video-a-papel.png"), fullPage: true });
    // Cambiar un paso antes de guardar y quitar otro dejándolo vacío
    const campos = page.locator("textarea.video-paso");
    const n = await campos.count();
    await campos.nth(4).fill("Vuelta 4: *2 pb, 1 aum* repetir 6 veces (24)");
    await campos.nth(n - 1).fill("");
    await page.fill("#vi-nombre", "Conejito del vídeo");
    await page.getByRole("button", { name: "Guardar patrón", exact: true }).click();
    const st = await estado(page);
    const p = st.patrones[0];
    assert.equal(p.titulo, "Conejito del vídeo"); assert.equal(p.ganchillo, "3,5 mm");
    assert.equal(p.pasos.length, n - 1);
    assert.equal(p.video.id, "dQw4w9WgXcQ");
    assert.equal(p.video.t["Vuelta 4: *2 pb, 1 aum* repetir 6 veces (24)"], 62);
    assert.match(p.notas, /youtube\.com\/watch\?v=dQw4w9WgXcQ/);
    assert.equal(await page.locator("a", { hasText: "Ver el vídeo" }).getAttribute("href"), "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    // Mientras teje: el paso tiene su enlace al minuto del vídeo
    await page.evaluate(id => { state.progreso[id] = { paso: 3, vueltas: 0, puntos: 0 }; save(); go({ name: "tejer", id }); }, p.id);
    assert.equal(await page.locator("a", { hasText: "Ver este paso en el vídeo (0:40)" }).getAttribute("href"), "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=40s");
    await page.evaluate(id => go({ name: "sofa", id }), p.id);
    await page.locator(".sofa-video", { hasText: "0:40" }).waitFor();
    // En papel también sale el minuto
    const hoja = await page.evaluate(id => hojaDeImpresion(buscar(id)).textContent, p.id);
    assert.match(hoja, /En el vídeo: minuto 0:40/);
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });
  await prueba("vídeos en ruso, portugués y turco también salen en español", async () => {
    const page = await nuevaPagina(browser);
    const [ru, pt, tr] = await page.evaluate(ts => ts.map(t => transcripcionAPatron(t)), ["0:00\nвсем привет сегодня вяжем зайчика крючок номер 2,5\n0:10\nначинаем с головы делаем кольцо амигуруми и вяжем в него шесть столбиков без накида\n0:20\nвторой ряд в каждую петлю делаем прибавку должно получиться двенадцать петель\n0:35\nтретий ряд один столбик без накида прибавка и так повторяем шесть раз у нас получится восемнадцать петель\n0:50\nв четвертом ряду два сбн и прибавка по кругу итого 24 петли\n1:05\nс пятого по десятый ряд вяжем без прибавок\n1:20\nодиннадцатый ряд два столбика без накида убавка повторяем 6 раз 18 петель\n1:30\nнабиваем голову и вставляем глазки\n1:40\nтеперь вяжем ушки кольцо амигуруми шесть столбиков без накида\n1:50\n2 ряд 6 прибавок 12 петель\n", "0:00 olá meninas hoje vamos fazer um coelhinho com agulha de dois e meio milímetros\n0:08 vamos começar pela cabeça fazemos um anel mágico com seis pontos baixos\n0:18 segunda carreira um aumento em cada ponto ficamos com doze pontos\n0:30 terceira carreira um ponto baixo um aumento repetimos seis vezes no total de dezoito pontos\n0:45 da quinta à décima carreira sem aumentos\n0:55 carreira onze dois pontos baixos e uma diminuição seis vezes\n1:05 enchemos a cabeça com fibra e colocamos os olhos\n", "0:00 merhaba arkadaşlar bugün tavşan örüyoruz 2,5 numara tığ kullanıyoruz\n0:10 kafadan başlıyoruz sihirli halka içine altı sık iğne\n0:20 ikinci tur her ilmeğe bir arttırma toplam on iki ilmek\n0:30 üçüncü tur bir sık bir arttırma altı kez tekrar toplam on sekiz\n0:45 dördüncü tur iki sık bir arttırma tur boyunca 24 ilmek olacak\n1:00 beşinci turdan onuncu tura kadar arttırma yapmadan düz örüyoruz\n1:15 on birinci tur iki sık bir azaltma 6 kez\n1:25 elyaf ile dolduruyoruz\n"]);
    assert.equal(ru.idioma, "ru"); assert.equal(pt.idioma, "pt"); assert.equal(tr.idioma, "tr");
    const comunes = ["Vuelta 1: 6 pb en el anillo mágico", "Vuelta 2: 1 aum en cada punto (12)", "Vuelta 3: *1 pb, 1 aum* repetir 6 veces (18)"];
    for (const r of [ru, pt, tr]) { assert.equal(r.ganchillo, "2,5 mm"); for (const c of comunes) assert.ok(r.pasos.some(p => p.texto === c), r.idioma + ": falta " + c); assert.ok(r.pasos.some(p => p.texto === "Vueltas 5 a 10: 1 pb en cada punto"), r.idioma); assert.ok(r.pasos.some(p => /^Vuelta 11: \*2 pb, 1 dism\* repetir 6 veces/.test(p.texto)), r.idioma); assert.ok(r.pasos.some(p => p.texto === "Rellena la pieza."), r.idioma); }
    // Ruso: «в четвертом ряду», partes (голова, ушки) y «2 ряд 6 прибавок»
    assert.deepEqual(ru.pasos.filter(p => /^Parte/.test(p.texto)).map(p => p.texto), ["Parte: Cabeza", "Parte: Orejas"]);
    assert.ok(ru.pasos.some(p => p.texto === "Vuelta 4: *2 pb, 1 aum* alrededor (24)"));
    assert.equal(ru.pasos[ru.pasos.length - 1].texto, "Vuelta 2: 6 aum (12)");
    assert.ok(tr.pasos.some(p => p.texto === "Vuelta 4: *2 pb, 1 aum* alrededor (24)"));
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });
  await prueba("en el móvil: capturas de pantalla de la transcripción se leen y se juntan sin repetir", async () => {
    const page = await nuevaPagina(browser);
    // Lo que sale de leer dos capturas: la hora del móvil arriba, el título y líneas repetidas entre una y otra
    const junto = await page.evaluate(() => juntarCapturas(["21:05 85%\nTranscripción\n0:00\nhola\n0:10 vuelta uno seis puntos bajos\n0:20\nvuelta dos", "21:06\nTranscripción\n0:10 vuelta uno seis puntos bajos\n0:20\nvuelta dos\n0.30\ndoce puntos"]));
    assert.equal(junto, "0:00\nhola\n0:10\nvuelta uno seis puntos bajos\n0:20\nvuelta dos\n0:30\ndoce puntos");
    await page.route(/cdn\.jsdelivr\.net\/npm\/tesseract\.js@5\.1\.1\/dist\/tesseract\.min\.js$/, (r) => r.fulfill({ path: path.join(VENDOR, "tesseract.min.js"), contentType: "text/javascript" }));
    // Capturas como las de la app de YouTube (la barra de arriba, el vídeo, «Transcripción» y las líneas)
    const lineas = TRANS_ES.trim().split("\n"), filas = [];
    for (let i = 0; i < lineas.length; i += 2) filas.push([lineas[i], lineas[i + 1]]);
    // (las capturas de un móvil de verdad tienen mucha resolución)
    const ctxMk = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
    const mk = await ctxMk.newPage();
    const capturas = [];
    for (const [a, z] of [[0, 8], [6, 14], [12, 20]]) {
      await mk.setContent(`<body style="margin:0;font-family:Arial;background:#fff"><div style="height:28px;font-size:13px;padding:4px 14px;display:flex;justify-content:space-between"><b>21:05</b><span>85%</span></div><div style="height:200px;background:#111"></div><div style="padding:12px 16px;font-size:18px;font-weight:600">Transcripción</div>` +
        filas.slice(a, z).map(([t, x]) => `<div style="display:flex;gap:14px;padding:10px 16px"><span style="background:#eee;border-radius:6px;padding:2px 6px;font-size:13px">${t}</span><span style="font-size:15px">${x}</span></div>`).join("") + `</body>`);
      capturas.push(await mk.screenshot());
    }
    await ctxMk.close();
    await page.evaluate(() => go({ name: "video" }));
    await page.setInputFiles("#vi-capturas", capturas.map((buffer, i) => ({ name: "Screenshot_" + (i + 1) + ".png", mimeType: "image/png", buffer })));
    await page.locator("textarea.video-paso").first().waitFor({ timeout: 180000 }).catch(async e => { throw new Error(e.message.split("\n")[0] + " · " + (await page.locator("#vi-texto").inputValue()).slice(0, 300) + " · " + await page.locator(".leyendo").innerText().catch(() => "")); });
    const pasos = await page.$$eval("textarea.video-paso", xs => xs.map(x => x.value));
    assert.deepEqual(pasos.slice(0, 5), ["Vuelta 1: 6 pb en el anillo mágico", "Vuelta 2: 1 aum en cada punto (12)", "Vuelta 3: *1 pb, 1 aum* repetir 6 veces (18)", "Vuelta 4: *2 pb, 1 aum* alrededor (24)", "Vueltas 5 a 10: 1 pb en cada punto"]);
    assert.match(await page.inputValue("#vi-texto"), /^0:00\n/);
    await page.screenshot({ path: path.join(CAPTURAS, "video-capturas.png") });
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });
  await prueba("si lo pegado ya es un patrón escrito (de la descripción del vídeo), se lee tal cual", async () => {
    const page = await nuevaPagina(browser);
    await page.evaluate(() => go({ name: "video" }));
    await page.fill("#vi-texto", "Vuelta 1: 6 pb en el anillo (6)\nVuelta 2: 6 aum (12)\nVuelta 3: (1 pb, 1 aum) x 6 (18)");
    await page.getByRole("button", { name: "Pasarlo a papel" }).click();
    await page.getByText("ya es un patrón escrito").waitFor();
    assert.equal(await page.locator("textarea.video-paso").count(), 3);
    await page.fill("#vi-texto", "Hola amigas, hoy os traigo un vídeo muy bonito. No olvidéis suscribiros.");
    await page.getByRole("button", { name: "Pasarlo a papel" }).click();
    await page.getByText("No he encontrado las vueltas").waitFor();
    assert.deepEqual(page.errores, []);
    await page.context().close();
  });

  console.log("Resto de la app");
  await prueba("todas las pantallas se abren sin errores, con datos reales", async () => {
    const page = await nuevaPagina(browser, {}, LEGADO);
    const vistas = [["inicio"], ["patrones"], ["patron", "m-1"], ["patron", "b-gorro"], ["tejer", "m-1"], ["sofa", "m-1"], ["importar"], ["editar"], ["editar", "m-1"],
      ["graficos"], ["grafico", "g-1"], ["foto"], ["lanas"], ["lana", "l-1"], ["mas"], ["contador"], ["ayuda"], ["copia"], ["herramientas"], ["traducir"], ["video"]];
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
  servidor.close();
  console.log(`\n${pasados} bien, ${fallos} mal`);
  process.exit(fallos ? 1 : 0);
})();
