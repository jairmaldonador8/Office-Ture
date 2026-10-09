# 04 · Vercel, Supabase y colas: cómo procesar en segundo plano, debounce y crons

Investigación hecha el 9 de octubre de 2026 para el bot de WhatsApp e Instagram de OfficeTure (carpeta `bot/`, proyecto Vercel separado con Root Directory `bot/`, Node/TypeScript sin framework, Supabase como base de datos). Todo lo citado viene de documentación oficial salvo donde se indica «fuente secundaria». Las fechas entre corchetes son el `last_updated` de la página o la fecha de publicación.

## Hallazgos

### 1. Procesar en segundo plano en Vercel tras responder al webhook

**`waitUntil` de `@vercel/functions`** (v3.9.11, Node >= 20)

- `waitUntil(promise)` extiende la vida del handler hasta que la promesa termina, sin bloquear la respuesta. Recibe una **Promise**, no un callback (`waitUntil(fn())`, nunca `waitUntil(fn)`). Fuente: [`@vercel/functions` API Reference](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package) [2026-09-03].
- Límite: «Promises passed to `waitUntil()` will have the same timeout as the function itself. If the function times out, the promises will be cancelled». Es decir, el trabajo en segundo plano cabe dentro de `maxDuration`, no más. `getDeadline()` devuelve la fecha límite real de la invocación (incluye las tareas de `waitUntil`). Misma fuente.
- Con Fluid Compute (activo por defecto en proyectos nuevos desde el 23-abr-2025) una instancia atiende varias invocaciones a la vez y se cobra por CPU activa, no por tiempo de espera de I/O; esperar 5 a 25 s a Claude casi no consume CPU activa. Fuente: [Fluid compute](https://vercel.com/docs/fluid-compute) y [Functions Limits](https://vercel.com/docs/functions/limitations) [2026-08-24].
- **No es durable**: si la instancia muere, se redeploya a mitad o se agota `maxDuration`, el trabajo se pierde sin reintento. Es el mecanismo correcto para «responder 200 en < 1 s y seguir trabajando», pero no para garantizar la entrega.

**`maxDuration` por plan con Fluid Compute** (fuente: [Functions Limits](https://vercel.com/docs/functions/limitations) [2026-08-24]):

| Plan | Por defecto | Máximo | Máximo extendido |
| --- | --- | --- | --- |
| Hobby | 300 s | 300 s | no disponible |
| Pro | 300 s | 800 s (GA) | 1800 s (beta, configuración por función, runtimes `nodejs20.x/22.x/24.x`) |
| Enterprise | 300 s | 800 s | 1800 s (beta) |

- Memoria: Hobby 2 GB / 1 vCPU fijo; Pro/Enterprise hasta 4 GB / 2 vCPU (se configura en el dashboard, no en `vercel.json`). Cuerpo de petición y respuesta: 4.5 MB. Concurrencia: hasta 30,000 (Hobby y Pro). Región por defecto `iad1`; Hobby una sola región.
- Se configura con `export const config = { maxDuration: 60 }` en el archivo de `api/` o con `functions` en `vercel.json`. Fuente: [Configuring duration](https://vercel.com/docs/functions/configuring-functions/duration).

**Vercel Queues (`@vercel/queue` v0.8.0, publicado 2026-10-05)**

- Estado: **beta pública** desde el 27-feb-2026, «available on all plans» (incluye Hobby). La documentación [2026-09-03] sigue marcándolo «(Beta)» y el trigger en `vercel.json` se llama `experimentalTriggers` con `type: "queue/v2beta"`. No encontré anuncio de GA. Fuentes: [Vercel Queues](https://vercel.com/docs/queues), [changelog public beta](https://vercel.com/changelog/vercel-queues-now-in-public-beta).
- Límites [2026-08-12]: retención (TTL) 60 s a 7 días (24 h por defecto); **delay antes de ser visible: 0 s a 7 días**, topado al TTL; visibility timeout 0 s a 60 min; mensaje hasta 100 MB; topics y consumer groups ilimitados; tras 32 reintentos, backoff forzado. Fuente: [Pricing and Limits](https://vercel.com/docs/queues/pricing).
- Precio: por operación (send, receive, delete, visibility change, notify), medido en trozos de 4 KiB; sends con `idempotencyKey` cuestan 2x; **Hobby incluye el primer 1,000,000 de operaciones**; Pro «usage-based», regional, desde $0.60 por millón (changelog). Las funciones invocadas en push se cobran como compute normal.
- `send(topic, payload, { delaySeconds, retentionSeconds, idempotencyKey, region })`. `idempotencyKey`: máximo 256 caracteres; ventana de deduplicación `min(retention, 24 h)` según el SDK (la API dice «toda la vida del mensaje original, hasta su TTL»). Los duplicados **se descartan silenciosamente**, `send` siempre devuelve éxito. Fuente: [JS SDK Reference](https://vercel.com/docs/queues/sdk) [2026-08-12], [API Reference](https://vercel.com/docs/queues/api) [2026-09-15].
- **No existe operación para cancelar o borrar un mensaje antes de que se entregue.** Los endpoints son SendMessage, ReceiveMessages, ReceiveMessageById, AcknowledgeMessage (requiere receipt handle de un lease) y ExtendLease. Un mensaje con delay no se puede retirar: hay que descartarlo en el consumidor.
- Entrega at-least-once; el consumidor debe ser idempotente. Consumidor para Node sin framework: `new QueueClient().handleNodeCallback((msg, meta) => …)` con firma `(req, res)`, o `handleCallback` con Web `Request`. Local: `vercel link` + `vercel env pull` para que el SDK se autentique (usa token OIDC de Vercel).

**Vercel Workflows / Workflow DevKit (`workflow` v5.2.0, publicado 2026-10-08)**

- Estado: **GA desde abril de 2026** (recap semanal de la comunidad de Vercel del 10 al 17 de abril de 2026 y cobertura de terceros; no encontré la entrada primaria del changelog, así que la fecha exacta queda como fuente secundaria). La doc [2026-09-04] ya no dice beta; multi-región requiere `workflow >= 5.0.0-beta.33`; Python y NestJS siguen en beta. Fuentes: [Vercel Workflows](https://vercel.com/docs/workflows), [Vercel Weekly 2026-04-20](https://community.vercel.com/t/vercel-weekly-2026-04-20/38580).
- `sleep('4s')` suspende el run sin consumir cómputo; está respaldado por un evento de temporizador en el log de eventos; **sin límite de duración de sleep ni de run**. `Run.cancel({ cancelReason })` cancela un run y `Run.wakeUp({ correlationIds })` interrumpe sleeps pendientes para reanudar antes. Hooks: `createHook({ token })` + `resumeHook(token, payload)` permiten que un run espere eventos externos con token determinista. Fuentes: [Workflow Pricing and Limits](https://vercel.com/docs/workflows/pricing) [2026-09-16], [Run API](https://workflow-sdk.dev/docs/api-reference/workflow-api/get-run), skill `vercel:workflow`.
- Precio: Hobby incluye 50,000 eventos/mes y 1 GB escrito; bajo demanda $0.02 por 1,000 eventos, $0.50/GB escrito, $0.50/GB-mes retenido (retención no disponible en Hobby). Un step normal genera 3 eventos; cada sleep, hook y reintento agrega más. Además cobra Queues y compute de las funciones. Retención de estado tras terminar: 1 día Hobby, 7 días Pro.
- Límites: replay de orquestación máximo 240 s; 25,000 eventos y 10,000 steps por run; payload 50 MB; rate limit 50,000 req/min Hobby.
- **Requisito de framework**: la guía de inicio lista Next.js, Vite, React Router, Astro, Express, Fastify, Hono, Nitro, Nuxt, SvelteKit, TanStack Start, NestJS (beta) y Python (beta). Para Express y Hono el camino oficial es **Nitro** (`npm i workflow nitro rollup`, `nitro.config.ts` con `modules: ["workflow/nitro"]`, `build: nitro build`). No hay guía para la carpeta `api/` sin framework: el SDK necesita un paso de compilación (directivas `'use workflow'` / `'use step'`) que `@vercel/node` solo no hace. Fuente: [Getting started](https://workflow-sdk.dev/docs/getting-started), [Express](https://workflow-sdk.dev/docs/getting-started/express), [Hono](https://workflow-sdk.dev/docs/getting-started/hono) [2026-10-08].

**Comparación de las cuatro formas de implementar el debounce de 4 s con reinicio**

| Opción | Cómo se reinicia el temporizador | Estado y costo | Veredicto |
| --- | --- | --- | --- |
| (i) Workflow con `sleep('4s')` | Un run por conversación: el webhook hace `resumeHook(token, msg)`; el run usa `createHook` iterable y vuelve a dormir 4 s tras cada mensaje; si no llega nada, responde. Alternativa: `run.cancel()` y arrancar otro run. | GA. Gratis en Hobby hasta 50k eventos/mes (cada mensaje ≈ 5 a 8 eventos). Exige Nitro + Hono/Express, bundler y tooling nuevo. | Elegante pero añade framework y una capa de orquestación que nuestro bot no necesita; con 240 s de replay y runs largos por conversación hay que cerrar runs (p. ej. tras 30 min sin mensajes). Segunda opción. |
| (ii) Queues con `delaySeconds: 4` | **No se puede cancelar** un mensaje diferido. Hay que enviar un mensaje por cada entrada y que el consumidor, al despertar, compare `ultimo_mensaje_at` en Supabase con la hora del mensaje; si llegó algo más tarde, descarta. Un `idempotencyKey` por conversación impediría encolar el reinicio (ventana = retención), así que **no** sirve para deduplicar. | Beta, todos los planes, 1M ops gratis Hobby. `@vercel/queue` 0.8.0, `experimentalTriggers` en `vercel.json`. | Funciona con el patrón «descartar al despertar», pero la API es beta (`queue/v2beta`), el nombre del trigger es «experimental» y el consumidor sin framework usa `handleNodeCallback`. Tercera opción. |
| (iii) Fila en Supabase (`responder_en = now() + 4 s`) + pg_cron + pg_net | El webhook hace `upsert` en `conversaciones` con `responder_en = now() + interval '4 seconds'`; cada mensaje nuevo mueve la hora (reinicio gratuito). Un job pg_cron cada 1 a 5 s llama con `net.http_post` a `POST /api/despachar` del bot, que toma con `select … for update skip locked` las conversaciones vencidas y responde. | pg_cron y pg_net incluidos en Free y Pro; sub-minuto desde pg_cron 1.5 / Postgres 15.1.1.61; pg_net en beta, hasta ~200 req/s, timeout por defecto 2000 ms. | **Recomendada**: todo el estado vive donde ya está (Supabase), el reinicio es un `update`, no exige framework ni beta de Vercel, y el despachador es una función normal `api/*.ts`. Riesgo: Free pausa el proyecto tras 7 días sin actividad y pg_cron no «recupera» corridas perdidas. |
| (iv) QStash de Upstash (`@upstash/qstash` 2.12.0) | `publishJSON({ delay: 4, deduplicationId })`. `DELETE /v2/messages/{id}` cancela un mensaje diferido si aún no está en vuelo (hay que guardar el `messageId`). La deduplicación por `Upstash-Deduplication-Id` tiene **ventana de 10 min** y devuelve 202 sin encolar: tampoco sirve para «reiniciar», solo para evitar dobles. | Free: 1,000 mensajes/día, delay máx. 7 días, 1 MB; pago por uso $1 por 100k mensajes. Proveedor externo adicional. | Viable y madura (es la que más se usa para esto), pero suma un tercer proveedor y una llave más; 1,000 mensajes/día en Free se agotan con ~15 conversaciones activas si cada entrada publica. Cuarta opción. |

Fuentes de QStash: [Deduplication](https://upstash.com/docs/qstash/features/deduplication), [Delay](https://upstash.com/docs/qstash/features/delay), [Pricing](https://upstash.com/docs/qstash/overall/pricing), [Cancel message](https://upstash.com/docs/qstash/api/messages/cancel).

### 2. Vercel Cron Jobs

- Frecuencia mínima y precisión [2026-07-15]: **Hobby: una vez al día, precisión por hora (±59 min)**; expresiones más frecuentes **fallan en el despliegue** («Hobby accounts are limited to daily cron jobs»). **Pro y Enterprise: una vez por minuto, precisión por minuto.** 100 cron jobs por proyecto en todos los planes. Fuente: [Usage & Pricing for Cron Jobs](https://vercel.com/docs/cron-jobs/usage-and-pricing).
- Cómo funciona [2026-09-16]: Vercel hace un **HTTP GET** a la URL de **producción** con el `path` de `vercel.json`; user agent `vercel-cron/1.0`; cabecera `x-vercel-cron-schedule` con la expresión; zona horaria **siempre UTC**; no se pueden combinar día del mes y día de la semana; no acepta `MON`, `JAN`. Fuente: [Cron Jobs](https://vercel.com/docs/cron-jobs).
- Autenticación [2026-08-11]: variable de entorno `CRON_SECRET` (recomiendan ≥ 16 caracteres aleatorios); Vercel la envía como `Authorization: Bearer <CRON_SECRET>`; el handler compara. Fuente: [Managing Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs).
- Duración: la misma que las funciones (`maxDuration`). **Sin reintentos** si falla. Entrega «best effort»: puede saltarse una corrida o invocarla dos veces; si la corrida anterior sigue viva, puede arrancar otra en paralelo (recomiendan lock + operaciones idempotentes). Los crons no siguen redirecciones. No hay soporte en `vercel dev`; se prueban con `vercel crons run /api/cron` o llamando el endpoint a mano. Misma fuente.
- Costo: incluidos en todos los planes; se cobra solo la invocación de la función.
- **Plan Hobby = uso no comercial.** La doc del plan [2026-09-14] remite a las fair use guidelines: «the Hobby plan restricts users to non-commercial, personal use only». El bot de OfficeTure es un activo comercial de un cliente: **debe ir en Pro** ($20 por asiento/mes con $20 de crédito de uso, según terceros; confirmar en [vercel.com/pricing](https://vercel.com/pricing)). Fuente: [Hobby plan](https://vercel.com/docs/plans/hobby).

### 3. Supabase

**pg_cron + pg_net**

- Sintaxis (fuente: [Cron quickstart](https://supabase.com/docs/guides/cron/quickstart.md)):

  ```sql
  select cron.schedule(
    'despachar-bot',
    '5 seconds',           -- o '* * * * *' para cada minuto
    $$
    select net.http_post(
      url := 'https://bot-officeture.vercel.app/api/despachar',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || current_setting('app.bot_secret')),
      body := jsonb_build_object('time', now()),
      timeout_milliseconds := 5000
    ) as request_id;
    $$
  );
  select cron.unschedule('despachar-bot');
  select cron.alter_job(job_id := (select jobid from cron.job where jobname = 'despachar-bot'), schedule := '*/5 * * * *');
  ```

  `cron.schedule` con el mismo nombre hace upsert. Horario en UTC (GMT).
- Intervalos en segundos (`'1 seconds'` a `'59 seconds'`) requieren pg_cron ≥ 1.5.0 según la página de la extensión, o Postgres ≥ 15.1.1.61 según el quickstart (las dos fuentes no coinciden en el criterio; verificar con `select extversion from pg_extension where extname = 'pg_cron'`). Fuente: [pg_cron](https://supabase.com/docs/guides/database/extensions/pgcron), [Supabase Cron](https://supabase.com/modules/cron).
- Recomendaciones oficiales: **no más de 8 jobs concurrentes** y **cada job < 10 min**; los resultados quedan en `cron.job_run_details` (limpiar con un job diario: `delete from cron.job_run_details where end_time < now() - interval '7 days'`). Fuente: [Cron](https://supabase.com/docs/guides/cron).
- `net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds int default 2000) returns bigint`: asíncrono (no bloquea), **solo POST con JSON**, **timeout por defecto 2000 ms**, respuestas guardadas 6 h en `net._http_response` (`pg_net.ttl` configurable), hasta ~200 req/s «de forma fiable», **sin reintentos automáticos**. La extensión está **en beta** («functions signatures may change»). Fuente: [pg_net](https://supabase.com/docs/guides/database/extensions/pg_net).
- Costo: pg_cron y pg_net están disponibles en Free y Pro sin cargo aparte; solo consumen CPU/conexiones de la instancia. Fuente: [Pricing](https://supabase.com/pricing).
- Fiabilidad: en **Free el proyecto se pausa tras 1 semana de inactividad** y los jobs dejan de correr sin aviso ni recuperación (fuentes secundarias: blogs de 2026; el pricing oficial confirma la pausa). Pro ($25/mes, incluye $10 de crédito de cómputo, 8 GB de disco, 2M de invocaciones de Edge Functions, 250 GB de egress) no se pausa.

**Edge Functions como alternativa**

- Límites [doc actual]: memoria 256 MB; **wall clock 150 s en Free, 400 s en planes de pago**; **CPU 2 s por petición** (no cuenta I/O); request idle timeout 150 s (504); bundle 20 MB; 100 funciones en Free, 500 en Pro (la página de límites dice 500; otra copia dice 1000); sin `sharp`/libvips ni Web Workers. `EdgeRuntime.waitUntil()` mantiene vivo el worker pero no extiende el wall clock. Fuente: [Edge Functions limits](https://supabase.com/docs/guides/functions/limits), [CPU limits](https://supabase.com/docs/guides/troubleshooting/edge-function-cpu-limits).
- Runtime: **Deno 2.1** en todas las regiones desde el 15-ago-2025 (la guía «Using Deno 2» sigue etiquetada Public Alpha); compatible con npm y `package.json`. Fuente: [changelog Deno 2.1](https://supabase.com/changelog/37941-all-regions-now-run-deno-2-1-compatible-release).
- Regiones de ejecución: `us-east-1`, `us-west-1`, `us-west-2`, `ca-central-1`, Europa, Asia, `sa-east-1`; se fija con cabecera `x-region`. Fuente: [Regional invocations](https://supabase.com/docs/guides/functions/regional-invocation).
- Veredicto: viables para el despachador o los crons (pg_cron → Edge Function) si quisiéramos todo en Supabase, pero duplicarían el código del bot en Deno y el límite de 2 s de CPU con 25 s de espera a Claude es cómodo solo porque la espera es I/O. Mantener un solo runtime (Node en Vercel) es más simple.

**supabase-js v2 con llave de servicio desde Node en Vercel**

- Versión actual: `@supabase/supabase-js` **2.117.3** (publicada 2026-10-07), **Node >= 22**; existe `3.0.0-next.29` en canal `next` (no usar aún).
- Llaves nuevas: `sb_publishable_…` (baja privilegio, respeta RLS) y `sb_secret_…` (backend, **salta todas las políticas RLS**). Las legacy `anon` y `service_role` (JWT) «keep working until the end of 2026» y se deprecan; conviene crear el proyecto ya con `sb_secret_`. Fuente: [API keys](https://supabase.com/docs/guides/api/api-keys).
- Uso en servidor: `createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })`; nunca exponerla al cliente. RLS: con la llave secreta no aplica; aun así conviene **activar RLS en todas las tablas** del bot para que la `publishable` (si algún día se usa en un panel) no pueda leer conversaciones. Poner `service_role` en una política «does nothing» (misma fuente).
- Con Fluid Compute, supabase-js usa HTTP (PostgREST) y no abre pool de Postgres, así que no hace falta `attachDatabasePool`; si se usara `pg` directo, usar el pooler (puerto 6543) y `attachDatabasePool`.

**Región para México**

- Supabase no tiene región en México. Regiones de Norteamérica: `us-east-1` (N. Virginia), `us-east-2` (Ohio), `us-west-1` (N. California), `us-west-2` (Oregon), `ca-central-1`. Fuente: [Available regions](https://supabase.com/docs/guides/platform/regions).
- Vercel tampoco; su región por defecto es `iad1` (Washington D. C., N. Virginia) y el failover siguiente es `cle1` (Cleveland). Fuente: [Regions](https://vercel.com/docs/regions).
- Recomendación: **`us-east-1` en Supabase y `iad1` en Vercel**: quedan en el mismo centro AWS (latencia bot→DB de ~1 ms) y la latencia Monterrey→Virginia (~40 a 60 ms) es irrelevante frente a los 5 a 25 s de Claude. Elegir Oregon o California solo mejoraría el tramo del usuario, que en un bot de WhatsApp no existe (Meta llama al webhook desde sus propios centros).

### 4. Estructura del proyecto Vercel sin framework y segundo proyecto con Root Directory `bot/`

**Funciones en `api/*.ts`**

- Cualquier archivo en `/api` se despliega como función. Firma recomendada: Web handler (`export function POST(request: Request)` o `export default { fetch(request) }`); también sirve la firma Node `(req: VercelRequest, res: VercelResponse)` de `@vercel/node` (v23.0.0). Sin framework hay que poner `"type": "module"` en `package.json` o usar `.mjs`. Fuente: [Functions API Reference](https://vercel.com/docs/functions/functions-api-reference) [2026-08-11].
- Configuración por archivo: `export const config = { runtime: 'nodejs', maxDuration: 60 }`, o en `vercel.json`:

  ```json
  {
    "$schema": "https://openapi.vercel.sh/vercel.json",
    "functions": { "api/**/*.ts": { "maxDuration": 60 } },
    "crons": [
      { "path": "/api/cron/seguimientos", "schedule": "* * * * *" },
      { "path": "/api/cron/sheets", "schedule": "*/10 * * * *" }
    ]
  }
  ```

  Los patrones de `functions` deben empezar en `api/` (un glob como `users/**/*.js` falla). Con Fluid no se pone `memory` en `vercel.json`. También existe `vercel.ts` tipado (`@vercel/config` 0.12.0).
- Node: versiones disponibles **24.x (por defecto), 22.x, 20.x**; **Node 20 se deprecá el 1-oct-2026**. Se fija con `"engines": { "node": "22.x" }` en `package.json` (tiene prioridad sobre el dashboard). Fuente: [Supported Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions) [2026-02-27]. Dado que supabase-js y googleapis exigen Node >= 22, **22.x o 24.x**; 24 es LTS y el default, así que no hay razón para quedarse en 22.
- Variables de entorno: se definen en el proyecto (dashboard o `vercel env add`), por entorno (production/preview/development); `vercel env pull` las baja a `.env.local`. Las sensibles (`SUPABASE_SECRET_KEY`, `WHATSAPP_TOKEN`, `CRON_SECRET`, JSON de Google) como «Sensitive».

**Segundo proyecto en el mismo repo sin que el sitio se redespliegue**

- Vercel permite N proyectos por repo (límite por plan); cada uno con su **Root Directory** (`bot/` para el bot; raíz o `web/` para el sitio). Por defecto **cada commit crea un deployment en todos los proyectos conectados**. Fuente: [Using Monorepos](https://vercel.com/docs/monorepos) [2026-08-11].
- Dos mecanismos para evitarlo:
  1. **Skipping unaffected projects** (automático, no ocupa slot de build): solo para repos GitHub con workspaces npm/yarn/pnpm/bun y nombres únicos en `package.json`. Cambios fuera del workspace cuentan como «globales» y despliegan todo. Nuestro sitio estático no es un workspace, así que no aplica salvo que convirtamos el repo en workspaces.
  2. **Ignored Build Step** (Settings → Build and Deployment): el comando **se ejecuta dentro del Root Directory**; salir con `0` cancela el build, con `1` lo continúa. Preset «Only build if there are changes in a folder» o comando `git diff HEAD^ HEAD --quiet -- .` (relativo al Root Directory). Los builds cancelados **sí cuentan** como deployments (100/día Hobby, 6,000/día Pro). Vercel clona con `--depth=10`. Fuentes: [Project settings](https://vercel.com/docs/project-configuration/project-settings) [2026-09-21], [KB Ignored Build Step](https://vercel.com/kb/guide/how-do-i-use-the-ignored-build-step-field-on-vercel) [2026-09-28].
- `ignoreCommand` en `vercel.json` hace lo mismo desde código: `{ "ignoreCommand": "git diff --quiet HEAD^ HEAD ./" }`. `git.deploymentEnabled` sirve para apagar ramas enteras (`{ "git": { "deploymentEnabled": { "dev": false } } }`), no para filtrar por carpeta. Fuente: [Git configuration](https://vercel.com/docs/project-configuration/git-configuration).
- Importante: `vercel.json` se lee desde el Root Directory del proyecto, así que `bot/vercel.json` y el `vercel.json` del sitio son independientes (crons, functions e ignoreCommand de cada uno).

### 5. Google Sheets desde Node con cuenta de servicio

- Paquetes (npm, 9-oct-2026): `googleapis` **185.0.0** (publicado 2026-10-08, Node >= 22, cliente oficial, muy pesado si se importa completo: usar `import { google } from 'googleapis'` o mejor `@googleapis/sheets`); `google-spreadsheet` **5.3.0** (publicado 2026-06-03, wrapper de alto nivel con `getRows`, `loadCells`, usa `google-auth-library` para auth); `google-auth-library` **11.2.0** (Node >= 22).
- Auth con JSON de cuenta de servicio en variable de entorno (fuente: [google-auth-library README](https://github.com/googleapis/google-auth-library-nodejs)):

  ```ts
  import { JWT } from 'google-auth-library';
  const creds = JSON.parse(process.env.GOOGLE_SA_JSON!);          // el JSON completo en una variable
  const auth = new JWT({
    email: creds.client_email,
    key: creds.private_key.replace(/\\n/g, '\n'),                  // por si la plataforma escapa los saltos
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  ```

  `google-spreadsheet` recibe ese mismo `JWT` como segundo argumento: `new GoogleSpreadsheet(id, auth)`; su guía recomienda cargar `GOOGLE_SERVICE_ACCOUNT_EMAIL` y `GOOGLE_PRIVATE_KEY` desde variables y nunca commitear la llave. Fuente: [node-google-spreadsheet auth](https://github.com/theoephraim/node-google-spreadsheet/blob/main/docs/guides/authentication.md). La hoja debe compartirse con el `client_email` de la cuenta de servicio.
- Leer una pestaña completa: con `googleapis`, `sheets.spreadsheets.values.get({ spreadsheetId, range: 'Catálogo' })`: **el nombre de la pestaña solo, sin celdas, devuelve todas las celdas con datos**; si el nombre lleva espacios o acentos va entre comillas simples (`'Entrega inmediata'`). `majorDimension` por defecto `ROWS`; `valueRenderOption` por defecto `FORMATTED_VALUE` (usar `UNFORMATTED_VALUE` para precios numéricos). `values.batchGet` lee varias pestañas en una llamada. Fuente: [A1 notation](https://developers.google.com/workspace/sheets/api/guides/concepts), [Reading values](https://developers.google.com/workspace/sheets/api/guides/values).
- Cuotas (fuente: [Usage limits](https://developers.google.com/workspace/sheets/api/limits)): **300 lecturas/min por proyecto y 60/min por usuario por proyecto**; 300 escrituras/min por proyecto; sin límite diario; «calls from a service account count as a single account» (nuestro cron queda bajo el tope de 60/min); exceso devuelve 429 (backoff exponencial). La página advierte que **cobrarán por exceder cuotas más adelante en 2026**. Un cron cada 10 min = 144 lecturas/día: irrelevante.

## Riesgos para nuestro diseño

1. **Plan Hobby**: no permite uso comercial, crons solo una vez al día (nuestro cron por minuto **falla al desplegar**), `maxDuration` fijo en 300 s y sin múltiples regiones. El bot necesita **Vercel Pro** desde el primer despliegue con crons. Presupuestar ~$20/mes más uso.
2. **`waitUntil` no es durable**: si Claude tarda 25 s y la función tiene `maxDuration` 60 s está bien, pero un redeploy, un timeout o un error no registrado pierde la respuesta sin reintento. Mitigación: todo mensaje entrante se escribe en Supabase **antes** de responder 200, y el despachador (pg_cron/cron) reprocesa lo que quedó en estado `pendiente` más de N segundos.
3. **Doble entrega de Meta**: WhatsApp reintenta webhooks si no recibe 200 rápido y puede repetir eventos; hay que deduplicar por `wamid` (unique en la tabla de mensajes) y responder 200 aunque el mensaje ya exista.
4. **Concurrencia del despachador**: pg_cron cada 5 s más cron de Vercel cada minuto pueden solaparse. Tomar conversaciones con `update … where responder_en <= now() and estado = 'esperando' … for update skip locked` (o un campo `tomada_en`) para que dos despachadores no respondan dos veces.
5. **pg_net**: beta, timeout por defecto 2 s, sin reintentos, respuestas guardadas 6 h (`net._http_response` crece). El endpoint `/api/despachar` debe responder 200 en < 1 s y hacer el trabajo con `waitUntil`; subir `timeout_milliseconds` a 5000; limpiar `cron.job_run_details` a diario (un job cada 5 s genera 17,280 filas/día).
6. **Supabase Free se pausa tras 7 días sin actividad** y mata pg_cron sin aviso. Para producción: **Supabase Pro** ($25/mes) o, como mínimo, aceptar que el cron de Vercel sea el despachador principal y pg_cron un refuerzo.
7. **Vercel Queues sigue en beta** (`queue/v2beta`, `experimentalTriggers`), sin cancelación de mensajes, y `idempotencyKey` deduplica durante toda la retención: no sirve para «reiniciar» el debounce. Si se adopta, hay que diseñar el consumidor con el patrón «descartar si hay mensaje más reciente».
8. **Workflow DevKit exige Nitro + Hono/Express**: romper la premisa «sin framework» y añadir un bundler; además cada conversación larga acumula eventos (límite 25,000 por run, replay 240 s) y hay que cerrar runs.
9. **Crons de Vercel**: best effort (puede saltar o duplicar corridas), sin reintentos, UTC, no corren en preview ni en `vercel dev`. Los seguimientos deben ser idempotentes (marcar `seguimiento_enviado_at` antes de enviar) y tolerar un minuto perdido.
10. **Ignored Build Step**: los builds cancelados cuentan contra la cuota diaria de deployments; con dos proyectos y commits frecuentes en Hobby (100/día) se nota, en Pro (6,000/día) no. Vercel clona con profundidad 10: un merge con muchos commits puede dejar `HEAD^` fuera del clon (raro, pero documentado como causa de fallos del diff).
11. **Llaves legacy de Supabase** (`anon`/`service_role`) se deprecan a fines de 2026: usar `sb_secret_` desde el inicio y guardar la llave como variable «Sensitive».
12. **Node 20 deprecado el 1-oct-2026**: ya pasó; fijar `engines.node` a `24.x` (o `22.x`) para que `supabase-js` y `googleapis` (ambos exigen >= 22) instalen sin advertencias.
13. **Cuota de Sheets**: insignificante para un cron cada 10 min, pero si el panel o pruebas locales leen mucho, el tope de 60/min por cuenta de servicio aplica a todos los procesos que compartan la misma cuenta.

## Recomendaciones concretas

**Debounce de 4 s con reinicio: opción (iii), fila en Supabase + despachador.**

1. Webhook `POST /api/webhook/whatsapp` (y `/api/webhook/instagram`): verifica la firma de Meta, inserta el mensaje (`insert … on conflict (wamid) do nothing`), hace `upsert` en `conversaciones` con `estado = 'esperando'`, `ultimo_mensaje_at = now()`, `responder_en = now() + interval '4 seconds'`, y **responde 200 de inmediato** (< 200 ms). Nada de Claude aquí.
2. Despachador `POST /api/despachar` (protegido con `Authorization: Bearer <DESPACHO_SECRET>`): toma hasta N conversaciones con `responder_en <= now() and estado = 'esperando'` usando `for update skip locked`, las marca `estado = 'respondiendo'`, responde 200 y procesa con `waitUntil`: arma el contexto, llama a Claude (5 a 25 s), envía por la API de Meta, guarda la respuesta y vuelve a `estado = 'idle'`. Si entre tanto llegó otro mensaje (`ultimo_mensaje_at > tomada_en`), reencola en vez de responder. `maxDuration: 120` para ese archivo.
3. Disparo del despachador cada 5 s con **pg_cron + pg_net** (`'5 seconds'`, `timeout_milliseconds := 5000`), y como red de seguridad el **cron de Vercel por minuto** (que ya existe para seguimientos) llama también al despachador. Si Supabase queda en Free y se pausa, el cron de Vercel sigue despachando con hasta 60 s de retraso; con Supabase Pro el debounce responde en 4 a 9 s.
4. Deja Workflow DevKit como opción futura si el bot crece a flujos largos (cotizaciones con aprobación humana); no lo metas ahora.

**Crons**

- `bot/vercel.json`: `{ "path": "/api/cron/minuto", "schedule": "* * * * *" }` (seguimientos, alertas y despacho de respaldo) y `{ "path": "/api/cron/sheets", "schedule": "*/10 * * * *" }` (sincronizar la hoja de Google a la tabla `catalogo`). Validar `Authorization: Bearer ${CRON_SECRET}` y rechazar con 401 si falta la variable. Operaciones idempotentes (marcar antes de enviar) y lock liviano en Supabase (`cron_locks` con `expires_at`) para evitar solapes.
- Requiere **Vercel Pro**; en Hobby el despliegue falla por la frecuencia.
- Horario en UTC: para «no mandar seguimientos de madrugada» convertir a `America/Monterrey` en el código, no en la expresión.

**Layout del proyecto**

```
bot/
  package.json        { "type": "module", "engines": { "node": "24.x" } }
  tsconfig.json
  vercel.json         functions (maxDuration por ruta), crons, ignoreCommand
  api/
    webhook/whatsapp.ts     GET (verify token) + POST (eventos)
    webhook/instagram.ts
    despachar.ts            POST, Bearer DESPACHO_SECRET, maxDuration 120
    cron/minuto.ts          GET, Bearer CRON_SECRET
    cron/sheets.ts          GET, Bearer CRON_SECRET
  src/
    supabase.ts             createClient con sb_secret_, persistSession false
    claude.ts               @anthropic-ai/sdk 0.133.0
    meta.ts                 envío por Graph API
    sheets.ts               googleapis + JWT desde GOOGLE_SA_JSON
  supabase/migrations/      tablas, RLS activado, pg_cron job 'despachar-bot'
```

- Dos proyectos Vercel sobre el mismo repo: el sitio (Root Directory raíz) y `officeture-bot` (Root Directory `bot/`, Framework Preset «Other», región `iad1`). En **cada** proyecto, Ignored Build Step = «Only build if there are changes in a folder» apuntando a su carpeta, o en `vercel.json`: sitio `"ignoreCommand": "git diff --quiet HEAD^ HEAD -- . ':!bot'"` y bot `"ignoreCommand": "git diff --quiet HEAD^ HEAD -- ."` (corre dentro de `bot/`). Así un commit en `bot/` no redespliega el sitio y viceversa.
- Variables del proyecto bot (Sensitive): `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `ANTHROPIC_API_KEY`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN`, `IG_TOKEN`, `CRON_SECRET`, `DESPACHO_SECRET`, `GOOGLE_SA_JSON`, `SHEET_ID`.
- Supabase: proyecto nuevo en `us-east-1`, plan Pro cuando salga a producción; `@supabase/supabase-js@2.117.3`; RLS activado en todas las tablas; llave `sb_secret_` solo en el servidor; pg_cron ≥ 1.5 y pg_net habilitados; job de limpieza de `cron.job_run_details`.
- Google: `googleapis@185.0.0` (o `@googleapis/sheets` para bundle chico) + `google-auth-library@11.2.0` con `JWT` desde `GOOGLE_SA_JSON`; scope `spreadsheets.readonly`; `values.get({ range: 'NombrePestaña' })`, `valueRenderOption: 'UNFORMATTED_VALUE'`. `google-spreadsheet@5.3.0` solo si se prefiere la API de filas con encabezados.

**Versiones a fijar (9-oct-2026)**: Node `24.x` · `@vercel/functions` 3.9.11 · `@vercel/node` 23.0.0 (solo tipos) · `@supabase/supabase-js` 2.117.3 · `@anthropic-ai/sdk` 0.133.0 · `googleapis` 185.0.0 · `google-auth-library` 11.2.0 · (`@vercel/queue` 0.8.0 y `workflow` 5.2.0 solo si se cambia de opción).

## Fuentes

Vercel

- Vercel Queues (beta): https://vercel.com/docs/queues [2026-09-03]
- Queues, pricing y límites: https://vercel.com/docs/queues/pricing [2026-08-12]
- Queues, API HTTP: https://vercel.com/docs/queues/api [2026-09-15]
- Queues, JS SDK: https://vercel.com/docs/queues/sdk [2026-08-12]
- Changelog Queues public beta: https://vercel.com/changelog/vercel-queues-now-in-public-beta [2026-02-27]
- Vercel Workflows: https://vercel.com/docs/workflows [2026-09-04]
- Workflow pricing y límites: https://vercel.com/docs/workflows/pricing [2026-09-16]
- Workflow SDK, getting started (frameworks): https://workflow-sdk.dev/docs/getting-started [2026-10-08]
- Workflow SDK, Express y Hono: https://workflow-sdk.dev/docs/getting-started/express · https://workflow-sdk.dev/docs/getting-started/hono [2026-10-08]
- Workflow SDK, Run (cancel, wakeUp): https://workflow-sdk.dev/docs/api-reference/workflow-api/get-run
- Workflows GA (fuente secundaria): https://community.vercel.com/t/vercel-weekly-2026-04-20/38580
- Functions limits: https://vercel.com/docs/functions/limitations [2026-08-24]
- Functions API reference (sin framework): https://vercel.com/docs/functions/functions-api-reference [2026-08-11]
- `@vercel/functions` (waitUntil, getDeadline): https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package [2026-09-03]
- Configurar duración: https://vercel.com/docs/functions/configuring-functions/duration
- Fluid compute: https://vercel.com/docs/fluid-compute
- Node.js versions: https://vercel.com/docs/functions/runtimes/node-js/node-js-versions [2026-02-27]
- Cron Jobs: https://vercel.com/docs/cron-jobs [2026-09-16]
- Cron usage y pricing: https://vercel.com/docs/cron-jobs/usage-and-pricing [2026-07-15]
- Managing Cron Jobs: https://vercel.com/docs/cron-jobs/manage-cron-jobs [2026-08-11]
- Hobby plan: https://vercel.com/docs/plans/hobby [2026-09-14]
- Monorepos: https://vercel.com/docs/monorepos [2026-08-11]
- Project settings (Ignored Build Step): https://vercel.com/docs/project-configuration/project-settings [2026-09-21]
- KB Ignored Build Step: https://vercel.com/kb/guide/how-do-i-use-the-ignored-build-step-field-on-vercel [2026-09-28]
- Git configuration (`ignoreCommand`, `git.deploymentEnabled`): https://vercel.com/docs/project-configuration/git-configuration
- Regions: https://vercel.com/docs/regions

Supabase

- Cron (recomendaciones): https://supabase.com/docs/guides/cron
- Cron quickstart (sintaxis, segundos, http_post): https://supabase.com/docs/guides/cron/quickstart.md
- pg_cron: https://supabase.com/docs/guides/database/extensions/pgcron
- pg_net: https://supabase.com/docs/guides/database/extensions/pg_net
- Edge Functions limits: https://supabase.com/docs/guides/functions/limits
- Edge Functions CPU limits: https://supabase.com/docs/guides/troubleshooting/edge-function-cpu-limits
- Deno 2.1 en todas las regiones: https://supabase.com/changelog/37941-all-regions-now-run-deno-2-1-compatible-release [2025-08-15]
- Regional invocations: https://supabase.com/docs/guides/functions/regional-invocation
- API keys (publishable/secret, deprecación legacy): https://supabase.com/docs/guides/api/api-keys
- Regiones: https://supabase.com/docs/guides/platform/regions
- Pricing: https://supabase.com/pricing
- Queues (pgmq): https://supabase.com/docs/guides/queues

Upstash

- QStash deduplication: https://upstash.com/docs/qstash/features/deduplication
- QStash delay: https://upstash.com/docs/qstash/features/delay
- QStash pricing: https://upstash.com/docs/qstash/overall/pricing
- QStash cancel message: https://upstash.com/docs/qstash/api/messages/cancel

Google

- Sheets usage limits: https://developers.google.com/workspace/sheets/api/limits
- Sheets A1 notation: https://developers.google.com/workspace/sheets/api/guides/concepts
- Sheets reading values: https://developers.google.com/workspace/sheets/api/guides/values
- google-auth-library README: https://github.com/googleapis/google-auth-library-nodejs
- node-google-spreadsheet auth: https://github.com/theoephraim/node-google-spreadsheet/blob/main/docs/guides/authentication.md

npm (registro consultado el 2026-10-09)

- `@supabase/supabase-js` 2.117.3 · `googleapis` 185.0.0 · `google-auth-library` 11.2.0 · `google-spreadsheet` 5.3.0 · `@vercel/queue` 0.8.0 · `workflow` 5.2.0 · `@vercel/functions` 3.9.11 · `@vercel/node` 23.0.0 · `@upstash/qstash` 2.12.0 · `@vercel/config` 0.12.0 · `@anthropic-ai/sdk` 0.133.0
