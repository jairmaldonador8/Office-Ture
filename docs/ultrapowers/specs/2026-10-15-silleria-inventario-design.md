# Sillería en la página de inventario

> **Superado el mismo día.** Jair descartó la rejilla dentro de inventario; la sillería vive ahora en `catalogo.html`. Ver `2026-10-15-catalogo-design.md`. Se conservan las piezas, los textos y las imágenes `img/silla-*.webp`.

Fecha: 15-oct-2026. Aprobado por Jair en la sesión.

## Contexto

El cliente mandó por WhatsApp (26-sep-2026) once fotos de sillería sin fondo con el nombre de cada pieza. El doc del kick-off pide que el catálogo sea accesible en la web y que use fotos sin fondo. Hoy `inventario.html` tiene un showroom de seis paradas donde «Sillas» es una sola tarjeta con tres fotos intercambiables; once sillas no caben ahí.

## Decisión

Sección nueva `#silleria` en `inventario.html`, entre el showroom y la llamada final a cotizar. Rejilla de tarjetas estilo hay.com con filtros por grupo. Sin precios por pieza (solo tenemos «sillas desde $1,490» de referencia y la regla es no inventar precios).

## Piezas y grupos

| Clave | Nombre del cliente | Grupo | Línea de uso |
|---|---|---|---|
| gerencial | Silla gerencial | oficina | Cabecera, soporte lumbar y brazos ajustables. Para quien pasa el día sentado. |
| ejecutiva | Silla ejecutiva | oficina | Respaldo alto de malla con cabecera. Presencia en la oficina de dirección. |
| secretarial | Silla secretarial | oficina | Respaldo medio y brazos fijos. La silla de todos los días. |
| operativa | Silla operativa | oficina | Ligera y económica, con malla transpirable. Para estaciones en bench. |
| industrial-alta | Silla industrial o de cajero, alta | industrial | Poliuretano lavable y aro reposapiés. Para caja, mostrador o laboratorio. |
| industrial-baja | Silla industrial o de cajero, baja | industrial | Poliuretano lavable con regatones. Para taller y producción. |
| visita | Silla de visita | espera | Base trineo cromada, sin ruedas. Frente al escritorio de quien atiende. |
| sillon-1 | Sillón de espera, 1 plaza | espera | Piel sintética y estructura metálica. Para recepción y sala de espera. |
| sillon-2 | Sillón de espera, 2 plazas | espera | La misma línea, para dos. Recepciones y lobbies. |
| comedor | Silla de comedor | comedor | Polipropileno apilable, fácil de limpiar. Para comedor de empleados. |
| mesabanco | Mesabanco escolar | comedor | Paleta y portalibros. Para capacitación y aulas. |

Filtros: Todas · Oficina · Espera y visita · Industrial · Comedor y escolar.

## Diseño

- **Cabeza**: ceja «Sillería · once modelos en inventario», h2 «Una silla para cada *puesto.*», bajada que remata con «Sillas desde $1,490 más IVA».
- **Tarjeta**: figura cuadrada blanca, borde `--linea`, radio `--radio`, foto `object-fit: contain` con aire; nombre en Poppins 500; línea de uso en 300; pie con enlace «Cotizar» a `wa.me` con el nombre del modelo en el texto. Zoom suave al hover.
- **Rejilla**: 2 columnas en 390 px, 3 desde 760 px, 4 desde 1000 px.
- **Showroom**: la tarjeta «Sillas» cambia sus tres fotos por gerencial, ejecutiva y operativa, y agrega el enlace «Ver las once sillas» a `#silleria`.
- **JS**: filtros con botones `aria-pressed`, ocultan tarjetas con `hidden`; sin animación si `prefers-reduced-motion`.
- **Imágenes**: `img/silla-<clave>.webp`, 1200 px, cuadradas, fondo blanco. Script de conversión fuera del repo.

## Verificación

Capturas 390 × 844 y 1440 × 900 con Edge sin ventana; sin scroll horizontal; once enlaces de WhatsApp con el modelo correcto; filtros con teclado.

## Fuera de alcance

Precios por pieza, página propia de sillas, el defecto del wordmark duplicado en capturas automatizadas, la variante menta del deck.
