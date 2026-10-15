# Páginas de línea con lenguaje editorial (inventario y equipa)

Fecha: 15-oct-2026. Petición de Jair: «hagas más profesional la parte de lo que tenemos hoy y tu empresa completa, que tenga más personalidad». Hasta hoy `inventario.html` y `equipa.html` eran una cabecera de texto, un componente (la vitrina o la maqueta) y el bloque de cierre.

## Decisión

Tomar los recursos del catálogo revista (paneles de color con esquina orgánica, producto flotando con sombra, índice de capítulos, cabeceras numeradas, mucho aire) pero **en la paleta del sitio** (oliva, sage, beige, marfil, terracota), para que las dos páginas sigan siendo del sitio y no del catálogo. Las variables nuevas viven en `body.linea`: `--panel-beige #e9e1d2`, `--panel-sage #dde3d0`, `--panel-marfil #fbf9f4`. Si el cliente prefiere su paleta, basta cambiar esas tres variables.

## Estructura

**Inventario («Lo que tenemos hoy»)**

1. Portada: ceja, titular, bajada, tres promesas (1 a 2 días, 06 piezas en vitrina, 30 minutos), botón de WhatsApp y enlace a la vitrina. A la derecha, panel beige con la silla gerencial flotando, etiqueta «En bodega», isotipo tenue y pie con precio.
2. Índice de capítulos (`.ln-indice`): 01 a 06; al tocar uno, `app.js` activa esa pieza en la vitrina (`[data-ir]`).
3. Vitrina: el showroom existente sin cambios de marcado, con cabecera de capítulo y escenario sobre degradado blanco a beige con esquina orgánica; la clase `blanca` va en el HTML desde el inicio.
4. «Cómo lo recibes»: tres pasos.
5. Paneles cruzados: catálogo (sage) y Línea II (oliva).
6. Cierre: el bloque de cotización, ahora con esquina orgánica.

**Equipa («Tu empresa, completa»)**

1. Portada igual que la anterior, con panel sage y la mesa de juntas; promesas: +20 oficinas, 100 % a la medida, 30 minutos.
2. «Lo que incluye un proyecto»: cuatro zonas en paneles (beige, sage, marfil, oliva) con los renders de estaciones, juntas, recepción y dirección. Se etiquetan «Zona 01» a «Zona 04» porque solo dos tienen código en el catálogo.
3. Simulador: la maqueta existente sin cambios, con cabecera de capítulo.
4. Proyectos: tres fotos reales (local vacío, instalación, oficina entregada). Los pies no afirman que sean el mismo proyecto.
5. «Cómo trabajamos»: cuatro pasos.
6. Paneles cruzados: Línea I (beige) y catálogo (oliva). Cierre.

## Implementación

- Bloque CSS `/* ---------- páginas de línea (inventario, equipa) ---------- */` con clases `.ln-*`, antes del bloque del catálogo revista. Reutiliza `.btn-contorno` del catálogo.
- `js/app.js`: manejador de `[data-ir]` dentro del bloque del showroom.
- Fuentes del ensamblado en el scratchpad de la sesión (`armar_lineas.py`, `ln-*.html`, `ln.css`); el script conserva intactos el showroom y la maqueta.

## Verificación

Playwright a 390 × 844 y 1440 × 900: sin scroll horizontal, la vitrina arranca en blanco, el índice activa la pieza correcta y las imágenes cargan. Publicado en https://officeture.vercel.app.
