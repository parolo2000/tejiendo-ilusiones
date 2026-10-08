// Pruebas de las cuentas y la comunidad contra un Supabase local (el de verdad no se toca).
// Hace falta Docker y la CLI de Supabase:
//   cd <carpeta con supabase/config.toml y supabase/migrations/ de este repo> && npx supabase start
//   export SUPABASE_SERVICE_ROLE_KEY=$(npx supabase status -o env | grep ^SERVICE_ROLE_KEY | cut -d'"' -f2)
//   NODE_PATH=$(npm root -g) node tests/nube.test.cjs
// (la clave de servicio es la del Supabase local, solo para crear las cuentas de prueba como haría quien lleva la app)
// Si el Supabase local no responde, avisa y no hace nada. Las reglas de la base de datos se prueban aparte, sin
// Docker, con supabase/pruebas/probar.sh.
const assert = require("assert"), http = require("http"), fs = require("fs"), path = require("path");
const { chromium } = require("playwright");
const API = process.env.SUPABASE_URL || "http://127.0.0.1:54321", CORREO = process.env.MAILPIT_URL || "http://127.0.0.1:54324";
const CLAVE = process.env.SUPABASE_CLAVE || "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH"; // la clave pública de prueba de la CLI
const NUBE = { url: API, clave: CLAVE }, SERVICIO = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CLAVE_PRUEBA = "punto-bajo-2026";
// Las cuentas las crea quien lleva la app (en el panel de Supabase); aquí, con la API de administración local
async function crearCuenta(correo) {
  const r = await fetch(API + "/auth/v1/admin/users", { method: "POST", headers: { apikey: SERVICIO, Authorization: "Bearer " + SERVICIO, "content-type": "application/json" },
    body: JSON.stringify({ email: correo, password: CLAVE_PRUEBA, email_confirm: true }) });
  const d = await r.json(); if (!r.ok) throw new Error("no se pudo crear " + correo + ": " + JSON.stringify(d)); return d.id;
}
async function bloquearCuenta(id) {
  await fetch(API + "/auth/v1/admin/users/" + id, { method: "PUT", headers: { apikey: SERVICIO, Authorization: "Bearer " + SERVICIO, "content-type": "application/json" }, body: JSON.stringify({ ban_duration: "876000h" }) });
}
const espera = ms => new Promise(r => setTimeout(r, ms));
async function codigoDe(correo) {
  for (let i = 0; i < 40; i++) {
    const r = await (await fetch(CORREO + "/api/v1/search?query=" + encodeURIComponent("to:" + correo))).json();
    const m = r.messages && r.messages[0];
    if (m) {
      const t = await (await fetch(CORREO + "/api/v1/message/" + m.ID)).json();
      await fetch(CORREO + "/api/v1/messages", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ IDs: [m.ID] }) });
      return /code: (\d{6})/.exec(t.Text)[1];
    }
    await espera(250);
  }
  throw new Error("no ha llegado el correo a " + correo);
}
let bien = 0, mal = 0;
async function prueba(nombre, fn) {
  try { await fn(); bien++; console.log("  ✓ " + nombre); }
  catch (e) {
    mal++; console.log("  ✗ " + nombre + "\n    " + String(e.stack || e).split("\n").slice(0, 4).join("\n    "));
    for (const p of paginasAbiertas) { try { console.log("    [pantalla] " + (await p.textContent(".view")).slice(0, 300)); } catch (x) {} }
  }
}
const paginasAbiertas = [];
(async () => {
  try { await fetch(API + "/auth/v1/health", { headers: { apikey: CLAVE } }); }
  catch (e) { console.log("No hay un Supabase local en " + API + ": no pruebo la comunidad."); return; }
  if (!SERVICIO) { console.log("Falta SUPABASE_SERVICE_ROLE_KEY (la del Supabase local): no pruebo la comunidad."); return; }
  const RAIZ = path.resolve(__dirname, "..");
  const servidor = http.createServer((req, res) => {
    const f = path.join(RAIZ, decodeURIComponent(new globalThis.URL(req.url, "http://x").pathname));
    if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": f.endsWith(".html") ? "text/html; charset=utf-8" : "text/javascript" }); res.end(fs.readFileSync(f));
  }).listen(0, "127.0.0.1");
  await new Promise(r => servidor.once("listening", r));
  const URL = "http://127.0.0.1:" + servidor.address().port + "/tejiendo-ilusiones.html";
  const browser = await chromium.launch();
  const sufijo = Date.now().toString(36);
  const pagina = async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await ctx.addInitScript(n => { window.TI_NUBE = n; }, NUBE);
    const p = await ctx.newPage(); p.errores = [];
    p.on("pageerror", e => p.errores.push(e.message));
    p.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) p.errores.push(m.text()); });
    await p.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await p.goto(URL); paginasAbiertas.push(p); return p;
  };
  // Al entrar, la app puede recargarse para poner la libreta de la cuenta: se espera a que esté lista de verdad
  const dentro = async p => {
    for (let i = 0; i < 60; i++) {
      try { if (await p.evaluate(() => typeof sesion !== "undefined" && !!sesion && nubeLista && !document.querySelector("#en-clave, #en-nueva"))) { await p.waitForTimeout(400); return; } } catch (e) {}
      await p.waitForTimeout(300);
    }
  };
  const entrar = async (p, correo, clave = CLAVE_PRUEBA) => {
    await p.evaluate(() => go({ name: "inicio" }));
    await p.fill("#en-correo", correo); await p.fill("#en-clave", clave); await p.check("#en-acepto");
    await p.click("button:has-text('Entrar')");
    for (let i = 0; i < 3; i++) {
      await dentro(p);
      try { await p.evaluate(() => { if (sesion) go({ name: "comunidad" }); }); break; } catch (e) { /* se ha recargado justo ahora */ }
    }
    await p.waitForTimeout(800);
  };
  const NOMBRE_ANA = "Ana " + sufijo, ANA = "ana-" + sufijo + "@ejemplo.es", BEA = "bea-" + sufijo + "@ejemplo.es";
  const OTRA = "otra-" + sufijo + "@ejemplo.es", CARMEN = "carmen-" + sufijo + "@ejemplo.es";
  await crearCuenta(ANA); await crearCuenta(BEA); await crearCuenta(OTRA); const idCarmen = await crearCuenta(CARMEN);
  const ana = await pagina(), bea = await pagina();
  console.log("Cuentas y comunidad");
  await prueba("sin cuenta solo se ve la pantalla de entrar: sin pestañas y sin «crear cuenta»", async () => {
    assert.equal(await ana.locator("#en-clave").count(), 1);
    assert.equal(await ana.locator("nav.tabs").isVisible(), false);
    for (const v of ["patrones", "labores", "mas", "sofa", "comunidad"]) {
      await ana.evaluate(v => go({ name: v, id: "b-bola" }), v);
      assert.equal(await ana.locator("#en-clave").count(), 1, v + " no se abre sin cuenta");
    }
    assert.match(await ana.textContent(".panel"), /¿No tienes cuenta\? Pídesela/);
    assert.doesNotMatch(await ana.textContent(".panel"), /null|Mandarme un código/);
    assert.ok((await ana.locator("#en-correo").boundingBox()).height >= 40, "la caja del correo es grande");
    await ana.evaluate(() => go({ name: "privacidad" }));
    assert.match(await ana.textContent("h1"), /privacidad/, "la página de privacidad se puede leer sin cuenta");
  });
  await prueba("contraseña equivocada: lo dice claro y no entra", async () => {
    await ana.evaluate(() => go({ name: "inicio" }));
    await ana.fill("#en-correo", ANA); await ana.fill("#en-clave", "otra-cosa"); await ana.check("#en-acepto");
    await ana.click("button:has-text('Entrar')");
    await ana.waitForSelector("text=El correo o la contraseña no son correctos.");
    assert.equal(await ana.evaluate(() => !!sesion), false);
  });
  await prueba("entrar con correo y contraseña sube al instante lo que ya tenía en el móvil, con sus fotos", async () => {
    await ana.evaluate(async () => {
      const c = document.createElement("canvas"); c.width = 200; c.height = 200; const x = c.getContext("2d"); x.fillStyle = "#e84393"; x.fillRect(0, 0, 200, 200);
      const p = { id: "m-1", titulo: "Gorro de bebé", pasos: ["Vuelta 1: 6 pb en anillo mágico (6)", "Vuelta 2: aum en cada punto (12)"], color: "#E84393" };
      state.patrones.unshift(p); save(); const l = guardarLabor(p, "mi nieta"); await fotoSet(l.id, c.toDataURL("image/jpeg", .8));
    });
    await entrar(ana, ANA);
    await ana.waitForFunction(() => !nubePendiente && fotosSubidas().size > 0, null, { timeout: 10000 });
    const remoto = await ana.evaluate(async () => (await llamar("/rest/v1/estados?select=datos&usuario=eq." + sesion.uid))[0].datos);
    assert.equal(remoto.labores[0].para, "mi nieta");
    assert.equal(await ana.locator("#co-nombre").count(), 1, "pide un nombre para la comunidad");
    await ana.fill("#co-nombre", NOMBRE_ANA); await ana.click("text=Guardar mi nombre"); await ana.waitForTimeout(800);
    assert.equal(await ana.locator("#co-nombre").count(), 0);
  });
  await prueba("publicar una labor con su foto y su patrón", async () => {
    const id = await ana.evaluate(() => state.labores[0].id);
    await ana.evaluate(id => go({ name: "publicar", id }), id);
    await ana.fill("#pu-texto", "Para mi nieta, con algodón rosa.");
    await ana.click("button:has-text('Publicar')"); await ana.waitForSelector(".pub");
    assert.match(await ana.locator(".pub h3").first().textContent(), /Gorro de bebé/);
    assert.equal(await ana.locator(".pub img.pub-foto").first().evaluate(i => i.complete && i.naturalWidth > 0), true, "la foto publicada se ve");
  });
  await prueba("otra persona lo ve, da me gusta, comenta y lo guarda para tejerlo", async () => {
    await entrar(bea, BEA);
    await bea.fill("#co-nombre", "Bea"); await bea.click("text=Guardar mi nombre"); await bea.waitForSelector(".pub");
    const suya = bea.locator(".pub", { hasText: NOMBRE_ANA }).first();
    await suya.locator("button:has-text('Me gusta')").click();
    await bea.locator(".pub", { hasText: NOMBRE_ANA }).first().locator("button:has-text('Te gusta · 1')").waitFor();
    await bea.locator(".pub", { hasText: NOMBRE_ANA }).first().locator("button:has-text('Comentarios')").click(); await bea.waitForSelector("#pub-comentario");
    await bea.fill("#pub-comentario", "¡Qué bonito!"); await bea.click("button:has-text('Comentar')");
    await bea.waitForSelector(".comentario");
    await bea.click("button:has-text('Tejer este patrón')"); await bea.waitForSelector("text=Te han mandado un patrón");
    await bea.click("text=Guardar en mis patrones");
    assert.equal(await bea.evaluate(() => state.patrones[0].titulo), "Gorro de bebé");
  });
  await prueba("seguir, y en «A quien sigo» sale solo lo de quien sigues", async () => {
    await bea.evaluate(() => go({ name: "comunidad" })); await bea.waitForSelector(".pub");
    await bea.locator(".pub .pub-autora", { hasText: NOMBRE_ANA }).first().click(); await bea.click("button:has-text('Seguir')");
    await bea.waitForSelector("button:has-text('Dejar de seguir')");
    assert.match(await bea.textContent(".page-title"), /1 la sigue/);
    await bea.evaluate(() => { view = { name: "comunidad", pest: "sigo" }; render(); }); await bea.waitForSelector(".pub");
    assert.equal(await bea.locator(".pub").count(), 1);
  });
  await prueba("avisos: a la dueña le sale un puntito en «Gente» y la lista de lo que ha pasado", async () => {
    await ana.evaluate(() => contarAvisos()); await ana.waitForTimeout(500);
    assert.equal(await ana.locator("nav.tabs button.con-aviso").count(), 1, "puntito en Gente");
    assert.match(await ana.locator("nav.tabs button.con-aviso").getAttribute("aria-label"), /4 avisos nuevos/);
    await ana.evaluate(() => go({ name: "avisos" })); await ana.waitForSelector(".aviso");
    const textos = await ana.locator(".aviso").allTextContents();
    assert.equal(textos.length, 4, JSON.stringify(textos));
    assert.ok(textos.some(t => /Bea te sigue/.test(t)), JSON.stringify(textos));
    assert.ok(textos.some(t => /A Bea le gusta tu publicación «Gorro de bebé»/.test(t)), JSON.stringify(textos));
    assert.ok(textos.some(t => /Bea ha comentado/.test(t)) && textos.some(t => /Bea está tejiendo tu patrón/.test(t)));
    await ana.waitForFunction(() => avisosSinLeer === 0);
    assert.equal(await ana.locator("nav.tabs button.con-aviso").count(), 0, "al verlos se quita el puntito");
  });
  await prueba("ordenar por más gustados y más tejidos, buscar, y guardar para luego", async () => {
    // Ana publica otra labor sin «me gusta» ni patrón
    await ana.evaluate(() => { const p = { id: "m-2", titulo: "Manta de rayas", pasos: ["Fila 1: 30 pb (30)"], color: "#2E86C1" }; state.patrones.unshift(p); save(); guardarLabor(p, ""); });
    const id = await ana.evaluate(() => state.labores[0].id);
    await ana.evaluate(id => go({ name: "publicar", id }), id); await ana.waitForSelector("#pu-texto");
    await ana.click("#pu-patron"); await ana.click("button:has-text('Publicar')"); await ana.waitForSelector(".pub");
    const titulos = async () => (await bea.locator(".pub", { hasText: NOMBRE_ANA }).locator("h3").allTextContents());
    await bea.evaluate(() => { view = { name: "comunidad", pest: "todas", orden: "recientes" }; render(); }); await bea.waitForSelector(".pub");
    assert.deepEqual((await titulos()).slice(0, 2), ["Manta de rayas", "Gorro de bebé"], "lo más nuevo primero");
    await bea.selectOption("#co-orden", "gustados"); await bea.waitForTimeout(800);
    assert.equal((await titulos())[0], "Gorro de bebé", "el que tiene «me gusta» primero");
    await bea.selectOption("#co-orden", "tejidos"); await bea.waitForTimeout(800);
    assert.equal((await titulos())[0], "Gorro de bebé", "el que se está tejiendo primero");
    assert.match(await bea.locator(".pub", { hasText: "Gorro de bebé" }).first().textContent(), /Lo está tejiendo 1 persona/);
    await bea.fill("#co-buscar", "manta"); await bea.waitForTimeout(1200);
    assert.deepEqual(await titulos(), ["Manta de rayas"], "buscar «manta»");
    await bea.fill("#co-buscar", "algodón rosa"); await bea.waitForTimeout(1200);
    assert.deepEqual(await titulos(), ["Gorro de bebé"], "busca también en el texto");
    await bea.fill("#co-buscar", "zzzz(,)*"); await bea.waitForTimeout(1200);
    assert.match(await bea.textContent(".view"), /No he encontrado nada/);
    await bea.fill("#co-buscar", ""); await bea.waitForTimeout(1200);
    await bea.locator(".pub", { hasText: "Manta de rayas" }).first().locator("button:has-text('Guardar')").click();
    await bea.waitForSelector("text=Guardada. La tienes");
    await bea.evaluate(() => { view = { name: "comunidad", pest: "guardadas" }; render(); }); await bea.waitForSelector(".pub");
    assert.deepEqual(await bea.locator(".pub h3").allTextContents(), ["Manta de rayas"]);
  });
  await prueba("la dueña puede quitar comentarios de su publicación", async () => {
    await ana.evaluate(() => go({ name: "comunidad" })); await ana.waitForSelector(".pub");
    await ana.locator(".pub", { hasText: NOMBRE_ANA }).filter({ hasText: "Gorro de bebé" }).first().locator("button:has-text('Comentarios · 1')").click(); await ana.waitForSelector(".comentario");
    await ana.click(".comentario button:has-text('Borrar')"); await ana.click(".comentario button:has-text('¿Borrar?')");
    await ana.waitForSelector("text=Nadie ha comentado todavía.");
  });
  await prueba("salir quita lo suyo del móvil; al volver a entrar vuelve todo, también la foto", async () => {
    await ana.evaluate(() => go({ name: "perfil", id: sesion.uid })); await ana.waitForSelector("text=Salir de mi cuenta");
    await Promise.all([ana.waitForEvent("load"), ana.click("text=Salir de mi cuenta")]);
    assert.equal(await ana.evaluate(() => state.labores.length), 0);
    assert.equal(await ana.evaluate(() => Object.keys(localStorage).some(k => k.startsWith(FKEY))), false, "no quedan fotos suyas en el móvil");
    await entrar(ana, ANA);
    await ana.waitForFunction(() => state.labores.length === 2, null, { timeout: 10000 });
    await ana.evaluate(() => go({ name: "labores" }));
    await ana.waitForSelector(".labor img", { timeout: 10000 });
  });
  await prueba("otra cuenta en el mismo móvil no ve ni se queda con lo de la anterior", async () => {
    await ana.evaluate(() => go({ name: "perfil", id: sesion.uid })); await ana.waitForSelector("text=Salir de mi cuenta");
    await Promise.all([ana.waitForEvent("load"), ana.click("text=Salir de mi cuenta")]);
    await entrar(ana, BEA);
    await ana.waitForFunction(() => state.patrones.some(p => p.titulo === "Gorro de bebé"), null, { timeout: 10000 });
    assert.equal(await ana.evaluate(() => state.labores.length), 0, "las labores de Ana no pasan a Bea");
  });
  await prueba("bloquear: deja de verse lo suyo (lo demás lo prueban las reglas en supabase/pruebas)", async () => {
    await bea.evaluate(() => { view = { name: "comunidad", pest: "todas" }; render(); }); await bea.waitForSelector(".pub");
    await bea.locator(".pub", { hasText: NOMBRE_ANA }).first().locator("button[aria-label='Más opciones']").click();
    await bea.click("button:has-text('Bloquear')"); await bea.click("button:has-text('¿Bloquear?')");
    await bea.waitForFunction(n => ![...document.querySelectorAll(".pub")].some(p => p.textContent.includes(n)) && !document.querySelector(".overlay"), NOMBRE_ANA);
  });
  await prueba("borrar la cuenta borra todo en el servidor y deja el móvil como estaba", async () => {
    await bea.evaluate(() => go({ name: "perfil", id: sesion.uid })); await bea.waitForSelector("summary");
    const uid = await bea.evaluate(() => sesion.uid);
    await bea.click("summary"); await bea.click("text=Borrar mi cuenta para siempre"); await bea.click("text=¿Segura? Toca otra vez");
    await bea.waitForSelector("text=Cuenta borrada");
    assert.equal(await bea.evaluate(() => state.patrones[0].titulo), "Gorro de bebé", "lo del móvil se queda");
    await entrar(bea, OTRA);
    const resto = await bea.evaluate(async u => (await llamar("/rest/v1/perfiles?select=id&id=eq." + u)).length, uid);
    assert.equal(resto, 0, "su perfil ya no existe");
  });
  await prueba("he olvidado mi contraseña: código al correo, contraseña nueva y dentro", async () => {
    const p = await pagina();
    await p.click("text=He olvidado mi contraseña");
    await p.fill("#en-correo", CARMEN); await p.click("text=Mandarme un código");
    await p.waitForSelector("#en-codigo"); await p.fill("#en-codigo", await codigoDe(CARMEN));
    await p.fill("#en-nueva", "corto"); await p.check("#en-acepto"); await p.click("text=Guardar y entrar");
    await p.waitForSelector("text=al menos 8");
    await p.fill("#en-nueva", "cadeneta-nueva-1");
    await p.click("text=Guardar y entrar"); await dentro(p);
    await p.context().close();
    const q = await pagina(); await entrar(q, CARMEN, "cadeneta-nueva-1");
    let dentroQ = false;
    for (let i = 0; i < 3 && !dentroQ; i++) { try { dentroQ = await q.evaluate(() => !!sesion); } catch (e) { await dentro(q); } }
    assert.equal(dentroQ, true, "entra con la contraseña nueva");
    await q.context().close();
  });
  await prueba("si se le quita la cuenta (deja de pagar), al caducar la sesión vuelve a la pantalla de entrar", async () => {
    const p = await pagina(); await entrar(p, CARMEN, "cadeneta-nueva-1");
    await bloquearCuenta(idCarmen);
    for (let i = 0; i < 3; i++) {
      try { await p.evaluate(async () => { sesion.exp = 0; try { await token(); } catch (e) {} }); break; } catch (e) { await dentro(p); }
    }
    await p.waitForSelector("#en-clave");
    assert.equal(await p.locator("nav.tabs").isVisible(), false);
    await p.context().close();
  });
  await prueba("sin errores en la consola", async () => { assert.deepEqual([...ana.errores, ...bea.errores], []); });
  await browser.close(); servidor.close();
  console.log("\n" + bien + " bien, " + mal + " mal");
  process.exitCode = mal ? 1 : 0;
})();
