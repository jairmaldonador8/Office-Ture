# Barra con logo que se encoge al hacer scroll

Fecha: 14-oct-2026 · Referencia: hay.com (clase `header-minimized`, logo con `transform: scale`).

## Qué se quiere

Que el sello de OfficeTure arranque grande y centrado en una barra alta y transparente, y que al bajar se encoja de forma continua, ligado al scroll, hasta el tamaño compacto actual mientras la barra se adelgaza. Al subir vuelve a crecer. Mismo comportamiento en portada, inventario y equipa.

## Diseño

- **Sin cambios de marcado.** Se reutilizan `.barra`, `.barra-in` y `.logo` en las tres páginas.
- **Una variable, `--p`,** de 0 (arriba) a 1 (compacta), la escribe `app.js` en `#barra` dentro de `requestAnimationFrame`. Tramo: los primeros 260 px de scroll, con easing ease-out.
- **CSS deriva todo de `--p`:** altura de la barra (`calc`) y escala del logo (`transform: scale`, origen centro). El logo conserva su caja de 34 px, así el grid de tres columnas no se mueve. Una transición corta en `transform` y `height` suaviza los saltos de rueda de ratón.
- **Tamaños.** Móvil: barra 92 → 64 px, logo 48 → 32 px. Escritorio (≥1000 px): barra 120 → 68 px, logo 76 → 34 px (entre 1000 y 1200 px se limita a 64 px para no chocar con los menús).
- **Fondo sólido** (`.solida`) se conserva como hoy: en portada al terminar el hero; en interiores a partir de 24 px de scroll.
- **Movimiento reducido:** `--p` salta entre 0 y 1 sin interpolar, sin transición.

## Verificación

Capturas con Playwright en 390 × 844 y 1440 × 900 arriba y a 400 px de scroll; sin scroll horizontal; menú móvil sigue funcionando.
