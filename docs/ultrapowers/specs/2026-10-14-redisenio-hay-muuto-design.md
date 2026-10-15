# Rediseño del sitio con el lenguaje de hay.com y muuto.com

Fecha: 14-oct-2026. Pedido: portada «más chida y más limpia» sobre el video, y el resto del sitio profesional, minimalista y muy visual, conservando la barra ya construida.

## Decisiones

- **Una sola superficie clara** (`--fondo:#f4f1ea`) en todo el sitio; sin bandas de color por sección. Los acentos quedan en fotos, botones terracota y dos tarjetas oliva (CTA de proceso y WhatsApp de contacto).
- **Esquinas casi rectas** (`--radio:4px`) y titulares en Poppins medium (500) en lugar de semibold, con tamaños más contenidos (`h2` 30 a 54 px).
- **Portada:** video a toda pantalla, texto abajo a la izquierda (ceja, titular, bajada) y botones abajo a la derecha en escritorio. El velo solo oscurece la base y un poco la parte alta para la barra. Se quitó la línea de scroll y el texto centrado.
- **Video:** recortado desde el segundo 3.6 para saltar la cortinilla del logo sobre crema; así el titular se lee desde el primer cuadro y el bucle enlaza oficina con oficina.
- **Rejillas tipo Muuto:** foto arriba, línea fina, etiqueta en versalitas y título debajo (dos líneas, historia de proyecto, mosaico de 4, redes). Sin pies superpuestos ni botones flotantes sobre las fotos.
- **Nosotros:** cabeza a la izquierda, texto grande a la derecha, tres pilares en columnas con línea superior, una sola foto panorámica (21:9) con pie y la franja de cifras con líneas.
- **Formulario de proveedores** sin caja: campos con línea inferior, línea negra arriba. **Pie** sobre la misma superficie, separado por una línea.
- **Fuera el selector de propuesta de color** (Oliva / Azul) y el tema azul: con el logo terracota ya no aplica. Se eliminó del HTML, del CSS y de app.js.

## Verificación

Capturas en Edge a 1440 y 390 px, página completa, de index, inventario y equipa; sin scroll horizontal; todas las imágenes cargan por HTTP; el video correcto se reproduce en cada tamaño.
