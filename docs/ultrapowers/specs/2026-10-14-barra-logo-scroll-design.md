# Barra con logo que se encoge al hacer scroll

Fecha: 14-oct-2026 · Referencia: hay.com (clase `header-minimized`, logo con `transform: scale`).

## Qué se quiere

Que el sello de OfficeTure arranque grande y centrado en una barra alta y transparente, y que al bajar se encoja de forma continua, ligado al scroll, hasta el tamaño compacto actual mientras la barra se adelgaza. Al subir vuelve a crecer. Mismo comportamiento en portada, inventario y equipa.

## Diseño (tercera ronda, 14-oct: copia del esquema real de hay.com)

- **Marcado nuevo en las tres páginas:** `.barra-in` contiene una fila `.menu` con los seis enlaces centrados y, debajo, `.barra-fila` con el botón de menú (izquierda), el sello (centro) y Cotizar (derecha).
- **Una variable, `--p`,** de 0 (arriba) a 1 (compacta), la escribe `app.js` en `#barra` dentro de `requestAnimationFrame` durante los primeros 260 px de scroll, con easing ease-out. A partir de 0.5 añade la clase `compacta`.
- **Escritorio (≥1000 px).** Arriba: fila de enlaces de 46 px y fila del sello de 92 px con el logo a 60 px. Al bajar la fila de enlaces pierde altura y opacidad hasta desaparecer, el sello baja a 34 px y la fila a 68 px, y aparece el botón de menú a la izquierda: queda una barra compacta con menú, sello y Cotizar. El botón abre el mismo menú a pantalla completa del móvil, centrado a 760 px.
- **Dirección del scroll (cuarta ronda).** En escritorio, bajando, el sello se funde (opacidad 0 y escala .6) y el círculo del menú ocupa su lugar en el centro, desplazado con `--dx` (distancia de la columna izquierda al centro, la mide `app.js`). En cuanto se sube, `app.js` pone la clase `subiendo` (umbral de 3 px): el círculo se desliza a la izquierda y el sello vuelve. Al llegar arriba el círculo se desvanece.
- **Botón de menú en escritorio (quinta ronda).** Ya no es el círculo con dos líneas: es el isotipo nuevo como SVG en línea (`<symbol id="i-iso">` en el sprite de cada página), 40 px, en marfil sobre la foto y en terracota cuando la barra es sólida o en interiores. Al abrir el menú se oculta y vuelve la X. En móvil se conserva el botón de dos líneas.
- **Móvil.** No hay fila de enlaces; la barra mide 76 px fijos y solo se encoge el sello, de 46 a 32 px.
- **Menú abierto.** La barra pasa encima del menú, transparente y en marfil, para que el sello y la X se vean sobre el oliva.
- **Fondo sólido** (`.solida`) se conserva como hoy: en portada al terminar el hero; en interiores a partir de 24 px de scroll.
- **Movimiento reducido:** `--p` salta entre 0 y 1 sin interpolar ni transiciones.

## Verificación

Capturas con Playwright en 390 × 844 y 1440 × 900 arriba y a 400 px de scroll; sin scroll horizontal; menú móvil sigue funcionando.
