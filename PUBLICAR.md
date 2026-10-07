# Publicar la versión instalable

La carpeta `docs/` es la app lista para subir a internet. Está en el repositorio
https://github.com/parolo2000/tejiendo-ilusiones y GitHub Pages la publica en
https://parolo2000.github.io/tejiendo-ilusiones/ Se genera así (desde `tejiendo-ilusiones/`):

    NODE_PATH=$(npm root -g) node tools/construir-web.cjs

Ocupa 14,7 MB, de los cuales la app se instala con 1,7 MB; los 13 MB restantes son el lector de fotos, que
solo se descarga la primera vez que se usa esa función.

**Hay que generarla otra vez cada vez que cambie `tejiendo-ilusiones.html`.**

## Opción recomendada: GitHub Pages (gratis)

Límites: 1 GB por repositorio y 100 GB de tráfico al mes. La app cabe de sobra.

1. Crear un repositorio en GitHub, por ejemplo `tejiendo-ilusiones`. Puede ser público o privado
   (con Pages gratis el sitio es público en los dos casos; en la app no hay nada privado, los datos de quien
   teje se quedan en su móvil).
2. Subir el proyecto a la rama `main` (la app ya construida va en `docs/`).
3. En el repositorio: Settings → Pages → Source: «Deploy from a branch» → rama `main` y carpeta `/docs`.
4. A los pocos minutos queda publicada en `https://<usuario>.github.io/tejiendo-ilusiones/`.

El archivo `.nojekyll` que genera el script ya está incluido: sin él, GitHub Pages ignora algunos archivos.

## Alternativas gratuitas

| Dónde | Coste | A tener en cuenta |
|---|---|---|
| GitHub Pages | 0 € | Lo más sencillo si ya hay cuenta de GitHub. El sitio es público. |
| Cloudflare Pages | 0 € | Más rápido fuera de Europa; permite sitios privados con Access. |
| Netlify | 0 € | 100 GB al mes. Se puede subir la carpeta arrastrándola. |
| Dominio propio (`tejiendoilusiones.es`) | unos 10-15 €/año | **Es lo único de pago.** No hace falta: funciona igual con la dirección gratuita. |

## Cómo se instala en el móvil

- **Android (Chrome):** abrir la dirección → menú de los tres puntos → «Instalar aplicación» o «Añadir a pantalla
  de inicio».
- **iPhone (Safari):** abrir la dirección → botón de compartir → «Añadir a pantalla de inicio».

Queda con su icono, se abre a pantalla completa y funciona sin conexión.

## Qué hay que saber

- **Los datos no se pierden al publicar una versión nueva**, pero viven en cada aparato: los del artifact de
  claude.ai y los de la versión instalada son dos sitios distintos. Para pasar los patrones de uno a otro:
  Más → Copia de seguridad → «Guardar una copia» en el primero y «Recuperar una copia» en el segundo.
- **La versión instalada funciona entera sin conexión**, incluido abrir PDF y leer fotos (después de la primera
  vez).
- **Actualizaciones:** al abrir la app con conexión se recoge la versión nueva. Si no hay conexión, abre la que
  tiene guardada.
- Hace falta HTTPS para que se pueda instalar. Las tres opciones de arriba lo dan gratis.
