# OfficeTure · contexto para el repo del sitio

Copiar este archivo como `CLAUDE.md` (o `CONTEXTO.md`) en el repo nuevo `officeture-web`.
Escrito el 9-oct-2026 por VITAstudio (Jair) a partir del trabajo hecho para Top Digital.

## Quién es el cliente

- **OfficeTure by Bryan López**: diseña y fabrica mobiliario de oficina en San Nicolás de los Garza, Nuevo León. Empresa 100 % mexicana.
- **Dos líneas de negocio**: (1) **entrega inmediata**, productos en inventario que se entregan en 1 a 2 días (escritorios lineales, semiejecutivos, archiveros, sillas operativas y ejecutivas); (2) **equipamiento de oficinas**, proyectos completos para empresas y corporativos (estaciones de trabajo, escritorios ejecutivos, salas de juntas, recepción, almacenaje). Entregan e instalan, armado o desarmado, en bodega o a domicilio.
- **Promesa comercial**: cotización en 30 minutos por WhatsApp. Precios de referencia (salen de su Facebook, más IVA): sillas desde $1,490 · escritorio lineal $2,750 · archivero vertical 4 gavetas $5,200 · semiejecutivo en L con librero $11,500 · ejecutivo con librero $14,200.
- **Clientes reales** (solo para contexto, NO se nombran en público): Torre Avalanz, Sumitomo, PROLEC, Norte Fiscal, Torre Sienna, MERASI y ~20 más. En el sitio se dice «+20 oficinas equipadas en Nuevo León».
- **Datos de contacto**: Salina Cruz #633, Col. Vicente Guerrero, San Nicolás de los Garza, N. L. · Tel. 81 1060 1298 · WhatsApp 81 2428 3124 (`https://wa.me/5218124283124`) · OfiTure@outlook.com · IG @officeturebl · FB `facebook.com/profile.php?id=61588972033875`. Horario: lunes a sábado (dato nuestro, validar).
- **Quién aprueba**: los dueños (Bryan). El contacto operativo es **Tadeo**, dueño de la agencia **Top Digital**, que es quien nos contrata. Top Digital le hace a OfficeTure los posts mensuales (6 anuncios en imagen, suben el día 15) y vendió el paquete de rebranding + sitio.

## Qué se vendió (sep-2026)

Propuesta de Top Digital aceptada: **branding (listo para que ellos mismos registren en el IMPI, clases 20 y 35) + sitio web informativo**, $20,000 + IVA en pago único, 3 semanas. Top Digital no hace el trámite del IMPI, entrega los archivos y orienta. El sitio debe cubrir: marca, redes, catálogo/productos, proyectos, «cobrar más» (posicionamiento de nivel) y **contacto para proveedores** (quieren que fabricantes de melamina, herrajes, sillería, estructura metálica y fletes los contacten). Dominio y hosting van aparte (~$2,500/año). El cliente aún no elige dominio.

## El rebranding (oct-2026)

La marca vieja era menta #a0ccc7 + azul #92b1e7 con un logo de silla en trazos; el cliente la consideró fea y pidió rebranding. Referencias de nivel: muebla.com.mx y boconcept.com (no se mencionan al cliente).

**Identidad nueva** (deck «Somos Top Digital - OfficeTure Branding», 20 láminas, se presenta a los dueños el 9-oct-2026):

- **Logos**: dos isotipos, **el sello** (silla dentro de un círculo; va en la barra del sitio y como avatar) y **el sillón** (sillón suelto; marca de agua, menú móvil, cinta). Wordmark «OfficeTure». Pendiente que los dueños elijan el isotipo principal para el registro.
  - **Actualización 14-oct-2026**: el cliente entregó un **wordmark «OfficeTure®» en terracota `#c5532c`** (sin isotipo). Es el logo que usa el sitio en la barra (`img/wordmark-marfil.png` sobre foto, `img/wordmark-terracota.png` sobre fondo claro), en el pie, en el favicon (la «O») y en `og.jpg`. El acento `--madera` del CSS pasó a ese terracota. El cliente también entregó el **isotipo nuevo**: un círculo con una esquina en negativo (`img/isotipo-{terracota,marfil,oliva,sage}.png`); sustituye al sillón como marca de agua del menú, de la vitrina y de la tarjeta de WhatsApp, y es el favicon. La portada tiene una sección «Marca» (`#marca`) que muestra isotipo, logotipo, paleta y tipografía como adelanto del branding. Los SVG vectorizados del wordmark y el isotipo están en el Escritorio de Jair (OneDrive).
- **Paleta**: oliva `#2f3a2a` (fondo principal y texto fuerte, tinta `#1f241b`), sage `#8a9a72` (acentos, cejas; claro `#b7c2a3`), beige `#cbbda9`, marfil `#efeae0` (fondo claro; crema `#faf8f3`, marfil-2 `#f6f3ec`), madera `#b57a3e` (SOLO botones y una palabra en cursiva por título; hover `#9d6632`). Texto `#4a4f43`, tenue `#8a8c80`.
- **Tipografía**: el deck ya usa **solo Poppins** (semibold para titulares con tracking -.035em, light para texto, medium en versalitas con tracking .2em para etiquetas, Light Italic en madera para la palabra acento). El sitio v2 todavía está en Fraunces + Outfit: **hay que pasarlo a Poppins** para que quede parejo con el deck.
- **Tono de voz**: «Espacios que te acompañan.» (frase de marca) · «Diseño para una vida real.» · «Mobiliario para espacios reales.» Habla de personas y de cómo trabajan, no solo de muebles; frases cortas, segunda persona, sin tecnicismos; promete cosas concretas (30 minutos, 1 a 2 días, instalado); nunca grita (sin mayúsculas para vender ni signos de exclamación); una palabra en cursiva y madera por título, nada más. Pilares: humano, elegante, funcional.
- **Fotos**: reales del cliente, con filtro cálido en CSS (`--foto: sepia(.18) saturate(.92) contrast(1.04) brightness(.98)`). Evitar `nosotros.jpg` en portada (sale un trabajador con casco). Si se usan fotos de banco, la gente debe verse mexicana/latina.
- **Dos campañas** de referencia hechas con ChatGPT (sello / sillón): fachada, bolsa, etiqueta, tarjetas, laptop, post de IG. El sitio es **una mezcla de las dos**.

## El sitio v2 (lo que hay que migrar)

Fuente actual en `Top Digital - fuentes editables\officeture\v2\` (carpeta de OneDrive en el Escritorio de Jair):

- `cuerpo.html`: `<title>`, meta description, `<style>` con `@font-face` + `__ESTILO__`, y el cuerpo con marcadores `__IMG:ruta__`, `__FONT:archivo__`, `__WA__` (icono SVG de WhatsApp).
- `estilo.css` (~25 KB): variables en `:root`, mobile first (iPhone 390 px), breakpoints 560 / 760 / 900 / 1000 px.
- `build.js`: incrusta todo como data URI y saca un HTML autónomo de 4 MB + capturas con Playwright. **En el repo nuevo esto se sustituye por archivos sueltos**: `index.html`, `css/estilo.css`, `js/app.js`, `img/` (WebP, 1600 px máx.), `fonts/` (Poppins woff2 300/400/500/600/700 + 300i/400i/500i, están en `assets/fonts/v2/`).

**Secciones, en orden**: barra fija (sello + menú + botón Cotizar; se vuelve sólida marfil al bajar) · menú móvil a pantalla completa (oliva, sillón de marca de agua) · **portada** («Espacios que te *acompañan.*», bajada, botones «Cotización en 30 minutos» y «Ver catálogo»; `hero.jpg` en móvil y `proy-1.jpg` en escritorio) · cinta en movimiento (Natural · Elegante · Atemporal · Funcional · Humano con el sillón) · **01 Nosotros** («Diseño para una vida *real.*», tres pilares, cifras: 1 a 2 días, 30 min, +20 oficinas, 100 % mexicano) · **02 Catálogo** (dos líneas: entrega inmediata / equipamiento; 4 productos con precio; nota de precios de referencia) · **03 Proyectos** (mosaico de 5 fotos con pies: despacho, corporativo, recepción, empresa, proceso) · **04 Cómo trabajamos** (4 pasos) · **Síguenos** (IG, FB, WA + un post simulado) · **05 Proveedores** (lista de insumos + formulario que arma un mensaje y lo abre en WhatsApp, sin backend) · **06 Contacto** (dirección, teléfono, correo, horario + tarjeta oliva de WhatsApp) · pie con wordmark grande y nota «Propuesta de sitio preparada por Top Digital · octubre de 2026» · botón flotante de WhatsApp.

**JS**: barra sólida al pasar la portada, hamburguesa/menú móvil con `aria-expanded`, `IntersectionObserver` para `.aparece`, `enviarProveedor()` que abre `wa.me` con el texto del formulario. Respeta `prefers-reduced-motion`.

**Activos** (en `assets/officeture/` y `assets/officeture/v2/`): logos recortados con transparencia `circulo-{completo,iso}-{marfil,negro,oliva,sage}.png`, `sillon-{completo,iso}-{marfil,negro,oliva,sage}.png`, `wordmark-{marfil,negro}.png`; fotos reales `hero.jpg`, `nosotros.jpg`, `prod-1..4.jpg`, `proy-1..4.jpg`; recortes de las campañas `c1-*.jpg`, `c2-*.jpg`, `campana-1/2.jpg`. Las fotos originales del cliente están en el Drive de Tadeo, carpeta «Fotos OfficeTure» (id `1THk2PXWN24Gq46F-AFom4BLZCB-G9GaF`); se bajan por enlace directo `https://drive.google.com/uc?export=download&id=<id>` (algunas JPEG traen bytes extra: en sharp usar `failOn:'none'`).

## Rediseño del 14-oct-2026 (hay.com / muuto como referencia)

Una sola superficie clara `--fondo:#f4f1ea`, esquinas casi rectas (`--radio:4px`), titulares en Poppins medium, rejillas de foto con pie debajo. Portada con video a toda pantalla (`video/portada.mp4` 1080p60 y `video/portada-movil.mp4` 720p30, recortados desde el segundo 3.6 para saltar la cortinilla del logo; `app.js` elige según el ancho). El selector de propuesta de color y el tema azul se eliminaron. Detalle en `docs/ultrapowers/specs/2026-10-14-redisenio-hay-muuto-design.md`.

## Reglas de trabajo

- **Mobile first**: todo se revisa primero en iPhone (390 × 844) porque Tadeo y los dueños lo ven en el teléfono. Sin scroll horizontal, gutter de 20 px mínimo.
- **Nada de precios ni textos inventados**: los textos y precios actuales son propuesta; se afinan con el cliente antes de publicar. Dejar la nota del pie hasta que aprueben.
- **Español de México**, tuteo, sin anglicismos innecesarios, comillas « », sin signos de exclamación.
- **El sitio es activo del cliente**: repo privado hasta aprobación, proyecto propio en Vercel, dominio del cliente cuando lo compren. No mezclar con el CRM de Top Digital (repo TOP-DIGITAL-SYSTEM) ni con el sitio de la agencia.
- **Deck y branding** siguen en `Top Digital - fuentes editables` (deck en `decks/office-ture-branding/`); el repo del sitio no los necesita. El 14-oct-2026 el deck pasó a 18 láminas con el wordmark terracota y el isotipo nuevos (láminas 5 a 7 y mockups en 11 y 12 hechos en CSS; la versión anterior quedó en `deck-sello.html.bak`). Si el sitio cambia, hay que recapturar `assets/officeture/v2/web-*.jpg` (sirviendo el sitio por HTTP, con Edge para que cargue el video) y recompilar con `node decks/office-ture-branding/build.js`; las capturas van en las láminas 13 a 15.
- Vercel: proyecto estático, sin framework. Si se agrega formulario real o catálogo administrable, evaluar Supabase o un CMS después de la aprobación.

## Pendientes del cliente (9-oct-2026)

1. Elegir isotipo principal (sello o sillón) para el registro de marca.
2. Aprobar paleta y Poppins.
3. Elegir y comprar dominio.
4. Textos finales, precios vigentes y fotos de los productos de entrega inmediata (falta foto real del archivero).
5. Confirmar horario y qué WhatsApp recibe las cotizaciones y los proveedores.
