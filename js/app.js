/* OfficeTure · comportamiento del sitio
   Sin dependencias. Barra al bajar, menú móvil, aparición al hacer scroll,
   miniaturas de sillas y formulario de proveedores que abre WhatsApp. */
(function () {
  'use strict';

  var WA = 'https://wa.me/5218124283124';
  var barra = document.getElementById('barra');
  var ham = document.querySelector('.hamburguesa');
  var menu = document.getElementById('menu-movil');
  var reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- barra: solo el sello se encoge con el scroll (--p de 0 a 1); la barra
     se vuelve sólida al pasar la portada (o casi de inmediato en interiores) ---- */
  var hero = document.getElementById('inicio');
  var TRAMO = 260;           /* píxeles de scroll en los que el logo pasa de grande a chico */
  var pAnterior = -1;
  var yAnterior = 0;
  var subiendo = false;
  var pendiente = false;
  var fila = barra.querySelector('.barra-fila');

  /* distancia del botón de menú (izquierda) al centro de la barra, para que en
     escritorio ocupe el lugar del sello al bajar */
  function medirDx() {
    if (!fila || !ham) return;
    var dx = fila.clientWidth / 2 - (ham.offsetLeft + ham.offsetWidth / 2);
    barra.style.setProperty('--dx', Math.round(dx) + 'px');
  }
  function pintarBarra() {
    pendiente = false;
    var y = window.scrollY || 0;
    var dy = y - yAnterior;
    if (dy < -3) subiendo = true; else if (dy > 3) subiendo = false;
    yAnterior = y;
    barra.classList.toggle('subiendo', subiendo);
    var p = Math.min(1, Math.max(0, y / TRAMO));
    if (reducido) p = p > 0.5 ? 1 : 0;
    p = 1 - (1 - p) * (1 - p);   /* ease-out: se encoge rápido al principio y asienta suave */
    p = Math.round(p * 1000) / 1000;
    if (p !== pAnterior) {
      barra.style.setProperty('--p', p);
      barra.classList.toggle('compacta', p >= 0.5);
      pAnterior = p;
    }
    var limite = hero ? hero.offsetHeight - 80 : 24;
    barra.classList.toggle('solida', y > limite);
  }
  function alScroll() {
    if (pendiente) return;
    pendiente = true;
    window.requestAnimationFrame(pintarBarra);
  }
  window.addEventListener('scroll', alScroll, { passive: true });
  window.addEventListener('resize', function () { medirDx(); alScroll(); });
  medirDx();
  pintarBarra();

  /* ---- video de portada: si carga, sustituye a las fotos en movimiento ---- */
  var video = document.getElementById('hero-video');
  if (video && hero) {
    var conVideo = function () { hero.classList.add('con-video'); };
    video.addEventListener('canplay', conVideo);
    video.addEventListener('error', function () { hero.classList.remove('con-video'); }, true);
    /* 1080p en escritorio, 720p en teléfono; sin video si el usuario pide ahorrar datos o menos movimiento */
    var ahorro = navigator.connection && navigator.connection.saveData;
    if (!reducido && !ahorro) {
      var movil = window.matchMedia('(max-width: 759px)').matches;
      video.src = movil ? video.dataset.srcMovil : video.dataset.src;
      video.load();
      var intento = video.play();
      if (intento && intento.catch) intento.catch(function () {});
    }
  }

  /* ---- menú móvil ---- */
  function abrirMenu(si) {
    document.body.classList.toggle('menu-abierto', si);
    ham.setAttribute('aria-expanded', String(si));
    ham.setAttribute('aria-label', si ? 'Cerrar menú' : 'Abrir menú');
    menu.setAttribute('aria-hidden', String(!si));
  }
  ham.addEventListener('click', function () {
    abrirMenu(!document.body.classList.contains('menu-abierto'));
  });
  menu.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', function () { abrirMenu(false); });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && document.body.classList.contains('menu-abierto')) abrirMenu(false);
  });

  /* ---- aparece al hacer scroll ---- */
  var elementos = document.querySelectorAll('.aparece');
  if ('IntersectionObserver' in window && !reducido) {
    var io = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('visto'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    elementos.forEach(function (el) { io.observe(el); });
  } else {
    elementos.forEach(function (el) { el.classList.add('visto'); });
  }

  /* ---- catálogo: pestañas de línea ---- */
  var tabs = document.querySelectorAll('.cat-tabs [role="tab"]');
  tabs.forEach(function (t) {
    t.addEventListener('click', function () {
      tabs.forEach(function (o) {
        var activa = o === t;
        o.classList.toggle('activa', activa);
        o.setAttribute('aria-selected', String(activa));
        var panel = document.getElementById(o.getAttribute('aria-controls'));
        if (panel) panel.hidden = !activa;
      });
      if (t.id === 'tab-inmediata') activarItem(itemActivo);
    });
  });

  /* enlaces que abren una pestaña concreta del catálogo (p. ej. la tarjeta de portada) */
  document.querySelectorAll('[data-pestana]').forEach(function (a) {
    a.addEventListener('click', function () {
      var t = document.getElementById(a.dataset.pestana);
      if (t) t.click();
    });
  });

  /* ---- showroom: vitrina fija en escritorio, carrusel en móvil ---- */
  var stage = document.querySelector('.show-stage');
  var lista = document.getElementById('show-lista');
  var items = lista ? Array.prototype.slice.call(lista.querySelectorAll('.show-item')) : [];
  var itemActivo = items[0];
  var esEscritorio = window.matchMedia('(min-width: 1000px)');
  var pad = function (n) { return String(n).padStart(2, '0'); };

  function activarItem(item) {
    if (!item) return;
    itemActivo = item;
    var idx = items.indexOf(item);
    items.forEach(function (o) { o.classList.toggle('activa', o === item); });
    if (stage) {
      stage.querySelectorAll('img[data-stage]').forEach(function (im) {
        im.classList.toggle('activa', im.dataset.stage === item.dataset.key);
      });
      stage.classList.toggle('blanca', !!item.dataset.contiene);
      document.getElementById('stage-num').textContent = pad(idx + 1);
      document.getElementById('stage-nombre').textContent = item.querySelector('h3').textContent;
    }
    var actual = document.getElementById('show-actual');
    if (actual) actual.textContent = pad(idx + 1);
  }

  if (items.length && 'IntersectionObserver' in window) {
    var ioShow = new IntersectionObserver(function (entradas) {
      if (!esEscritorio.matches) return;
      entradas.forEach(function (en) { if (en.isIntersecting) activarItem(en.target); });
    }, { rootMargin: '-42% 0px -42% 0px', threshold: 0 });
    items.forEach(function (it) { ioShow.observe(it); });
  }

  /* índice de capítulos (inventario): lleva a la pieza en la vitrina */
  document.querySelectorAll('[data-ir]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var item = document.querySelector('.show-item[data-key="' + a.dataset.ir + '"]');
      if (!item || !lista) return;
      e.preventDefault();
      if (esEscritorio.matches) {
        item.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        lista.scrollIntoView({ behavior: 'smooth', block: 'start' });
        lista.scrollTo({ left: item.offsetLeft - lista.offsetLeft, behavior: 'smooth' });
      }
      activarItem(item);
    });
  });

  if (lista) {
    var tScroll;
    lista.addEventListener('scroll', function () {
      if (esEscritorio.matches) return;
      clearTimeout(tScroll);
      tScroll = setTimeout(function () {
        var ancho = items[0].offsetWidth + 14;
        var idx = Math.max(0, Math.min(items.length - 1, Math.round(lista.scrollLeft / ancho)));
        activarItem(items[idx]);
      }, 60);
    }, { passive: true });
    document.querySelectorAll('.show-flecha').forEach(function (f) {
      f.addEventListener('click', function () {
        var idx = items.indexOf(itemActivo) + Number(f.dataset.dir);
        idx = Math.max(0, Math.min(items.length - 1, idx));
        items[idx].scrollIntoView({ behavior: reducido ? 'auto' : 'smooth', block: 'nearest', inline: 'center' });
      });
    });
  }

  /* variantes: modelos de silla y acabados */
  document.querySelectorAll('.variantes').forEach(function (grupo) {
    var item = grupo.closest('.show-item');
    var nombre = grupo.querySelector('.var-nombre');
    grupo.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () {
        grupo.querySelectorAll('button').forEach(function (o) { o.classList.remove('activa'); });
        b.classList.add('activa');
        if (nombre) nombre.textContent = b.dataset.nombre;
        item.dataset.img = b.dataset.img;
        var pre = new Image();
        pre.onload = function () {
          var foto = item.querySelector('.show-foto img');
          if (foto) foto.src = b.dataset.img;
          if (stage) {
            var im = stage.querySelector('img[data-stage="' + item.dataset.key + '"]');
            if (im) im.src = b.dataset.img;
          }
        };
        pre.src = b.dataset.img;
        if (!item.classList.contains('activa')) activarItem(item);
      });
    });
  });

  /* ---- equipa tu oficina: configurador por áreas → WhatsApp ----
     Precios de referencia del cliente (más IVA). null = a cotizar. */
  var AREAS = [
    { id: 'estaciones', nombre: 'Estaciones de trabajo', ceja: 'Operativo', foto: 'img/proy-despues.webp', unidad: 'puestos', auto: true, cant: 12, on: true,
      base: 'Estación', modelos: [{ n: 'lineal con cajonera', p: 2750 }, { n: 'en escuadra', p: null }] },
    { id: 'direccion', nombre: 'Dirección', ceja: 'Ejecutivo', foto: 'img/prod-ejecutivo.webp', unidad: 'oficinas', cant: 1, on: false,
      base: '', modelos: [{ n: 'Semiejecutivo en L con librero', p: 11500 }, { n: 'Ejecutivo con librero', p: 14200 }] },
    { id: 'juntas', nombre: 'Sala de juntas', ceja: 'Reuniones', foto: 'img/hero.webp', unidad: 'salas', cant: 1, on: false,
      base: 'Sala de juntas', modelos: [{ n: 'para 6 personas', p: null }, { n: 'para 8 personas', p: null }, { n: 'para 10 o más', p: null }] },
    { id: 'recepcion', nombre: 'Recepción', ceja: 'Bienvenida', foto: 'img/proy-recepcion.webp', unidad: 'mostradores', cant: 1, on: false,
      base: 'Mostrador', modelos: [{ n: 'recto', p: null }, { n: 'en L', p: null }] },
    { id: 'almacenaje', nombre: 'Almacenaje', ceja: 'Archivo', foto: 'img/prod-archivero.webp', unidad: 'archiveros', cant: 2, on: false,
      base: 'Archivero vertical de 4 gavetas ·', modelos: [{ n: 'grafito', p: 5200 }, { n: 'nogal', p: 5200 }, { n: 'claro', p: 5200 }] },
    { id: 'silleria', nombre: 'Sillería', ceja: 'Para sentarse bien', foto: 'img/proy-individual.webp', unidad: 'sillas', auto: true, cant: 12, on: true,
      base: 'Silla', modelos: [{ n: 'operativa', p: 1490, desde: true }, { n: 'ejecutiva', p: null }, { n: 'ejecutiva con cabecera', p: null }] }
  ];
  var contAreas = document.getElementById('equipa-areas');
  var formEq = document.getElementById('form-equipa');
  if (contAreas && formEq) {
    var eqRango = document.getElementById('eq-rango');
    var eqNum = document.getElementById('eq-num');
    var eqLineas = document.getElementById('eq-lineas');
    var eqTotal = document.getElementById('eq-total');
    var pesos = function (n) { return '$' + n.toLocaleString('es-MX'); };
    var estado = AREAS.map(function (a) { return { on: a.on, modelo: 0, cant: a.cant, manual: false }; });

    function nombreLinea(a, m) { return (a.base ? a.base + ' ' : '') + m.n; }

    function pintar() {
      var personas = Number(eqRango.value);
      eqNum.value = personas;
      var total = 0, hayDesde = false, lineas = [];
      AREAS.forEach(function (a, i) {
        var s = estado[i];
        var art = contAreas.children[i];
        art.classList.toggle('activa', s.on);
        art.querySelector('.eq-foto').setAttribute('aria-pressed', String(s.on));
        art.querySelectorAll('.eq-modelo').forEach(function (b, j) { b.classList.toggle('activa', j === s.modelo); });
        art.querySelector('.eq-paso output').innerHTML = s.cant + '<small>' + a.unidad + '</small>';
        if (!s.on) return;
        var m = a.modelos[s.modelo];
        var precio = m.p ? s.cant * m.p : null;
        if (precio) { total += precio; if (m.desde) hayDesde = true; }
        lineas.push({ texto: s.cant + ' × ' + nombreLinea(a, m), precio: precio, desde: m.desde });
      });
      eqLineas.innerHTML = lineas.length
        ? lineas.map(function (l) { return '<li><b>' + l.texto + '</b><span>' + (l.precio ? (l.desde ? 'desde ' : '') + pesos(l.precio) : 'a cotizar') + '</span></li>'; }).join('')
        : '<li class="vacia">Activa al menos un área para armar tu oficina.</li>';
      eqTotal.textContent = total ? (hayDesde ? 'desde ' : '') + pesos(total) : 'a cotizar';
    }

    contAreas.innerHTML = AREAS.map(function (a) {
      return '<article class="eq-area" data-id="' + a.id + '">' +
        '<button type="button" class="eq-foto" aria-pressed="false"><img src="' + a.foto + '" alt="" loading="lazy"><small>' + a.ceja + '</small><span>' + a.nombre + '</span><i></i></button>' +
        '<div class="eq-opciones">' +
          '<div><p class="eq-etiqueta">Modelo</p><div class="eq-modelos" role="group" aria-label="Modelo de ' + a.nombre.toLowerCase() + '">' +
            a.modelos.map(function (m, j) { return '<button type="button" class="eq-modelo" data-i="' + j + '"><b>' + m.n.charAt(0).toUpperCase() + m.n.slice(1) + '</b><span>' + (m.p ? (m.desde ? 'desde ' : '') + pesos(m.p) + ' + IVA' : 'a cotizar') + '</span></button>'; }).join('') +
          '</div></div>' +
          '<div class="eq-cant"><span>Cantidad</span><div class="eq-paso"><button type="button" data-d="-1" aria-label="Menos">&minus;</button><output></output><button type="button" data-d="1" aria-label="Más">+</button></div></div>' +
        '</div></article>';
    }).join('');

    Array.prototype.forEach.call(contAreas.children, function (art, i) {
      art.querySelector('.eq-foto').addEventListener('click', function () { estado[i].on = !estado[i].on; pintar(); });
      art.querySelectorAll('.eq-modelo').forEach(function (b) {
        b.addEventListener('click', function () { estado[i].modelo = Number(b.dataset.i); pintar(); });
      });
      art.querySelectorAll('.eq-paso button').forEach(function (b) {
        b.addEventListener('click', function () {
          estado[i].cant = Math.max(1, Math.min(200, estado[i].cant + Number(b.dataset.d)));
          estado[i].manual = true;
          pintar();
        });
      });
    });

    eqRango.addEventListener('input', function () {
      var personas = Number(eqRango.value);
      AREAS.forEach(function (a, i) { if (a.auto && !estado[i].manual) estado[i].cant = personas; });
      pintar();
    });

    formEq.addEventListener('submit', function (e) {
      e.preventDefault();
      var entrega = formEq.querySelector('input[name="entrega"]:checked').value;
      var partidas = [];
      AREAS.forEach(function (a, i) {
        var s = estado[i];
        if (s.on) partidas.push('- ' + s.cant + ' × ' + nombreLinea(a, a.modelos[s.modelo]));
      });
      var texto = 'Hola, quiero equipar mi oficina para ' + eqRango.value + ' personas.' +
        '\n' + (partidas.length ? partidas.join('\n') : '- Áreas por definir') +
        '\nEntrega: ' + entrega +
        '\nEstimado de referencia: ' + eqTotal.textContent + ' + IVA';
      window.open(WA + '?text=' + encodeURIComponent(texto), '_blank', 'noopener');
    });

    pintar();
  }

  /* ---- proveedores: el botón despliega el registro ---- */
  var provBtn = document.querySelector('.prov-abrir');
  var provReg = document.getElementById('prov-registro');
  if (provBtn && provReg) {
    provBtn.addEventListener('click', function () {
      var abrir = !provReg.classList.contains('abierto');
      if (abrir) provReg.hidden = false;
      requestAnimationFrame(function () { provReg.classList.toggle('abierto', abrir); });
      provBtn.setAttribute('aria-expanded', abrir ? 'true' : 'false');
      provBtn.textContent = abrir ? 'Cerrar el registro' : 'Registrarme como proveedor';
      if (abrir) {
        setTimeout(function () {
          provReg.scrollIntoView({ behavior: 'smooth', block: 'start' });
          var primero = provReg.querySelector('input:not([type=hidden]):not([type=radio])'); if (primero) primero.focus({ preventScroll: true });
        }, 450);
      } else {
        provReg.addEventListener('transitionend', function ocultar() { if (!provReg.classList.contains('abierto')) provReg.hidden = true; provReg.removeEventListener('transitionend', ocultar); });
      }
    });
  }

  /* ---- «¿Qué ofreces?»: las etiquetas escriben el campo oculto ---- */
  document.querySelectorAll('input[name="giro-opcion"]').forEach(function (r) {
    r.addEventListener('change', function () { if (r.checked) document.getElementById('pv-giro').value = r.value; });
  });

  /* ---- formulario de proveedores → WhatsApp ---- */
  var form = document.getElementById('form-proveedor');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = function (id) { return (document.getElementById(id).value || '').trim(); };
      var faltan = ['pv-nombre', 'pv-empresa', 'pv-tel'].filter(function (id) { return !v(id); });
      var aviso = document.getElementById('pv-aviso');
      if (faltan.length) {
        faltan.forEach(function (id) { document.getElementById(id).classList.add('error'); });
        document.getElementById(faltan[0]).focus();
        aviso.textContent = 'Faltan tu nombre, empresa o teléfono para poder responderte.';
        aviso.classList.add('error');
        return;
      }
      var texto = 'Hola, soy proveedor.' +
        '\nNombre: ' + v('pv-nombre') +
        '\nEmpresa: ' + v('pv-empresa') +
        '\nOfrezco: ' + v('pv-giro') +
        '\nTeléfono: ' + v('pv-tel') +
        (v('pv-msg') ? '\n' + v('pv-msg') : '');
      window.open(WA + '?text=' + encodeURIComponent(texto), '_blank', 'noopener');
      aviso.textContent = 'Se abrió WhatsApp con tu mensaje. Solo usamos tus datos para responderte.';
      aviso.classList.remove('error');
    });
    form.querySelectorAll('input').forEach(function (i) {
      i.addEventListener('input', function () { i.classList.remove('error'); });
    });
  }
})();

