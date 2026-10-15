/* ============================================================================
   ANIMACIONES · activa la biblioteca de css/animaciones.css
   Pone .anim-in a los [data-anim] al entrar en pantalla (una sola vez), parte los
   títulos en palabras, hace contar los números y mueve las fotos con parallax.
   window.Animaciones.repetir(el) vuelve a correr una animación (para las demos).
   ========================================================================== */
(function () {
  'use strict';

  var reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // títulos palabra por palabra: se envuelve cada palabra conservando <em> y demás
  function partirPalabras(el) {
    if (el.dataset.partido) return;
    el.dataset.partido = '1';
    var i = 0;
    (function recorrer(nodo) {
      Array.prototype.slice.call(nodo.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(function (pedazo) {
            if (!pedazo) return;
            if (/^\s+$/.test(pedazo)) { frag.appendChild(document.createTextNode(pedazo)); return; }
            var caja = document.createElement('span');
            caja.className = 'anim-palabra';
            var dentro = document.createElement('span');
            dentro.style.setProperty('--i', i++);
            dentro.textContent = pedazo;
            caja.appendChild(dentro);
            frag.appendChild(caja);
          });
          nodo.replaceChild(frag, n);
        } else if (n.nodeType === 1) {
          recorrer(n);
        }
      });
    })(el);
  }

  function contar(el) {
    var hasta = parseFloat(el.dataset.hasta || el.textContent) || 0;
    var pre = el.dataset.prefijo || '', suf = el.dataset.sufijo || '';
    if (reducido) { el.textContent = pre + hasta + suf; return; }
    var t0 = null, dur = 1600;
    function paso(t) {
      if (!t0) t0 = t;
      var p = Math.min((t - t0) / dur, 1);
      var e = 1 - Math.pow(1 - p, 3);
      el.textContent = pre + Math.round(hasta * e) + suf;
      if (p < 1) requestAnimationFrame(paso);
    }
    el.textContent = pre + '0' + suf;
    requestAnimationFrame(paso);
  }

  function preparar(el) {
    var tipo = el.getAttribute('data-anim');
    if (tipo === 'palabras') partirPalabras(el);
    if (tipo === 'escalonado') Array.prototype.forEach.call(el.children, function (h, i) { h.style.setProperty('--i', i); });
  }

  function activar(el) {
    el.classList.add('anim-in');
    if (el.getAttribute('data-anim') === 'cuenta') contar(el);
  }

  // un elemento recortado por completo (revela, barrido) no cuenta como visible para el
  // navegador, así que en esos casos se vigila a su contenedor
  var vigilado = new Map();
  var obs = reducido ? null : new IntersectionObserver(function (entradas) {
    entradas.forEach(function (e) {
      if (!e.isIntersecting) return;
      (vigilado.get(e.target) || []).forEach(activar);
      vigilado.delete(e.target);
      obs.unobserve(e.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });

  function iniciar(raiz) {
    (raiz || document).querySelectorAll('[data-anim]').forEach(function (el) {
      preparar(el);
      if (reducido) { activar(el); return; }
      var tipo = el.getAttribute('data-anim');
      var blanco = (tipo === 'revela' || tipo === 'barrido') ? el.parentElement : el;
      if (!vigilado.has(blanco)) { vigilado.set(blanco, []); obs.observe(blanco); }
      vigilado.get(blanco).push(el);
    });
  }
  iniciar();

  // parallax: desplaza la foto en proporción a cuánto se ha recorrido su contenedor
  var conParallax = reducido ? [] : Array.prototype.slice.call(document.querySelectorAll('[data-parallax]'));
  if (conParallax.length) {
    var pendiente = false;
    var mover = function () {
      pendiente = false;
      var alto = window.innerHeight;
      conParallax.forEach(function (el) {
        var r = el.parentElement.getBoundingClientRect();
        if (r.bottom < 0 || r.top > alto) return;
        var centro = (r.top + r.height / 2 - alto / 2) / alto;
        el.style.transform = 'translate3d(0,' + (centro * -100 * parseFloat(el.dataset.parallax || 0.12)) + '%,0) scale(1.12)';
      });
    };
    window.addEventListener('scroll', function () {
      if (!pendiente) { pendiente = true; requestAnimationFrame(mover); }
    }, { passive: true });
    mover();
  }

  window.Animaciones = {
    iniciar: iniciar,
    repetir: function (el) {
      el.classList.remove('anim-in');
      void el.offsetWidth;
      setTimeout(function () { activar(el); }, 60);
    }
  };
})();
