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

## 2026-10-07 · Alojamiento, enlace «teje este patrón» y correcciones

- Alojada en GitHub Pages: repositorio `parolo2000/tejiendo-ilusiones`, carpeta `docs/` (antes `web/`), en
  https://parolo2000.github.io/tejiendo-ilusiones/.
- Enviar un patrón con un enlace («Enviar a una amiga» en cada patrón). El patrón va comprimido detrás de `#`,
  así que no pasa por ningún servidor. Al abrirlo se enseña la pantalla «Te han mandado un patrón» y solo se
  guarda si se pulsa Guardar; no se duplica si ya está. Todo lo que llega se valida: solo textos, con límites de
  tamaño (también al descomprimir), y se pinta como texto, nunca como HTML.
- Motor: «1 pb en la 2ª cad y en cada cad» contaba 1 punto; ahora cuenta todos (29 en la manta). La salida del
  motor de los patrones incluidos no cambia (`motor-referencia.json` igual).
- En la app de claude.ai, aviso en Inicio para instalar la versión del móvil y cómo llevarse los patrones con la
  copia de seguridad. Se puede quitar («No volver a mostrar», preferencia `avisoApp`).
- Seguridad: los colores de patrones y lanas se validan al cargar (una copia de seguridad tocada a mano no puede
  meter estilos).
- Prueba del doble toque del modo sofá más robusta (fallaba a veces por tiempos).
- Tests: 34/34.

## 2026-10-07 · Que no se pierda nada, vídeos de los puntos y leer en voz alta

- Al abrir, la app pide al navegador almacenamiento persistente (`navigator.storage.persist`), para que no borre
  los datos al hacer limpieza.
- Recordatorio de copia de seguridad: si hay cosas propias y hace más de 30 días de la última copia (o desde que
  se empezó a usar), Inicio lo recuerda. «Ahora no» lo aplaza una semana. Preferencias nuevas `ultCopia`,
  `copiaDesde`, `copiaPospuesta` (sin cambio de versión de datos: las preferencias se completan solas).
- «¿Cómo se hace?»: en la vista completa, debajo del paso, enlaces a vídeos de YouTube de cada punto del paso;
  también en las opciones del modo sofá y junto a cada abreviatura. Solo abre una búsqueda; no se envía nada.
- Modo sofá: botón «Oír» que lee el paso con la voz del móvil, cambiando abreviaturas por palabras («pb» → «punto
  bajo»). Opción «Leer cada paso en voz alta» (`prefs.leer`) que lo lee solo al cambiar de paso o repetición.
- Tests: 3 nuevos. 37/37.

## 2026-10-07 · Deshacer, tejer otra vez y apuntes por paso

- «Deshacer» en el aviso de abajo durante 7 segundos tras «Volver a empezar», «Borrar patrón» (recupera el
  patrón en su sitio, su progreso y su foto) y «Quitar del cuaderno» (recupera la labor y su foto).
- Al guardar una labor terminada, botón «Tejerlo otra vez» que reinicia el progreso y abre el patrón.
- Cada labor guarda su propia copia de la foto: si se cambia o se borra la foto del patrón, la de la labor sigue.
- Apuntes por paso: en la vista completa, «Apunte para este paso» (hasta 300 letras); en el modo sofá se ve
  como «Tu apunte: …». Nuevo `state.apuntes` {idPatrón: {paso: texto}}; sin cambio de versión de datos (si no
  existe, se crea vacío al cargar).
- Tests: 3 nuevos. 40/40.

## 2026-10-07 · Imprimir, tu semana y copias más seguras

- «Imprimir» en cada patrón: hoja limpia con letra grande, una casilla por paso para ir tachando, los puntos que
  usa y tus apuntes. También sirve para guardarla en PDF. Dentro de claude.ai el navegador no deja imprimir: la
  app lo avisa en vez de no hacer nada.
- «Tu semana» en Inicio: barras con el tiempo tejido cada uno de los últimos 7 días (solo si se ha tejido algo).
  Nuevo `state.diario` {"AAAA-MM-DD": segundos}; se guarda el último año. Sin cambio de versión de datos.
- Copia de seguridad:
  - En el móvil, «Enviarla por WhatsApp o correo» (menú de compartir del sistema; va como .txt porque los
    móviles no comparten .json, y «Recuperar una copia» la lee igual). Solo sale si el móvil lo permite.
  - «Recuperar una copia» se puede deshacer y aparta lo que había en `rincon-ganchillo-v1-antes-de-recuperar`.
  - Seguridad: de una copia solo se aceptan fotos que sean imágenes (`data:image/…`).
- Tests: 3 nuevos (y uno que fallaba a veces, arreglado). 43/43.

## 2026-10-07 · Descanso, buscar mejor y colores oscuros

- Modo sofá: cada hora seguida tejiendo, un aviso suave («Estira las manos y descansa la vista»), con vibración
  si está activada. Si para más de 10 minutos, la cuenta empieza de nuevo. Se quita en Opciones
  (`prefs.descanso`, activado por defecto).
- Buscar patrones sin importar tildes ni mayúsculas («muneco» encuentra «Muñeco»), y también dentro de las notas
  y los pasos.
- Más → Colores: Automáticos, Claros u Oscuros (`prefs.tema`). Oscuros cansan menos de noche aunque el móvil
  esté en claro. En Automáticos manda el móvil.
- Tests: ahora todos abren la app desde un servidor local (con `file://` Chromium a veces perdía localStorage al
  recargar y alguna prueba fallaba sin motivo). 3 nuevos. 46/46.

## 2026-10-07 · Accesibilidad revisada

- Revisión con axe-core (gratis, solo para revisar; no va dentro de la app) de las 16 pantallas, en claro y en
  oscuro: sin problemas de contraste. Arreglado lo que salió: idioma «es» en la página (lectores de pantalla y voz),
  la lista de pasos del patrón y las tablas de Abreviaturas y Herramientas, que ahora se pueden mover con teclado.
- Un patrón recibido por enlace no se guarda dos veces aunque se toque «Guardar» otra vez.
- Tests: 46/46.

## 2026-10-07 · Dibujo en el modo sofá, gráfico y foto, dibujar un patrón, importar del ruso

- Modo sofá: el dibujo de la vuelta se va marcando al tocar (en verde lo hecho, con borde el punto que toca).
  Con el móvil de pie, una tira con los puntos de la vuelta; tumbado o en el ordenador, el gráfico entero con la
  vuelta marcada. Un aumento cuenta 2 puntos (`simbolosHechos`). Si el texto del paso no cabe, manda el texto y el
  dibujo se quita en esa pantalla. Gráficos en filas y en redondo (`marcar` en `dibujarFilas`/`dibujarRedondo`);
  `graficoEnCurso` sale de la vista completa y lo usan las dos.
- Patrón: arriba, el gráfico («Ver el gráfico») y al lado la foto de tu creación o el hueco «Añadir foto».
- Escribir un patrón: «Dibujarlo en un gráfico» abre un gráfico nuevo con el nombre puesto y el botón
  «Guardar como patrón».
- Importar:
  - Patrones en ruso (сбн, ссн, пссн, с2н, вп, сс, пр, уб, КА, «1 ряд», «4-6 ряды», «(сбн, пр) х 6»…).
  - Lana y color: de la línea «Lana/Hilo/Yarn/Пряжа» se coge la lana (nuevo campo al revisar) y su color, que pasa
    a ser el color de la ficha.
  - «Solo las vueltas» (marcado por defecto): se quedan las líneas «Vuelta N»; lo demás va a las notas
    («Otras líneas del patrón»), no se pierde. Se puede desmarcar.
  - Arreglo: una línea solo con letras rusas se tiraba como si fuera adorno.
- Tests: 4 nuevos y 2 adaptados a «Solo las vueltas». 50/50. Accesibilidad (axe) sin avisos.

## 2026-10-07 · Patrones con partes y colores («1ª vuelta», CUERPO, PIES, ALAS)

- Importar entiende «1ª vuelta», «16ª vuelta», «1era vuelta», «5ª a 10ª vuelta» (`normalizarVuelta`), también
  para «Solo las vueltas».
- Partes: una cabecera en mayúsculas o con «(hacer N)» seguida de «Con gris» se guarda como un paso
  «Parte: PIES (hacer 2) · con anaranjado». Un «Con blanco» suelto entre vueltas es «Cambia a la lana blanco.».
  Sin cambio de datos: siguen siendo pasos de texto.
- Modo sofá: en una parte nueva avisa «Nueva parte: se empieza otra vez por la vuelta 1» y el botón dice
  «Empezar esta parte». Arriba se ve la lana de ahora y los colores que pide la vuelta («con blanco»).
- El gráfico es el de la parte en la que se está (`parteDe`, `subPatron`); si la vuelta 1 dice «anillo mágico»,
  va en redondo con el anillo en el centro.
- Leyendas «Pto = punto» no son pasos ni se pegan a otras líneas; van a las notas.
- Motor: «en el primer pa», «en el último punto»… son un sitio, no un punto (antes salía 1 de más).
- Las notas del patrón respetan los saltos de línea.
- Tests: 1 nuevo. 51/51.

## 2026-10-07 · Puntos del color de su lana

- En los gráficos sacados del texto, cada punto se pinta con la lana con la que se teje: la de su parte
  («Parte: CUERPO · con gris»), la de un «Cambia a la lana …» y los cambios dentro de una vuelta
  («3 pa, con blanco: 10 pa, con gris: 5 pa»). Si un trozo no cuadra con los puntos, la vuelta va entera del color
  de antes. Si el patrón no habla de colores, el gráfico no cambia. (`colorearGrafico`, `trozosDeColor`,
  `lanaIndice`; usa los colores de lana que ya tenían los gráficos, sin cambio de datos.)
- El color se ve más (más opaco y con borde, para que el blanco no desaparezca) y lo hecho en el modo sofá se
  marca con un borde verde sin tapar el color. En la tira del móvil, cada punto lleva una raya de su color.
- Tests: 1 nuevo. 52/52.

## 2026-10-07 · Elegir la parte del patrón y ver si va en redondo o en filas

- En un patrón por partes, arriba salen botones con cada parte (con el color de su lana). Al elegir una, se ve su
  gráfico, con su nombre y «En redondo (como un círculo)» o «En filas (plano, como un cuadrado)». Por defecto, la
  parte en la que va tejiendo.
- «Ver el gráfico» abre el gráfico de esa parte, con sus colores (se guarda con `de` y `parte`), y desde ahí
  «← Patrón» vuelve al patrón.
- Tests: 1 nuevo. 53/53.

## 2026-10-07 · Seis mejoras: ruso en fotos, piezas dobles, lanas, aviso de color, arreglos y contadores

- Fotos y PDF escaneados en ruso: `ocr/rus.traineddata.gz` (tessdata 4.0.0_best_int, @tesseract.js-data/rus 1.0.0)
  y el lector arranca con `["spa","eng","rus"]`. Todo sigue en el móvil.
- Partes que se tejen varias veces («PIES (hacer 2)», «(2 piezas)», «(make 2)», «(2 детали)»): `vecesDe`,
  `piezasDe`, `sofaPasoAnterior`. Al acabar la primera pieza se vuelve a la vuelta 1 de la parte
  (`progreso[id].pieza`, sin migración), con «Pieza 1 de 2» en el modo sofá y en la vista completa.
- Lanas que pide el patrón (`lanasDelPatron`: hilo, partes, «Cambia a la lana», «con blanco:») frente a «Mis
  lanas» (`tengoLana`: por el nombre o por el color más parecido). Dice cuál falta y «＋ Ya tengo …» la apunta
  con nombre y color puestos, y vuelve al patrón.
- Modo sofá: en el punto exacto en que cambia el color dentro de la vuelta sale «Ahora cambia a la lana blanca»
  con su color, vibración y sonido (y en voz alta si lo tiene puesto).
- Importar: en las vueltas que no cuadran, `sugerirArreglo` propone el cambio más probable de un número (veces que
  se repite, números que la foto confunde o el total) con «Aplicar» y «Deshacer» (`importarArreglos`).
- Contador: varios con nombre (`state.contadores`, hasta 12; el principal sigue en `state.libre`). Se crean,
  renombran y borran con deshacer.
- Tests: 6 nuevos. 59/59.

## 2026-10-07 · Por importancia: aviso antes de la vuelta difícil, cuánto falta, fotos del avance y gastar lana

- Orden por valor × frecuencia × diferenciación × retención ÷ esfuerzo. Las calculadoras de aumentos y de muestra
  ya estaban en Más; las carpetas quedan fuera (puntúan 6 y el buscador ya cubre eso).
- Modo sofá y vista completa: «Ojo: en la vuelta 12 se cambia de color…» durante la última repetición del paso de
  antes (`ojoDelPaso`: parte nueva, cambio de lana, colores dentro de la vuelta, hebra de atrás/delante, rellenar,
  coser o unir, punto que no ha salido aún).
- Cuánto te falta (`puntosQueQuedan`, `cuantoFalta`): puntos que quedan, contando las piezas repetidas, y el tiempo
  a su ritmo real (con 20 puntos y 2 minutos tejidos). En el patrón, la vista completa y las opciones del sofá.
- Fotos de cómo va (`state.avances`, hasta 12 por patrón, a 520 px): desde la vista completa o las opciones del
  sofá. «Así va creciendo» en el patrón; se ven en grande y se quitan. Al borrar el patrón se borran, con deshacer.
- Al terminar, «¿Has gastado lana de tu cesta?» (`cajaGastar`) quita de Mis lanas los ovillos usados, con
  deshacer, primero las del color del patrón. Una lana a 0 sale «Agotada» (`ovillosDe`).
- Las ventanas ya no aplastan su contenido cuando no cabe (`.overlay .box > *{flex-shrink:0}`).
- Tests: 4 nuevos. 63/63.
