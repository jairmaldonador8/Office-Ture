# Research brief · chatbot OfficeTure

Fecha: 9 de octubre de 2026. Insumo: spec `docs/ultrapowers/specs/2026-10-09-chatbot-design.md`. Detalle y fuentes en `research/partes/01` a `05`.

## Contexto

El spec define un bot propio para WhatsApp e Instagram con Claude, Supabase y funciones en Vercel, con modo coexistencia para que Bryan siga contestando desde su app. La investigación verificó cada pieza contra documentación vigente. Cinco hallazgos cambian el diseño; el resto lo confirma.

## Hallazgos que cambian el spec

### 1. Coexistencia exige un intermediario

Meta sí ofrece coexistencia («Onboard WhatsApp Business app users», Embedded Signup v4). Pero no hay ruta directa: el número solo se conecta por Embedded Signup operado por un **Tech Provider** o un **BSP** (proveedor de soluciones). OfficeTure no puede hacerlo sola desde el panel de la app.

| Camino | Qué implica | A favor | En contra |
|--------|-------------|---------|-----------|
| **Top Digital como Tech Provider** | Verificar a Top Digital como negocio en Meta, App Review de `whatsapp_business_messaging` y `whatsapp_business_management`, montar Embedded Signup v4 (v2/v3 caducan el 15-oct-2026). | Sin cuota mensual extra, control total, sirve para otros clientes de Top Digital. | La verificación de negocio puede tardar días o semanas; más trabajo inicial. |
| **BSP con coexistencia** (360dialog, YCloud, Wati, etc.) | El BSP hace el Embedded Signup; nuestro webhook recibe los eventos del BSP o de Meta según el proveedor. | Arranque en días. | Cuota mensual del BSP, dependencia de un tercero, API del BSP puede diferir de Cloud API. |

México no aparece en la lista de exclusión (solo Nigeria y Sudáfrica). Se confirma al correr el alta con el número real. Requisitos operativos: app de WhatsApp Business 2.24.17 o superior; Windows no soportado como dispositivo vinculado; si Bryan no abre la app unos 14 días, Meta desconecta (`PRIMARY_INACTIVITY`); el historial se sincroniza una vez. Los mensajes de Bryan llegan como `smb_message_echoes`. Se puede desconectar y volver atrás sin perder chats.

**Decisión pendiente del usuario: camino Tech Provider o BSP.**

### 2. Vercel y Supabase deben ser planes de pago

- Vercel Hobby es solo para uso no comercial y limita los cron a una vez al día; un cron por minuto falla al desplegar. Se necesita **Vercel Pro** (USD 20 al mes por miembro).
- Supabase Free pausa el proyecto tras 7 días sin actividad, lo que mata `pg_cron`. Se necesita **Supabase Pro** (USD 25 al mes).
- Costo fijo de infraestructura: unos USD 45 al mes, que no estaban en el spec.

### 3. Debounce con fila en Supabase, disparado por pg_cron cada 5 s

El webhook inserta el mensaje (único por id externo), mueve `responder_en = now() + 4 s` en la conversación y responde 200. Un despachador `POST /api/despachar` toma las vencidas con `for update skip locked` y procesa cada una con `waitUntil`. Lo dispara `pg_cron` con intervalo `'5 seconds'` vía `pg_net`, con el cron de Vercel por minuto como respaldo. Se descartan Vercel Queues (beta, sin cancelar mensajes diferidos), Workflow DevKit (exige Nitro y framework) y QStash (tercer proveedor). El tiempo de respuesta queda entre 4 y 9 s desde el último mensaje.

### 4. Los mensajes del bot cuestan desde el 1 de octubre de 2026

Meta cobra por mensaje de servicio y utility dentro de la ventana: unos **USD 0.0085** cada uno en México; marketing USD 0.0397. La excepción que importa: si la conversación nace de un anuncio Click-to-WhatsApp y respondemos en 24 h, se abre una ventana de **72 horas gratis** para todo, incluidas plantillas. La mayoría del tráfico viene de anuncios. La cuota de 1,000 mensajes de servicio gratis al mes que reportan proveedores no aparece en Meta; no contar con ella.

Consecuencia: partir la respuesta en dos burbujas duplica el costo fuera de la ventana gratuita. Regla: **una burbuja por turno**, dos solo cuando el contenido lo exige. Las alertas a Bryan también cuestan, y fuera de 24 h requieren plantilla `alerta_bryan` de categoría utility.

### 5. Aviso de privacidad obligatorio en el chat

La LFPDPPP de 2025, artículo 16 fracción II, exige un aviso de privacidad simplificado antes de pedir datos personales. El bot debe mandar una línea con enlace al aviso completo la primera vez que pide nombre, dirección o teléfono. Los datos fiscales requieren consentimiento expreso: la factura se deriva a Bryan, como ya decía el cerebro. La Ley Federal de Protección al Consumidor exige aclarar IVA y cargos (ya cubierto) y respetar «no me escribas» (ya cubierto). Hace falta que OfficeTure tenga publicado su aviso de privacidad, idealmente en el sitio.

## Hallazgos que confirman o ajustan detalles

### WhatsApp Cloud API

- Graph API v26.0 es la vigente; ejemplos oficiales en v25.0. Fijar versión en variable de entorno.
- `referral` trae `source_id`, `headline`, `body`, `source_url` y `ctwa_clid` solo en el primer mensaje; `ctwa_clid` puede faltar.
- Firma HMAC-SHA256 sobre el cuerpo crudo. Meta reintenta hasta 7 días y duplica: idempotencia por `wamid`.
- Marcar leído y mostrar «escribiendo» en una sola llamada; el indicador dura 25 s.
- La media del cliente se descarga con token y la URL caduca en 5 minutos: descargar en el webhook, no después.
- Enviar imágenes subiendo media y usando `media id`; enviar por `link` está desaconsejado.
- El paquete oficial `whatsapp` de Meta está archivado. Usar un cliente propio con `fetch`.
- La política de Meta permite automatización, exige vía clara a un humano y opt-in. No exige decir «soy bot».

### Instagram

- Usar **Instagram Messaging API con Facebook Login** y token de página, que no caduca. Permisos: `instagram_basic`, `instagram_manage_messages`, `pages_manage_metadata`, `business_management`.
- Para escribir a clientes reales se necesita Advanced Access: App Review con video y Business Verification. Crear la app en el portafolio de OfficeTure.
- Webhook `object: "instagram"`; el eco de Bryan llega en `messages` con `is_echo: true`. Distinguir eco del bot vs de la app de IG registrando nuestros ids de mensaje.
- Referral de anuncio: `ad_id`, `ref`, `source: "ADS"`, `ads_context_data.ad_title`.
- Texto máximo 1,000 bytes; `typing_on` y `mark_seen` disponibles.
- Ventana de 24 h, sin plantillas. Novedad del 28-sep-2026, aún por confirmar: 7 días si la conversación nace de un anuncio. La etiqueta `HUMAN_AGENT` (7 días, envío manual) requiere App Review aparte; no se pide en la v1.
- Meta pide en IG que el bot responda en menos de 30 s y que siempre haya ruta a humano.

### Claude

- `claude-sonnet-5-5`: USD 2 entrada / 10 salida por millón; lectura de caché USD 0.10. `claude-haiku-5-5`: USD 0.10 / 0.50. Ventana de 1M.
- Costo por conversación de 10 turnos con caché: Sonnet 5.5 unos USD 0.07, Haiku 5.5 unos USD 0.004. A 300 a 1,500 conversaciones: Sonnet USD 20 a 100 al mes.
- Arrancar con Sonnet 5.5 en `effort: "low"`, `max_tokens` 1500. Decidir Haiku con la eval de escenarios.
- Sonnet 5.5 no acepta `temperature` ni `tool_choice` forzado: usar `auto` con herramientas `strict: true`.
- SDK `@anthropic-ai/sdk@0.133.0`, bucle con `toolRunner` y herramientas zod, `max_iterations` acotado, timeout de 60 s y 2 reintentos.
- Caché: `cache_control` con `ttl: "1h"` en el último bloque del sistema; nada volátil en el sistema (la hora va por herramienta).
- **Riesgo**: recortar el historial a 30 mensajes con pensamiento activo puede dar error 400. Solución: al pasar de 30 mensajes, resumir y abrir hilo nuevo con el resumen en el contexto dinámico.
- Visión: descargar la imagen, redimensionar a 1,568 px máximo, enviar en base64.
- Claude no recibe audio. Transcribir con `gpt-4o-mini-transcribe` (USD 0.003 por minuto) o Deepgram Nova-3 `es-419`. Costo despreciable.
- Extracción final del lead: `messages.parse` con salida estructurada en una llamada aparte.

### Patrones conversacionales

- Retraso humano de 0 a 4 s mejora la percepción; más de 20 s genera sospecha. El debounce de 4 s más la generación queda en el rango.
- Botones de WhatsApp: máximo 3 de 20 caracteres; listas hasta 10 filas. Útiles para elegir categoría o municipio; texto libre para lo demás.
- Handoff, según Intercom, Wati y respond.io: ofrecer humano una vez, no dos seguidas; pausar el bot al escribir el agente; escalar si hay bucle de 3 turnos sin avance.
- Seguimientos: el consenso es dos toques como techo. Toque 1 a las 2 a 4 h dentro de la ventana; toque 2 al día siguiente, gratis si cae en las 72 h del anuncio. El tercer toque de 2 días del spec se elimina.
- Calidad de Meta: bloqueos y reportes bajan el límite de mensajería. Portafolio nuevo arranca en 250 conversaciones por día.
- Transparencia: presentarse como asistente de OfficeTure, decir la verdad si preguntan, Bryan a un mensaje. Hay iniciativa de ley del 8-sep-2026 para obligar a identificar bots; no es ley todavía.
- Evals: ocho rúbricas binarias (IVA, no inventar, escalar en el turno correcto, no mentir sobre ser humano, aviso de privacidad, una pregunta por mensaje, sin signos de exclamación, longitud) con juez de otro modelo.
- Las cifras de «98 % de apertura» o «recupera 25 %» son marketing de proveedores; no usarlas con los dueños.

### Infraestructura

- Node 24 (Node 20 deprecado en Vercel desde el 1-oct-2026).
- `bot/vercel.json` con `functions`, `crons` e `ignoreCommand` para que el bot solo despliegue con cambios en `bot/`; el sitio ignora `bot/`.
- Supabase en `us-east-1`, junto a la región `iad1` de Vercel. Llaves nuevas `sb_secret_`; las legacy caducan a fin de 2026.
- `pg_net` en beta, timeout 2 s por defecto (subir a 5 s), sin reintentos: el despachador debe ser idempotente.
- Google Sheets con `googleapis@185.0.0` y `google-auth-library@11.2.0`, JWT de cuenta de servicio desde variable de entorno; cuota holgada.
- Versiones: `@supabase/supabase-js@2.117.3`, `@vercel/functions@3.9.11`, `@anthropic-ai/sdk@0.133.0`.

## Costos mensuales estimados

| Concepto | Rango |
|----------|-------|
| Vercel Pro | USD 20 |
| Supabase Pro | USD 25 |
| Claude Sonnet 5.5 | USD 20 a 100 |
| WhatsApp (fuera de ventana gratuita, plantillas y alertas) | USD 5 a 30 |
| Transcripción de audio | menos de USD 2 |
| BSP, solo si se elige ese camino | USD 0 a 50 según proveedor |
| **Total** | **USD 70 a 225** |

## Cambios que se aplicarán al spec

1. Sección 12: camino de alta de WhatsApp según la decisión Tech Provider o BSP; Vercel Pro y Supabase Pro; Node 24; región `us-east-1`.
2. Sección 2: debounce por fila en Supabase y `pg_cron` cada 5 s; despachador con `skip locked` y `waitUntil`.
3. Sección 3 y 4: una burbuja por turno; descarga inmediata de media; transcripción de audio con servicio externo; hilo nuevo con resumen al pasar 30 mensajes.
4. Sección 5: aviso de privacidad simplificado antes del primer dato personal.
5. Sección 7: dos toques máximo; el de 2 días se elimina; priorizar la ventana de 72 h de anuncios.
6. Sección 6: alertas a Bryan por WhatsApp con plantilla utility y copia por correo como respaldo gratuito.
7. Sección 14: pendientes nuevos: aviso de privacidad publicado, decisión Tech Provider o BSP, verificación de negocio en Meta, alta de tarjeta de pago en Meta.

## No confirmado

- Ventana gratuita de 7 días en WhatsApp e Instagram desde el 28-sep-2026: lo reportan proveedores; Meta todavía dice 72 h en WhatsApp.
- Cuota de 1,000 mensajes de servicio gratis al mes.
- Disponibilidad de coexistencia en México con nombre explícito en la documentación de Meta.
- Sintaxis exacta de `pg_cron` en segundos según la versión de Postgres del proyecto.
