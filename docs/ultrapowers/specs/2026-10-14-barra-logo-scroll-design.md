# Barra con logo que se encoge al hacer scroll

Fecha: 14-oct-2026 · Referencia: hay.com (clase `header-minimized`, logo con `transform: scale`).

## Qué se quiere

Que el sello de OfficeTure arranque grande y centrado en una barra alta y transparente, y que al bajar se encoja de forma continua, ligado al scroll, hasta el tamaño compacto actual mientras la barra se adelgaza. Al subir vuelve a crecer. Mismo comportamiento en portada, inventario y equipa.

## Diseño

- **Sin cambios de marcado.** Se reutilizan `.barra`, `.barra-in` y `.logo` en las tres páginas.
- **Una variable, `--p`,** de 0 (arriba) a 1 (compacta), la escribe `app.js` en `#barra` dentro de `requestAnimationFrame`. Tramo: los primeros 260 px de scroll, con easing ease-out.
- **Solo se mueve el sello** (ajuste del 14-oct, segunda ronda): la barra mide 76 px fijos; el logo cambia con `transform: scale` (origen centro) y un margen lateral que reserva el ancho del sello grande, así los menús no se mueven. Una transición corta en `transform` suaviza los saltos de rueda de ratón.
- **Menús centrados como en HAY:** los enlaces de la izquierda se alinean pegados al sello y los de la derecha también; solo el botón Cotizar queda en el extremo derecho.
- **Tamaños.** Móvil: logo 46 → 32 px. Escritorio: 34 px compacto; grande 41 px (≥1000), 51 px (≥1200) y 60 px (≥1300).
- **Fondo sólido** (`.solida`) se conserva como hoy: en portada al terminar el hero; en interiores a partir de 24 px de scroll.
- **Movimiento reducido:** `--p` salta entre 0 y 1 sin interpolar, sin transición.

## Verificación

Capturas con Playwright en 390 × 844 y 1440 × 900 arriba y a 400 px de scroll; sin scroll horizontal; menú móvil sigue funcionando.
