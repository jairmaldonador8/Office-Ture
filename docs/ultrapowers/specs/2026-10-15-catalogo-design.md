# Página de catálogo

Fecha: 15-oct-2026. Sustituye a la rejilla de sillería dentro de inventario (spec del mismo día), que Jair descartó: «se ve como lista, no como catálogo» y «está enterrado dentro de inventario».

## Decisión

Página propia `catalogo.html`, enlazada como «Catálogo» desde el menú, el menú móvil y el pie de todas las páginas. Inventario y Equipa siguen siendo las dos líneas (showroom y maqueta); el catálogo es el documento que el cliente manda en el primer contacto, ahora en la web.

## Estructura

1. **Portada**: ceja «Catálogo · octubre de 2026», h1 «Todo lo que *fabricamos.*», bajada e índice numerado de capítulos con conteo de modelos. Foto panorámica 21:9 del escritorio ejecutivo en nogal con pie.
2. **Barra de capítulos pegajosa** bajo la barra fija (76 px en móvil, 68 px en escritorio), con el capítulo visible subrayado por `IntersectionObserver`.
3. **Cuatro capítulos**, cada uno con número grande en beige, ceja, titular con una palabra en cursiva terracota, bajada y un dato a la derecha (entrega, precio desde, oficinas equipadas):
   - 01 Escritorios: lineal con cajonera ($2,750, destacado), escuadra (a cotizar, tres acabados), semiejecutivo en L ($11,500), ejecutivo con librero ($14,200), dirección en U (a la medida).
   - 02 Sillería: los once modelos del cliente, gerencial destacada, «desde $1,490» en el dato del capítulo.
   - 03 Almacenaje: archivero vertical ($5,200, tres acabados, destacado) y credenza con librero (a la medida).
   - 04 Equipamiento: estaciones de trabajo (destacado), recepción, oficinas privadas, salas de juntas y áreas comunes; enlace a «Arma tu oficina».
4. **Cierre**: tarjeta oliva de cotización en 30 minutos y pie.

## Tarjeta de producto

Foto con esquinas de 4 px (4:5; el destacado 4:3 y ocupa dos columnas y dos filas), línea fina, nombre en Poppins 500, descripción corta, acabados como puntos de color cuando aplica, y pie con precio o nota («A la medida», «Según medida», «En inventario») y enlace «Cotizar» a WhatsApp con el modelo escrito. Las sillas van sobre tarjeta blanca con la foto contenida. Rejilla de 2 columnas en 390 px, 3 desde 760 px y 4 desde 1000 px.

## Verificación

Playwright a 390 × 844 y 1440 × 900: sin scroll horizontal, 22 imágenes cargan, la barra pegajosa queda a 76 / 68 px bajo la barra fija y marca el capítulo activo, los enlaces del índice llevan al capítulo con margen para no quedar bajo las barras.

## Fuera de alcance

Ficha de producto con detalle, PDF descargable, precios por silla. Pendientes con el cliente: nombres y textos de cada pieza, precios vigentes.
