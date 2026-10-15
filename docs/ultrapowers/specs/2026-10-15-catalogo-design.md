# Página de catálogo, formato revista

Fecha: 15-oct-2026. Tres iteraciones el mismo día:

1. Rejilla de sillería dentro de inventario. Descartada: «se ve como lista, no como catálogo».
2. Página propia `catalogo.html` con cuatro capítulos en rejilla editorial (estilo hay.com). Descartada: Jair pidió «algo con personalidad, que parezca una revista premium» y mandó dos referencias generadas con ChatGPT (portada de catálogo y doble página).
3. **Esta versión**: catálogo como revista, con la paleta del cliente.

## Decisión de paleta

La referencia usa menta `#a0ccc7`, azul cielo `#92b1e7`, blanco y negro, que son los colores que el cliente sigue usando (doc del kick-off). Jair eligió tomarla tal cual: el catálogo es la primera pieza viva de la variante con la paleta del cliente, para que los dueños la comparen contra el resto del sitio en oliva y terracota. Se implementa redefiniendo las variables de color en `body.catalogo`, sin tocar el resto del sitio: fondo «mesa» `#e6e1d8`, papel blanco, acento verde `#3f9284` para la palabra del titular, botones negros, wordmark negro en la barra y el pie, isotipo menta.

## Estructura: seis pliegos

Cada pliego es una hoja blanca con sombra, cabecera corrida en versalitas y folio en la esquina.

| Folio | Contenido |
|---|---|
| 01 | Portada: isotipo menta y wordmark negro (SVG inline, `#i-wordmark`), «Mobiliario de oficina · Catálogo 2026», titular «Espacios que te acompañan.», bajada, índice de capítulos. Foto del escritorio ejecutivo recortada con la forma del isotipo (`clip-path: url(#clip-iso)`) sobre una mancha azul. |
| 02 | Intro: «Mobiliario para espacios reales.», bajada, etiquetas Trabajar / Reunir / Recibir / Guardar, foto a sangre. Panel menta «Sillería · Soporte para ideas más grandes» con la silla gerencial flotando, código, nombre y «desde $1,490». |
| 03 | Escritorios: panel azul con título, subtítulo, texto y botón de contorno; foto grande; cinco tarjetas con código OT-ES01 a 05. |
| 04 | Sillería: panel menta invertido, silla ejecutiva sobre gris; once tarjetas OT-SI01 a 11 en cuatro columnas. |
| 05 | Almacenaje (panel azul, archivero, tres tarjetas OT-AL) y Equipamiento (panel menta, estaciones, tres tarjetas OT-EQ, botón «Arma tu oficina»). |
| 06 | Contraportada negra: logo, «Cotización en 30 minutos.», botón menta de WhatsApp y datos de contacto. |

## Componentes

- **Panel de color** (`.rev-panel`): esquina inferior grande (110 px) y un círculo blanco translúcido como mancha; texto alineado arriba; botón de contorno negro con flecha.
- **Tarjeta de producto** (`.rev-prod`): foto 4:3 sobre gris `#f1f0ec` con esquinas de 12 px, código en versalitas, nombre y precio o nota. Toda la tarjeta enlaza a WhatsApp con el modelo escrito.
- **Sillas con fondo transparente**: `img/silla-*.webp` ahora llevan alfa (se quita solo el blanco conectado a los bordes, con 1 px de borde suave) para que floten sobre los paneles.
- **Códigos OT-xx00**: son una convención propuesta para que el catálogo se lea como tal; no existen en el negocio del cliente todavía.

## Verificación

Playwright a 390 × 844 y 1440 × 900: sin scroll horizontal, 22 imágenes cargan, la portada, el panel destacado y el capítulo de sillería revisados en ambos tamaños.

## Fuera de alcance

Ficha de detalle por producto, PDF descargable, precios por silla, nombres definitivos. Pendiente con el cliente: validar textos, precios y los códigos.

## Imágenes de producto con fondo blanco (15-oct-2026, tarde)

Jair entregó dos zip idénticos (`OfficeTure_Todas_Imagenes_Desde_1121.zip`) con 25 imágenes: 15 recreaciones generadas por IA y 10 fotos originales retocadas a fondo blanco, más un LEEME que advierte que las generadas «pueden variar herrajes, número de cajones, estructura o tonalidades» y deben validarse contra el producto real. Pidió sustituir con ellas las fotos de producto del inventario y del catálogo, sin tocar las once sillas.

- Se convirtieron 14 a `img/prod-*.webp` 1200 × 1200 con fondo transparente, con el mismo flujo que las sillas (script `convertir_prod.py` en el scratchpad de la sesión). Nombres: lineal, archivero (gris, foto retocada), escuadra-claro, semiejecutivo, ejecutivo, direccion, escuadra-silla, credenza, librero, archivero-nogal (foto retocada), estaciones, recepcion, privada, juntas.
- Los acabados grafito y nogal del escritorio en escuadra (`prod-escuadra-{grafito,nogal}.webp`) se recolorearon a partir del render claro, solo en los píxeles de madera; no existen renders de esos tonos.
- Las fotos reales que seguían en uso se renombraron a `img/foto-ejecutivo.webp` (portada del catálogo recortada con el isotipo) y `img/foto-semiejecutivo.webp` (tarjeta «Línea I» de la portada). Se borraron `prod-lineal`, `prod-archivero` y `tono-*` antiguos.
- Inventario: cada producto lleva `data-contiene="1"` y la figura `show-foto blanca`, de modo que el escenario se pone blanco y la imagen se contiene, igual que las sillas. Catálogo: las figuras de producto y las fotos de capítulo llevan `recorte`.
- Desajustes a validar con el cliente: el «escritorio lineal con cajonera» se muestra con un render sin cajonera (no hay uno con pedestal), el archivero principal es gris en vez de los tres tonos, y «Dirección en U» usa el render en caoba.
