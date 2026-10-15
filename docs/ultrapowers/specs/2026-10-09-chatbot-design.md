# Chatbot OfficeTure · diseño

Fecha: 9 de octubre de 2026. Autor: VITAstudio (Jair) para Top Digital. Estado: aprobado en brainstorming, pendiente de investigación técnica.

## 1. Qué es y para qué

Un asistente de ventas por WhatsApp e Instagram para OfficeTure. Contesta el primer mensaje de inmediato, detecta qué busca la persona, recomienda productos de entrega inmediata con precios reales, levanta los datos del pedido y pasa la conversación a Bryan López cuando toca. Las conversaciones llegan sobre todo de campañas de Meta Ads que corre Top Digital.

Objetivo medible: más pedidos confirmables al mes. Métricas secundarias: conversaciones atendidas, leads calificados, cotizaciones, transferencias a Bryan, ventas cerradas, motivos de pérdida, productos más pedidos, zonas con más demanda.

### Decisiones tomadas en brainstorming

| Tema | Decisión |
|------|----------|
| Plataforma | Bot propio: WhatsApp Cloud API + Instagram Messaging API, Claude como cerebro, Supabase como base. No Go High Level. |
| Alcance | Vende entrega inmediata. Si piden equipar una oficina completa, califica lo básico y transfiere a Bryan. Proveedores quedan fuera de la v1. |
| Canales v1 | WhatsApp e Instagram. Messenger y chat en el sitio quedan para después. |
| Entrada de Bryan | Modo coexistencia de Meta: el número sigue en la app de WhatsApp Business de Bryan y el bot responde por API. Si coexistencia no está disponible para el número, se construye una bandeja propia (sección 11). |
| Seguimiento | Primer contacto automático con detección de intención. Recordatorios mínimos: 2 h, 24 h y 2 días. |
| Inventario | La hoja de Google «OfficeTure - Productos Entrega Inmediata GHL» es la fuente de verdad. Se sincroniza a Supabase. |
| Identidad | Asistente virtual con nombre propio. Nombre de trabajo: **Mariana**. Se cambia por variable de entorno cuando los dueños elijan. Si preguntan si es bot, lo dice. |
| Infraestructura | Carpeta `bot/` en este repo, proyecto Vercel Pro separado del sitio, Supabase Pro en `us-east-1`, Claude Sonnet 5.5, Node 24. |
| Alta de WhatsApp | Top Digital se registra como Tech Provider de Meta y conecta el número con Embedded Signup v4 en modo coexistencia. Mientras se aprueba, todo se construye y prueba con el número de prueba de Meta. |
| Flujo de trabajo | Auto-commit y auto-push en la rama `chatbot`; specs e investigación se commitean. |

### Fuentes

- «Versión Mejorada GHL - Cerebro Chatbot con IA - OfficeTure» (Google Doc, id `1JovnM7DmA9L6VuDxLkvekHWMsGZ7cd29AABQnUSL83s`): reglas, flujo, triggers, FAQ, objeciones, seguimientos.
- «Cerebro Chatbot con IA - OfficeTure» (id `1bX5u-quiPRdl7XfZg9GXOlBuv9WpXzCnir7Q_w_dNCU`): respuestas del cliente sobre pagos, entregas, garantías.
- Hoja «OfficeTure - Productos Entrega Inmediata GHL» (id `1aUWbdkkDhSSW-AgYewjJkYmT0fpVmn3Vy-z_XLSx0xk`): 42 productos, pestañas `Import_GHL` y `Reglas_Chatbot`.
- `CLAUDE.md` del repo: tono de marca, datos de contacto, reglas de trabajo.

## 2. Arquitectura

```
Meta (WhatsApp / Instagram)
        │ webhook
        ▼
bot/api/webhook  ── verifica firma, guarda evento, agenda turno (4 s) ── 200
        │
        ▼
turno de respuesta  ── carga contexto ── Claude + herramientas ── envía por adaptador
        │                                      │
        ▼                                      ▼
   Supabase (contactos, conversaciones, mensajes, leads, productos, alertas)
        ▲
        │ cron 10 min
   Hoja de Google (inventario)
```

### Componentes

| Componente | Responsabilidad | Depende de |
|------------|-----------------|------------|
| `api/webhook` | Verificación GET de Meta. POST: validar `X-Hub-Signature-256`, deduplicar por id de mensaje, guardar evento crudo, normalizar a `MensajeEntrante`, agendar turno. Responde en menos de 1 s. | Adaptadores, Supabase |
| Cola de turnos | Columna `responder_en` en `conversaciones`. El webhook la mueve a `ahora + 4 s` con cada mensaje. `pg_cron` cada 5 s llama por `pg_net` a `POST /api/despachar`, que toma las vencidas con `for update skip locked`, las marca en proceso y ejecuta el trabajador con `waitUntil`. El cron de Vercel por minuto llama al mismo despachador como respaldo. Idempotente: un turno en proceso no se toma dos veces. | Supabase (`pg_cron`, `pg_net`), `@vercel/functions` |
| Trabajador | Carga los mensajes del hilo actual (máximo 30; al superarlos se cierra el hilo, se resume con Claude y se abre uno nuevo con el resumen en el contexto dinámico), estado del lead, modo de la conversación. Si el modo no es `bot`, no responde (única excepción: el aviso de una sola vez en `esperando_humano`, sección 6). Llama a Claude con herramientas, ejecuta llamadas, envía la respuesta en una sola burbuja (dos solo si incluye foto + texto, porque cada mensaje cuesta), guarda todo. | Claude, adaptadores, Supabase |
| Adaptador WhatsApp | Cliente propio con `fetch` (el paquete oficial de Meta está archivado), versión de Graph en variable de entorno (v25.0 o v26.0). Entrada: texto, imagen, audio, ubicación, botón, referencia de anuncio (`referral`), eco de mensajes de Bryan (`smb_message_echoes`). La media del cliente se descarga en el webhook porque su URL caduca en 5 minutos. Salida: texto, imagen por `media id`, plantilla, y «escribiendo» + leído en una sola llamada. | Graph API |
| Adaptador Instagram | Instagram Messaging API con Facebook Login y token de página. Entrada: texto, imagen, historia respondida, referencia de anuncio (`ad_id`, `ads_context_data`). Eco de la app de IG por `is_echo: true`; los ecos del propio bot se reconocen por sus ids guardados. Salida: texto (máximo 1,000 bytes) e imagen, `typing_on` y `mark_seen`. | Graph API |
| Transcripción | Los audios se transcriben con `gpt-4o-mini-transcribe` (alternativa Deepgram Nova-3 `es-419`) antes de pasar a Claude. Si falla, el bot pide que lo escriba. | API de transcripción |
| Herramientas de Claude | Funciones puras sobre Supabase descritas en sección 4. | Supabase |
| Sincronizador de inventario | Lee la hoja con cuenta de servicio, valida, hace upsert en `productos`, marca inactivos los que desaparecen. | Google Sheets API |
| Cron de seguimientos y alertas | Cada minuto: envía recordatorios vencidos, reenvía alertas sin atender, reactiva el bot cuando vencen `humano` o `esperando_humano`. Corre como cron de Vercel por minuto (`bot/vercel.json`), posible porque el proyecto está en Vercel Pro (el plan Hobby solo admite crons diarios; sección 12). El despacho de turnos cada 5 s sigue en Supabase (`pg_cron` + `pg_net`). Sin Vercel Pro, el cron por minuto tendría que moverse a `pg_cron`, llamando por `pg_net` a los mismos endpoints. | Supabase, adaptadores |
| Simulador | CLI que corre escenarios guionizados contra el trabajador sin tocar Meta y guarda la transcripción para calificar tono y triggers. | Trabajador |

### Estructura de carpetas

```
bot/
  api/
    webhook.ts          # GET verify + POST eventos
    cron/seguimientos.ts
    cron/inventario.ts
  src/
    canales/whatsapp.ts
    canales/instagram.ts
    canales/tipos.ts    # MensajeEntrante, MensajeSaliente
    cerebro/prompt.ts   # arma el prompt del sistema
    cerebro/herramientas.ts
    cerebro/responder.ts
    datos/              # consultas a Supabase
    flujo/turnos.ts     # debounce
    flujo/triggers.ts
    flujo/seguimiento.ts
  supabase/migrations/
  pruebas/
    unitarias/
    escenarios/*.md     # conversaciones guionizadas
    simulador.ts
  package.json
  vercel.json
```

## 3. Recorrido de un mensaje

1. Cliente da clic en un anuncio de sillas y escribe «hola, precio de sillas».
2. Meta manda el evento. El webhook valida firma, guarda `eventos` con el id del mensaje, crea o recupera `contacto` y `conversacion`, inserta `mensaje`, agenda turno a 4 s, marca leído y responde 200.
3. Si llega «como 6» a los 2 s, se inserta y el turno se reprograma.
4. Vence el turno. El trabajador ve modo `bot`, arma contexto: prompt del sistema, resumen del lead, últimos mensajes, referencia del anuncio.
5. Claude llama `buscar_productos({categoria:'silla', cantidad:6})`, recibe sillas operativas con precio, y responde en dos burbujas: la recomendación y una pregunta (área y municipio).
6. El adaptador manda «escribiendo», espera 1 a 2 s por burbuja, envía, guarda `mensajes` con `autor: bot`.
7. Si la cantidad fuera 4 o más, Claude llama `registrar_lead` con `prioritario: true` y sigue cotizando; la transferencia ocurre al cierre (sección 6). Si fueran 10 o más, llama `escalar` de inmediato.

Tiempo total objetivo: 5 a 8 s desde el último mensaje del cliente.

## 4. El cerebro

### Prompt del sistema

Se arma en código a partir de bloques versionados en `bot/src/cerebro/`:

1. **Identidad y tono.** Nombre del asistente, español de México, tuteo, frases cortas, una pregunta por mensaje (máximo dos), sin signos de exclamación, sin mayúsculas para vender, máximo un emoji ocasional, no repetir cierres, no decir «con gusto» siempre. Promesas concretas: cotización en 30 minutos, entrega en 1 a 2 días si hay inventario, instalado. Ejemplos de tono correcto e incorrecto del cerebro de Tadeo.
2. **Reglas duras.** Las 20 del cerebro: no inventar precios, stock, medidas, colores, promociones; todo es + IVA; sin tarjeta ni meses sin intereses; no confirmar cierre; no prometer mismo día sin validar; no discutir precio; no comparar agresivamente; no mandar a otra tienda; no pedir todos los datos en el primer mensaje. Regla adicional: todo número que mencione debe venir de una herramienta.
3. **Información fija.** Dirección, showroom, horarios, zonas de entrega, entrega gratis desde $40,000 en 5 municipios, pagos, anticipo 50 %, facturación, garantías, política de cambios, maniobras a planta alta. Respuestas autorizadas a objeciones y FAQ.
4. **Flujo de venta.** Detectar intención, producto, cantidad, área, municipio; recomendar máximo 3 opciones; dar precio en el formato obligatorio; cierre suave; datos del pedido solo con interés real; resumen y transferencia.
5. **Contexto dinámico.** Referencia del anuncio (encabezado y cuerpo del anuncio que trajo al cliente), hora local y si es horario de atención, resumen del lead hasta ahora, modo de la conversación.

Los bloques 1 a 4 son estáticos y se mandan con caché de prompt. El bloque 5 va al final.

### Herramientas

| Herramienta | Entrada | Salida | Regla |
|-------------|---------|--------|-------|
| `buscar_productos` | categoría, subcategoría, uso, presupuesto máximo, cantidad | hasta 5 productos activos con nombre, precio + IVA, stock, uso recomendado, medidas y colores si existen, url de foto | Ordena por prioridad de venta y ajuste al presupuesto. Nunca devuelve inactivos. |
| `info_entrega` | municipio o colonia | si entregan, si aplica mismo día, tiempo estimado, regla de envío gratis, costo de maniobras | Si el municipio no está en la lista, responde «fuera de zona, escalar». |
| `registrar_lead` | campos del lead (parciales), `prioritario` opcional con motivo (`4_piezas`, `factura`, `planta_alta`) | lead actualizado | Acumula; no exige todos los campos. Marcar prioritario no interrumpe la conversación. |
| `escalar` | motivo (enum de triggers inmediatos), resumen, urgencia, tipo de cliente | confirmación | Transfiere de inmediato: dispara sección 6. |
| `enviar_foto` | id de producto | confirmación | Solo si el producto tiene foto. |
| `hora_actual` | ninguna | hora en Monterrey y si es horario de atención | |

Los seguimientos no son una herramienta: los programa el sistema según el estado de la conversación (sección 7). Claude solo puede anunciarlos en texto («te escribo en 2 días») cuando el cerebro lo indica.

### Modelo

`claude-sonnet-5-5` con `effort: "low"` y `max_tokens` 1500, SDK `@anthropic-ai/sdk@0.133.0` con `toolRunner`, herramientas `strict: true` y `tool_choice: auto` (Sonnet 5.5 no acepta temperatura ni herramienta forzada). Caché del sistema con `ttl: "1h"`. Timeout 60 s, 2 reintentos. Las imágenes del cliente se redimensionan a 1,568 px y van en base64. La extracción final del lead se hace con salida estructurada en una llamada aparte. Haiku 5.5 queda como alternativa si la eval de escenarios lo aprueba. Registro de cada llamada: tokens, herramientas usadas, latencia, texto final.

### Lo que no hace

No conversa de temas ajenos; redirige en una línea. No da descuentos. No confirma pedidos. No inventa nombres de modelos. Si no sabe, usa la frase autorizada: «Ese dato te lo confirmo con el asesor para no darte información incorrecta».

## 5. Primer contacto y detección de intención

- Si el mensaje trae referencia de anuncio, el bot abre reconociendo el tema del anuncio sin repetirlo textualmente, y pregunta lo mínimo para avanzar.
- Si no trae referencia, clasifica el primer mensaje en: escritorio, silla, archivero, paquete, proyecto completo, pregunta de servicio (horario, ubicación, factura), proveedor, otro. Las categorías de producto entran al flujo de venta. Proyecto completo entra al flujo de calificación corta: personas, mobiliario, municipio, fecha deseada, y escala. Proveedor recibe una respuesta fija con el correo del negocio y se escala con motivo `proveedor` sin flujo de venta. Otro recibe una pregunta de orientación.
- Saludos sin contenido reciben la apertura del cerebro: qué busca, escritorio, silla, archivero o mobiliario para oficina.
- Para elegir categoría o municipio puede usar botones de WhatsApp (máximo 3 de 20 caracteres) o una lista (hasta 10 filas). Lo demás, texto libre.

### Aviso de privacidad

La primera vez que el bot va a pedir un dato personal (nombre, teléfono, dirección), antes de pedirlo, manda una línea: «Tus datos los usamos solo para cotizar y entregar tu pedido. Aviso de privacidad: <enlace>.» Se registra en `leads.aviso_enviado`. Datos fiscales no se piden en el chat; la factura se deriva a Bryan. Si el cliente pide que no le escriban, se marca `no_contactar` y se cancelan seguimientos.

## 6. Triggers y entrada de Bryan

### Disparadores

Hay dos clases.

**Inmediatos** (Claude llama `escalar` y la conversación pasa a Bryan en ese momento): listo para comprar (el cliente acepta la pregunta de cierre o empieza a dar datos de pedido), pide descuento, entrega mismo día, 10 piezas o más, instalación especial, producto fuera de inventario, a medida, queja, proyecto completo, quiere pagar, pide hablar con una persona, el bot no entiende dos mensajes seguidos, cliente molesto o lenguaje agresivo, municipio fuera de zona, proveedor.

**Marcadores** (Claude llama `registrar_lead` con `prioritario` y sigue cotizando): 4 a 9 piezas, pide factura, planta alta. El lead queda marcado y la transferencia ocurre cuando se cumpla un trigger inmediato, normalmente «listo para comprar». El umbral de 10 piezas es distinto al de 4 porque el cerebro lo trata como prospecto empresarial prioritario que Bryan debe atender desde el inicio.

### Qué pasa al escalar

1. El bot manda al cliente el mensaje de transferencia del cerebro («te paso con Bryan López para que confirme disponibilidad, pago y entrega»).
2. Guarda en `leads` el resumen interno con el formato del cerebro: nombre, empresa, teléfono, producto, cantidad, color, zona, dirección, horario, factura, pago, fecha, comentarios, urgencia, tipo de cliente.
3. Crea `alerta` y la envía al WhatsApp personal de Bryan con el resumen, el motivo y el nombre del contacto tal como aparece en su app. Si Bryan no ha escrito al número del negocio en las últimas 24 h, se usa la plantilla utility `alerta_bryan`. La misma alerta se copia por correo como respaldo gratuito.
4. Pone la conversación en modo `esperando_humano`. El bot deja de responder, salvo para decir una vez «Bryan te atiende en un momento» si el cliente insiste.
5. Si Bryan no escribe en ese chat en 30 minutos dentro de horario, la alerta se reenvía a Bryan y se copia al segundo número de dueños. Fuera de horario, las alertas se agrupan y se envían a las 9:00 del siguiente día hábil, además de la alerta inmediata.
6. `esperando_humano` vence a las 2 horas dentro de horario, o a las 11:00 del siguiente día hábil si se disparó fuera de horario. Al vencer sin eco de Bryan, el bot vuelve a modo `bot`, avisa al cliente con un texto según el motivo (si hubo pedido: «Bryan sigue revisando tu pedido, mientras tanto te ayudo con cualquier duda»; si fue error o queja: «ya estoy de vuelta, dime en qué te ayudo»), y el lead queda marcado `escalado_sin_atender`, que aparece en la alerta diaria. El cliente nunca queda sin respuesta más de 2 horas en horario.

En `esperando_humano`, `humano` y `pausado` no se programan ni se envían seguimientos de la sección 7.

### Coexistencia

El número 81 2428 3124 permanece en la app de WhatsApp Business de Bryan y se conecta a la Cloud API en modo coexistencia. Meta entrega al webhook el eco de los mensajes que Bryan manda desde su app. Al recibir un eco, la conversación pasa a modo `humano` por 12 horas. En Instagram aplica lo mismo con el eco de la app de IG.

### Comandos de Bryan

Lo que Bryan escribe en el chat del cliente desde su app llega al cliente, así que los comandos no van ahí. Van por el canal de alertas: Bryan contesta desde su número personal al número del negocio, y el bot los procesa sin reenviar nada al cliente. Cada alerta incluye un identificador de la conversación: el teléfono del cliente en WhatsApp, o el usuario de Instagram en IG. El comando acepta cualquiera de los dos; si Bryan responde citando la alerta, el bot usa esa cita y el identificador no hace falta. El webhook reconoce los números de los dueños antes de crear contacto o turno, así que nunca se tratan como clientes.

| Comando | Efecto |
|---------|--------|
| `/bot 8112345678` | La conversación vuelve a modo `bot` ya. |
| `/pausa 8112345678` | Modo `pausado`: el bot calla hasta `/bot`. |
| `/ganado 8112345678` | Estado `ganado`; cierra seguimientos. |
| `/perdido 8112345678 precio` | Estado `perdido` con motivo libre; cierra seguimientos. |
| `/ayuda` | Lista de comandos. |

Solo se aceptan comandos de los números registrados de Bryan y del segundo dueño. Cualquier otro mensaje desde esos números se ignora y se registra.

Si la investigación confirma que coexistencia no está disponible para este número, se activa la alternativa de la sección 11.

## 7. Seguimiento

| Momento | Condición | Canal y costo | Mensaje |
|---------|-----------|---------------|---------|
| 3 h sin respuesta | El cliente dejó el flujo a medias o recibió precio y no contestó | Mensaje libre dentro de la ventana de 24 h | Seguimiento corto del cerebro, adaptado al punto donde se quedó |
| Día siguiente, 10:00 | No contestó el toque 1 | Si la conversación vino de anuncio y sigue dentro de la ventana gratuita de 72 h: libre y gratis. Si no: plantilla utility con costo. | «¿Te gustaría avanzar con este modelo o te paso otra opción según tu presupuesto?», o el recordatorio de inventario y ruta si dijo «lo voy a revisar» |

Los toques solo salen entre 9:00 y 20:00; si caen fuera, se mueven a las 9:00. Los programa el sistema, no Claude: cuando el trabajador envía un mensaje, evalúa el estado de la conversación e inserta en `seguimientos` el siguiente toque que corresponda; el cron solo despacha los vencidos. Cualquier mensaje del cliente cancela los pendientes. Máximo 2 toques por lead, porque más de dos se percibe como envío masivo y los bloqueos bajan la calidad del número ante Meta. Después, el lead pasa a estado `frio` y aparece en la alerta diaria a Bryan. No hay seguimientos en modos `esperando_humano`, `humano` o `pausado`, ni a quien pidió que no le escriban.

Las plantillas y la ventana de 24 h son de WhatsApp. En Instagram no existen plantillas: ahí solo aplica el toque de 3 horas dentro de la ventana; lo que no contesta en 24 h pasa directo a `frio`.

Plantillas a registrar en Meta, todas de categoría utility: `seguimiento_precio`, `seguimiento_revision`, `alerta_bryan` (para que Bryan reciba alertas aunque no haya escrito en 24 h). Si Meta reclasifica alguna como marketing, su costo sube de USD 0.0085 a 0.0397 por envío.

## 8. Datos

### Tablas en Supabase

| Tabla | Campos clave |
|-------|--------------|
| `contactos` | id, canal (`whatsapp` / `instagram`), id externo, nombre mostrado, teléfono, empresa, creado |
| `conversaciones` | id, contacto, canal, modo (`bot` / `esperando_humano` / `humano` / `pausado`), modo_hasta, referencia de anuncio (id, encabezado, cuerpo, ctwa_clid), último mensaje del cliente, último mensaje del bot, estado (`nuevo` / `calificado` / `cotizado` / `pedido` / `transferido` / `ganado` / `perdido` / `frio`) |
| `mensajes` | id, conversación, autor (`cliente` / `bot` / `humano`), tipo, texto, url de adjunto, id externo, enviado, leído, error |
| `leads` | id, conversación, los campos del resumen interno, producto de interés, cantidad, presupuesto, urgencia, tipo de cliente, prioritario (bool) y motivos de prioridad, motivo de escalación, escalado_sin_atender (bool), aviso_enviado (bool), no_contactar (bool), motivo de pérdida, resumen para Bryan |
| `productos` | id, categoría, subcategoría, nombre, slug, precio, stock, prioridad, uso recomendado, respuesta base, medidas, colores, foto, activo, sincronizado |
| `plantillas` | nombre, idioma, estado de aprobación, cuerpo, variables |
| `alertas` | id, conversación, motivo, enviada a, enviada en, atendida en, reintentos |
| `seguimientos` | id, conversación, tipo, programado para, enviado en, cancelado |
| `eventos` | id externo único, canal, payload crudo, procesado en |
| `llamadas_modelo` | id, conversación, modelo, tokens entrada y salida, herramientas, latencia, costo estimado |

RLS activado en todo. Solo la clave de servicio del bot lee y escribe. No hay acceso anónimo.

### Sincronización con la hoja

Cada 10 minutos una función lee `Import_GHL` con una cuenta de servicio de Google que tiene acceso de lectura a la hoja. Mapea columnas, valida precio numérico y stock conocido, hace upsert por slug del nombre, y marca `activo = false` lo que ya no aparece. Si la lectura falla, mantiene lo último y avisa por alerta interna después de 3 fallos seguidos.

Se le propone a Tadeo agregar a la hoja las columnas `Medidas`, `Colores`, `Foto_URL` y `Activo`. Sin ellas el bot funciona, pero responde «te lo confirma el asesor» para medidas y colores. Los textos de `Respuesta_Chatbot_Base` se usan como referencia de tono, no se mandan literales.

## 9. Errores y resiliencia

- Firma inválida: 403 y registro. Evento duplicado: 200 sin procesar.
- Claude falla o tarda más de 25 s: reintento una vez; si vuelve a fallar, el bot manda «Dame un momento, en seguida te atiendo», crea alerta a Bryan con motivo `error_modelo` y deja la conversación en `esperando_humano`.
- Meta rechaza el envío: reintento con espera creciente hasta 3 veces; se guarda el error en `mensajes`.
- Ventana de 24 h cerrada: cualquier envío libre se convierte en plantilla si existe una equivalente; si no, se registra y no se manda.
- Hoja inaccesible: se conserva el inventario anterior.
- Todo error grave se registra en `eventos` con el payload para reproducirlo.

## 10. Pruebas

- **Unitarias**: adaptadores (normalización de cada tipo de evento, firma), herramientas (búsqueda, reglas de entrega, límites de seguimiento), triggers (cada motivo dispara el flujo correcto), turnos (reprogramación con mensajes seguidos), sincronizador (mapeo y validación).
- **Escenarios guionizados** en `pruebas/escenarios/`: cliente de anuncio de sillas; «está caro»; 12 sillas para capacitación; proyecto de 10 personas; pide factura; queja; manda foto de su espacio; escribe fuera de horario; pide descuento; pide humano; Bryan entra y el bot se calla; `/bot` reactiva. Cada escenario define mensajes del cliente y qué debe cumplir la respuesta: herramientas llamadas, trigger esperado, ausencia de signos de exclamación, ningún precio fuera de inventario, longitud máxima.
- **Simulador**: corre los escenarios contra el trabajador real con Claude, sin Meta, y guarda transcripciones en la carpeta de pruebas para leerlas con Tadeo.
- **Staging**: número de prueba de Meta y cuenta de Instagram de prueba, con su propio proyecto de Supabase.

## 11. Alternativa si no hay coexistencia

Bandeja propia: página web móvil dentro de `bot/` protegida con acceso de Supabase para Bryan y el segundo dueño. Lista de conversaciones con estado, lectura en tiempo real, cuadro para responder desde el mismo número, botón para devolver al bot. Las alertas llevan un enlace directo a la conversación. Es la misma tabla `mensajes`, con `autor: humano`. Se construye solo si la investigación descarta coexistencia.

## 12. Despliegue y requisitos externos

- Vercel Pro (el plan Hobby no permite uso comercial ni cron por minuto): proyecto `officeture-bot`, directorio raíz `bot/`, Node 24, región `iad1`, `ignoreCommand` para desplegar solo con cambios en `bot/` (y el sitio ignora `bot/`). Variables: tokens de Meta, secreto de verificación, secreto de firma, clave de servicio de Supabase, clave de Anthropic, clave del servicio de transcripción, credenciales de la cuenta de servicio de Google, números de Bryan y del segundo dueño, correo de alertas, nombre del asistente, URL del aviso de privacidad, versión de Graph API, `CRON_SECRET`.
- Supabase Pro (el plan Free pausa el proyecto y detiene `pg_cron`): proyecto propio del cliente en `us-east-1`, junto a Vercel `iad1`. Extensiones `pg_cron` y `pg_net`. Llaves nuevas `sb_secret_`.
- Meta, WhatsApp: Top Digital se registra como Tech Provider. Requiere verificación de negocio de Top Digital, app de Top Digital con App Review de `whatsapp_business_messaging` y `whatsapp_business_management` en acceso avanzado, y Embedded Signup v4 con el flujo de coexistencia (las versiones 2 y 3 caducan el 15-oct-2026). OfficeTure completa el alta desde ese flujo con su propio portafolio y agrega un método de pago en Meta.
- Meta, Instagram: Instagram Messaging API con Facebook Login en la misma app. Permisos `instagram_basic`, `instagram_manage_messages`, `pages_manage_metadata`, `business_management` con acceso avanzado (App Review con video). La cuenta de Instagram debe ser profesional y estar ligada a la página de Facebook. Token de página de larga duración.
- Número: 81 2428 3124 en coexistencia. Requisitos: app de WhatsApp Business 2.24.17 o superior; Bryan debe abrir la app al menos cada 14 días o Meta desconecta; el historial se sincroniza una sola vez; WhatsApp para Windows deja de funcionar como dispositivo vinculado. Las alertas salen de ese mismo número hacia los números personales de Bryan y del segundo dueño.
- Mientras se aprueba el Tech Provider, el desarrollo y las pruebas usan el número de prueba de la app de Meta.
- Costos mensuales estimados (ver research brief):

| Concepto | Rango |
|----------|-------|
| Vercel Pro | USD 20 |
| Supabase Pro | USD 25 |
| Claude Sonnet 5.5 (unos USD 0.07 por conversación) | USD 20 a 100 |
| WhatsApp: mensajes del bot fuera de la ventana gratuita de anuncios (USD 0.0085 cada uno desde el 1-oct-2026), plantillas y alertas | USD 5 a 30 |
| Transcripción de audio | menos de USD 2 |
| **Total** | **USD 70 a 175** |

## 13. Fuera de alcance de la v1

Messenger, chat en el sitio, pagos en línea, panel de inventario propio, respuestas en audio, campañas salientes a listas, flujo completo de proveedores, integración con Go High Level, reportes automáticos (los datos quedan en Supabase para armarlos después).

## 14. Pendientes del cliente

1. Confirmar nombre del asistente.
2. Confirmar WhatsApp que recibe alertas (Bryan) y segundo número de dueños.
3. Acceso de administrador al portafolio de Meta de OfficeTure, verificación de su negocio y método de pago en Meta.
4. Compartir la hoja de inventario con la cuenta de servicio y agregar columnas de medidas, colores, foto y activo.
5. Aprobar las tres plantillas antes de registrarlas en Meta.
6. Confirmar horario de atención (el cerebro dice lunes a viernes 9 a 19 y sábado 10 a 19; `CLAUDE.md` lo marca por validar).
7. Top Digital: iniciar ya la verificación de negocio en Meta para registrarse como Tech Provider; es el paso más lento.
8. Publicar el aviso de privacidad de OfficeTure (idealmente en el sitio) para enlazarlo desde el chat.
9. Aprobar el costo fijo de Vercel Pro y Supabase Pro.
