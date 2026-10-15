# OfficeTure · sitio web

Sitio informativo de **OfficeTure by Bryan López**, mobiliario de oficina en San Nicolás de los Garza, N. L.
Propuesta preparada por Top Digital, octubre de 2026. Estático, sin framework ni dependencias.

## Estructura

```
index.html        portada (video, nosotros, proyectos, proceso, redes, proveedores, contacto)
catalogo.html     catálogo completo en cuatro capítulos: escritorios, sillería, almacenaje y equipamiento
inventario.html   línea I, entrega inmediata: showroom de seis paradas
equipa.html       línea II, equipamiento: maqueta «Arma tu oficina»
css/estilo.css    estilos, mobile first (390 px) con breakpoints 560 / 760 / 900 / 1000 px
js/app.js         barra, menú móvil, aparición al hacer scroll, showroom (vitrina fija / carrusel), configurador por áreas y formularios → WhatsApp
js/espacio.js     pestaña «Equipa tu oficina»: maqueta SVG animada que se arma según el número de personas y manda la oficina por WhatsApp
img/              fotos reales del cliente en WebP (máx. 1600 px), logos PNG con transparencia, favicon, og.jpg
fonts/            Poppins woff2 (300 / 300i / 400 / 400i / 500 / 500i / 600 / 700)
CLAUDE.md         contexto del cliente, marca y reglas de trabajo
```

## Ver en local

Cualquier servidor estático sirve. Por ejemplo:

```
npx serve .
```

Abrir `index.html` directo desde el disco también funciona, pero las fuentes y el mapa cargan mejor por HTTP.

## Publicar

Proyecto estático en Vercel, sin configuración: importar el repo y publicar.
Cuando el cliente compre dominio hay que cambiar la etiqueta `og:image` a la URL absoluta.

## Pendientes antes de publicar

Los textos, precios y fotos son propuesta y se afinan con el cliente. Ver la lista de pendientes en `CLAUDE.md`.
