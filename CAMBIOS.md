# Tejiendo Ilusiones: registro de cambios

Roadmap: https://claude.ai/code/artifact/9806797f-de72-45ba-988f-2232ce38a1ea

## 2026-10-07 · Fase 0 (red de seguridad) y fase 1 (modo sofá)

- Copia de la versión anterior: `versiones/tejiendo-ilusiones-2026-10-07-antes-modo-sofa.html`.
- Datos: campo `v` (versión, ahora 2) y `MIGRACIONES` en el bloque «Estado y guardado». Antes de migrar se guarda
  la copia literal en `localStorage["rincon-ganchillo-v1-copia-v1"]`. Nuevo `state.prefs` {tejer, sonido, vibrar, auto}
  y `progreso[id].rep` (repetición dentro de un paso «Vueltas 7 a 20»). La migración no cambia `state.t`,
  para no pisar datos más nuevos de la nube.
- Modo sofá (`VISTAS.sofa`): pantalla completa, mitad de abajo = +1, avance solo al cuadrar, deshacer ilimitado
  en la sesión, pasos «hasta que mida» y pasos sin cuenta, tiempo automático (se pausa tras 10 min sin tocar),
  vibración, sonido (WebAudio), pedal/teclado (espacio, flechas, AvPág). Lógica pura en `infoPaso`,
  `sofaTocar`, `sofaVueltaHecha`, `sofaSiguientePaso`. `tejer(id)` abre el modo que se usó la última vez.
- `<meta name="viewport">` añadido (fuera de claude.ai el móvil mostraba la app en miniatura).

## Tests

    NODE_PATH=$(npm root -g) node tests/app.test.cjs

Playwright + Chromium, gratis. `tests/motor-referencia.json` es la salida del motor de patrones antes de los
cambios; si un cambio del motor es intencionado, se regenera con `node tests/motor-snapshot.cjs <html>`.
Capturas en `tests/capturas/`.

## Pendiente detectado

- «ch 3» en inglés: resuelto en el importador (fase 2a).
- El botón atrás del móvil cierra la app (no hay historial): resuelto en la fase 4.

## 2026-10-07 · Fase 2a: pegar un patrón (sin IA)

- Copia previa: `versiones/tejiendo-ilusiones-2026-10-07-con-modo-sofa.html`.
- Nueva pantalla `VISTAS.importar` (Patrones → «Pegar un patrón»). Funciones puras: `limpiarPegado` (quita viñetas,
  enlaces y números de página, separa vueltas pegadas, une líneas cortadas), `esIngles`/`esUK`, `traducirIngles`
  (EE. UU. y Reino Unido; «ch 3», «(sc, inc) x6», «rep from * 5 more times», «[24]», «Rnds 5-8»…),
  `revisarLinea` (cuadra / revisar / no entiendo) e `importarTexto`.
- El patrón guarda el texto pegado en `original` (sin cambio de versión de datos: campo opcional nuevo).
- Pendiente: el motor no entiende «1 pb en la 2ª cad y en cada cad» (sale 1 punto). PDF con pdf.js y foto con
  Tesseract.js (fase 2b).

## 2026-10-07 · Fase 2b: abrir un PDF y leer una foto (en el móvil, sin IA de pago)

- Copia previa: `versiones/tejiendo-ilusiones-2026-10-07-publicada-v9.html` (la versión publicada).
- La pantalla pasa a llamarse «Añadir un patrón», con tres opciones: Abrir un PDF, Foto del patrón y Pegar texto.
  Lo leído se pone en el recuadro para revisarlo y corregirlo antes de guardar.
- PDF: pdf.js 3.11.174 desde cdnjs, cargado solo al usarlo, con `isEvalSupported:false` (CVE-2024-4367).
  `textoDePDF` junta los trozos por altura de línea. Si el PDF no tiene texto (escaneado), lee hasta 6 páginas
  como fotos.
- Foto: Tesseract.js 5.1.1 (español + inglés). El script viene de jsdelivr; el lector y los idiomas (13 MB,
  carpeta `ocr/`, ver `ocr/LEEME.txt`) se publican junto a la app, porque el artifact no deja descargarlos de
  otra web. Se descargan solo la primera vez que se lee una foto y quedan guardados en el móvil.
- `arreglarLectura` corrige números leídos como letras («(l2)» → «(12)»). Nada sale del móvil.
- Si el lector no arranca (sin red, móvil antiguo o el sitio no lo permite) avisa y propone copiar el texto de la
  foto con el propio móvil y pegarlo.
- Mejora: el grosor del ganchillo se toma de la línea que dice «ganchillo»/«hook», no de la lana.
- `[hidden]` siempre oculta (antes `.stack` lo anulaba fuera del artifact).
- Tests: 5 nuevos (PDF con texto, foto en inglés, PDF escaneado, archivos rotos y sin lector, arreglos de
  lectura). Usan copias locales de las librerías en `tests/vendor/` y un servidor local. 20/20.
- Al publicar hay que subir también los archivos de `ocr/` (parámetro `files`).

## 2026-10-07 · Fase 3: versión instalable que funciona sin conexión (PWA)

- `tools/construir-web.cjs` genera `web/` a partir de `tejiendo-ilusiones.html`: manifiesto, iconos (dibujados
  con el propio Chromium de los tests, incluido el recortable de Android), service worker y copias de `lib/` y
  `ocr/`. La fuente sigue siendo un solo HTML; el script no la modifica, solo la envuelve.
- `tools/sw-plantilla.js`: la app va primero a la red y, sin conexión, a lo guardado; los archivos van a lo
  guardado primero. Caché aparte para el lector de fotos (13 MB) y para las fuentes de Google, con el nombre de
  la caché sacado de un hash del contenido, para que una versión nueva sustituya a la anterior.
- En `web/` la app pone `window.TI_LOCAL`: carga pdf.js y Tesseract desde `lib/` (sin conexión) y la copia de
  seguridad se descarga con el navegador, que fuera del artifact sí deja.
- `lib/` guarda copias exactas de las librerías del CDN (antes en `tests/vendor/`), usadas por la versión
  instalable y por los tests.
- `PUBLICAR.md`: cómo subirla (GitHub Pages recomendado), alternativas gratuitas, cómo se instala en el móvil y
  cómo pasar los patrones de una versión a otra con la copia de seguridad.
- Se instala con 1,7 MB; 14,7 MB en total contando el lector de fotos.
- Tests: 2 nuevos (se instala y funciona sin conexión con un patrón guardado, incluido abrir PDF; manifiesto e
  iconos completos). 22/22.
- Pendiente: elegir alojamiento (es decisión de Parolo) y el botón atrás del móvil (fase 4).

## 2026-10-07 · Fase 4 (primera parte): el botón atrás del móvil

- Copia previa: `versiones/tejiendo-ilusiones-2026-10-07-antes-boton-atras.html`.
- `go()` deja una marca en el historial (`pushState`) y un `popstate` devuelve la pantalla anterior, así que el
  botón atrás del móvil ya no cierra la app.
- Con una ventana abierta encima (opciones del modo sofá, imagen del gráfico), atrás la cierra y se queda en la
  misma pantalla; vuelve a marcar el historial para no perder profundidad. También cierra con Escape.
  `abrirVentana`/`cerrarV` centralizan esto; `render()` cierra cualquier ventana al cambiar de pantalla.
- «← Volver» usa el historial cuando la pantalla anterior es justo esa (`atras()`), así no se alarga ni deja al
  usuario dando vueltas entre dos pantallas.
- `pushState` no funciona con `file://`: las pruebas del botón atrás van sobre el servidor local.
- Tests: 2 nuevos. 24/24.
- Pendiente de la fase 4: «Mis labores» y simplificar la navegación.

## 2026-10-07 · Fase 4 (segunda parte): Mis labores

- Copia previa: `versiones/tejiendo-ilusiones-2026-10-07-antes-labores.html`.
- Datos v3: `state.labores` (`{id, patron, titulo, para, nota, fin, tiempo, fotoDe}`). La migración mete en el
  cuaderno todo lo que ya estaba terminado (`progreso[x].fin`), sin tocar el progreso ni mover ninguna foto: la
  labor apunta a la foto del patrón con `fotoDe`. No se borra nada.
- Al terminar un patrón, la caja de «¡Terminado!» pide foto y «¿Para quién es?» y lo guarda en el cuaderno.
  Guardarlo es opcional y se puede volver al último paso como antes.
- `VISTAS.labores`: lo que está a medias arriba (las mismas tarjetas de «seguir tejiendo») y debajo lo terminado,
  con foto, para quién, fecha y tiempo. Desde cada tarjeta se cambia para quién, se cambia la foto o se quita del
  cuaderno (el patrón no se toca).
- Navegación: la pestaña «Gráficos» pasa a ser «Labores»; los gráficos siguen a un toque desde Más, desde Inicio
  y desde cada patrón («Ver como gráfico»). Cuatro pestañas, como antes.
- Tests: 3 nuevos (migración de lo ya terminado sin duplicar al reabrir; terminar → para quién → cuaderno →
  cambiar y quitar; el cuaderno enseña lo que está a medias). 27/27.
- Pendiente: compartir (fase 5) y cuenta/sincronización (fase 6).

## 2026-10-07 · Fase 5 (primera parte): compartir una labor

- `tarjetaLaborImagen` dibuja en un canvas (1080×1350) la foto de la labor, el título, para quién, la fecha y el
  tiempo tejido, con el pie «Hecho a mano con Tejiendo Ilusiones». Sin foto, dibuja el ovillo de la app sobre
  fondo rosa en vez de un hueco gris.
- `entregarImagen` prueba por este orden: el botón de compartir del móvil (`navigator.share` con archivo, que
  funciona en la versión instalable), la descarga del artifact, la descarga del navegador y, si no hay nada,
  enseña la imagen para guardarla con el dedo. Sirve también para los gráficos.
- Botón «Compartir» en cada labor del cuaderno y en la caja de «¡Terminado!».
- Nada sale del móvil: la imagen se hace en el propio aparato y es la usuaria quien decide a quién se la manda.
- Tests: 1 nuevo (tamaño, color de fondo, PNG, y que desde la pantalla se ve y se cierra con atrás). 28/28.
- Pendiente de la fase 5: el enlace «teje este patrón», que necesita que la app esté alojada en una dirección
  propia (ver PUBLICAR.md).
