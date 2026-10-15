/* ============================================================================
   MARIANA · chat de la página (versión de demostración, oct-2026)
   Responde en el navegador con reglas fijas, los 42 productos reales de la hoja
   de Tadeo y los datos del cerebro. Cuando el bot de /bot esté desplegado con
   la llave de Anthropic, `responder()` se cambia por una llamada a su API.
   Turi es la mascota: cuatro poses (img/turi-*.webp) que cambian según lo que
   pasa en el chat: quieto, saluda, laptop (mientras escribe) y café (despedida).
   ========================================================================== */
(function () {
  'use strict';

  var POSE = { quieto: 'img/turi-quieto.webp', saluda: 'img/turi-saluda.webp', laptop: 'img/turi-laptop.webp', cafe: 'img/turi-cafe.webp', cara: 'img/turi-cara.webp' };
  var WA = 'https://wa.me/5218124283124';
  var reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- inventario (hoja Import_GHL, 15-oct-2026; precios más IVA) ----------
  var PRODUCTOS = [
    ['Lineal', 'Escritorio lineal estructura metálica', 2750], ['Lineal', 'Escritorio lineal con cajonera', 5200],
    ['Lineal', 'Escritorio de melamina sin cajonera', 3450], ['Ejecutivo', 'Escritorio ejecutivo', 14200],
    ['Secretarial', 'Escritorio secretarial en L', 5590], ['Semi ejecutivo', 'Escritorio semi ejecutivo en L con librero', 11500],
    ['Archivero', 'Archivero vertical de 4 gavetas', 5200],
    ['Ejecutiva', 'Silla CORE', 2950], ['Ejecutiva', 'Silla ERGO', 3100], ['Ejecutiva', 'Silla CORE SS', 3290],
    ['Ejecutiva', 'Silla ZOL', 2590], ['Ejecutiva', 'Silla ZOMER', 2190], ['Ejecutiva', 'Silla FLEX', 2100],
    ['Ejecutiva', 'Silla ORION', 3350], ['Ejecutiva', 'Silla CORPORATE', 4200], ['Ejecutiva', 'Silla BOLT', 3900],
    ['Ejecutiva', 'Silla THIN', 4200], ['Ejecutiva', 'Silla MESH', 4200],
    ['Operativa', 'Silla LITE', 1490], ['Operativa', 'Silla ERGO operativa', 1950], ['Operativa', 'Silla FLY', 2190],
    ['Operativa', 'Silla FLUX', 2390], ['Operativa', 'Silla PULSE', 2590], ['Operativa', 'Silla WORK', 2590],
    ['Operativa', 'Silla CORE operativa', 2590], ['Operativa', 'Silla BOLT LT', 2950], ['Operativa', 'Silla ZOMER LT', 2190],
    ['Operativa', 'Silla DUAL', 2390], ['Operativa', 'Silla RHIN', 2590],
    ['Multiusos', 'Silla MOVE', 690], ['Multiusos', 'Silla SPOT', 1190], ['Multiusos', 'Silla NÁPOLES', 1290],
    ['Multiusos', 'Silla NEVA', 1350], ['Multiusos', 'Silla ERCO', 1490], ['Multiusos', 'Silla FACTORY sin respaldo', 2450],
    ['Multiusos', 'Silla FACTORY con respaldo', 3200], ['Multiusos', 'Silla SORA', 1590], ['Multiusos', 'Silla MEZK', 1690],
    ['Multiusos', 'Silla RITA', 2100], ['Multiusos', 'Silla SATURN', 1350], ['Multiusos', 'Silla NEZO OT', 3200],
    ['Multiusos', 'Silla NEZO', 2250]
  ].map(function (p) { return { sub: p[0], nombre: p[1], precio: p[2], clave: norm(p[1]) }; });

  var GRUPOS = {
    ejecutiva: { titulo: 'sillas ejecutivas', para: 'para dirección, gerencia o jornadas largas', foto: 'img/silla-ejecutiva.webp', filtro: function (p) { return p.sub === 'Ejecutiva'; } },
    operativa: { titulo: 'sillas operativas', para: 'para el equipo que trabaja todo el día en escritorio', foto: 'img/silla-operativa.webp', filtro: function (p) { return p.sub === 'Operativa'; } },
    multiusos: { titulo: 'sillas multiusos', para: 'para visitas, salas de espera, capacitación o comedor', foto: 'img/silla-visita.webp', filtro: function (p) { return p.sub === 'Multiusos'; } },
    escritorio: { titulo: 'escritorios', para: 'de entrega inmediata', foto: 'img/prod-lineal.webp', filtro: function (p) { return /^Escritorio/.test(p.nombre); } },
    archivero: { titulo: 'archiveros', para: '', foto: 'img/prod-archivero.webp', filtro: function (p) { return p.sub === 'Archivero'; } }
  };
  var FOTOS = {
    'Escritorio ejecutivo': 'img/prod-ejecutivo.webp',
    'Escritorio semi ejecutivo en L con librero': 'img/prod-semiejecutivo.webp',
    'Archivero vertical de 4 gavetas': 'img/prod-archivero.webp'
  };

  // Modelos de silla que se pueden nombrar sueltos («la ergo», «quiero la zol»).
  var MODELOS = ['core', 'ergo', 'zol', 'zomer', 'flex', 'orion', 'corporate', 'bolt', 'thin', 'mesh', 'lite', 'fly', 'flux',
    'pulse', 'work', 'dual', 'rhin', 'move', 'spot', 'napoles', 'neva', 'erco', 'factory', 'sora', 'mezk', 'rita', 'saturn', 'nezo'];

  // Fuente: bot/src/negocio/entrega.ts. «metro» = puede ser al día siguiente (validar con Bryan).
  var MUNICIPIOS = [
    ['San Nicolás', 'san nicolas', 1], ['Apodaca', 'apodaca', 1], ['Escobedo', 'escobedo', 1], ['Monterrey', 'monterrey|mty', 1],
    ['Guadalupe', 'guadalupe', 1], ['San Pedro', 'san pedro', 1], ['Juárez', 'juarez', 1], ['Santa Catarina', 'santa catarina', 1],
    ['García', 'garcia', 1], ['Cadereyta', 'cadereyta', 0], ['El Carmen', 'el carmen', 0], ['Salinas Victoria', 'salinas victoria', 0],
    ['Ciénega de Flores', 'cienega de flores', 0], ['Pesquería', 'pesqueria', 0], ['Santiago', 'santiago', 0], ['Allende', 'allende', 0],
    ['Montemorelos', 'montemorelos', 0], ['General Terán', 'general teran|gral teran', 0], ['Saltillo', 'saltillo', 0],
    ['Ramos Arizpe', 'ramos arizpe', 0], ['Zuazua', 'zuazua', 0], ['Marín', 'marin', 0]
  ];

  var NUMEROS = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
    once: 11, doce: 12, quince: 15, veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50, cien: 100 };

  // ---------- utilidades ----------
  function norm(t) {
    return String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ$ ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function tiene(t, re) { return re.test(t); }
  function dinero(n) { return '$' + n.toLocaleString('es-MX') + ' + IVA'; }
  function una(lista) { return lista[Math.floor(Math.random() * lista.length)]; }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function horaMty() {
    try { return +new Intl.DateTimeFormat('es-MX', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/Monterrey' }).format(new Date()); }
    catch (e) { return new Date().getHours(); }
  }
  function saludoHora() {
    var h = horaMty();
    return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  }
  function listaHtml(productos, nota) {
    return '<span class="m-lista">' + productos.map(function (p) {
      return '<div><span>' + esc(p.nombre) + '</span><span>' + dinero(p.precio) + '</span></div>';
    }).join('') + '</span>' + (nota ? '<span class="m-nota">' + nota + '</span>' : '');
  }
  function art(p, la, el) { return /^Silla/.test(p.nombre) ? la : el; }
  function fotoHtml(src) { return '<img class="m-foto" src="' + src + '" alt="" loading="lazy">'; }
  // Hasta tres opciones repartidas en el rango de precio: la de entrada, una media y la de arriba.
  function tres(productos) {
    var o = productos.slice().sort(function (a, b) { return a.precio - b.precio; });
    if (o.length <= 3) return o;
    return [o[0], o[Math.floor(o.length / 2)], o[o.length - 1]];
  }
  function cantidad(t) {
    var m = t.match(/\b(\d{1,4})\s*(piezas?|pzas?|sillas?|escritorios?|archiveros?|unidades?|de la|de las|de el|del)?\b/);
    if (m && (m[2] || /\b(necesito|quiero|ocupo|serian|son|para)\b/.test(t))) return +m[1];
    var w = t.match(/\b(dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|quince|veinte|treinta|cuarenta|cincuenta|cien)\s+(piezas?|sillas?|escritorios?|archiveros?)\b/);
    return w ? NUMEROS[w[1]] : 0;
  }

  // ---------- estado de la conversación ----------
  var estado = { ultimo: null, grupo: null, sinEntender: 0, ofrecioBryan: false, intereses: [] };

  function anotar(texto) {
    if (estado.intereses.indexOf(texto) < 0) estado.intereses.push(texto);
    if (estado.intereses.length > 4) estado.intereses.shift();
  }

  function waLink() {
    var msg = 'Hola, vengo de la página de OfficeTure.';
    if (estado.intereses.length) msg += ' Me interesa: ' + estado.intereses.join(', ') + '.';
    return WA + '?text=' + encodeURIComponent(msg);
  }

  // ---------- productos ----------
  function buscarModelo(t) {
    t = t.replace(/\bsillas\b/g, 'silla');
    // nombre completo escrito tal cual («silla ergo operativa»): gana el más largo
    var exacto = PRODUCTOS.filter(function (p) { return /^silla /.test(p.clave) && (' ' + t + ' ').indexOf(' ' + p.clave + ' ') >= 0; })
      .sort(function (a, b) { return b.clave.length - a.clave.length; })[0];
    if (exacto) return [exacto];
    for (var i = 0; i < MODELOS.length; i++) {
      var m = MODELOS[i];
      if (!new RegExp('\\b' + m + '\\b').test(t)) continue;
      var hallados = PRODUCTOS.filter(function (p) { return new RegExp('\\b' + m + '\\b').test(p.clave); });
      // afinar con lo que dijo la persona: «ergo operativa», «core ss», «nezo ot», «factory con respaldo»
      var finos = hallados.filter(function (p) {
        var extra = p.clave.replace('silla ', '').replace(m, '').trim();
        return extra && t.indexOf(extra) >= 0;
      });
      if (finos.length) return finos;
      var simples = hallados.filter(function (p) { return p.clave === 'silla ' + m; });
      return hallados.length > 1 ? hallados : (simples.length ? simples : hallados);
    }
    return null;
  }

  function buscarEscritorio(t) {
    if (/semi/.test(t)) return PRODUCTOS.filter(function (p) { return p.sub === 'Semi ejecutivo'; });
    if (/ejecutiv|direccion|director|gerente|jefe/.test(t)) return PRODUCTOS.filter(function (p) { return p.sub === 'Ejecutivo'; });
    if (/secretari|recepcion|en l\b|forma de l/.test(t)) return PRODUCTOS.filter(function (p) { return p.sub === 'Secretarial'; });
    if (/cajon/.test(t)) return PRODUCTOS.filter(function (p) { return /cajonera/.test(p.clave) && !/sin/.test(p.clave); });
    if (/melamina/.test(t)) return PRODUCTOS.filter(function (p) { return /melamina/.test(p.clave); });
    if (/lineal|sencill|metal/.test(t)) return PRODUCTOS.filter(function (p) { return p.sub === 'Lineal'; });
    return null;
  }

  function grupoSilla(t) {
    if (/ejecutiv|gerenci|direccion|director|jefe|presiden/.test(t)) return 'ejecutiva';
    if (/operativ|secretari|ergonom|trabajo|colaborador|empleado|equipo/.test(t)) return 'operativa';
    if (/visita|espera|multiuso|capacitacion|comedor|apilabl|junta|evento|plegabl|recepcion/.test(t)) return 'multiusos';
    return null;
  }

  function responderProducto(lista, n) {
    estado.ultimo = lista.length === 1 ? lista[0] : null;
    if (lista.length > 1) {
      return {
        html: 'Tengo ' + lista.length + ' modelos con ese nombre, ¿cuál buscas?' + listaHtml(lista),
        chips: lista.slice(0, 3).map(function (p) { return p.nombre; })
      };
    }
    var p = lista[0];
    anotar(p.nombre);
    var foto = FOTOS[p.nombre] ? fotoHtml(FOTOS[p.nombre]) : '';
    if (n > 0) {
      var total = n * p.precio;
      var extra = n >= 10
        ? 'Para ' + n + ' piezas lo mejor es que Bryan revise tu pedido directamente: confirma inventario, entrega y te da el precio final.'
        : 'Bryan te confirma disponibilidad y fecha de entrega.';
      return {
        html: foto + (n === 1
          ? art(p, 'Una', 'Un') + ' <b>' + esc(p.nombre) + '</b> queda en <b>' + dinero(p.precio) + '</b>.\n'
          : n + ' × <b>' + esc(p.nombre) + '</b> a ' + dinero(p.precio) + ' cada una.\nSerían <b>' + dinero(total) + '</b>.\n') + extra + ' ¿En qué municipio sería la entrega?',
        chips: ['Monterrey', 'San Nicolás', 'Pasar con Bryan'],
        pose: 'laptop'
      };
    }
    return {
      html: foto + art(p, 'La', 'El') + ' <b>' + esc(p.nombre) + '</b> está en ' + dinero(p.precio) + ', de entrega inmediata.\n¿Cuántas piezas necesitas y en qué municipio sería la entrega?',
      chips: ['Necesito 1', 'Necesito 5', 'Ver opciones parecidas']
    };
  }

  function responderGrupo(clave, n) {
    var g = GRUPOS[clave];
    var todos = PRODUCTOS.filter(g.filtro);
    estado.grupo = clave;
    estado.ultimo = null;
    anotar(g.titulo);
    var desde = Math.min.apply(null, todos.map(function (p) { return p.precio; }));
    var opciones = clave === 'escritorio' ? todos : tres(todos);
    var intro = 'Tenemos ' + todos.length + ' ' + g.titulo + (g.para ? ' ' + g.para : '') + ', desde ' + dinero(desde) + '.';
    if (clave === 'escritorio') intro = 'Estos son los escritorios de entrega inmediata:';
    var cierre = n > 1
      ? '\nPara ' + n + ' piezas, dime cuál te late y te saco el total.'
      : '\n¿Para cuántas personas sería?';
    return {
      html: fotoHtml(g.foto) + intro + listaHtml(opciones, clave === 'escritorio' ? 'Foto de referencia. Precios vigentes hasta el 31 de diciembre de 2026.' : 'Foto de referencia. Te muestro tres de ' + todos.length + '.') + cierre,
      chips: clave === 'escritorio'
        ? ['Escritorio ejecutivo', 'Escritorio en L', 'Sillas para el equipo']
        : ['La más económica', 'Ver todas', 'Escritorios']
    };
  }

  // ---------- entrega ----------
  function municipio(t) {
    for (var i = 0; i < MUNICIPIOS.length; i++) {
      if (new RegExp('\\b(' + MUNICIPIOS[i][1] + ')\\b').test(t)) return { nombre: MUNICIPIOS[i][0], metro: !!MUNICIPIOS[i][2] };
    }
    return null;
  }
  function responderEntrega(m) {
    if (!m) {
      return {
        html: 'Entregamos en Monterrey y su zona metropolitana, y también programamos ruta a municipios cercanos como Cadereyta, Santiago o Saltillo.\nEl envío se cotiza según distancia y cantidad, y también puedes recoger en San Nicolás. ¿A qué municipio sería?',
        chips: ['Monterrey', 'Apodaca', 'Saltillo']
      };
    }
    anotar('entrega en ' + m.nombre);
    var cuando = m.metro
      ? 'Con inventario y ruta disponible, puede llegar al día siguiente de tu pedido.'
      : 'Ahí programamos ruta; normalmente son de 2 a 3 días según producto y cantidad.';
    return {
      html: 'Sí llegamos a <b>' + m.nombre + '</b>. ' + cuando + '\nEl costo de envío no va incluido: Bryan lo confirma según distancia y piezas. Entregamos de 10:30 a 18:00, armado o desarmado según el modelo.' +
        (estado.ultimo ? '\n¿Te dejo listo el pedido de la ' + esc(estado.ultimo.nombre) + ' para que Bryan lo confirme?' : '\n¿Qué te gustaría cotizar?'),
      chips: estado.ultimo ? ['Sí, pasar con Bryan', 'Seguir viendo productos'] : ['Sillas', 'Escritorios', 'Archivero']
    };
  }

  // ---------- intenciones ----------
  var SALUDO = /^(hola+|holi|buen(os|as)? (dias|tardes|noches)|buen dia|que tal|hey|saludos|hi|hello|buenas)\b/;
  var COMO_ESTAS = /\b(como estas|como esta|como te va|como andas|que tal estas|como va)\b/;

  function bryan(motivo) {
    estado.ofrecioBryan = true;
    return {
      html: motivo + '\nBryan López, nuestro asesor, te atiende por WhatsApp. Te dejo el chat abierto con lo que platicamos:',
      boton: true,
      chips: ['Seguir viendo productos']
    };
  }

  function responder(original) {
    var t = norm(original);
    if (!t) return null;
    var saludo = '';

    if (SALUDO.test(t) || COMO_ESTAS.test(t)) {
      var resto = t.replace(SALUDO, '').replace(COMO_ESTAS, '').replace(/\b(turi|que tal|buen dia)\b/g, '').trim();
      var preguntaComo = COMO_ESTAS.test(t);
      if (resto.split(' ').length < 2) {
        estado.sinEntender = 0;
        if (preguntaComo) {
          return {
            html: una([
              saludoHora() + '. Muy bien, gracias por preguntar. ¿Y tú cómo vas?\nCuéntame qué buscas para tu oficina y te ayudo a cotizarlo.',
              'Muy bien, gracias. Aquí ayudando a armar oficinas. ¿Cómo estás tú?\n¿Buscas algo en especial o te muestro lo que tenemos de entrega inmediata?'
            ]),
            chips: ['Ver sillas', 'Ver escritorios', '¿Qué puedes hacer?'],
            pose: 'saluda'
          };
        }
        return {
          html: una([
            saludoHora() + ', ¿cómo estás? Soy Turi, de OfficeTure.\n¿Cómo te puedo ayudar hoy?',
            'Hola, qué gusto saludarte. ¿Cómo estás?\nCuéntame qué necesitas para tu oficina y lo vemos juntos.',
            saludoHora() + '. Qué bueno que escribes. ¿En qué te puedo ayudar: sillas, escritorios o equipar una oficina completa?'
          ]),
          chips: ['Ver sillas', 'Ver escritorios', 'Equipar una oficina'],
          pose: 'saluda'
        };
      }
      saludo = una(['Hola, qué tal. ', saludoHora() + '. ', 'Hola. ']);
      t = resto;
    }

    var r = intencion(t, original);
    if (r && saludo) r.html = saludo + (r.html.charAt(0) === '<' ? '\n' : '') + r.html;
    return r;
  }

  function intencion(t) {
    var n = cantidad(t);

    // respuestas a cómo estás del cliente
    if (/^(bien|muy bien|todo bien|excelente|perfecto|aqui|bien gracias|bien y tu|muy bien y tu)\b/.test(t) && t.split(' ').length <= 5) {
      return { html: una(['Qué bueno. ¿Qué te gustaría ver para tu oficina?', 'Me da gusto. Dime qué buscas y te paso opciones con precio.']), chips: ['Sillas', 'Escritorios', 'Archivero'] };
    }
    if (/\b(gracias|grax|muy amable|te lo agradezco)\b/.test(t)) {
      return { html: una(['A ti. Aquí sigo si quieres ver algo más.', 'Con todo gusto. Si te surge otra duda, aquí estoy.']), pose: 'cafe', chips: ['Ver más productos', 'Hablar con Bryan'] };
    }
    if (/\b(adios|bye|hasta luego|nos vemos|eso es todo|es todo)\b/.test(t)) {
      return { html: 'Gracias por escribir. Que tengas muy buen día, aquí estoy cuando lo necesites.', pose: 'cafe' };
    }
    if (/\b(eres (un )?(bot|robot|ia|persona|humana|real)|eres humana|hablo con (un )?(bot|robot|persona)|inteligencia artificial)\b/.test(t)) {
      return { html: 'Soy Turi, asistente virtual de OfficeTure. Te ayudo con precios, entregas y dudas, y cuando quieras te paso con Bryan López, que es una persona y cierra los pedidos.', chips: ['Hablar con Bryan', '¿Qué puedes hacer?'] };
    }
    if (/\b(quien eres|como te llamas|tu nombre)\b/.test(t)) {
      return { html: 'Soy Turi, asistente de OfficeTure. Fabricamos y vendemos mobiliario de oficina en San Nicolás de los Garza. ¿Qué te gustaría ver?', chips: ['Sillas', 'Escritorios'] };
    }
    if (/\b(que puedes hacer|en que me ayudas|que haces|como funcionas|para que sirves|ayuda)\b/.test(t)) {
      return {
        html: 'Te puedo ayudar con:\n· Precios reales de sillas, escritorios y archiveros\n· Cuánto te sale un pedido por pieza\n· Si llegamos a tu municipio y cuándo\n· Pagos, factura, garantía e instalación\n· Pasarte con Bryan para cerrar tu pedido\n¿Por dónde empezamos?',
        chips: ['Ver sillas', 'Entregas', 'Formas de pago']
      };
    }

    // personas y casos que atiende Bryan
    if (/\b(hablar con|asesor|persona real|humano|vendedor|bryan|llamar|marcar|pasar con|telefono|whats?app)\b/.test(t) || /^si,? pasar con bryan$/.test(t)) {
      return bryan('Claro, te paso con él.');
    }
    if (/\b(descuento|rebaja|mejor precio|lo menos|menos precio|me lo dejas|promocion|oferta)\b/.test(t)) {
      return bryan('Los precios por volumen o especiales los revisa Bryan directamente para darte la mejor opción real.');
    }
    if (/\b(proveedor|proveo|fabrico|distribuyo|vendo (melamina|herrajes|telas?)|ofrecer mis|ofrecerles)\b/.test(t)) {
      return { html: 'Gracias por pensar en nosotros. Para proveedores, escríbenos a <b>OfiTure@outlook.com</b> con lo que ofreces y tus datos, y el equipo te contacta. También puedes usar la sección Proveedores de esta página.' };
    }
    if (/\b(queja|reclamo|llego (roto|danado|mal)|no ha llegado|mal servicio|molest)\b/.test(t)) {
      return bryan('Lamento mucho eso. Quiero que lo resuelva Bryan en persona para darle seguimiento.');
    }
    if (/\b(medidas|mide|miden|dimensiones|color|colores|material|peso|soporta)\b/.test(t)) {
      return bryan('Ese dato te lo confirmo con el asesor para no darte información incorrecta.');
    }
    if (/\b(proyecto|equipar|amueblar|oficina completa|oficinas completas|corporativo|estaciones de trabajo|sala de juntas|a la medida|remodel|mobiliario completo)\b/.test(t)) {
      anotar('equipar una oficina');
      return {
        html: 'Eso nos encanta: diseñamos y fabricamos oficinas completas, con estaciones de trabajo, salas de juntas, recepción y almacenaje, y lo instalamos.\nPara orientarte, ¿para cuántas personas es el espacio y en qué municipio está?',
        chips: ['Para 5 personas', 'Para 20 personas', 'Pasar con Bryan']
      };
    }
    if (/\b(credenzas?|libreros? sueltos?|mesa de juntas|mesa de centro|mesas? de reuniones|lockers?|recepcion completa)\b/.test(t)) {
      return bryan('Esa pieza no la manejo en el inventario de entrega inmediata, pero la podemos fabricar o revisar.');
    }
    if (/\b(hoy|mismo dia|urgente|ahorita|en este momento)\b/.test(t) && /\b(entreg|llega|mand|envi|lo ocupo|necesito)\b/.test(t)) {
      return bryan('Entregar el mismo día depende del inventario, la ruta y tu zona, así que eso lo confirma Bryan para no prometerte algo que no sea seguro.');
    }

    // productos
    var modelo = buscarModelo(t);
    if (modelo) return responderProducto(modelo, n);
    if (/\b(mas (barata|economica|barato|economico)|la de menos|economic|barat)\b/.test(t)) {
      var base = estado.grupo ? PRODUCTOS.filter(GRUPOS[estado.grupo].filtro) : PRODUCTOS;
      var min = base.slice().sort(function (a, b) { return a.precio - b.precio; })[0];
      return responderProducto([min], n);
    }
    if (/\b(ver todas|todas las|todos los|catalogo completo|lista completa)\b/.test(t) && estado.grupo) {
      var todas = PRODUCTOS.filter(GRUPOS[estado.grupo].filtro).sort(function (a, b) { return a.precio - b.precio; });
      return { html: 'Aquí van todas:' + listaHtml(todas, 'Precios vigentes hasta el 31 de diciembre de 2026.') + '\n¿Alguna te llamó la atención?', chips: [todas[0].nombre, 'Hablar con Bryan'] };
    }
    if (/\b(parecidas|similares|otras opciones|otra opcion)\b/.test(t)) {
      if (estado.ultimo) {
        var g = estado.ultimo.sub === 'Ejecutiva' ? 'ejecutiva' : estado.ultimo.sub === 'Operativa' ? 'operativa' : estado.ultimo.sub === 'Multiusos' ? 'multiusos' : 'escritorio';
        return responderGrupo(g, n);
      }
      if (estado.grupo) return responderGrupo(estado.grupo, n);
    }
    if (/\barchiver/.test(t)) return responderProducto(PRODUCTOS.filter(function (p) { return p.sub === 'Archivero'; }), n);
    if (/\bescritori|\bmesa de trabajo|\ben l\b/.test(t)) {
      var esc_ = buscarEscritorio(t);
      if (esc_ && esc_.length === 1) return responderProducto(esc_, n);
      if (esc_ && esc_.length > 1) return { html: 'De ese tipo tengo:' + listaHtml(esc_) + '\n¿Cuál te sirve más?', chips: esc_.map(function (p) { return p.nombre; }) };
      return responderGrupo('escritorio', n);
    }
    if (/\b(silla|sillas|sillon|asiento)\b/.test(t)) {
      var gs = grupoSilla(t);
      if (gs) return responderGrupo(gs, n);
      estado.grupo = null;
      return {
        html: 'Tenemos tres tipos de silla de entrega inmediata:\n· <b>Ejecutivas</b>, desde ' + dinero(2100) + '\n· <b>Operativas</b>, desde ' + dinero(1490) + '\n· <b>Multiusos</b> para visitas y capacitación, desde ' + dinero(690) + '\n¿Para quién sería la silla?',
        chips: ['Ejecutivas', 'Operativas', 'Multiusos']
      };
    }
    var gsuelto = grupoSilla(t);
    if (gsuelto && t.split(' ').length <= 3) return responderGrupo(gsuelto, n);
    if (n && /\b(personas?|colaboradores|empleados|puestos|lugares)\b/.test(t)) {
      if (n >= 10 || estado.intereses.indexOf('equipar una oficina') >= 0) {
        anotar('oficina para ' + n + ' personas');
        return bryan('Para un espacio de ' + n + ' personas, Bryan te arma una propuesta con estaciones, sillas y almacenaje a tu medida, y la instalamos.');
      }
      var esc1 = PRODUCTOS[0], sil1 = PRODUCTOS.filter(function (p) { return p.nombre === 'Silla LITE'; })[0];
      anotar(n + ' puestos de trabajo');
      return {
        html: 'Para ' + n + ' personas, un arreglo sencillo y resistente sería:' + listaHtml([
          { nombre: n + ' × ' + esc1.nombre, precio: n * esc1.precio },
          { nombre: n + ' × ' + sil1.nombre, precio: n * sil1.precio }
        ], 'Total aproximado: ' + dinero(n * (esc1.precio + sil1.precio)) + '. Envío aparte.') + '\n¿Lo vemos así o prefieres algo más ejecutivo?',
        chips: ['Algo más ejecutivo', 'Sillas operativas', 'Pasar con Bryan']
      };
    }
    if (n && estado.ultimo) return responderProducto([estado.ultimo], n);
    if (n && estado.grupo) return responderGrupo(estado.grupo, n);

    // datos del negocio
    var mun = municipio(t);
    if (/\b(entreg|envio|envios|mandan|llegan|llega|flete|domicilio|reparto|zona|cobertura|hacen envio)\b/.test(t) || (mun && t.split(' ').length <= 4)) {
      return responderEntrega(mun);
    }
    if (/\b(horario|hora|abren|cierran|abierto|atienden|sabado|domingo)\b/.test(t)) {
      return { html: 'Atendemos de lunes a viernes de 9:00 a 19:00 y el sábado de 10:00 a 19:00. Las entregas son de 10:30 a 18:00.\n¿Te ayudo a cotizar algo mientras?', chips: ['Sillas', 'Escritorios'] };
    }
    if (/\b(donde estan|direccion|ubicacion|ubicados|showroom|tienda|recoger|visitarlos|ir a ver|sucursal)\b/.test(t)) {
      return { html: 'Estamos en <b>Salina Cruz #633, Col. Vicente Guerrero, San Nicolás de los Garza, N. L.</b>\nSi quieres pasar a ver los muebles o recoger tu pedido, avísale a Bryan antes para tenerlo listo.', chips: ['Hablar con Bryan', 'Horario'] };
    }
    if (/\b(tarjeta|meses|msi|credito|debito)\b/.test(t)) {
      return { html: 'Por ahora no manejamos tarjeta ni meses sin intereses. El pago es por transferencia o en efectivo, con 50 % de anticipo para separar tu pedido.', chips: ['¿Dan factura?', 'Entregas'] };
    }
    if (/\b(pago|pagar|anticipo|transferencia|efectivo|apartar|separar|formas de pago)\b/.test(t)) {
      return { html: 'Puedes pagar por transferencia o en efectivo. Para separar se deja 50 % de anticipo; en productos de inventario se puede liquidar contra entrega. No manejamos tarjeta ni meses sin intereses.', chips: ['¿Dan factura?', 'Garantía'] };
    }
    if (/\b(factura|facturan|cfdi|rfc|iva)\b/.test(t)) {
      return { html: 'Sí facturamos. Todos los precios son más 16 % de IVA y la factura sale el mismo día o al siguiente. Bryan te pide los datos fiscales al cerrar.', chips: ['Formas de pago', 'Ver productos'] };
    }
    if (/\b(garantia|se rompe|defecto|cuanto duran|calidad)\b/.test(t)) {
      return { html: 'Los escritorios tienen 1 año de garantía por defectos de fábrica. Las sillas, 3 años, o 5 años con factura.\nCubre cantos, chapas, correderas y defectos de fábrica; no cubre golpes, humedad ni mal uso. Si algo llega dañado, se cambia.', chips: ['Ver sillas', 'Instalación'] };
    }
    if (/\b(instal|armad|arman|armar)\b/.test(t)) {
      return { html: 'La instalación va incluida cuando aplica. Según el modelo, la cantidad y la distancia, te lo entregamos armado, desarmado o lo instalamos en tu oficina.', chips: ['Entregas', 'Escritorios'] };
    }
    if (/\b(fabrican|hecho en|mexican|quienes son|empresa|nosotros|experiencia|clientes)\b/.test(t)) {
      return { html: 'Somos OfficeTure, una empresa 100 % mexicana que diseña y fabrica mobiliario de oficina en San Nicolás de los Garza. Tenemos línea de entrega inmediata y hacemos proyectos completos; ya equipamos más de 20 oficinas en Nuevo León.', chips: ['Ver productos', 'Equipar una oficina'] };
    }
    if (/\b(precio|precios|cuanto|cuesta|costo|cotiza|cotizacion|catalogo|productos|que venden|que tienen|inventario)\b/.test(t)) {
      return {
        html: 'Te paso precios reales de entrega inmediata, todos más IVA:\n· Sillas desde ' + dinero(690) + '\n· Escritorio lineal desde ' + dinero(2750) + '\n· Archivero de 4 gavetas en ' + dinero(5200) + '\n· Escritorio ejecutivo en ' + dinero(14200) + '\n¿Qué te interesa ver?',
        chips: ['Sillas', 'Escritorios', 'Archivero']
      };
    }
    if (/^(si|sip|claro|va|ok|okay|dale|sale|de acuerdo|perfecto)$/.test(t)) {
      if (estado.ultimo) return bryan('Perfecto. Para confirmar disponibilidad, pago y entrega te paso con Bryan.');
      return { html: 'Va. ¿Qué te gustaría ver primero?', chips: ['Sillas', 'Escritorios', 'Archivero'] };
    }
    if (/^(no|nel|no gracias|asi esta bien)$/.test(t)) {
      return { html: 'Está bien. Si te surge algo, aquí sigo.', chips: ['Ver productos'] };
    }
    if (mun) return responderEntrega(mun);

    // no entendí
    estado.sinEntender++;
    if (estado.sinEntender >= 2 && !estado.ofrecioBryan) {
      estado.sinEntender = 0;
      return bryan('Creo que no te estoy entendiendo bien, y no quiero darte información incorrecta.');
    }
    return {
      html: una([
        'Esa no me la sé todavía. Puedo ayudarte con sillas, escritorios, archiveros, entregas y pagos. ¿Qué buscas?',
        'Perdón, no te entendí del todo. ¿Me lo dices de otra forma? Por ejemplo: «sillas para 5 personas» o «¿entregan en Apodaca?».'
      ]),
      chips: ['Ver sillas', 'Entregas', 'Hablar con Bryan']
    };
  }

  // ---------- interfaz ----------
  var ICO_X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  var ICO_WA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2zm0 1.8a8.2 8.2 0 1 1-4.2 15.3l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 0 1 12 3.8zm-3.3 4.4c-.2 0-.5 0-.7.3-.3.3-1 1-1 2.3s1 2.7 1.1 2.9c.2.2 2 3.1 4.9 4.3 2.4 1 2.9.8 3.4.7.5 0 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3l-2-1c-.3-.1-.5-.1-.7.1l-.9 1.1c-.2.2-.3.2-.6.1-.3-.2-1.2-.5-2.4-1.5-.9-.8-1.5-1.8-1.6-2.1-.2-.3 0-.5.1-.6l.4-.5.3-.5v-.5l-.9-2.2c-.2-.5-.5-.5-.7-.5h-.6z"/></svg>';

  var raiz = document.createElement('div');
  raiz.className = 'turi';
  raiz.innerHTML =
    '<div class="turi-nube" role="status"><span class="turi-nube-texto"></span><button type="button" aria-label="Cerrar aviso">×</button></div>' +
    '<section class="turi-panel" role="dialog" aria-modal="false" aria-label="Chat con Turi, asistente de OfficeTure">' +
      '<header class="turi-cabeza">' +
        '<div class="turi-avatar"><img src="' + POSE.cara + '" alt=""></div>' +
        '<div class="turi-quien"><b>Turi</b><span>Asistente de OfficeTure</span></div>' +
        '<button class="turi-x" type="button" aria-label="Cerrar chat">' + ICO_X + '</button>' +
      '</header>' +
      '<div class="turi-log" aria-live="polite"></div>' +
      '<div class="turi-chips"></div>' +
      '<footer class="turi-pie">' +
        '<form class="turi-forma" autocomplete="off">' +
          '<input type="text" name="m" placeholder="Escribe tu mensaje" aria-label="Tu mensaje" maxlength="300">' +
          '<button type="submit" aria-label="Enviar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg></button>' +
        '</form>' +
        '<div class="turi-legal"><span>Asistente virtual · versión de prueba</span><a class="turi-wa" href="' + WA + '" target="_blank" rel="noopener">' + ICO_WA + 'WhatsApp</a></div>' +
      '</footer>' +
    '</section>' +
    '<button class="turi-lanzador" type="button" aria-label="Abrir chat con Turi" aria-expanded="false">' +
      '<span class="turi-cuerpo"><img class="p-quieto" src="' + POSE.quieto + '" alt=""><img class="p-saluda" src="' + POSE.saluda + '" alt=""></span>' +
      '<svg class="cerrar-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
    '</button>';
  document.body.appendChild(raiz);
  document.body.classList.add('con-turi');

  var log = raiz.querySelector('.turi-log');
  var chips = raiz.querySelector('.turi-chips');
  var forma = raiz.querySelector('.turi-forma');
  var entrada = forma.querySelector('input');
  var lanzador = raiz.querySelector('.turi-lanzador');
  var nube = raiz.querySelector('.turi-nube');
  var waPie = raiz.querySelector('.turi-wa');
  var ocupado = false;
  var historial = [];


  function pintar(m) {
    var div = document.createElement('div');
    div.className = 'm-msg ' + (m.de === 'tu' ? 'm-tu' : 'm-bot');
    if (m.de === 'tu') div.textContent = m.texto;
    else div.innerHTML = m.html;
    if (m.pose && POSE[m.pose]) {
      div.insertAdjacentHTML('afterbegin', '<img class="m-turi" src="' + POSE[m.pose] + '" alt="">');
    }
    if (m.bienvenida) {
      div.classList.add('m-bienvenida');
      div.insertAdjacentHTML('afterbegin', '<img class="m-turi-grande" src="' + POSE.saluda + '" alt="Turi te saluda">');
    }
    if (m.boton) {
      var a = document.createElement('a');
      a.className = 'm-wa-btn';
      a.href = waLink();
      a.target = '_blank';
      a.rel = 'noopener';
      a.innerHTML = ICO_WA + 'Seguir con Bryan en WhatsApp';
      a.style.cssText = 'display:inline-flex;align-items:center;gap:8px;margin-top:10px;padding:9px 14px;border-radius:999px;background:#25D366;color:#fff;font-weight:500;font-size:13.5px;white-space:nowrap';
      a.querySelector('svg').style.cssText = 'width:16px;height:16px;fill:#fff';
      div.appendChild(document.createElement('br'));
      div.appendChild(a);
    }
    log.appendChild(div);
    // las respuestas largas se leen desde su inicio, no desde el final
    log.scrollTop = m.de === 'tu' ? log.scrollHeight : Math.min(div.offsetTop - 12, log.scrollHeight);
  }

  function ponerChips(lista) {
    chips.innerHTML = '';
    (lista || []).forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = c;
      b.addEventListener('click', function () { enviar(c); });
      chips.appendChild(b);
    });
  }

  function decir(r) {
    var m = { de: 'bot', html: r.html, boton: !!r.boton, pose: r.pose, bienvenida: !!r.bienvenida };
    historial.push(m);
    pintar(m);
    brinca();
    ponerChips(r.chips);
    waPie.href = waLink();
  }

  function escribiendo(r) {
    ocupado = true;
    ponerChips([]);
    var puntos = document.createElement('div');
    puntos.className = 'm-escribe';
    puntos.setAttribute('aria-label', 'Turi está escribiendo');
    puntos.innerHTML = '<img src="' + POSE.laptop + '" alt=""><span><i></i><i></i><i></i></span>';
    log.appendChild(puntos);
    log.scrollTop = log.scrollHeight;
    var largo = r.html.replace(/<[^>]+>/g, '').length;
    var espera = reducido ? 300 : Math.min(600 + largo * 12, 2200);
    setTimeout(function () {
      puntos.remove();
      decir(r);
      ocupado = false;
    }, espera);
  }

  function enviar(texto) {
    texto = String(texto || '').trim();
    if (!texto || ocupado) return;
    var m = { de: 'tu', texto: texto };
    historial.push(m);
    pintar(m);
    entrada.value = '';
    var r = responder(texto);
    if (r) escribiendo(r);
  }

  function bienvenida() {
    escribiendo({
      bienvenida: true,
      html: 'Hola, <b>Bryan</b> y <b>Scarleth</b>. Soy Turi, el asistente de OfficeTure.\nLes ayudo con precios, entregas y dudas de nuestros muebles de oficina. ¿Qué les gustaría ver?',
      chips: ['Ver sillas', 'Ver escritorios', 'Equipar una oficina', 'Hablar con Bryan']
    });
  }

  function abrir() {
    raiz.classList.add('abierta');
    lanzador.setAttribute('aria-expanded', 'true');
    lanzador.setAttribute('aria-label', 'Cerrar chat');
    nube.classList.remove('ver');
    if (!historial.length) bienvenida();
    if (window.matchMedia('(min-width: 560px)').matches) setTimeout(function () { entrada.focus(); }, 200);
  }
  function cerrar() {
    raiz.classList.remove('abierta');
    lanzador.setAttribute('aria-expanded', 'false');
    lanzador.setAttribute('aria-label', 'Abrir chat con Turi');
    if (typeof revisar === 'function') revisar();
  }

  lanzador.addEventListener('click', function () { raiz.classList.contains('abierta') ? cerrar() : abrir(); });
  raiz.querySelector('.turi-x').addEventListener('click', cerrar);
  nube.addEventListener('click', function (e) {
    if (e.target.tagName === 'BUTTON') {
      // si la persona cierra un mensaje, Turi se calla un buen rato
      nube.classList.remove('ver');
      silencioHasta = Date.now() + 120000;
      return;
    }
    abrir();
  });
  forma.addEventListener('submit', function (e) { e.preventDefault(); enviar(entrada.value); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && raiz.classList.contains('abierta')) cerrar(); });

  // cada carga de página empieza de cero: sin conversación guardada y con la nube de saludo
  try { sessionStorage.removeItem('turi'); sessionStorage.removeItem('turi-nube'); } catch (e) { /* sin almacenamiento */ }
  var telefono = window.matchMedia('(max-width: 759px)');
  var portada = document.querySelector('.hero');
  var yaSalio = false;

  // en el teléfono Turi no aparece hasta que la portada (el video) quedó completamente arriba
  function pasoPortada() {
    var fin = portada ? portada.getBoundingClientRect().bottom : window.innerHeight * 0.9 - window.scrollY;
    return fin <= 0;
  }
  function revisar() {
    var ocultar = telefono.matches && !raiz.classList.contains('abierta') && !pasoPortada();
    raiz.classList.toggle('oculto', ocultar);
    if (!ocultar && !yaSalio) {
      yaSalio = true;
      setTimeout(function () { platica(0); }, telefono.matches ? 600 : 3500);
    }
  }
  var pendiente = false;
  window.addEventListener('scroll', function () {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(function () { pendiente = false; revisar(); });
  }, { passive: true });
  window.addEventListener('resize', revisar);
  revisar();

  // Turi saluda con la mano al aparecer la nube y luego cada tanto mientras el chat está cerrado;
  // en el teléfono además da un saltito
  function saluda() {
    if (reducido || raiz.classList.contains('abierta') || raiz.classList.contains('oculto')) return;
    lanzador.classList.add('saluda');
    setTimeout(function () { lanzador.classList.remove('saluda'); }, 2600);
  }
  // mensajes que Turi suelta cada cierto tiempo: aparecen unos segundos y se van solos
  var MENSAJES = [
    'Hola, <b>Bryan</b> y <b>Scarleth</b>. ¿Cómo están? ¿Les puedo ayudar en algo?',
    '¿Tienes alguna duda? Pregúntame lo que quieras.',
    '¿Buscas sillas o escritorios? Te paso precios al momento.',
    'Te digo si entregamos en tu zona y cuándo llega.',
    '¿Vas a equipar una oficina completa? Cuéntame cuántas personas son.',
    'Aquí sigo, por si me necesitas.',
    '¿Quieres ver qué tenemos de entrega inmediata?'
  ];
  var textoNube = nube.querySelector('.turi-nube-texto');
  var ultimo = -1, silencioHasta = 0, quitar = null;
  function platica(i) {
    if (raiz.classList.contains('abierta') || raiz.classList.contains('oculto') || Date.now() < silencioHasta) return;
    if (i === undefined) {
      do { i = 1 + Math.floor(Math.random() * (MENSAJES.length - 1)); } while (i === ultimo);
    }
    ultimo = i;
    textoNube.innerHTML = MENSAJES[i];
    nube.classList.add('ver');
    saluda();
    clearTimeout(quitar);
    quitar = setTimeout(function () { nube.classList.remove('ver'); }, 6000);
  }
  (function cadaRato() {
    setTimeout(function () { platica(); cadaRato(); }, 26000 + Math.random() * 12000);
  })();
  (function cadaTanto() {
    setTimeout(function () { saluda(); cadaTanto(); }, 11000 + Math.random() * 7000);
  })();

  // el avatar del encabezado da un brinquito cada vez que Turi contesta
  var avatar = raiz.querySelector('.turi-avatar');
  function brinca() {
    if (reducido) return;
    avatar.classList.remove('brinca');
    void avatar.offsetWidth;
    avatar.classList.add('brinca');
  }

  // para probar desde la consola: Turi.probar('hola, cuánto cuesta la silla ergo')
  window.Turi = { abrir: abrir, cerrar: cerrar, probar: function (t) { var r = responder(t); return r && r.html.replace(/<[^>]+>/g, ' '); } };
})();
