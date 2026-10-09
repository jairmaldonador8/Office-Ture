# 05 · Patrones conversacionales, handoff, seguimientos, transparencia y evaluación

Investigación para el bot de ventas de OfficeTure (WhatsApp + Instagram). Fecha: 9 de octubre de 2026.
Criterio de fuentes: documentación oficial de Meta, leyes mexicanas en texto vigente, estudios con datos y, cuando no hay otra cosa, guías de proveedores (marcadas como tales). Las cifras de proveedores se toman como orientación, no como evidencia. Lo que no se pudo confirmar se dice explícitamente.

---

## Hallazgos

### 1. Patrones probados para bots de ventas en WhatsApp (LATAM/México)

**Contexto de mercado**
- 71 % de los adultos en línea en México considera la mensajería el método más rápido y sencillo para tratar con empresas, y el mismo 71 % confía más en las empresas a las que puede escribir (Kantar, vía Expansión, mar-2025) [30]. El estudio BCG + Meta sobre México (400 empresas) reporta que 70 % de las empresas mexicanas ya invierten o planean invertir en IA para su mensajería [31].
- No existe un estudio independiente de 2025-2026 que mida tasas de respuesta y abandono de bots de ventas en WhatsApp en México. Las cifras que circulan (respuesta 35-50 %, «98 % de apertura», recuperación de carritos 15-35 %) salen de blogs de proveedores (Kosmo, Chatsell, Aurora Inbox, Chatarmin) sin metodología publicada [32]. **No confirmado.** Hay que medir con datos propios.

**Longitud de mensaje y número de burbujas**
- Meta no fija longitud ideal. Límites técnicos: cuerpo de botones de respuesta hasta 1,024 caracteres; cuerpo de listas hasta 4,096 [3][4]. Lo que sí hay son guías de diseño conversacional: Google («Prompt the user with only a single question at a time. Don't overwhelm the user with options and questions») [28] y ServiceNow («Focus on one question per turn», mensajes cortos y escaneables) [29].
- Los proveedores recomiendan respuestas de máximo 3 oraciones y partir respuestas largas en 2-3 burbujas secuenciales; respuestas de menos de ~150 caracteres van en una sola burbuja (SleekFlow describe así su modo de «chat bubble replies»; es cambio de producto, no estudio) [32]. No encontré un estudio controlado que compare una burbuja vs. varias. **No confirmado con datos**; es consenso de práctica.

**Pausas e indicador «escribiendo»**
- WhatsApp Cloud API tiene indicador de escritura oficial desde abril de 2025: se envía al marcar como leído el mensaje entrante (`status: read` + `typing_indicator: {type: "text"}`); se apaga al responder o a los 25 segundos. Meta dice: «only display a typing indicator if you are going to respond» y lo recomienda «if it will take you a few seconds to respond» [2][14].
- Evidencia académica: Gnewuch et al. (ECIS 2018) encontraron que un retraso dinámico (0 a ~4 s según la complejidad de la respuesta; promedio 2.3 s) aumenta la humanidad percibida, la presencia social y la satisfacción frente a respuestas instantáneas, en contexto de atención a clientes [26]. El seguimiento de 2022 (BISE, N = 202) matiza: el retraso ayuda con usuarios novatos y perjudica con usuarios experimentados [26]. Un estudio de NYU Tandon (CHI 2026) con asistentes de IA halló que respuestas idénticas se perciben como más «pensadas» con 9 s que con 2 s, pero a 20 s algunos usuarios sospechan fallas; la utilidad percibida hace pico en 9 s [27].

**Botones y listas vs. texto libre**
- Límites oficiales: botones de respuesta rápida, máximo 3 por mensaje, 20 caracteres por etiqueta, pie de 60 caracteres [3]. Listas: hasta 10 filas en total (hasta 10 secciones), título de fila 24 caracteres, descripción 72, etiqueta del botón 20 [4]. Son mensajes de sesión: solo dentro de la ventana de 24 h [8].
- Los proveedores coinciden en usar botones cuando hay ≤ 3 opciones cerradas, listas cuando hay 4-10, y texto libre para lo demás; y en que cada tecleo es una fricción. No hay prueba A/B pública de 2025 que lo cuantifique. **No confirmado con datos**.
- Las etiquetas largas se cortan en pantallas chicas; usar IDs descriptivos en el `payload` para la lógica del bot [3].

**Imágenes y productos**
- Meta ofrece mensajes de producto desde catálogo: producto único (imagen, título, precio, botón «Ver»), multiproducto (hasta 30 productos en hasta 10 secciones), carrusel (hasta 10 tarjetas) y mensaje de catálogo. La imagen se toma del catálogo (no se puede poner encabezado de imagen en mensajes de producto); si cambia el precio en el catálogo, se actualiza en el chat [16]. Alternativa simple: mensaje de imagen con pie (caption).
- No encontré datos de conversión por mandar imagen vs. no mandarla. **No confirmado.**

**Pedir datos sin que abandonen**
- Regla de diseño: una pregunta por turno [28][29]. Nada cuantitativo sobre orden de preguntas en WhatsApp específicamente.
- Con anuncios Click-to-WhatsApp (CTWA), Meta permite un «welcome message sequence» (texto de bienvenida, mensaje prellenado para el usuario e ice breakers) ligado al anuncio [9]; los ice breakers de número de teléfono son hasta 4, de 80 caracteres, sin emojis, y aparecen solo la primera vez que alguien abre el chat; los enlaces `wa.me` con texto prellenado los ocultan [10].

### 2. Handoff humano

**Lo que exige Meta**
- Política de mensajería (versión es-LA, actualizada 23-sep-2026): «You may use automation when responding during the 24-hour window» y la empresa «must also have available prompt, clear, and direct escalation paths». Vías aceptadas: transferencia a chat con representante humano, teléfono, correo, soporte web, visita al negocio, formulario de ayuda [1].
- Desde el 15-oct-2025 (cuentas nuevas) y 15-ene-2026 (todas), Meta prohíbe los asistentes de IA de propósito general en la plataforma; los bots con función de negocio (ventas, soporte, pedidos, citas) siguen permitidos. Fuente secundaria (respond.io); Meta no publicó la entrada en el changelog que pude consultar [18][14]. **Parcialmente confirmado.**
- Incumplimientos repetidos escalan: aviso → bloqueos temporales (1-3 días en plantillas; 5, 7 o 30 días en todos los mensajes) → bloqueo indefinido → baja permanente. El «excessive negative feedback from users» también detona límites [11].

**Cómo lo resuelven las herramientas conocidas**
- **Intercom Fin** [20]: escala de inmediato si el cliente pide claramente un humano o una regla lo dice; *ofrece* escalar (no escala) ante enojo, palabras vagas como «agente», o cuando el cliente se repite tres turnos; «Fin will never offer escalation twice in a row» (si vuelve a dispararse, escala directo para evitar bucles); la oferta es en texto, sin botones; mensaje por defecto «Let me connect you with a teammate»; si no hay destino humano configurado no ofrece escalar y cierra con «get more help»; al escalar deja un resumen como nota interna.
- **Zendesk** [21]: dentro de horario, bloque de escalación; fuera de horario, el agente de IA explica que no hay nadie y ofrece opciones (ticket, otro canal) y se quita la opción «hablar con humano» para no crear tickets huérfanos; los tickets nocturnos van a un grupo propio con prioridad baja. No publica SLA.
- **respond.io** [19]: el handoff es una acción «assign to agent or team»; recomiendan instruir explícitamente al agente de IA que *no responda* al contacto después de asignar («no AI outbound after handoff») para evitar que bot y humano se pisen; por defecto reparte round robin.
- **Wati** (guía de arquitectura, no función nativa) [22]: estados `AI_ACTIVE → HANDOFF_REQUESTED → QUEUED/ASSIGNED → HUMAN_ACTIVE → RESOLVED`; filtro de envío: «no AI outbound message once status is HANDOFF_REQUESTED or later»; paquete para el humano: transcripción, resumen de una línea, datos extraídos, qué intentó el bot; si el humano no responde: reasignar o escalar a equipo «rather than silently reactivating the bot»; cap de reintentos y cooldown; recalcular la ventana de 24 h antes de que el humano escriba.
- **Kommo** [23]: Salesbot tiene paso «Pause» con condición «Message received» y acción «Change responsible user»; no documenta pausa automática cuando un gerente escribe. **No confirmado.**
- **Jelou** (referencia LATAM) [24]: el bot se pausa cuando un agente responde desde la app de WhatsApp Business; pausa dinámica (se reinicia con cada mensaje del agente) o fija, configurable de 15 min a 4 h, 30 min por defecto; vuelve a la IA con palabra clave.
- **Treble y Yalo**: no encontré documentación pública de su handoff. **No confirmado.**

**Tiempos**
- No hay SLA estándar de la industria para bot → humano. Las guías de proveedores hablan de «time-to-agent» y «escalation lag» como métricas y de revisar 10-15 conversaciones escaladas por semana. Datos duros sobre velocidad de respuesta: InsideSales (auditoría 2019, 4,723 empresas) solo 7.7 % responde en 5 minutos; Conversica (2017, 866 empresas) 13 % responde en 5 minutos y solo 8 % hace 8 o más intentos; en 2020, ~60 % de las empresas hacía solo 1-2 intentos [35]. La cifra «21× más probable de calificar si contestas en 5 min» se repite mucho pero no pude verificarla en la fuente original. **No confirmado.**
- En Instagram, un humano puede responder hasta 7 días después del último mensaje del usuario con la etiqueta `HUMAN_AGENT`; la etiqueta es para personas, no para bots ni secuencias automatizadas (fuente secundaria, Chatwoot) [50]. En WhatsApp no existe equivalente: pasada la ventana de 24 h, solo plantillas [8].

### 3. Seguimientos y calidad del número

**Reglas de Meta que acotan la cadencia**
- Ventana de servicio de 24 h desde el último mensaje del usuario: mensajes libres y gratuitos; fuera de ella, solo plantillas aprobadas, cobradas por mensaje desde el 1-jul-2025 [8].
- Conversaciones que nacen de un anuncio CTWA (app móvil): si respondes dentro de 24 h, se abre una ventana de *punto de entrada gratuito* de 72 h en la que «you can send any type of message to the user at no charge», incluidas plantillas [8]. Es la ventana natural para los recordatorios del bot.
- **Límite por usuario de plantillas de marketing**: WhatsApp limita cuántas plantillas de marketing recibe una persona de *cualquier* empresa; el límite «adapts automatically over time based on a person's recent engagement levels»; si el usuario responde, se abre ventana de 24 h y las plantillas dentro no cuentan; el fallo llega como error 131049; reintentar en menos de 24 h puede bloquear entregas a ese usuario otras 24 h [7]. Infobip lo resume como «solo dos plantillas de marketing al mismo usuario en 24 horas», compartidas entre todas las marcas; utilidad y autenticación están exentas [17].
- **Calificación de calidad del número**: se calcula con la retroalimentación de los últimos 7 días (bloqueos y sus motivos: «No longer needed», «Didn't sign up», «Spam», «Offensive», reportes). Si cae a baja, el estado pasa a *Flagged*; si en 7 días no sube a media/alta, el límite de mensajería baja un nivel; en Flagged no se puede subir de nivel. *Restricted* es por alcanzar el límite diario, no por calidad; en ambos casos las respuestas a mensajes del cliente siguen permitidas [6][5].
- Los límites son por portafolio de negocio: cuentas nuevas empiezan en 250 conversaciones iniciadas por la empresa en 24 h; suben a 2,000 con verificación o enviando 2,000 mensajes de calidad en 30 días; después escalan automáticamente si se usa al menos la mitad del límite en 7 días con calidad alta [5].
- Opt-in: para iniciar conversaciones con plantillas hay que tener consentimiento claro, que nombre a la empresa y diga qué tipo de mensajes se enviarán; Meta recomienda opt-in separado por categoría y dar instrucciones claras de baja [12][1]. La política además exige respetar bloqueos y solicitudes de baja [1].
- Las plantillas tienen su propia calificación (verde/amarillo/rojo) por bloqueos, reportes y tasa de lectura; una plantilla roja puede pausarse o deshabilitarse [13].

**Cadencias y tasas (evidencia débil)**
- No encontré ningún estudio de 2025-2026 que mida tasa de recuperación por número de toque en WhatsApp. Las guías de proveedores convergen en: primer seguimiento 24-72 h después, secuencias de 2-3 mensajes, y dos mensajes sin respuesta como techo antes de que «se sienta bulk» [33][34]. Una cita a Sinch («48 % de respuesta en el mensaje 1 → 11 % en el 5») no se pudo rastrear al informe original. **No confirmado.**
- Chatarmin (estudio propio con 30 marcas de e-commerce) reporta respuesta 45-55 %, clic 45-60 % en mensajes con botones, conversión de flujos automatizados 10-25 %, baja por campaña < 0.5 % [32]. Proveedor, no independiente.
- Sobre horarios: ninguna fuente oficial fija horas; es sentido común comercial y lo tratamos como recomendación propia.

### 4. Intención en el primer mensaje: aprovechar el `referral`

- WhatsApp: cuando la conversación nace de un anuncio, el primer mensaje entrante trae un objeto `referral` con `source_url`, `source_id` (ID del anuncio), `source_type` (`ad` | `post`), `headline` y `body` (texto del anuncio), `media_type`, `image_url` / `video_url` / `thumbnail_url`, `ctwa_clid` (ID de clic para atribución) y `ref` (campo nuevo) [9]. Solo viene en el primer mensaje; si no se guarda ahí, se pierde (reportes de desarrolladores, p. ej. issue de Evolution API) [9]. Puede venir casi vacío (solo `source_url`) si la persona escribe antes de que cargue el contexto del anuncio.
- Instagram (anuncios Click-to-Direct): el webhook trae `referral` con `ad_id`, `source: ADS`, `type: OPEN_THREAD`, `ref` opcional y `ads_context_data` con `ad_title`, `photo_url` o `video_url` [15].
- Meta permite configurar por anuncio un «welcome message sequence» (texto de bienvenida, mensaje prellenado e ice breakers) [9]. Buenas prácticas de proveedores (360dialog, Blip, WhatsApp Business blog): hacer visible en el anuncio que al tocar se abre un chat, retomar en el primer mensaje la oferta exacta del anuncio, meter 1 pregunta calificadora y «do what the ad promised, and do it quickly» [52][53]. No hay cifras públicas sobre cuánto mejora personalizar con el `referral`. **No confirmado con datos.**

### 5. Transparencia: identificar al bot y datos personales en México

**Meta**
- La política de WhatsApp no exige decir «soy un bot», pero sí automatización solo dentro de la ventana de 24 h, vías de escalamiento «prompt, clear, and direct», no confundir a las personas, no pedir números completos de tarjeta, no reenviar información de un cliente a otro y «eres responsable de emitir y garantizar todos los avisos correspondientes» (avisos de privacidad incluidos) [1].

**Ley mexicana vigente**
- **LFPDPPP** (nueva ley, DOF 20-mar-2025, vigente desde el 21-mar-2025, última reforma 14-nov-2025; la autoridad ya es la Secretaría Anticorrupción y Buen Gobierno, no el INAI) [36][37]:
  - Art. 7: el consentimiento puede ser tácito; «por regla general será válido el consentimiento tácito» una vez puesto a disposición el aviso de privacidad; **datos financieros o patrimoniales requieren consentimiento expreso**; el consentimiento se puede revocar y el aviso debe decir cómo.
  - Art. 8: datos sensibles requieren consentimiento expreso y por escrito (no aplica a un bot de muebles si no se piden).
  - Art. 10: cuando los datos dejan de ser necesarios para las finalidades del aviso «deberán ser suprimidos previo bloqueo»; la ley no fija un plazo general de conservación, lo fija el responsable en su aviso.
  - Art. 11: usar los datos para una finalidad distinta a la del aviso exige nuevo consentimiento (p. ej. pasar de «cotizar» a «mandarte promociones»).
  - Art. 15: contenido mínimo del aviso (identidad y domicilio del responsable; qué datos se tratan; finalidades, distinguiendo las que requieren consentimiento; opciones para limitar uso; medios para ejercer ARCO; cómo se avisan cambios).
  - Art. 16-II: cuando los datos se obtienen «por cualquier medio electrónico […] o cualquier otra tecnología», hay que dar el aviso **en modalidad simplificada** (fracciones I a IV del art. 15) y decir dónde está el aviso integral. Esto aplica a un chat de WhatsApp.
  - La ley no contiene reglas sobre decisiones automatizadas ni perfilado; «tratamiento» cubre operaciones manuales o automatizadas [36][37].
- **LFPC art. 76 Bis** (transacciones por medios electrónicos; última reforma 12-dic-2025) [38]: I. usar la información del consumidor de forma confidencial, sin transmitirla a otros proveedores; III. dar al consumidor, antes de la transacción, **domicilio físico, teléfonos y medios para reclamaciones**; V. derecho a conocer términos, condiciones, **costos y cargos adicionales** y formas de pago; VI. respetar la decisión de **no recibir avisos comerciales**. Art. 76 Bis 1 remite a la Norma Mexicana de comercio electrónico (NMX-COE-001-SCFI-2018), que es de aplicación voluntaria y pide mecanismos para quejas y confidencialidad [40].
- **No existe hoy en México obligación legal de identificar al bot ni de garantizar atención humana.** Hay una iniciativa del 8-sep-2026 (Dip. Alan Sahir Márquez, PAN) para añadir una fracción X al art. 76 Bis LFPC: informar «de manera clara y accesible» que se interactúa con un sistema automatizado, garantizar atención humana cuando el sistema sea insuficiente (al menos en cobros no reconocidos, cancelaciones, devoluciones, fraudes) y prohibir «impedir u obstaculizar injustificadamente el acceso a la atención humana» repitiendo procesos automatizados; PROFECO emitiría los criterios [39]. Es iniciativa, no ley; su estado posterior no se pudo confirmar.
- Referencia externa: en la Unión Europea el art. 50 del AI Act obliga desde el 2-ago-2026 a informar que se interactúa con una IA salvo que sea obvio [41]. No aplica en México, pero marca la tendencia regulatoria que la iniciativa mexicana copia.

**Efecto comercial de revelar que es bot**
- Luo, Tong, Fang y Qu (Marketing Science, 2019; experimento de campo con 6,200+ clientes, llamadas *outbound* de un servicio financiero): un bot no revelado vende como un vendedor competente y 4× más que uno inexperto; revelar que es bot **antes** de la conversación redujo la compra en 79.7 %, porque los clientes se vuelven cortantes y lo perciben menos competente y empático; revelarlo al final o tras la compra mitiga el efecto [25]. Ojo: contexto outbound, guion rígido, 2019; no es WhatsApp inbound.
- Encuestas 2025 van en sentido contrario sobre expectativas: 91 % de 1,005 compradores de EUA cree que las marcas deberían estar obligadas a revelar que es un bot (Adobe Express, nov-2025) y 43 % admite fingir satisfacción para terminar la conversación [42]; Clutch (oct-2025): 90 % quiere que se revele el uso de IA y 87 % aún necesita humano para resolver del todo [43]. Son encuestas de proveedores, EUA.

### 6. Evaluación de un bot de ventas

**Métricas (definiciones usadas en la industria)**
- *Containment / resolución sin humano*: porcentaje de conversaciones que el bot completa sin handoff; advertencia conocida: un bot puede «contener» agotando al usuario, por eso se acompaña de resolución real o CSAT [49].
- *Tasa de handoff*: Microsoft Dynamics 365 la define como leads entregados a vendedores ÷ leads procesados por el agente × 100; separa «lead handling rate» (handoffs + descalificados) y «lead qualification time» [48].
- *Tasa de calificación*: leads con datos completos de pedido ÷ conversaciones iniciadas (definición propia; los benchmarks públicos de 40-65 % no son comparables entre sí).
- *Tiempo a primera respuesta* y *tiempo a agente* (desde que se pide humano hasta que el humano escribe); *escalation lag* (cuándo debió escalar vs. cuándo escaló).
- *CSAT* por pulgar o 1-5 al cierre; los benchmarks de proveedores para pymes rondan 75-80 % positivo, sin fuente independiente.

**Método de evals (guías oficiales y herramientas)**
- Anthropic [44]: criterios específicos y medibles; evals que «mirror your real-world task distribution» incluyendo casos borde («poor, harmful, or irrelevant user input» en chat); «more questions with slightly lower signal automated grading is better than fewer questions with high-quality human hand-graded evals»; calificación por código > LLM > humano según costo; para el juez LLM: rúbricas detalladas («The answer should always mention 'Acme Inc.' in the first sentence. If it does not, the answer is automatically graded as 'incorrect'»), salidas cerradas (correcto/incorrecto o 1-5), razonamiento activado, y «generally best practice to use a different model to evaluate than the model used to generate». Incluye ejemplo de juez multi-turno que recibe el historial menos el último turno y califica «context utilization» 1-5.
- Langfuse (oct-2025) [45]: dos métodos complementarios, (a) «N+1»: tomar fallas reales de producción, recortar el historial hasta el fallo y convertirlo en caso de prueba; (b) simulación: definir dimensiones (persona + escenario + datos), correr conversaciones multi-turno con OpenEvals contra el bot y calificar la transcripción completa con juez LLM; «binary pass/fail is often enough to start»; peligros: confiar solo en la herramienta, métricas elaboradas demasiado pronto, tratar la simulación como verdad («only as good as your context design»), datasets que se quedan viejos.
- LangSmith [46]: simulador de usuario + evaluadores de trayectoria que corren al final sobre la lista de mensajes. DeepEval tiene `ConversationSimulator` (escenario, perfil de usuario, resultado esperado).
- Investigación 2025-2026 [47]: los simuladores LLM tienden a ser demasiado «cooperativos y educados», lo que infla el desempeño de un bot de ventas; los benchmarks nuevos (MultiChallenge, EYT-Bench) agregan resistencia, cambio de intención y rúbricas por instancia, y recomiendan juez de otra familia de modelos y ensambles para reducir sesgo de auto-preferencia, posición y verbosidad.

---

## Riesgos para nuestro diseño

1. **Que bot y Bryan se pisen.** Ninguna de las herramientas conocidas lo resuelve «por magia»: todas dependen de un estado de conversación que apaga al bot. Si Bryan contesta desde la app de WhatsApp Business (coexistencia) y el bot no lo detecta, el cliente recibe dos voces. Hay que modelar el estado explícitamente y escuchar los mensajes *salientes* del número.
2. **Silencio después del handoff.** Si Bryan no responde, la ventana de 24 h se cierra y el bot ya no puede escribir texto libre; solo plantillas de pago sujetas al límite por usuario. Un lead «transferido» puede morir en silencio. Peor si pasa de noche o en domingo.
3. **Seguimientos que bajan la calidad del número.** Los bloqueos de 7 días pesan sobre un portafolio que arranca en 250 conversaciones/día. Dos o tres recordatorios mal puestos por semana a gente que no contestó son el camino directo a *Flagged*. El límite por usuario de Meta además puede tirar nuestras plantillas aunque nosotros mandemos pocas (compite con todas las marcas) [7][17].
4. **Promesa de 30 minutos.** La promesa de marca («cotización en 30 minutos») la cumple el bot en entrega inmediata, pero en los 13 disparadores de handoff la cumple Bryan. Si no hay SLA interno, el bot promete algo que el humano no sostiene.
5. **Revelar o no que es bot.** El único experimento de campo riguroso (Luo 2019) dice que revelarlo de entrada hunde ventas; las encuestas dicen que la gente exige saberlo; la política de Meta no lo exige pero sí exige salida a humano; México hoy no obliga, pero hay iniciativa y tendencia regulatoria. El riesgo es irse a cualquiera de los extremos: esconderlo (riesgo reputacional con los dueños y con el cliente que lo descubre) o abrir con «Soy una inteligencia artificial» (riesgo comercial).
6. **Datos personales en un chat sin aviso.** La nueva LFPDPPP exige aviso simplificado al recabar datos por medios electrónicos; pedir nombre, dirección de entrega, correo y datos de factura sin haberlo mostrado es incumplimiento desde el primer pedido. Datos fiscales/patrimoniales requieren consentimiento expreso, no tácito.
7. **Precios «+ IVA».** El art. 76 Bis-V LFPC da derecho a conocer costos y cargos adicionales; un bot que repite «$2,750» sin aclarar el IVA y el flete está en zona gris y además genera quejas (disparador de handoff).
8. **Simular humanidad con retrasos.** Un retraso de 2-4 s con «escribiendo» ayuda; retrasos largos o indicadores sin respuesta Meta los desaconseja explícitamente. Y los usuarios experimentados (los dueños probándolo) pueden percibir el retraso como lentitud.
9. **Evaluar con usuarios simulados demasiado amables.** Si solo probamos con guiones cooperativos, el bot se verá mejor de lo que es; los clientes reales regatean, mandan audios, escriben «precio» y nada más, o preguntan tres cosas a la vez.
10. **Cifras de proveedores en el deck.** Casi todas las tasas que circulan para LATAM son marketing. Si prometemos a los dueños «98 % de apertura» o «recupera 25 % de los leads» sin datos propios, perdemos credibilidad cuando los números reales lleguen.

---

## Recomendaciones concretas

### A. Reglas de redacción para el prompt del bot

1. **Una pregunta por mensaje.** Nunca dos preguntas en la misma burbuja. Si hay que pedir varios datos, se piden en orden, uno por turno, y se confirma al final en un solo resumen.
2. **Longitud:** respuestas de 1 a 3 oraciones; máximo ~300 caracteres por burbuja; máximo 2 burbujas por turno (la segunda solo si es una pregunta o un botón). Listas de productos con precio van en una burbuja con saltos de línea o en un mensaje de lista/producto, no en párrafo.
3. **Cuándo botones, cuándo texto:** botones (≤ 3) cuando la decisión es cerrada («Para mí / Para mi oficina / Varias piezas»), lista cuando hay 4-10 opciones (modelos de silla), texto libre para cantidades, nombres, direcciones. Etiquetas de ≤ 20 caracteres, sin emojis. Si el usuario contesta con texto en vez de tocar el botón, se acepta sin regañar.
4. **Imágenes:** mandar 1 foto del producto (con pie: nombre, precio con IVA incluido, entrega 1-2 días) solo cuando el cliente ya dijo qué producto le interesa o pide «foto»; nunca más de 2 fotos seguidas sin pregunta en medio. Si se usa catálogo de Meta, preferir mensaje de producto único o carrusel de hasta 10.
5. **Tono (del manual de marca):** tuteo, frases cortas, sin signos de exclamación, sin mayúsculas para vender, sin emojis como relleno (máximo uno por conversación y solo si el cliente los usa), comillas « ». Hablar de cómo trabaja la persona, no solo del mueble. Prometer solo lo concreto: 30 minutos, 1 a 2 días, instalado.
6. **Precios:** siempre «$2,750 más IVA ($3,190 con IVA)» la primera vez que se menciona un precio; si hay flete, decir que se cotiza por zona. Nunca inventar precios ni descuentos: un descuento es disparador de handoff.
7. **Orden de preguntas para levantar pedido** (de menor a mayor fricción): producto → cantidad → ¿es para ti o para una empresa? → zona o municipio de entrega → nombre → ¿requieres factura? (si sí, handoff + consentimiento expreso) → confirmación del resumen. El teléfono ya lo tenemos; el correo solo si pide factura o cotización formal en PDF.
8. **Mensajes en los que el usuario manda poco** («precio», «info», un audio): responder con una pregunta cerrada con botones, no con un párrafo. Si llega audio, decir que por ahora solo leemos texto y ofrecer que Bryan lo escuche.
9. **Ritmo:** marcar como leído y activar `typing_indicator` al recibir; responder entre 1.5 y 4 s según longitud (nunca más de 8 s). Si el modelo tarda más, el indicador se apaga solo a los 25 s; no simular pausas más largas.
10. **Honestidad sobre su naturaleza:** si preguntan «¿eres un bot?» o «¿eres una persona?», responder siempre con la verdad en una línea y ofrecer a Bryan: «Soy el asistente automático de OfficeTure. Si prefieres, te paso con Bryan ahora mismo.»

### B. Apertura con contexto del anuncio (pregunta 4)

- Guardar el `referral` completo en el primer webhook (`source_id`, `headline`, `body`, `ctwa_clid`, `ref`) y mapear `source_id` → producto/campaña en una tabla nuestra. Si `referral` viene vacío o solo con `source_url`, abrir con la apertura genérica.
- Usar el `ref` de los anuncios (o el `source_id`) para saber si el anuncio era de entrega inmediata (producto con precio) o de equipamiento (proyecto): el primero entra al flujo de pedido; el segundo levanta 2 datos y va a handoff.
- Retomar el anuncio con una frase, no con el titular literal del anuncio. Ejemplos en tono de marca:
  - Anuncio de silla: «Hola. Soy el asistente de OfficeTure. Vi que te interesó la silla ejecutiva del anuncio: está en $X más IVA y se entrega en 1 a 2 días en Monterrey. ¿La quieres para ti o para varias personas?»
  - Anuncio de escritorio en L: «Hola, aquí OfficeTure. El escritorio en L con librero que viste sale en $11,500 más IVA, entregado y armado. ¿Cuántos necesitas?»
  - Anuncio de equipamiento: «Hola. Soy el asistente de OfficeTure. Vi que buscas equipar una oficina. Dime cuántas personas van a trabajar ahí y en qué zona estás, y Bryan te manda una propuesta hoy mismo.»
  - Sin referral: «Hola, soy el asistente de OfficeTure. ¿Buscas algo de entrega inmediata (escritorios, sillas, archiveros) o quieres equipar una oficina completa?» (con 2 botones).
- Configurar un *welcome message sequence* por anuncio en Ads Manager con 2-3 ice breakers que coincidan con los botones del bot, para que el primer mensaje del usuario ya traiga intención.
- Instagram: leer `referral.ads_context_data.ad_title` y usar la misma plantilla de apertura; recordar que en IG las respuestas humanas tardías llevan `HUMAN_AGENT` (7 días) y el bot no debe usarla.

### C. Handoff bot → Bryan

1. **Estado explícito por conversación**: `bot`, `handoff_pendiente`, `humano`, `cerrada`. El bot solo envía si el estado es `bot`. Cualquier mensaje saliente del número que no haya generado el bot (Bryan escribiendo desde la app) cambia el estado a `humano` y lo mantiene mientras haya actividad humana; vuelve a `bot` tras 4 h sin mensajes de Bryan o con una palabra clave suya (p. ej. «#bot»). Copia el patrón de Jelou/Wati.
2. **Qué dice el bot al transferir** (una sola vez, nunca dos ofertas seguidas, como Fin): «Esto te lo resuelve mejor Bryan. Ya le pasé tu pedido (resumen). Te escribe por aquí mismo en menos de 30 minutos en horario de oficina.» Fuera de horario: «Bryan te escribe mañana a partir de las 9. Si es urgente, puedes llamar al 81 1060 1298.»
3. **Paquete para Bryan** (por WhatsApp interno, correo o panel): nombre, teléfono, origen del anuncio, producto(s) y cantidad, zona, motivo del handoff (cuál de los 13 disparadores), resumen de 2 líneas y transcripción enlazada. Bryan no debe pedir nada que el cliente ya dijo.
4. **SLA interno**: 30 min en horario (lunes a sábado 9-18, validar con el cliente). Si a los 20 min Bryan no ha escrito, recordatorio a Bryan; a los 30 min el bot avisa al cliente una sola vez («Bryan sigue con otro cliente; en cuanto se desocupe te escribe. ¿Hay algo más que te pueda adelantar yo?») y vuelve a `bot` solo para dudas simples, sin cerrar el handoff. Si pasan 23 h sin respuesta humana, antes de que se cierre la ventana el bot manda un último mensaje libre para reabrir la sesión con una pregunta; pasado eso, solo una plantilla de utilidad («seguimiento de tu cotización») y nunca más de una.
5. **Sin bucles**: si el cliente pide humano por segunda vez, transferir de inmediato sin volver a preguntar. Si pide humano y no hay disparador, también se transfiere (la política de Meta exige vía directa).
6. **Instagram**: mismo estado; el bot no envía nada pasada la ventana de 24 h; lo que sigue lo escribe Bryan con `HUMAN_AGENT`.

### D. Cadencia de seguimiento

- Solo seguir a quien ya mostró intención (eligió producto o pidió precio). Nunca seguir a quien escribió una vez y se fue sin interacción.
- **Toque 1**: 2-4 h después de que el cliente dejó de responder a medio flujo, dentro de la ventana de 24 h (gratis, texto libre): una pregunta corta que retome donde se quedó. Horario 9-20 h; si cae fuera, se programa para las 9.
- **Toque 2**: al día siguiente, dentro de las 72 h de punto de entrada gratuito si vino de anuncio (plantilla sin costo) o como plantilla de utilidad si se abrió el pedido; una sola vez.
- **Techo: dos toques sin respuesta.** Después, el lead pasa a lista de Bryan para seguimiento humano o campaña mensual, nunca más mensajes del bot. Registrar cada bloqueo/reporte y, si hay 2 bloqueos en una semana, pausar seguimientos y revisar textos.
- No usar plantillas de marketing para seguimiento de cotización: usar categoría utilidad con referencia al pedido; manejar el error 131049 marcando al usuario como «no reintentar 24 h».
- Dar siempre salida: «Si prefieres que no te escriba, dime “no” y listo» en el toque 2 (cumple LFPC 76 Bis-VI y la política de Meta sobre bajas).
- Medir en datos propios: tasa de respuesta por toque, bloqueos por toque y calificación del número cada semana, antes de decidir si existe un toque 3.

### E. Legal y transparencia (México)

1. **Identificación ligera y honesta desde el primer mensaje:** «Soy el asistente de OfficeTure» (sin «IA», sin «bot» en la apertura), que es verdad, no suena a máquina y prepara el handoff; respuesta veraz inmediata si preguntan; Bryan siempre a un mensaje de distancia. Esto cumple lo que exige Meta hoy, se adelanta a la iniciativa de la LFPC y evita el golpe del «disclosure fuerte» que midió Luo 2019.
2. **Aviso de privacidad simplificado dentro del chat** (LFPDPPP art. 16-II), la primera vez que se va a pedir un dato personal (antes de nombre/dirección): «Para armar tu pedido te voy a pedir nombre y zona de entrega. OfficeTure (Salina Cruz 633, San Nicolás de los Garza) usa tus datos solo para cotizar y entregar. Aviso completo: officeture.mx/privacidad.» Debe cubrir identidad y domicilio del responsable, datos que se tratan, finalidades y opciones para limitar uso (art. 15 I-IV) y enlazar al aviso integral (que incluya ARCO, mecanismo de revocación y cómo se avisan cambios). Pendiente: redactar el aviso integral y colgarlo en el sitio.
3. **Qué datos pedir:** solo los necesarios para cotizar y entregar (nombre, teléfono que ya tenemos, zona/dirección de entrega, cantidad, producto). Correo solo si piden PDF o factura. **Datos de factura (RFC, razón social, régimen, domicilio fiscal) los pide Bryan**, con consentimiento expreso (botón «Acepto el aviso de privacidad» o texto «sí, acepto»), porque la ley exige consentimiento expreso para datos financieros/patrimoniales. Nunca pedir datos de tarjeta por chat (política de Meta).
4. **Retención:** definir plazo en el aviso (sugerencia: conversaciones y datos de pedido 24 meses; leads sin pedido 6 meses; luego bloqueo y supresión conforme al art. 10). Las transcripciones que se usen para evaluar el bot se anonimizan (sin nombre, teléfono ni dirección).
5. **LFPC 76 Bis:** el bot debe poder dar en cualquier momento domicilio físico, teléfono y correo para reclamaciones (fracción III), aclarar IVA y cargos adicionales (fracción V) y respetar «no me escribas más» (fracción VI). Las quejas van siempre a humano (ya es disparador).
6. **Promociones futuras:** pasar de «cotizar» a «mandarte ofertas» es otra finalidad (art. 11): requiere opt-in separado («¿Quieres que te avisemos cuando haya inventario nuevo? Sí / No»), como recomienda Meta.

### F. Evaluación

1. **Métricas de operación (semanal):** conversaciones iniciadas por origen (anuncio/IG/orgánico); tasa de calificación (pedido con producto + cantidad + zona + nombre); tasa de handoff y motivo (uno de los 13); tiempo a primera respuesta del bot (objetivo < 10 s); tiempo a respuesta de Bryan tras handoff (objetivo < 30 min en horario); abandono por paso del flujo; respuesta por toque de seguimiento; bloqueos/reportes y calificación del número; CSAT al cierre (pulgar arriba/abajo con un botón, solo en conversaciones que terminaron en pedido o handoff).
2. **Evals antes de salir y en cada cambio de prompt:**
   - Banco de 60-100 conversaciones guionizadas en español de Monterrey: 13 disparadores × 2 variantes cada uno, flujos felices de los 4 productos, casos borde (solo «precio», audio, foto de una oficina, tres preguntas en un mensaje, regateo, «¿eres bot?», insulto, pedido de 50 sillas, pregunta fuera de tema, cambio de intención a mitad, dirección fuera de Nuevo León, cliente que pide factura, cliente que pide descuento dos veces).
   - Simulador de usuario con personas y adversidad (persona + escenario + «cómo empuja»): regateador, apurado, desconfiado, ambiguo. Aceptar que el simulador es más amable que la realidad y complementar con transcripciones reales («N+1» de Langfuse) desde la segunda semana.
   - **Juez LLM de otra familia** de modelos que el bot, con razonamiento activado y salidas cerradas. Rúbricas binarias por conversación: (a) ¿pidió un dato por turno?; (b) ¿mencionó IVA la primera vez que dio precio?; (c) ¿inventó precio, descuento o plazo?; (d) ¿escaló en el turno correcto según el disparador (ni antes ni después)?; (e) ¿usó signos de exclamación, mayúsculas de venta o más de un emoji?; (f) ¿mintió sobre ser humano?; (g) ¿mostró el aviso de privacidad antes de pedir datos?; (h) ¿respetó «no me escribas»?. Más una escala 1-5 de tono de marca con anclas escritas y un «context utilization» 1-5 al estilo del ejemplo de Anthropic.
   - Criterio de salida: 100 % en (c), (f) y (g); ≥ 95 % en (d); ≥ 90 % en el resto; tono ≥ 4 en promedio. Validar el juez contra 30 conversaciones calificadas a mano por Jair/Tadeo antes de confiar en él.
3. **Revisión humana:** 10-15 conversaciones escaladas por semana con Bryan durante el primer mes (patrón de Intercom/proveedores) para ajustar los disparadores: handoffs innecesarios y handoffs tardíos por igual.
4. **Lo que se le presenta a los dueños:** cifras propias desde la semana 1 (conversaciones, pedidos levantados, tiempo de respuesta, handoffs), no benchmarks de proveedores.

---

## Fuentes

Oficiales (Meta)
1. WhatsApp Business Messaging Policy (es-LA, actualizada 23-sep-2026): https://whatsappbusiness.com/es-la/policy/
2. Cloud API · Typing indicators: https://developers.facebook.com/docs/whatsapp/cloud-api/typing-indicators
3. Cloud API · Interactive reply buttons messages: https://developers.facebook.com/docs/whatsapp/cloud-api/messages/interactive-reply-buttons-messages
4. Cloud API · Interactive list messages: https://developers.facebook.com/docs/whatsapp/cloud-api/messages/interactive-list-messages
5. Messaging limits: https://developers.facebook.com/docs/whatsapp/messaging-limits
6. Meta Business Help · About your WhatsApp Business phone number's quality rating: https://www.facebook.com/business/help/896873687365001
7. Per-user marketing template limits: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/marketing-templates/per-user-limits.md
8. Pricing (ventana de 24 h, punto de entrada gratuito de 72 h, cobro por mensaje desde 1-jul-2025): https://developers.facebook.com/docs/whatsapp/pricing
9. Click-to-WhatsApp · Welcome message sequences (incluye campos del objeto `referral`): https://developers.facebook.com/documentation/business-messaging/whatsapp/ctwa/welcome-message-sequences.md
10. Conversational components (ice breakers, commands): https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/conversational-components.md
11. Policy and spam enforcement: https://developers.facebook.com/documentation/business-messaging/whatsapp/policy-enforcement
12. Getting opt-in: https://developers.facebook.com/docs/whatsapp/overview/getting-opt-in
13. Template quality rating: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-quality.md
14. WhatsApp changelog (typing indicators 8-abr-2025; per-message pricing 1-jul-2025): https://developers.facebook.com/documentation/business-messaging/whatsapp/changelog
15. Instagram Platform · Webhook notification examples (objeto `referral` de anuncios Click-to-Direct): https://developers.facebook.com/docs/instagram-platform/webhooks/examples/
16. Catalogs · Share products with WhatsApp users: https://developers.facebook.com/documentation/business-messaging/whatsapp/catalogs/share-products

Herramientas (documentación o blogs de producto)
17. Infobip · What is WhatsApp frequency capping: https://www.infobip.com/blog/what-is-whatsapp-frequency-capping
18. respond.io · WhatsApp general-purpose chatbots ban (15-oct-2025 / 15-ene-2026): https://respond.io/blog/whatsapp-general-purpose-chatbots-ban
19. respond.io Help · AI Agent action: assign to agent or team: https://respond.io/help/ai-skills/ai-agent-action-assign-to-agent-or-team
20. Intercom Help · How to automatically escalate conversations (Fin): https://www.intercom.com/help/en/articles/12396892-how-to-automatically-escalate-conversations
21. Zendesk Support · Routing after-hours messaging requests: https://support.zendesk.com/hc/en-us/articles/11033533612954
22. Wati · Human handoff for AI agents on WhatsApp: https://www.wati.io/en/blog/human-handoff-ai-agent-whatsapp-mcp/
23. Kommo Support · Salesbot overview: https://support.kommo.com/docs/salesbot-overview
24. Jelou Docs · Coexistence (pausa del bot cuando responde un agente): https://docs.jelou.ai/en/connect/settings/coexistence.md
50. Chatwoot · Human Agent tag en Instagram/Messenger: https://chatwoot.com/hc/user-guide/articles/1745225158-what-is-human-agent-tag-in-instagram-messenger-channel
52. WhatsApp Business blog · Click to WhatsApp ad guide: https://whatsappbusiness.com/blog/click-to-whatsapp-ad-guide/
53. Blip Help · Personalización de flujos por anuncio CTWA: https://help.blip.ai/hc/en-us/articles/20178934582551

Estudios y guías de diseño
25. Luo, Tong, Fang, Qu (2019), «Machines vs. Humans: The Impact of AI Chatbot Disclosure on Customer Purchases», Marketing Science 38(6): https://www.fox.temple.edu/news/2020/01/chatbots-can-help-improve-salesprovided-you-dont-reveal-its-chatbot · https://www.informs.org/News-Room/INFORMS-Releases/News-Releases/Artificial-Intelligence-Can-Improve-Sales-by-Four-Times-Compared-to-Some-Human-Employees
26. Gnewuch, Morana, Adam, Maedche (ECIS 2018), «Faster Is Not Always Better»: https://publikationen.bibliothek.kit.edu/1000089970 · apéndice del seguimiento BISE 2022: https://media.springernature.com/original/springer-static/esm/art%3A10.1007%2Fs12599-022-00755-x/MediaObjects/12599_2022_755_MOESM1_ESM.pdf
27. Earth.com (30-abr-2026) sobre el estudio de NYU Tandon (CHI 2026) de retrasos 2/9/20 s: https://www.earth.com/news/faster-isnt-better-why-slower-chatbots-seem-more-intelligent/
28. Google · Conversation design: Questions: https://developers.google.com/assistant/conversation-design/questions
29. ServiceNow Horizon · Guidelines for any conversation: https://horizon.servicenow.com/guidelines/conversation-design/guidelines-for-any-conversation
30. Expansión (11-mar-2025) · 7 de cada 10 mexicanos confía en WhatsApp para comunicarse con empresas (Kantar): https://expansion.mx/tecnologia/2025/03/11/mexicanos-confia-whatsapp-comunicarse-empresas
31. BCG + Meta (2024) · New Horizons in Business Messaging: Pioneering Approaches for Mexican Businesses: https://www.bcg.com/publications/2024/new-horizons-in-business-messaging-pioneering-approaches-for-mexican-businesses
32. Chatarmin · WhatsApp Marketing KPIs 2026 (estudio propio, proveedor): https://chatarmin.com/en/blog/whats-app-kpi
33. Wati · WhatsApp follow-up messages (proveedor): https://www.wati.io/en/blog/whatsapp-follow-up-messages/
34. toflow · WhatsApp B2B outreach sequence (proveedor): https://toflow.ai/blog/whatsapp-b2b-outreach-sequence
35. Conversica · 4Ps of Lead Follow-Up 2017: https://info.conversica.com/rs/221-UQO-143/images/2017%204Ps%20Report%20-%20final.pdf · Sales Effectiveness Report 2020: https://www.conversica.com/wp-content/uploads/2022/12/2020-Sales-Effectiveness-Report-Benchmark-eBook-021621.pdf
42. Adobe Express (nov-2025) · Future of conversational marketing (encuesta 1,005 compradores EUA): https://www.adobe.com/express/learn/blog/future-of-conversational-marketing
43. Clutch (oct-2025) · 8 in 10 shoppers find AI website tools both helpful and frustrating: https://www.businesswire.com/news/home/20251014077920/en/Clutch-Report-8-in-10-Shoppers-Find-AI-Website-Tools-Both-Helpful-and-Frustrating
47. EYT-Bench (jul-2026): https://arxiv.org/pdf/2607.10428 · Evaluación de chatbot con simulador de usuario y juez LLM (IWSDS 2026): https://aclanthology.org/2026.iwsds-1.13.pdf
48. Microsoft Learn · Monitor leads by Sales Qualification Agent (definiciones de handoff y qualification rate): https://learn.microsoft.com/en-us/dynamics365/sales/monitor-leads-by-sales-qualification-agent
49. Talkative · Chatbot containment rate: https://gettalkative.com/info/chatbot-containment-rate

Evaluación (documentación oficial)
44. Anthropic · Define success criteria and build evaluations: https://platform.claude.com/docs/en/test-and-evaluate/develop-tests
45. Langfuse (9-oct-2025) · Evaluating multi-turn conversations: https://langfuse.com/blog/2025-10-09-evaluating-multi-turn-conversations
46. LangSmith · How to simulate multi-turn interactions: https://docs.smith.langchain.com/evaluation/how_to_guides/multi_turn_simulation

Legal (México y referencia UE)
36. LFPDPPP, texto vigente (DOF 20-mar-2025, última reforma 14-nov-2025), Cámara de Diputados: https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf (arts. 7, 8, 10, 11, 15, 16 citados del texto)
37. Garrigues · Resumen de la nueva LFPDPPP: https://www.garrigues.com/es_ES/noticia/mexico-nueva-ley-federal-proteccion-datos-personales-posesion-particulares-introduce
38. LFPC, texto vigente (última reforma 12-dic-2025), Cámara de Diputados: https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPC.pdf (arts. 76 Bis y 76 Bis 1 citados del texto)
39. Gaceta Parlamentaria, 8-sep-2026 · Iniciativa que adiciona la fracción X al art. 76 Bis LFPC (atención humana frente a sistemas automatizados): https://gaceta.diputados.gob.mx/Gaceta/66/2026/sep/20260908-II-2.html
40. ECIJA · Profeco emite Código de Ética para e-commerce / NMX-COE-001-SCFI-2018: https://www.ecija.com/actualidad-insights/mexico-profeco-emite-codigo-de-etica-para-e-commerce/
41. Mondaq · EU AI Act Article 50 transparency enforcement (2-ago-2026): https://www.mondaq.com/uk/privacy-protection/1825278/

No confirmado o sin fuente primaria localizable: tasas de respuesta/abandono de bots en México; efecto medido de burbujas múltiples; conversión por imagen; «21× más probable de calificar en 5 min»; cifras de Sinch por número de toque; handoff de Treble y Yalo; texto literal de Meta sobre la prohibición de IA de propósito general; estado legislativo de la iniciativa del 8-sep-2026.
