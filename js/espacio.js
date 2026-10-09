/* OfficeTure · «Armemos tu espacio»
   Maqueta en SVG que se arma sola según el número de personas.
   Reglas: hasta 12 personas, área abierta con escritorios en bench; de 13 en
   adelante, cubículos con mamparas. Se desbloquean sala de juntas (6),
   recepción (10) y dirección (16). Precios de referencia del cliente. */
(function () {
  'use strict';

  var svg = document.getElementById('plano');
  if (!svg) return;

  var WA = 'https://wa.me/5218124283124';
  var NS = 'http://www.w3.org/2000/svg';
  var escena = document.getElementById('plano-escena');
  var rango = document.getElementById('esp-rango');
  var num = document.getElementById('esp-num');
  var planoN = document.getElementById('plano-n');
  var modoTxt = document.getElementById('plano-modo');
  var hitos = document.querySelectorAll('#esp-hitos li');
  var cotizar = document.getElementById('esp-cotizar');
  var gZonas = document.getElementById('plano-zonas');
  var gPods = document.getElementById('plano-pods');
  var gPlantas = document.getElementById('plano-plantas');
  var reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var MIN = Number(rango.min), MAX = Number(rango.max);

  var UMBRAL = { juntas: 6, recepcion: 10, cubiculos: 13, direccion: 16 };
  var POD = { abierta: { w: 170, h: 150 }, cubiculos: { w: 200, h: 200 } };

  /* hitos sobre la pista */
  hitos.forEach(function (li) {
    li.style.setProperty('--p', ((Number(li.dataset.min) - MIN) / (MAX - MIN) * 100) + '%');
  });

  /* ---------- piezas ---------- */
  function el(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  function silla(cx, cy, d) {
    return '<g class="pop" style="animation-delay:' + (d || 0) + 'ms"><circle class="silla" cx="' + cx + '" cy="' + cy + '" r="12"/><circle class="cabeza" cx="' + cx + '" cy="' + cy + '" r="5.5"/></g>';
  }
  function sillaVacia(cx, cy, d) {
    return '<g class="pop" style="animation-delay:' + (d || 0) + 'ms"><circle class="silla" cx="' + cx + '" cy="' + cy + '" r="11"/><circle class="cabeza-marfil" cx="' + cx + '" cy="' + cy + '" r="4"/></g>';
  }
  function planta(cx, cy) {
    return '<g class="pop"><circle class="planta-maceta" cx="' + cx + '" cy="' + cy + '" r="9"/><circle class="planta" cx="' + (cx - 5) + '" cy="' + (cy - 6) + '" r="7"/><circle class="planta" cx="' + (cx + 6) + '" cy="' + (cy - 4) + '" r="6"/><circle class="planta" cx="' + cx + '" cy="' + (cy + 2) + '" r="6"/></g>';
  }

  /* pod de área abierta: 4 escritorios en bench, 2 arriba y 2 abajo */
  function podAbierta(n) {
    var s = '';
    var pos = [[10, 34, 'arriba'], [88, 34, 'arriba'], [10, 78, 'abajo'], [88, 78, 'abajo']];
    for (var i = 0; i < n; i++) {
      var x = pos[i][0], y = pos[i][1], lado = pos[i][2], d = i * 70;
      s += '<g class="pop" style="animation-delay:' + d + 'ms"><rect class="escritorio" x="' + x + '" y="' + y + '" width="72" height="42" rx="5"/>' +
        '<rect class="monitor" x="' + (x + 25) + '" y="' + (lado === 'arriba' ? y + 34 : y + 4) + '" width="22" height="4" rx="1"/></g>';
      s += silla(x + 36, lado === 'arriba' ? y - 16 : y + 58, d + 60);
    }
    return s;
  }

  /* pod de cubículos: cruz de mamparas y un escritorio en L por cuadrante */
  function cuadranteL(d) {
    return '<g class="pop" style="animation-delay:' + d + 'ms">' +
      '<rect class="escritorio" x="20" y="54" width="74" height="38" rx="4"/>' +
      '<rect class="escritorio" x="58" y="18" width="36" height="74" rx="4"/>' +
      '<rect class="monitor" x="66" y="40" width="4" height="22" rx="1"/></g>' +
      silla(40, 36, d + 60);
  }
  function podCubiculos(n) {
    var s = '<path class="mampara pop" d="M100 6V194M6 100H194"/>';
    var tr = ['', 'translate(200,0) scale(-1,1)', 'translate(0,200) scale(1,-1)', 'translate(200,200) scale(-1,-1)'];
    for (var i = 0; i < n; i++) s += '<g transform="' + tr[i] + '">' + cuadranteL(i * 70) + '</g>';
    return s;
  }

  /* zonas desbloqueables */
  function zonaJuntas(x, y, w, h) {
    var cx = x + w / 2, cy = y + h / 2 + 10, s = '';
    s += '<rect class="zona" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="12"/>';
    s += '<text x="' + (x + 16) + '" y="' + (y + 24) + '">Sala de juntas</text>';
    s += '<rect class="madera pop" x="' + (cx - 32) + '" y="' + (cy - 78) + '" width="64" height="156" rx="14"/>';
    var d = 0;
    [-52, 0, 52].forEach(function (dy) { s += sillaVacia(cx - 52, cy + dy, d += 50); s += sillaVacia(cx + 52, cy + dy, d += 50); });
    s += sillaVacia(cx, cy - 98, d += 50); s += sillaVacia(cx, cy + 98, d += 50);
    return s;
  }
  function zonaDireccion(x, y, w, h) {
    var s = '';
    s += '<rect class="zona" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="12"/>';
    s += '<text x="' + (x + 16) + '" y="' + (y + 24) + '">Dirección</text>';
    s += '<rect class="librero pop" x="' + (x + 20) + '" y="' + (y + h - 34) + '" width="' + (w - 40) + '" height="16" rx="3"/>';
    s += '<g class="pop" style="animation-delay:80ms"><rect class="madera" x="' + (x + 40) + '" y="' + (y + 120) + '" width="150" height="46" rx="6"/>' +
      '<rect class="madera" x="' + (x + 144) + '" y="' + (y + 60) + '" width="46" height="106" rx="6"/>' +
      '<rect class="monitor" x="' + (x + 100) + '" y="' + (y + 126) + '" width="26" height="4" rx="1"/></g>';
    s += silla(x + 112, y + 184, 160);
    s += sillaVacia(x + 90, y + 96, 220) + sillaVacia(x + 124, y + 82, 270);
    s += planta(x + w - 28, y + 46);
    return s;
  }
  function zonaRecepcion(x, y, w, h) {
    var s = '';
    s += '<rect class="zona" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="12"/>';
    s += '<text x="' + (x + 16) + '" y="' + (y + 24) + '">Recepción</text>';
    s += '<rect class="madera pop" x="' + (x + 130) + '" y="' + (y + 14) + '" width="170" height="24" rx="6"/>';
    s += silla(x + 215, y + 54, 80);
    var d = 120;
    [0, 36, 72].forEach(function (dx) { s += sillaVacia(x + w - 150 + dx, y + 40, d += 50); });
    s += planta(x + w - 40, y + 40);
    return s;
  }

  /* ---------- reconciliación con animación ---------- */
  function sincronizar(grupo, deseados, clase) {
    var vivos = {};
    deseados.forEach(function (d) {
      vivos[d.id] = true;
      var g = grupo.querySelector('[data-id="' + d.id + '"]');
      var nuevo = !g;
      if (nuevo) {
        g = el('g', { 'data-id': d.id, 'class': clase });
        g.style.transform = 'translate(' + (d.x + d.w * d.s / 2) + 'px,' + (d.y + d.h * d.s / 2) + 'px) scale(0)';
        grupo.appendChild(g);
      }
      if (g.dataset.sig !== d.sig) { g.innerHTML = d.html; g.dataset.sig = d.sig; }
      g.classList.remove('fuera');
      var destino = 'translate(' + d.x + 'px,' + d.y + 'px) scale(' + d.s + ')';
      if (nuevo && !reducido) {
        void g.getBoundingClientRect();
        requestAnimationFrame(function () { g.style.transform = destino; });
      } else {
        g.style.transform = destino;
      }
    });
    Array.prototype.forEach.call(grupo.querySelectorAll('[data-id]'), function (g) {
      if (vivos[g.dataset.id] || g.classList.contains('fuera')) return;
      g.classList.add('fuera');
      var r = g.style.transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
      if (r) g.style.transform = 'translate(' + r[1] + 'px,' + r[2] + 'px) scale(0)';
      setTimeout(function () { if (g.classList.contains('fuera')) g.remove(); }, reducido ? 0 : 450);
    });
  }

  /* ---------- distribución ---------- */
  function distribuir(n) {
    var modo = n >= UMBRAL.cubiculos ? 'cubiculos' : 'abierta';
    var juntas = n >= UMBRAL.juntas, recepcion = n >= UMBRAL.recepcion, direccion = n >= UMBRAL.direccion;
    var derecha = juntas || direccion;
    var zona = { x0: 50, y0: recepcion ? 140 : 50, x1: derecha ? 690 : 950, y1: 580 };
    var zonas = [];
    if (recepcion) zonas.push({ id: 'recepcion', x: 0, y: 0, w: 0, h: 0, s: 1, sig: 'r' + (derecha ? 1 : 0), html: zonaRecepcion(50, 50, (derecha ? 640 : 900), 70) });
    if (juntas) zonas.push({ id: 'juntas', x: 0, y: 0, w: 0, h: 0, s: 1, sig: 'j' + (direccion ? 1 : 0), html: zonaJuntas(715, 50, 235, direccion ? 250 : 540) });
    if (direccion) zonas.push({ id: 'direccion', x: 0, y: 0, w: 0, h: 0, s: 1, sig: 'd', html: zonaDireccion(715, 330, 235, 260) });

    var base = POD[modo], gap = modo === 'abierta' ? 34 : 26;
    var pods = Math.ceil(n / 4);
    var aw = zona.x1 - zona.x0, ah = zona.y1 - zona.y0;
    var cols = Math.max(1, Math.min(pods, Math.round(Math.sqrt(pods * (aw / ah) * (base.h / base.w)))));
    var rows = Math.ceil(pods / cols);
    while (cols > 1 && Math.ceil(pods / (cols - 1)) === rows) cols--;
    var s = Math.min(1, (aw - gap * (cols - 1)) / (cols * base.w), (ah - gap * (rows - 1)) / (rows * base.h));
    var pw = base.w * s, ph = base.h * s;
    var totalW = cols * pw + gap * (cols - 1), totalH = rows * ph + gap * (rows - 1);
    var ox = zona.x0 + (aw - totalW) / 2, oy = zona.y0 + (ah - totalH) / 2;
    var lista = [];
    for (var i = 0; i < pods; i++) {
      var c = i % cols, r = Math.floor(i / cols);
      var puestos = Math.min(4, n - i * 4);
      lista.push({ id: 'pod' + i, x: ox + c * (pw + gap), y: oy + r * (ph + gap), w: base.w, h: base.h, s: s,
        sig: modo + puestos, html: modo === 'abierta' ? podAbierta(puestos) : podCubiculos(puestos) });
    }
    return { modo: modo, juntas: juntas, recepcion: recepcion, direccion: direccion, pods: lista, zonas: zonas };
  }

  /* ---------- pintar ---------- */
  var ultimoN = -1;
  function pintar() {
    var n = Number(rango.value);
    if (n === ultimoN) return;
    ultimoN = n;
    num.value = n;
    if (planoN) planoN.textContent = n;
    rango.style.setProperty('--pct', ((n - MIN) / (MAX - MIN) * 100) + '%');
    var d = distribuir(n);
    sincronizar(gZonas, d.zonas, 'zona-g');
    sincronizar(gPods, d.pods, 'pod');
    gPlantas.innerHTML = planta(66, 566) + (d.recepcion || d.juntas ? '' : planta(934, 66));

    var modoNombre = d.modo === 'abierta' ? 'Área abierta' : 'Cubículos con mamparas';
    modoTxt.textContent = modoNombre;
    hitos.forEach(function (li) { li.classList.toggle('listo', n >= Number(li.dataset.min)); });

    /* mensaje de WhatsApp con la oficina armada, sin precios */
    var lineas = [];
    lineas.push(n + ' × ' + (d.modo === 'abierta' ? 'escritorio lineal con cajonera' : 'estación en escuadra con mamparas'));
    lineas.push(n + ' × silla operativa');
    if (d.juntas) lineas.push('Sala de juntas');
    if (d.recepcion) lineas.push('Mostrador de recepción');
    if (d.direccion) lineas.push('Oficina de dirección');
    var texto = 'Hola, quiero cotizar una oficina para ' + n + ' personas (' + modoNombre.toLowerCase() + ').\n' +
      lineas.map(function (l) { return '- ' + l; }).join('\n');
    cotizar.href = WA + '?text=' + encodeURIComponent(texto);
  }

  var jugando = false, yaJugo = false;
  rango.addEventListener('input', function () { jugando = false; pintar(); });
  document.querySelectorAll('.hud-paso').forEach(function (b) {
    b.addEventListener('click', function () {
      jugando = false;
      rango.value = Math.max(MIN, Math.min(MAX, Number(rango.value) + Number(b.dataset.d)));
      pintar();
    });
  });
  pintar();

  /* ---------- selector temporal de estilos ---------- */
  var seccion = document.getElementById('espacio');
  document.querySelectorAll('#estilo-sel button').forEach(function (b) {
    b.addEventListener('click', function () {
      seccion.dataset.estilo = b.dataset.estilo;
      document.querySelectorAll('#estilo-sel button').forEach(function (o) { o.classList.toggle('activa', o === b); });
      svg.style.removeProperty('--rx'); svg.style.removeProperty('--rz'); svg.style.removeProperty('--s');
    });
  });

  /* ---------- parallax suave con el mouse (solo maqueta) ---------- */
  if (escena && window.matchMedia('(hover: hover) and (pointer: fine)').matches && !reducido) {
    escena.addEventListener('pointermove', function (e) {
      if (seccion.dataset.estilo !== 'a') return;
      var r = escena.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
      svg.style.setProperty('--rx', (40 - py * 8) + 'deg');
      svg.style.setProperty('--rz', (-10 + px * 8) + 'deg');
      svg.style.setProperty('--s', '1.02');
    });
    escena.addEventListener('pointerleave', function () {
      svg.style.removeProperty('--rx'); svg.style.removeProperty('--rz'); svg.style.removeProperty('--s');
    });
  }

  /* ---------- intro: se arma sola la primera vez que se ve ---------- */
  function intro() {
    if (yaJugo || reducido) return;
    yaJugo = true; jugando = true;
    var desde = 1, hasta = 12, t0 = null, dur = 2200;
    rango.value = desde; ultimoN = -1; pintar();
    function paso(t) {
      if (!jugando) return;
      if (!t0) t0 = t;
      var k = Math.min(1, (t - t0) / dur);
      var e = 1 - Math.pow(1 - k, 3);
      rango.value = Math.round(desde + (hasta - desde) * e);
      pintar();
      if (k < 1) requestAnimationFrame(paso); else jugando = false;
    }
    requestAnimationFrame(paso);
  }
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { intro(); io.disconnect(); } });
    }, { threshold: 0.35 });
    io.observe(svg);
  }
})();
