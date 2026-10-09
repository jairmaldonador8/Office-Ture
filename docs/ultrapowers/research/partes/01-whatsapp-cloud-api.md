# 01 · WhatsApp Cloud API: coexistencia, webhooks, envío, precios, cuenta y SDK

Investigación hecha el 9 de octubre de 2026 para el bot de ventas de OfficeTure (número 81 2428 3124, hoy en la app WhatsApp Business de Bryan; hosting en funciones serverless de Vercel, Node/TypeScript).

Convención: «Meta» = página oficial en developers.facebook.com o whatsappbusiness.com. Cuando un dato solo aparece en proveedores (BSP) o blogs, se marca como **no confirmado en Meta**. Las fechas entre paréntesis son la fecha que muestra la fuente o, si no la muestra, la fecha de consulta (9-oct-2026).

---

## Hallazgos

### 1. Coexistencia (app WhatsApp Business + Cloud API en el mismo número)

**Existe oficialmente y cómo se llama**

- Meta la documenta bajo el nombre «Onboard WhatsApp Business app users» dentro de Embedded Signup; la propia página dice que «is sometimes referred to as "Coexistence" in support channels and Partner documentation». El tipo de flujo en Embedded Signup se llama `whatsapp_business_app_onboarding` (desde v3, 29-may-2025, `coexistence` dejó de ser valor válido de `extras.featureType`).
  Fuente: Meta, Onboard WhatsApp Business app users (consultado 9-oct-2026) · Meta, Embedded Signup Versions (consultado 9-oct-2026) · Meta, WhatsApp changelog, entradas 11-feb-2025, 29-may-2025.
- Línea de tiempo oficial (changelog de Meta): 11-feb-2025 «Added ability for solution providers to onboard WhatsApp Business app users via Embedded Signup (aka "Coexistence")»; 5-may-2025 se agregaron números de India; 23-oct-2025 se agregaron Australia, Japón, Filipinas, Rusia, Corea del Sur, Turquía, EEE/UE y Reino Unido; 25-nov-2025 se agregaron los webhooks de edición y borrado de mensajes para coexistencia.

**Disponibilidad en México**

- Meta no publica una lista positiva de países. Lo que publica son las ampliaciones (arriba) y, según proveedores, las exclusiones. Las únicas exclusiones que siguen apareciendo en 2026 son Nigeria y Sudáfrica (WaliChat: «no está actualmente disponible para negocios en Nigeria y Sudáfrica», por código de país del número). México nunca ha aparecido en ninguna lista de exclusión y dos fuentes de terceros lo nombran entre los mercados del beta inicial (India, México, Brasil, Indonesia, EE. UU., Hong Kong, Singapur).
  Fuentes: WaliChat, WhatsApp Business App Coexistence (2026) · Gallabox, WhatsApp Coexistence update (2026) · ChakraHQ, Coexistence beta to worldwide (actualizado jul-2026).
- **Conclusión**: México (+52) está soportado por eliminación y por evidencia de proveedores, pero **no hay una frase de Meta que diga «México»**. La prueba definitiva es correr el Embedded Signup con el número real: si el país no es elegible, el flujo lo rechaza en el primer paso.

**Requisitos (Meta)**

- «You must already be a Solution Partner or Tech Provider.» No hay ruta «directa» desde el App Dashboard para conectar un número que vive en la app: el único mecanismo documentado es Embedded Signup «with session logging», implementado por la app de un Tech Provider/Solution Partner.
- App WhatsApp Business versión **2.24.17 o superior**.
- Embedded Signup **v4** (vigente desde 8-oct-2025). «Embedded signup v2 will be deprecated on October 15, 2026»; v3 y las vistas previas caducan en octubre de 2026.
- Webhook capaz de procesar `history`, `smb_app_state_sync` y `smb_message_echoes`, además de `messages` y `account_update`.
- No se exige Meta Business verificado para onboardear (la página no lo menciona); la verificación sí afecta límites de mensajería (ver sección 5).
  Fuentes: Meta, Onboard WhatsApp Business app users · Meta, Embedded Signup Versions · Meta, Get started for Tech Providers.

**Limitaciones conocidas (tabla oficial de Meta, consultada 9-oct-2026)**

- Throughput: «business phone numbers that are in use with both the WhatsApp Business app and Cloud API have a fixed throughput of 20 mps» (un número normal de Cloud API tiene 80 mps por defecto).
- Grupos: «Group chats will not be synchronized.» Siguen funcionando en la app, pero la API no los ve.
- Listas de difusión: «Broadcast lists will be disabled. Existing Broadcast lists will become read-only.»
- Catálogo, pedidos, estados, perfil de negocio, respuestas rápidas, etiquetas, mensajes de ausencia, canales: «No change» en la app, «Not supported» en Cloud API (no se sincronizan ni se gestionan por API).
- Se apagan en chats 1:1: mensajes temporales, «ver una vez» y ubicación en tiempo real.
- Llamadas de voz y video: siguen en la app, no soportadas por API.
- Dispositivos vinculados: hasta 4 compañeros; «All companion clients are supported, except for WhatsApp for Windows and WhatsApp for WearOS». Al onboardear «all companion apps will be unlinked from the account» y hay que volver a vincular. Los mensajes enviados desde un compañero no soportado **no** generan webhook.
- Historial: se puede sincronizar hasta 6 meses (fases 0 a 2, día 0 a 180) **una sola vez** y dentro de las **24 h** posteriores al onboarding; si se pierde la ventana hay que offboardear y repetir. Los IDs de media del historial solo llegan para los primeros 14 días. Si el negocio rechaza compartir el historial, llega un webhook con error `2593109`.
- Ventana de servicio y precios: «Messages sent from the WhatsApp Business app do not affect Cloud API windows or pricing.» La ventana de 24 h solo se abre cuando el usuario escribe después del onboarding. Lo que Bryan mande desde la app sigue siendo gratis; lo que mande el bot por API se cobra con tarifa Cloud API.
- Inactividad: `account_update` con `PARTNER_REMOVED` y `reason` = `PRIMARY_INACTIVITY` («primary device inactive for approximately 14 days») o `COMPANION_INACTIVITY` (~30 días). Otros motivos: `ACCOUNT_DISCONNECTED`, `BUSINESS_DOWNGRADE`, `CHANGE_NUMBER`, `USER_RE_REGISTERED`. Proveedores lo resumen como «abrir la app al menos cada 14 días» (algunos dicen 13; Meta dice ~14).
- Error `131060` en webhook de `unsupported`: esperable en primeros mensajes o desde compañeros no soportados.
- Latencia del eco: Meta no publica cifra. Solo dice «Messages sent and received are mirrored between the Cloud API and WhatsApp Business app» y que el onboarding «can take several minutes». **No confirmado**: proveedores reportan segundos.
  Fuente: Meta, Onboard WhatsApp Business app users (consultado 9-oct-2026).

**Cómo llegan al webhook los mensajes que Bryan manda desde la app**

- Campo de suscripción: **`smb_message_echoes`**. Se dispara cuando «A business customer with a WhatsApp Business app number, onboarded by a partner, sends a message from the WhatsApp Business app or a companion device», y también cuando borra (`type: "revoke"`, con `revoke.original_message_id`) o edita (`type: "edit"`, con `edit.original_message_id` y `edit.message`) un mensaje.
- Forma del payload (ejemplo oficial): `object: "whatsapp_business_account"` → `entry[].changes[].field: "smb_message_echoes"` → `value.message_echoes[]` con `from` (el número del negocio), `to` (el usuario), `id` (`wamid.…`), `timestamp` (string; Meta aclara que es la hora en que se disparó el webhook, no la de envío) y `type` + objeto del tipo (`text.body`, `image.{caption,mime_type,sha256,id,url}`, etc.).
- Meta exige: «You must display these in your app's message thread history.»
  Fuente: Meta, smb_message_echoes webhook reference (consultado 9-oct-2026).
- Los mensajes que el bot manda por API «appear in the WhatsApp Business app automatically» (360dialog; Meta lo expresa como «mirrored»).

**¿Se puede desactivar y volver atrás?**

- Sí. El dueño lo hace en la app: **Ajustes › Cuenta › Business Platform › (plataforma) › Desconectar**. Meta lo documenta como «Disconnect Account»; llega `account_update` con `PARTNER_REMOVED`. El número sigue funcionando en la app con sus chats intactos; solo se pierde el enlace con la API.
- No se puede usar el endpoint Deregister de la API para un número en coexistencia.
- Si el dueño cambia de teléfono o re-registra la app, Meta offboardea automáticamente (`ACCOUNT_OFFBOARDED`) y ofrece un re-onboarding en segundo plano con opt-in pre-marcado; llega `ACCOUNT_RECONNECTED` «typically within a few minutes». Mientras tanto hay que pausar envíos por API.
- **No confirmado en Meta**: varios proveedores (UChat, SleekFlow) dicen que si un número se desconecta de un partner y se quiere conectar con otro, conviene esperar semanas; y que un número no puede estar en dos plataformas a la vez.
  Fuentes: Meta, Onboard WhatsApp Business app users · Meta, Reconnect offboarded coexistence clients (consultado 9-oct-2026) · WaliChat · Superchat/Spur help centers (2026).

### 2. Webhook de mensajes

**Versión vigente de Graph API**

- La versión más reciente es **v26.0** (lanzada 29-jul-2026). Los ejemplos de la documentación de WhatsApp usan **v25.0**; el changelog de WhatsApp todavía referencia v24.0 (8-oct-2025) para cambios de campos de límites. Cada versión vive ~2 años (v20.0 expira 24-sep-2026).
  Fuentes: Meta, Graph API changelog v26.0 · Meta, Introducing Graph API v25 (18-feb-2026) · Meta, Typing indicators / Media (ejemplos v25.0).

**Estructura del payload (Meta, Webhooks reference overview)**

- `object: "whatsapp_business_account"` → `entry[{ id (WABA), changes[{ field: "messages", value }] }]`.
- `value.messaging_product: "whatsapp"`, `value.metadata.{display_phone_number, phone_number_id}`.
- Entrantes: `value.contacts[{ profile.name, wa_id }]` y `value.messages[{ from, id ("wamid.…"), timestamp (string Unix), type, <objeto del tipo>, context?, referral? }]`.
- Salientes: `value.statuses[{ id, status (sent|delivered|read|failed|played), timestamp, recipient_id, conversation.{id, origin.type}, pricing.{billable, pricing_model, category} }]`. Hasta 3 statuses por mensaje.
- Errores: de sistema/cuenta en `value.errors`; de mensaje entrante en `messages[].errors` con `type: "unsupported"`; de salida en `statuses[].errors`.
- Payload hasta **3 MB**. Meta puede agrupar notificaciones (hasta 1000 en Graph API), pero no lo garantiza: procesar cada `entry`/`change` por separado.
  Fuentes: Meta, Webhooks reference (messages) · Meta, WhatsApp webhooks overview · Meta, Graph API Webhooks getting started (consultados 9-oct-2026).

**Tipos de mensaje (ejemplos oficiales)**

- `text`: `text.body`.
- `image` / `audio` / `video` / `document` / `sticker`: `{ id, mime_type, sha256, caption?, filename? }` y desde 16-oct-2025 también `url` (changelog). El `id` se usa con el endpoint de media (sección 3).
- `location`: `location.{latitude, longitude, name?, address?}`.
- `interactive`: `interactive.type` = `button_reply` → `button_reply.{id, title}`; `list_reply` → `list_reply.{id, title, description}`; respuestas de Flows llegan como `nfm_reply` (no cubierto en la página consultada).
- `reaction`: `reaction.{message_id, emoji}`; si el usuario quita la reacción llega el webhook sin `emoji`; no se envían reacciones a mensajes de más de 30 días.
- `button` (respuesta a botón de plantilla), `contacts`, `order`, `unsupported`.
- `context.{from, id}` cuando el usuario responde citando un mensaje; `context.forwarded` / `frequently_forwarded` cuando reenvía.
  Fuentes: Meta, Webhook reference: reaction / interactive / text (consultados 9-oct-2026) · 360dialog, Webhook reference (espejo del formato de Meta).

**`referral` para clics desde anuncios Click-to-WhatsApp (Meta, Webhook reference: text message, consultado 9-oct-2026)**

- El objeto `referral` va dentro del mensaje y «only included if message sent via a Click to WhatsApp ad».
- Campos: `source_url` («Click to WhatsApp ad URL»), `source_id`, `source_type` (`ad` o `post`), `headline` («Click to WhatsApp ad headline»), `body`, `media_type` (`image` | `video`), `image_url` | `video_url`, `thumbnail_url`, `ctwa_clid` («Click to WhatsApp ad click ID»), `welcome_message` (texto de bienvenida si lo había).
- Advertencia oficial: `ctwa_clid` «is omitted entirely for messages originating from an ad in WhatsApp Status». Un reporte en Evolution API muestra `ctwa_clid` vacío en algunos payloads: tratar como opcional.
- `ctwa_clid` es lo que se reenvía a la Conversions API (`action_source: business_messaging`, `messaging_channel: whatsapp`) para atribuir la conversión al anuncio.
  Fuentes: Meta, Webhook reference text · Meta, WhatsApp changelog (entrada «Added ctwa_clid property to referral object») · Meta, Automatic Events API · Evolution API issue #2645 (2026).

**Verificación de firma**

- Encabezado `X-Hub-Signature-256` con valor `sha256=<hex>`. Es un **HMAC-SHA256 del cuerpo con el App Secret**. Meta: «You don't have to validate the payload, but you should.»
- Detalle que rompe implementaciones: la firma se calcula sobre el payload con **unicode escapado** (`äöå` → `äöå`) y hex en minúsculas. En la práctica, firmar los **bytes crudos del body tal como llegan** funciona porque Meta ya los manda escapados; lo que falla es re-serializar el JSON parseado. En Vercel hay que leer el body crudo (`await request.text()` / `req.body` como Buffer) antes de parsear. Comparar con `crypto.timingSafeEqual`.
- Verificación inicial (GET): `hub.mode=subscribe`, `hub.verify_token`, `hub.challenge`; responder el `hub.challenge` en texto plano si el token coincide.
  Fuentes: Meta, Graph API Webhooks getting started (consultado 9-oct-2026; menciona certificado mTLS `meta-outbound-api-ca-2025-12.pem` vigente desde 15-abr-2026) · Meta, Messenger Platform webhooks (texto sobre unicode escapado).

**Reintentos y deduplicación**

- WhatsApp: «If your endpoint returns an HTTP status code other than 200 … Meta retries with decreasing frequency until the request succeeds, for up to 7 days.» Los reintentos van a **todas** las apps suscritas a la WABA y «can result in duplicate webhook notifications». (La página genérica de Graph API habla de 36 h; para WhatsApp manda la de 7 días.)
- Tiempo de respuesta: Meta no publica un timeout en la página de WhatsApp. La de Messenger exige 200 «within 5 seconds or less». Asumir ese límite.
- Deduplicar por `messages[].id` (`wamid`) y por `statuses[].id` + `status`. No hay garantía de orden: ordenar por `timestamp`.
- Algunos webhooks no se envían si la app está en modo Development: poner la app en **Live**.
  Fuentes: Meta, WhatsApp webhooks overview · Meta, Set up webhooks (lista de 19 campos de suscripción) · Meta, Messenger webhooks (consultados 9-oct-2026).

### 3. Envío

- Endpoint: `POST https://graph.facebook.com/v25.0/{phone_number_id}/messages` con `Authorization: Bearer <token>` y siempre `"messaging_product": "whatsapp"`. Respuesta: `messages[0].id` (wamid) y `contacts[0].wa_id` (puede diferir del número marcado; usar `wa_id` para seguimiento).
- **Marcar como leído + «escribiendo»** en una sola llamada (disponible desde 8-abr-2025):

  ```json
  { "messaging_product": "whatsapp", "status": "read",
    "message_id": "<wamid entrante>", "typing_indicator": { "type": "text" } }
  ```

  «The typing indicator is dismissed when you send your response or after 25 seconds, whichever comes first.» Meta pide usarlo solo si de verdad se va a responder. Marcar como leído también marca los anteriores.
  Fuente: Meta, Typing indicators (consultado 9-oct-2026, ejemplos v25.0).
- **Imágenes por URL**: `"type": "image", "image": { "link": "<URL pública>", "caption": "…" }`. Meta lo marca **«not recommended»**; prefiere subir una vez con `POST /{phone_number_id}/media` (multipart, `messaging_product=whatsapp`, `file`, `type`) y mandar por `image.id` (el ID dura 30 días). JPEG/PNG, máx. 5 MB, 8-bit RGB/RGBA, caption ≤ 1024 caracteres.
  Fuente: Meta, Image messages · Meta, Media reference (consultados 9-oct-2026).
- **Descargar media que manda el cliente**: `GET /v25.0/{media_id}` devuelve `{ url, mime_type, sha256, file_size, id }`; luego `GET <url>` **con el mismo Bearer** (sin token falla). «Media URLs expire after 5 minutes»: pedir una nueva si caducó; un 404 también significa «vuelve a pedir la URL». El `media_id` de un webhook vive **7 días**. Tamaños: audio/video 16 MB, imagen 5 MB, documento 100 MB; entrantes > 100 MB dan error `131052`. Audio entrante típico: `audio/ogg; codecs=opus`.
  Fuente: Meta, Media reference (consultado 9-oct-2026).
- **Límites de tasa**:
  - Throughput: 80 mps por número normal; **20 mps fijos en coexistencia**.
  - «Pair rate limit»: a un mismo usuario, 1 mensaje cada 6 s en promedio (~600/h); ráfaga de hasta 45 en 6 s pero se descuenta de cuota futura; exceder da `131056`.
  - Llamadas Graph a endpoints de gestión (plantillas, phone_numbers…): 200/h por app por WABA (5000/h si la WABA tiene número registrado).
  - Reintento recomendado por Meta ante fallo: espera `4^X` segundos, X desde 0.
  - Límite de mensajería (usuarios únicos fuera de ventana por 24 h) es otro concepto: ver sección 5.
  Fuente: Meta, Cloud API overview (consultado 9-oct-2026) · Meta, Onboard WhatsApp Business app users.

### 4. Ventana de 24 h, plantillas y precios

**Reglas vigentes (Meta, Pricing, consultado 9-oct-2026)**

- Desde **1-jul-2025** Meta cobra **por mensaje de plantilla entregado**, no por conversación.
- Ventana de servicio (CSW) de 24 h: se abre/renueva cada vez que el usuario escribe. Dentro de ella se pueden mandar mensajes libres (texto, imagen, interactivos) **hoy gratis**; fuera de ella solo plantillas aprobadas.
- Punto de entrada gratuito (FEP): si el usuario llega por anuncio Click-to-WhatsApp o botón de página de Facebook (desde Android/iOS) y el negocio responde dentro de 24 h, se abre una ventana de **72 h** en la que todo (incluidas plantillas) es gratis. **No confirmado en Meta**: Wati y otros reportan que desde el 28-sep-2026 esa ventana pasó a **7 días**; la página de precios de Meta consultada hoy sigue diciendo 72 h. Verificar en el changelog antes de contar con ello.
- Categorías de plantilla: **MARKETING, UTILITY, AUTHENTICATION**. «Service» no es una categoría de plantilla; es la etiqueta que llevan los mensajes libres dentro de la ventana (`pricing.category: "service"`).

**Cambio del 1-oct-2026 (Meta, Upcoming pricing updates for Meta Business Agent, service and utility messages, consultado 9-oct-2026)**

- «Effective October 1, 2026, Meta will charge on a per-message basis for service messages» (mensajes libres dentro de la ventana, gratis desde 1-nov-2024).
- «Meta will charge for utility messages sent in response to users within an open 24-hour customer service window» (gratis desde 1-jul-2025).
- «By market, rates for service messages are the same as the rates for utility and authentication messages.» «Meta does not offer volume tiers for service messages.»
- «The 72-hour free entry point window is unchanged for message delivery.» Los mensajes del usuario hacia el negocio siguen sin costo.
- **No confirmado en Meta**: la cuota de **1,000 mensajes de servicio gratis por número y por mes** (sin acumulación) la reportan Wati, YCloud, Goeva, respond.io y PickyAssist, pero **no aparece en la página oficial consultada**. Tampoco aparece en Meta el plazo del 30-sep-2026 para tener método de pago (YCloud). Tratar ambas cosas como probables pero sin fuente primaria.
- Meta Business Agent (su propio agente de IA) se cobra por token (USD 2.00 por millón, ~4-5 ¢ por mensaje) desde 1-ago-2026; **no aplica** a un bot propio como el nuestro. La política de «AI Providers» (cobro por mensaje no-plantilla) aplica solo a asistentes de IA de propósito general en mercados donde Meta está obligada legalmente; desde 13-may-2026 solo Brasil. Tampoco aplica a OfficeTure.

**Tarifas para México (+52)**

- Meta publica las tarjetas en CSV/PDF (USD y MXN) desde la página de precios, pero son archivos y la tabla interactiva de whatsappbusiness.com carga por JavaScript; no pude extraer la cifra directamente de Meta. Dos fuentes independientes que citan las tarjetas de Meta descargadas el 17-sep-2026 coinciden:

  | Categoría | Hasta 30-sep-2026 | Desde 1-oct-2026 |
  |---|---|---|
  | Marketing | USD 0.0305 (≈ MXN 0.56) | **USD 0.0397** (≈ MXN 0.73) |
  | Utility fuera de ventana | USD 0.0085 (≈ MXN 0.16) | USD 0.0085 |
  | Utility dentro de ventana | gratis | USD 0.0085 |
  | Authentication | USD 0.0085 | USD 0.0085 |
  | Service (texto libre en ventana) | gratis | USD 0.0085 (tras la cuota gratis, si existe) |

  Fuentes: Goeva, WhatsApp API pricing Mexico («Data verified on September 17, 2026») · YCloud, Pricing update effective October 1, 2026 (4-sep-2026; tabla de aumentos de marketing: México 0.0305 → 0.0397, +30 %). Cifras más altas en otros blogs (0.0436 marketing, Aurora/Ominiflow) corresponden a tarjetas anteriores al 1-oct-2025, cuando Meta bajó marketing en México.
- Hay IVA 16 % encima si se factura en México, y el BSP (si lo hubiera) cobra margen aparte.

**Aprobación de plantillas**

- Revisión automática al crear o editar; «Review can take up to 24 hours». Estados: APPROVED, In-Review/PENDING, REJECTED, PAUSED, DISABLED. Límite: 250 plantillas por WABA si el portafolio no está verificado; 6,000 si está verificado y tiene nombre para mostrar aprobado; 100 creaciones/h.
- Recategorización: desde 9-abr-2025 una plantilla enviada como UTILITY que Meta juzga MARKETING se aprueba directamente como MARKETING (no se rechaza). Meta puede recategorizar aprobadas con 1 día de aviso. Apelación dentro de 60 días.
  Fuentes: Meta, Message templates · Meta, Template categorization (consultados 9-oct-2026).

**Qué categoría toca**

- **Recordatorio de cotización al cliente** («te mandamos la cotización #123, ¿la revisaste?»): Meta no da ejemplo de cotizaciones. Si el texto es específico del usuario, no promocional y responde a algo que él pidió (la cotización), cabe en **UTILITY** como «continuing a conversation the user requested» / account alert. En cuanto incluya descuento, urgencia («aprovecha», «solo hoy») o invitación a comprar, Meta la clasifica **MARKETING**. Recomendación: redactarla neutra, con número de cotización y pregunta cerrada, y aceptar que Meta puede aprobarla como MARKETING (USD 0.0397 vs 0.0085).
- **Alerta interna al dueño** (bot → número personal de Bryan): es un mensaje de negocio a usuario y se cobra igual. Si Bryan escribió al bot en las últimas 24 h es mensaje de servicio; si no, hace falta plantilla. Una plantilla «Nuevo lead: {{nombre}} pide {{producto}}» es informativa y específica → **UTILITY** (account alert). Alternativa gratis y sin plantilla: que las alertas vayan por otro canal (correo, Telegram, push) o que los dueños manden un «ok» diario al bot para mantener la ventana abierta (frágil).
  Fuente: Meta, Template categorization (consultado 9-oct-2026).

### 5. Requisitos de cuenta

- **Portafolio de negocio (Meta Business)**: obligatorio como contenedor de la WABA. Verificarlo lo hace «only someone with an Admin role in the Business» del portafolio del **cliente** (OfficeTure), con documentos del negocio; Meta no publica tiempos. Un partner puede verificar al cliente (partner-led business verification) si onboardeó.
- **Límites de mensajería** (usuarios únicos fuera de ventana cada 24 h, por portafolio): «Newly created business portfolios have a messaging limit of 250» → 2,000 (al verificar el negocio, o al enviar 2,000 entregados con calidad alta en 30 días) → 10,000 → 100,000 → ilimitado (escala automática en 6 h si se usó la mitad del límite en 7 días con calidad alta). Para OfficeTure 250/día sobra.
- **Nombre para mostrar**: en coexistencia el número conserva el perfil de la app (Meta lista «Business profile» como «No change»). La revisión automática del nombre ocurre al subir de límite; cambios: 10 por 30 días, con re-registro en 14 días. No pude confirmar en Meta si un número de coexistencia pasa por revisión de nombre; proveedores indican que sí puede fallar la cuenta oficial (palomita) para estos números (**no confirmado**).
- **Política de bots**: la Política de mensajes de WhatsApp Business (actualizada **23-sep-2026**) permite automatización dentro de la ventana de 24 h («You may use automation when responding during the 24-hour window») y exige «prompt, clear, and direct escalation paths»: transferencia a humano, teléfono, correo, soporte web, visita o formulario. **No exige** declarar que es un bot ni etiquetar la IA. Exige opt-in explícito antes de iniciar conversaciones con plantillas (el consentimiento debe mencionar el nombre del negocio).
- **Permisos**: `whatsapp_business_messaging` (enviar/recibir y webhooks `messages`) y `whatsapp_business_management` (gestión de WABA, plantillas, resto de webhooks). Acceso **Standard** se otorga automático a apps de tipo Business y basta para operar WABAs **propias** del portafolio dueño de la app («you do not need Advanced access or app review» como Direct Developer). Acceso **Advanced** (App Review, ~24 h, con video por permiso y explicación escrita, negocio verificado del desarrollador) es obligatorio para tocar WABAs de **otros** portafolios; sin él, «API calls return error code 200».
- **Escenario Top Digital**: coexistencia exige Tech Provider/Solution Partner → la app de Embedded Signup debe ser de un negocio **verificado** con Advanced access en ambos permisos. Dos caminos:
  1. **Top Digital como Tech Provider**: verifica su propio Meta Business, pasa App Review, implementa Embedded Signup v4 con `whatsapp_business_app_onboarding`, y onboardea el número de OfficeTure. Es el camino «agencia administra el portafolio del cliente».
  2. **Usar un BSP** que ya tenga coexistencia (360dialog, YCloud, Wati, Kapso, etc.): el BSP corre el Embedded Signup y nos da token/webhook; cuesta margen mensual y nos ata a su API.
  Lo que **no** es posible según lo documentado: que OfficeTure, como Direct Developer con Standard access, conecte su propio número de la app desde el App Dashboard sin Embedded Signup.
- **Token**: en producción, token permanente de **System User** del portafolio dueño de la WABA con `whatsapp_business_messaging`, `whatsapp_business_management`, `business_management`. Si el onboarding lo hace Top Digital (Tech Provider), el token sale del Embedded Signup (business token del cliente) o de un System User del portafolio de Top Digital con acceso compartido a la WABA.
- **Método de pago** en la WABA antes de mandar plantillas en producción (y, según proveedores, antes del 1-oct-2026 para no perder mensajes de servicio).
  Fuentes: Meta, Business verification · Meta, Messaging limits · Meta, Display names · WhatsApp Business Messaging Policy (23-sep-2026) · Meta, App review for Solution Providers · Meta, Get started for Tech Providers · Meta, Get started (System User) (consultados 9-oct-2026).

### 6. SDK en Node/TypeScript

- **SDK oficial de Meta (`whatsapp` en npm, repo WhatsApp/WhatsApp-Nodejs-SDK)**: versión **0.0.5-Alpha**, repo **archivado el 7-jun-2023**, apunta a Graph v16.0. **Descartar.**
- **`whatsapp-api-js` (Secreto31126)**: versión **6.3.0** en npm, TypeScript puro, **sin dependencias**, Node ≥ 22.13, MIT, `DEFAULT_API_VERSION = "v24.0"` (configurable), tipos para webhooks incluyendo `referral`, soporte para validar firma con `appSecret` vía WebCrypto (`subtle`). Último push mayo-2026. Es el más mantenido de los que revisé. No tiene tipos para `smb_message_echoes`.
- **`@great-detail/whatsapp`** v9: tipado, documenta Cloud API v23; **`@kapso/whatsapp-cloud-api`** (actualizado jul-2026, un mantenedor); **`meta-cloud-api`** 0.1.x. **`whatsapp-cloud-api` (tawn33y)** sin actividad desde jul-2024: descartar.
- **Recomendación**: la superficie que usamos es pequeña (enviar texto/imagen/interactivo, marcar leído, bajar media, verificar firma). Un cliente propio con `fetch` nativo (~150 líneas, Node 20+ en Vercel) y tipos propios evita depender de la versión que el SDK fije y nos deja usar v25.0/v26.0 hoy. Si se prefiere librería, `whatsapp-api-js@6.3.0` con `v: "v25.0"`.
  Fuentes: registry.npmjs.org (whatsapp@latest, whatsapp-api-js@latest) · GitHub WhatsApp/WhatsApp-Nodejs-SDK · jsDelivr types.d.ts de whatsapp-api-js@6.3.0 (consultados 9-oct-2026).

---

## Riesgos para nuestro diseño

1. **Coexistencia no es «conectar y ya»**: requiere una app de Tech Provider/Solution Partner con Advanced access y Embedded Signup v4. Top Digital hoy no es Tech Provider; eso es verificación de negocio + App Review (~24 h si todo va bien, pero rechazos son comunes) + implementar el flujo de Embedded Signup. Alternativa: BSP con coexistencia (costo mensual + dependencia).
2. **México no está confirmado por Meta con nombre y apellido.** Es casi seguro que sí (nunca ha estado excluido, estuvo en el beta), pero hay que probarlo con el número real antes de prometer nada.
3. **20 mps y límites del lado de la app**: sin grupos ni difusiones por API, catálogo y etiquetas no visibles, dispositivos vinculados se desvinculan al onboardear (Bryan tendrá que volver a enlazar WhatsApp Web/Mac; Windows no sirve).
4. **Desconexión silenciosa por inactividad**: si Bryan deja de abrir la app ~14 días el partner se desvincula y el bot deja de recibir; hay que escuchar `account_update` y avisar.
5. **Sincronización de historial una sola vez y en 24 h**: si no se dispara al onboardear, se pierde para siempre (habría que offboardear y repetir).
6. **Cambio de precios el 1-oct-2026**: todo lo que el bot responda dentro de la ventana deja de ser gratis (~USD 0.0085/mensaje en México, salvo cuota gratis no confirmada). Un bot «platicador» que manda 5 mensajes por turno quintuplica el costo. Las alertas a los dueños también cuestan o requieren plantilla.
7. **Eco de Bryan**: `smb_message_echoes` nos dice que él respondió, pero sin garantía de latencia ni orden; el bot puede contestar al mismo tiempo que él. Hace falta una regla de «humano activo» (por ejemplo, si llega un eco en los últimos N minutos, el bot calla).
8. **Reintentos y duplicados**: Meta reintenta hasta 7 días y manda duplicados; sin idempotencia por `wamid` el bot contestará dos veces.
9. **Timeout de webhook**: hay que responder 200 en segundos; generar la respuesta con un LLM dentro del handler es inviable sin `waitUntil` o cola.
10. **Clasificación de plantillas**: el recordatorio de cotización puede acabar en MARKETING (≈ 4.7 veces más caro y con límites por usuario); además Meta aplica «pacing» y límites de marketing por usuario.
11. **Embedded Signup v2/v3 caducan en octubre de 2026**: cualquier guía o SDK que use v2 ya no sirve; hay que implementar v4.
12. **Firma**: en Vercel el body hay que leerlo crudo; con el JSON parseado la firma no coincide.

## Recomendaciones concretas

1. **Decidir ya el camino de onboarding.** Opción A: Top Digital se registra como Tech Provider (verificar negocio en Meta Business de Top Digital, App Review de `whatsapp_business_messaging` + `whatsapp_business_management`, Embedded Signup v4 con `extras.featureType = "whatsapp_business_app_onboarding"`, `sessionInfoVersion: 3`). Opción B: BSP con coexistencia. Si queremos ser dueños del stack y reutilizar esto para otros clientes de la agencia, A; si queremos salir en días, B. Recomiendo A con B como plan de contingencia, y empezar la verificación de negocio de Top Digital **hoy** porque es el paso más lento.
2. **Prueba de elegibilidad de México** en cuanto exista la app: correr el Embedded Signup con el número 81 2428 3124 en modo prueba (usuario con rol developer) antes de construir el resto.
3. **Preparar a Bryan**: actualizar la app a ≥ 2.24.17, tener el teléfono a la mano durante el onboarding (código + QR), aceptar compartir historial, re-vincular WhatsApp Web/Mac después, y abrir la app al menos una vez por semana. Explicar lo que pierde: listas de difusión y mensajes temporales en 1:1.
4. **Suscribirse a** `messages`, `smb_message_echoes`, `smb_app_state_sync`, `history`, `account_update`, `message_template_status_update`, `phone_number_quality_update`. Poner la app en Live.
5. **Webhook en Vercel**: leer body crudo → validar `X-Hub-Signature-256` con `timingSafeEqual` → responder 200 de inmediato → procesar con `waitUntil` de `@vercel/functions` (el promise comparte el `maxDuration` de la función; subir `maxDuration` a 60 s en el plan Pro) o encolar (Vercel Queues/Supabase). Idempotencia por `wamid` en Supabase (tabla `eventos_whatsapp` con unique sobre `wamid` + `tipo`).
6. **Regla de «humano al mando»**: guardar el `timestamp` del último `smb_message_echoes` por conversación; si Bryan escribió en los últimos 10-15 minutos, el bot no responde (o solo registra). Mostrar los ecos en el log de la conversación como exige Meta.
7. **Coste**: diseñar cada turno del bot como **un solo mensaje** (texto + botones interactivos) en vez de varios. Presupuesto de referencia para México tras el 1-oct-2026: USD 0.0085 por mensaje del bot; USD 0.0397 por plantilla de marketing. Poner método de pago en la WABA desde el inicio.
8. **Alertas a los dueños**: no asumir ventana abierta. Crear una plantilla UTILITY «nuevo_lead» con parámetros nombrados (`{{nombre}}`, `{{producto}}`, `{{resumen}}`) y, en paralelo, mandar la misma alerta por correo (gratis) para no depender de aprobación. Los dueños deben haber dado opt-in (guardar evidencia).
9. **Recordatorio de cotización**: plantilla UTILITY neutra («Hola {{nombre}}, te enviamos la cotización {{folio}} el {{fecha}}. ¿Tienes alguna duda o quieres ajustarla?»), sin descuentos ni urgencia; aceptar MARKETING si Meta la recategoriza y presupuestarla así.
10. **Click-to-WhatsApp**: guardar `referral.ctwa_clid`, `source_id`, `headline` en el primer mensaje de cada lead y reenviarlo a Conversions API (`action_source: business_messaging`) cuando se cierre venta; `ctwa_clid` puede faltar (Status ads).
11. **Media**: al recibir imagen/audio del cliente, descargar dentro de 5 min con el token y guardar en Supabase Storage; no guardar la URL de Meta. Para enviar fotos de productos, subirlas una vez con `/media` y reutilizar el `id` (renovar cada 30 días) en lugar de `link`.
12. **Cliente HTTP**: implementar un módulo propio con `fetch`, `API_VERSION = "v25.0"` en una constante, tipos propios para los payloads (texto, imagen, interactivo, reacción, ubicación, echo, status). Dejar `whatsapp-api-js@6.3.0` como alternativa documentada.
13. **Escalado a humano**: incluir siempre en el bot un botón/intención «Hablar con una persona» y el teléfono 81 1060 1298, para cumplir la política del 23-sep-2026.
14. **Vigilar el changelog** (changelog de WhatsApp y Graph API) cada trimestre: tarifas cambian el día 1 de cada trimestre con un mes de aviso; verificar en noviembre si la cuota de 1,000 mensajes gratis y la ventana FEP de 7 días aparecen en Meta.

## Fuentes

Meta (oficial)

- Onboard WhatsApp Business app users (coexistencia): https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users/ (consultado 9-oct-2026)
- Reconnect offboarded coexistence clients: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/reconnect-offboarded-coexistence-clients (9-oct-2026)
- Embedded Signup versions: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/versions (9-oct-2026)
- smb_message_echoes webhook reference: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/smb_message_echoes (9-oct-2026)
- Webhooks reference overview (messages): https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages (9-oct-2026)
- Webhook reference, text message (incluye `referral`): https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/text (9-oct-2026)
- Webhook reference, reaction: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/reaction (9-oct-2026)
- Webhook reference, interactive: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/interactive (9-oct-2026)
- WhatsApp webhooks overview (reintentos 7 días, 3 MB, mTLS): https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview/ (9-oct-2026)
- Set up webhooks (19 campos de suscripción): https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks (9-oct-2026)
- Graph API Webhooks getting started (firma, hub.challenge, mTLS 2025-12): https://developers.facebook.com/docs/graph-api/webhooks/getting-started (9-oct-2026)
- Messenger Platform webhooks (unicode escapado, 5 s): https://developers.facebook.com/docs/messenger-platform/webhooks (9-oct-2026)
- Typing indicators: https://developers.facebook.com/docs/whatsapp/cloud-api/typing-indicators (9-oct-2026)
- Media reference: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media (9-oct-2026)
- Image messages: https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/image-messages (9-oct-2026)
- Cloud API overview (throughput, pair rate limit): https://developers.facebook.com/docs/whatsapp/cloud-api/overview (9-oct-2026)
- Pricing: https://developers.facebook.com/docs/whatsapp/pricing (9-oct-2026)
- Upcoming pricing updates for Meta Business Agent, service and utility messages: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages (9-oct-2026)
- AI Providers pricing policy: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/ai-providers/ (9-oct-2026)
- Message templates: https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates (9-oct-2026)
- Template categorization: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization (9-oct-2026)
- Template category guidelines: https://developers.facebook.com/docs/whatsapp/updates-to-pricing/new-template-guidelines (9-oct-2026)
- Messaging limits: https://developers.facebook.com/docs/whatsapp/messaging-limits (9-oct-2026)
- Display names: https://developers.facebook.com/documentation/business-messaging/whatsapp/display-names (9-oct-2026)
- Business verification: https://developers.facebook.com/docs/development/release/business-verification (9-oct-2026)
- Get started for Tech Providers: https://developers.facebook.com/docs/whatsapp/solution-providers/get-started-for-tech-providers (9-oct-2026)
- App review for Solution Providers: https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/app-review (9-oct-2026)
- Get started (System User token): https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started (9-oct-2026)
- WhatsApp changelog: https://developers.facebook.com/documentation/business-messaging/whatsapp/changelog/ (última entrada 12-may-2026)
- Graph API changelog v26.0: https://developers.facebook.com/docs/graph-api/changelog/version26.0 (29-jul-2026)
- Introducing Graph API v25: https://developers.facebook.com/blog/post/2026/02/18/introducing-graph-api-v25-and-marketing-api-v25 (18-feb-2026)
- Política de mensajes de WhatsApp Business: https://whatsappbusiness.com/es-la/policy/ (actualizada 23-sep-2026)
- Tabla de precios interactiva: https://whatsappbusiness.com/es-la/products/platform-pricing/ (9-oct-2026)

Proveedores y terceros (para precios de México, disponibilidad y detalles no publicados por Meta)

- Goeva, WhatsApp Business API pricing Mexico: https://www.goeva.ai/en/resources/whatsapp-business-api-pricing-mexico (datos verificados 17-sep-2026)
- YCloud, Pricing update effective October 1, 2026: https://www.ycloud.com/blog/whatsapp-api-message-pricing-update-effective-october-1-2026 (4-sep-2026)
- Wati, Pricing changes: service messages and Click-to-Message ads: https://support.wati.io/en/articles/16954666-whatsapp-business-platform-api-pricing-changes-service-messages-and-click-to-message-ads (sep/oct-2026)
- respond.io, WhatsApp pricing change 2026: https://respond.io/blog/whatsapp-pricing-change-2026 (2026)
- 360dialog, Webhook reference (formato de `referral`, reacción, interactivo): https://docs.360dialog.com/docs/messaging/webhook/webhook-reference (9-oct-2026)
- 360dialog, Coexistence webhooks: https://docs.360dialog.com/partner/onboarding/whatsapp-coexistence/coexistence-webhooks (9-oct-2026)
- WaliChat, WhatsApp Business App Coexistence (exclusión Nigeria/Sudáfrica, pasos en la app): https://wali.chat/whatsapp-business-app (2026)
- Gallabox, WhatsApp Coexistence update: https://gallabox.com/whatsapp-coexistence-update (2026)
- ChakraHQ, Coexistence beta to worldwide: https://chakrahq.com/article/whatsapp-coexistence-business-app-register-cloud-api/ (actualizado jul-2026)
- Superchat, disconnect coexistence in Meta: https://help.superchat.com/en/articles/600739-how-to-disconnect-the-whatsapp-coexistence-connection-in-meta (2026)
- Evolution API issue #2645 (`ctwa_clid` vacío): https://github.com/evolution-foundation/evolution-api/issues/2645 (2026)
- npm registry `whatsapp@latest` y `whatsapp-api-js@latest`: https://registry.npmjs.org/whatsapp/latest · https://registry.npmjs.org/whatsapp-api-js/latest (9-oct-2026)
- GitHub WhatsApp/WhatsApp-Nodejs-SDK (archivado 7-jun-2023): https://github.com/WhatsApp/WhatsApp-Nodejs-SDK
- jsDelivr, tipos de whatsapp-api-js@6.3.0 (`DEFAULT_API_VERSION = "v24.0"`): https://cdn.jsdelivr.net/npm/whatsapp-api-js@6.3.0/lib/types.d.ts
- Vercel, @vercel/functions (`waitUntil`): https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package (3-sep-2026)
