/* ============================================================================
   OBRA · video de la oficina armándose (sección 03 Proyectos)
   Se reproduce cuando la mitad del video está en pantalla y se queda en el último
   cuadro, con la oficina terminada. Si la persona sale de la sección y regresa, se
   repite desde el principio. Con «reducir movimiento» solo muestra la oficina lista.
   ========================================================================== */
(function () {
  'use strict';

  var video = document.getElementById('obra-video');
  if (!video) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var termino = false;
  video.addEventListener('ended', function () { termino = true; });

  new IntersectionObserver(function (e) {
    var visible = e[0].isIntersecting;
    if (visible) {
      if (termino) { video.currentTime = 0; termino = false; }
      var p = video.play();
      if (p && p.catch) p.catch(function () { /* el navegador bloqueó la reproducción: queda el póster */ });
    } else if (!video.paused) {
      video.pause();
    }
  }, { threshold: 0.5 }).observe(video);
})();
