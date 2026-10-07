# Tejiendo Ilusiones

Una libreta de ganchillo para el móvil: patrones vuelta a vuelta, modo sofá (un toque, un punto), importar
patrones desde texto, PDF o foto, gráficos, contador y un cuaderno de labores. En español, sin cuentas, sin
anuncios y sin enviar nada a ningún servidor: todo se guarda en el propio móvil.

**App:** https://parolo2000.github.io/tejiendo-ilusiones/ (se puede instalar y funciona sin conexión).

## Cómo está hecha

- `tejiendo-ilusiones.html`: la app entera, un solo archivo HTML con JavaScript sin dependencias. Es la fuente.
- `docs/`: la versión instalable que publica GitHub Pages. **No se edita a mano**; se genera con
  `NODE_PATH=$(npm root -g) node tools/construir-web.cjs`.
- `lib/`: copias exactas de pdf.js y Tesseract.js. `ocr/`: el lector de fotos y los idiomas (ver `ocr/LEEME.txt`).
- `tests/`: pruebas con Playwright. `NODE_PATH=$(npm root -g) node tests/app.test.cjs`.
- `CAMBIOS.md`: qué se ha cambiado y por qué. `PUBLICAR.md`: cómo publicar e instalar.

Coste: 0 €. Librerías de código abierto (Apache-2.0) y alojamiento gratuito.
