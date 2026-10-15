/* ============================================================================
   MONTAJE · la oficina se arma conforme bajas (sección 03 Proyectos)
   Las capas van de la última (terminada) a la primera (vacía). Según cuánto se ha
   recorrido la sección, la capa de encima se vuelve transparente poco a poco y deja
   ver la siguiente; cada capa además se aleja un poco mientras se desvanece.
   ========================================================================== */
(function () {
  'use strict';

  var sec = document.querySelector('.montaje');
  if (!sec) return;
  var capas = Array.prototype.slice.call(sec.querySelectorAll('.mt-capa')).reverse(); // [vacía, instalación, terminada]
  var pasos = sec.querySelectorAll('.mt-paso');
  var marcas = sec.querySelectorAll('.mt-indice i');
  var reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function limitar(v) { return Math.min(Math.max(v, 0), 1); }

  function mover() {
    var r = sec.getBoundingClientRect();
    var recorrido = sec.offsetHeight - window.innerHeight;
    // t va de 0 (inicio) a pasos-1 (último paso centrado)
    var t = limitar(-r.top / Math.max(recorrido, 1)) * (pasos.length - 1);

    // la capa k (0 = vacía) se desvanece entre el paso k+1 y el k+2
    capas.forEach(function (capa, k) {
      if (k === capas.length - 1) { capa.style.opacity = 1; capa.style.transform = 'scale(' + (1.08 - 0.08 * limitar((t - 2) / 1)) + ')'; return; }
      var f = limitar((t - (k + 1.15)) / 0.85);
      capa.style.opacity = reducido ? (f > 0.5 ? 0 : 1) : 1 - f;
      capa.style.transform = reducido ? '' : 'scale(' + (1.04 + 0.04 * f) + ')';
    });

    var activo = Math.round(t);
    pasos.forEach(function (p, i) { p.classList.toggle('activa', i === activo); });
    marcas.forEach(function (m, i) { m.classList.toggle('activa', i === Math.max(0, activo - 1)); });
  }

  var pendiente = false;
  window.addEventListener('scroll', function () {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(function () { pendiente = false; mover(); });
  }, { passive: true });
  window.addEventListener('resize', mover);
  mover();
})();
