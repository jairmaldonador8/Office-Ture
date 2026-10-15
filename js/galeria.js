/* ============================================================================
   GALERÍA · filas de fotos que se mueven solas
   Cada fila se duplica para dar la vuelta sin corte. Avanza sola mientras está en
   pantalla; se detiene al pasar el mouse, al tocarla o al arrastrarla, y retoma
   un momento después. Con «reducir movimiento» no se mueve sola y solo se desliza.
   ========================================================================== */
(function () {
  'use strict';

  var filas = document.querySelectorAll('.gal-fila');
  if (!filas.length) return;
  var reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var VELOCIDAD = 0.45; // pixeles por cuadro

  filas.forEach(function (fila) {
    // segunda copia para el bucle; la copia no la leen los lectores de pantalla
    Array.prototype.slice.call(fila.children).forEach(function (fig) {
      var copia = fig.cloneNode(true);
      copia.setAttribute('aria-hidden', 'true');
      copia.querySelectorAll('img').forEach(function (img) { img.alt = ''; });
      fila.appendChild(copia);
    });

    var dir = Number(fila.getAttribute('data-dir')) || 1;
    var pausa = false, visible = false, reanudar = null, pos = 0;
    var mitad = function () { return fila.scrollWidth / 2; };

    function detener(ms) {
      pausa = true;
      clearTimeout(reanudar);
      reanudar = setTimeout(function () { pausa = false; pos = fila.scrollLeft; }, ms);
    }

    // la fila que va a la derecha empieza a la mitad para tener a dónde avanzar
    if (dir < 0) requestAnimationFrame(function () { fila.scrollLeft = mitad(); pos = fila.scrollLeft; });

    function cuadro() {
      if (visible && !pausa && !reducido) {
        pos += VELOCIDAD * dir;
        var m = mitad();
        if (pos >= m) pos -= m;
        if (pos <= 0) pos += m;
        fila.scrollLeft = pos;
      }
      requestAnimationFrame(cuadro);
    }
    requestAnimationFrame(cuadro);

    new IntersectionObserver(function (e) { visible = e[0].isIntersecting; }).observe(fila);

    fila.addEventListener('mouseenter', function () { pausa = true; clearTimeout(reanudar); });
    fila.addEventListener('mouseleave', function () { detener(400); });
    fila.addEventListener('touchstart', function () { detener(2500); }, { passive: true });
    fila.addEventListener('touchend', function () { detener(2500); }, { passive: true });
    fila.addEventListener('wheel', function () { detener(1500); }, { passive: true });

    // arrastrar con el mouse en escritorio
    var arrastre = null;
    fila.addEventListener('mousedown', function (e) {
      arrastre = { x: e.clientX, inicio: fila.scrollLeft };
      fila.classList.add('arrastrando');
    });
    window.addEventListener('mousemove', function (e) {
      if (!arrastre) return;
      fila.scrollLeft = arrastre.inicio - (e.clientX - arrastre.x);
    });
    window.addEventListener('mouseup', function () {
      if (!arrastre) return;
      arrastre = null;
      fila.classList.remove('arrastrando');
      pos = fila.scrollLeft;
    });
    // si la persona desliza, el bucle continúa desde donde quedó
    fila.addEventListener('scroll', function () { if (pausa) pos = fila.scrollLeft; }, { passive: true });
  });
})();
