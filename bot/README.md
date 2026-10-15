# Asistente de ventas OfficeTure

Bot de WhatsApp e Instagram con Claude, Supabase y funciones de Vercel. Diseño en `docs/ultrapowers/specs/2026-10-09-chatbot-design.md`; plan en `docs/ultrapowers/plans/2026-10-09-chatbot.md`.

## Desarrollo

    npm install
    npm test
    npm run typecheck
    npm run lint

### Simular conversaciones con Claude real

    ANTHROPIC_API_KEY=... npm run simular
    npm run simular -- descuento

Transcripciones en `pruebas/transcripciones/`.

## Inventario

La fuente es la hoja de Google «OfficeTure - Productos Entrega Inmediata GHL», pestaña `Import_GHL` (`HOJA_ID` y `HOJA_PESTANA`). Se sincroniza cada 10 minutos (`/api/cron/inventario`).

Columnas de la hoja real: `Categoria`, `Subcategoria`, `Producto`, `Precio_MXN`, `IVA`, `Precio_Publico`, `Disponibilidad`, `Stock`, `Prioridad_Venta`, `Respuesta_Chatbot_Base`.

- Obligatorias para el bot: `Categoria`, `Subcategoria`, `Producto`, `Precio_MXN`, `Stock`, `Prioridad_Venta`. Si falta alguna columna, no se actualiza nada y se avisa.
- Opcionales que el bot entiende: `Medidas`, `Colores`, `Foto_URL`, `Activo`. Además lee `Respuesta_Chatbot_Base` cuando viene llena.
- `IVA`, `Precio_Publico` y `Disponibilidad` no se leen: el precio sale de `Precio_MXN` y la existencia de `Stock`.
- `Stock` acepta alto, medio, bajo y proveedor. `Prioridad_Venta` acepta alta, media y baja (si trae otra cosa se usa baja y se avisa).

### Ocultar un producto

- Escribir `No` en `Activo` (también valen `inactivo`, `false`, `0` y `n`, con o sin mayúsculas). Si la columna `Activo` falta o la celda está vacía, el producto sigue activo.
- Poner `Stock` en `0`, «agotado», «sin stock» o «sin existencia»: la fila se rechaza, no se carga y se avisa a los dueños.
- Borrar la fila: el producto se marca inactivo.

### Protección del inventario

- Si la hoja trae menos de la mitad de los productos activos que hay cargados (filtro puesto, filas borradas por error), la sincronización se rechaza, se conserva el catálogo anterior y se avisa de inmediato.
- Si la lectura falla o no hay ningún producto válido, se siguen usando los últimos precios; al tercer fallo seguido (30 minutos) se avisa.
- Las filas con error (precio inválido, categoría o stock desconocidos, producto repetido) se avisan una vez por cada conjunto distinto de errores; las demás se cargan.
- Los avisos salen por correo si `CORREO_ALERTAS`, `RESEND_API_KEY` y `RESEND_FROM` están puestas; si no, por WhatsApp al primer dueño de `DUENOS`.

## Comandos de Bryan

Se mandan al número del negocio desde el WhatsApp personal de un dueño, o respondiendo a una alerta (sin teléfono, aplican a la conversación de la alerta citada). El teléfono puede ir de 10 dígitos, con 52 o con 521, y con espacios o guiones.

    /bot 8112345678              el asistente vuelve a atender ese chat
    /pausa 8112345678            el asistente se calla en ese chat hasta /bot
    /ganado 8112345678           venta cerrada
    /perdido 8112345678 motivo   venta perdida; el motivo es texto libre y opcional
    /bot @usuario                lo mismo para Instagram (también /pausa, /ganado y /perdido)
    /ayuda                       lista los comandos

Un teléfono mal escrito se rechaza. Cualquier otro comando responde con la ayuda.

## Variables de entorno

Se validan al arrancar (`src/config.ts`); si falta una obligatoria, el bot no arranca. Plantilla en `.env.example`.

Obligatorias:

| Variable | Para qué |
| --- | --- |
| `META_APP_SECRET` | Firma `X-Hub-Signature-256` de los webhooks |
| `META_VERIFY_TOKEN` | Verificación GET de los webhooks |
| `WA_PHONE_NUMBER_ID`, `WA_TOKEN` | Envío por WhatsApp |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | Base de datos (llave `sb_secret_`) |
| `ANTHROPIC_API_KEY` | Claude |
| `DUENOS` | Dueños, como `Bryan:5218100000000,Socio:5218100000001`; el primero recibe los avisos |
| `AVISO_PRIVACIDAD_URL` | Enlace del aviso de privacidad (URL válida) |
| `CRON_SECRET` | Mínimo 16 caracteres; protege `/api/despachar` y `/api/cron/*` |

Con valor por omisión:

| Variable | Omisión |
| --- | --- |
| `META_GRAPH_VERSION` | `v25.0` |
| `CLAUDE_MODEL` | `claude-sonnet-5-5` |
| `HOJA_ID` | la hoja de inventario actual |
| `HOJA_PESTANA` | `Import_GHL` |
| `NOMBRE_ASISTENTE` | `Mariana` |

Opcionales, por función:

| Función | Variables |
| --- | --- |
| Instagram | `IG_USER_ID`, `IG_PAGE_TOKEN` |
| Inventario desde Google Sheets | `GOOGLE_SA_JSON` (JSON completo de la cuenta de servicio; sin él la sincronización falla y se avisa) |
| Transcripción de audios | `OPENAI_API_KEY` (sin ella el bot pide que escriban) |
| Correo de alertas | `CORREO_ALERTAS`, `RESEND_API_KEY`, `RESEND_FROM` (las tres) |

Secretos de Supabase Vault (los usa `disparar_despacho()` de `supabase/migrations/20261009000002_cron.sql`, que cada 5 s llama a `/api/despachar`):

- `url_despachar`: `https://<proyecto-bot>.vercel.app/api/despachar`
- `cron_secret`: el mismo valor que `CRON_SECRET` en Vercel

## Plantillas de WhatsApp

Crearlas en WhatsApp Manager, categoría Utility, idioma `es_MX`. El texto de las dos de seguimiento debe coincidir palabra por palabra con `PLANTILLAS_SEGUIMIENTO` en `src/flujo/cron.ts`, porque eso es lo que se guarda en el historial para Claude.

- `seguimiento_precio`: «Hola, te escribo de OfficeTure sobre la cotización que te pasamos. ¿Te gustaría avanzar o prefieres que te mande otra opción según tu presupuesto?»
- `seguimiento_revision`: «Hola, te escribo de OfficeTure para dar seguimiento a tu cotización de mobiliario. Si todavía lo necesitas, responde este mensaje y te ayudo.»
- `alerta_bryan`: «Nuevo cliente para atender en OfficeTure. Motivo: {{1}}. Cliente: {{2}}. Resumen: {{3}}. Atiéndelo desde la app de WhatsApp Business.»

El código solo manda el nombre y las tres variables de `alerta_bryan` (`src/flujo/escalar.ts`, sin saltos de línea y máximo 900 caracteres cada una); su cuerpo vive en Meta y es el del plan.

## Despliegue

Orden recomendado:

1. **Supabase** (Pro, región `us-east-1`): crear el proyecto y aplicar `supabase/migrations/20261009000001_esquema.sql`. Activar `pg_net`.
2. **Secretos de Vault**: crear `url_despachar` y `cron_secret` (ver arriba) antes de la migración siguiente; sin ellos el despachador solo emite un aviso y no hace nada.
3. **Migración de cron**: aplicar `20261009000002_cron.sql` (activa `pg_cron` y programa el despacho cada 5 s).
4. **Vercel**: proyecto nuevo con Root Directory `bot` y plan Pro. Los crons de `vercel.json` (`/api/cron/minuto` cada minuto y `/api/cron/inventario` cada 10 minutos) no caben en Hobby; sin Pro, el cron por minuto tendría que moverse a `pg_cron`. Cargar las variables de entorno y desplegar.
5. **Meta**: webhook de WhatsApp en `https://<dominio-del-bot>/api/webhook/whatsapp` con el campo `messages` (y `smb_message_echoes` al conectar el número real en coexistencia); webhook de Instagram en `https://<dominio-del-bot>/api/webhook/instagram` con `messages` y `messaging_referral`. Token de verificación: `META_VERIFY_TOKEN`. Dar de alta las tres plantillas.
6. **Google**: cuenta de servicio con la API de Sheets activada; pegar su JSON en `GOOGLE_SA_JSON` y compartir la hoja con su `client_email` como lector. Probar con `curl -H "Authorization: Bearer <CRON_SECRET>" https://<dominio-del-bot>/api/cron/inventario`.

## Pendiente

Alta del número real 81 2428 3124 en modo coexistencia: requiere que Top Digital sea Tech Provider aprobado y una página de Embedded Signup v4. Al tenerla, solo cambian `WA_PHONE_NUMBER_ID` y `WA_TOKEN`, y se suscribe el campo `smb_message_echoes`.
