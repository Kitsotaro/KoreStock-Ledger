// © 2026 KoreStock Ledger — un proyecto de Kitsótaro · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// PRESENTACION.JS — capturas de la app en la portada (fase UI, 2026-10-23).
//   - Contenedor de tamaño fijo: cambiar de captura nunca mueve la página.
//   - Avanza sola cada 4.5 s; se detiene con el cursor encima, con la
//     pestaña oculta y si se pide menos movimiento. Flechas y puntos.
//
// Expone: iniciarPresentacion.
// Depende de: componentes.js ($, $$).
// ============================================================

function iniciarPresentacion(raiz) {
  if (!raiz) return;
  const diapositivas = $$('.diapositiva', raiz), puntos = $$('[data-ir-diapositiva]', raiz);
  const leyenda = $('.presentacion-leyenda', raiz);
  const quieta = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let actual = 0, temporizador = null;
  const mostrar = (i) => {
    actual = (i + diapositivas.length) % diapositivas.length;
    diapositivas.forEach((d, k) => { d.classList.toggle('activa', k === actual); d.setAttribute('aria-hidden', String(k !== actual)); });
    puntos.forEach((p, k) => p.setAttribute('aria-current', String(k === actual)));
    if (leyenda) leyenda.textContent = diapositivas[actual].dataset.leyenda || '';
  };
  const detener = () => { clearInterval(temporizador); temporizador = null; };
  const seguir = () => { detener(); if (!quieta && !document.hidden) temporizador = setInterval(() => mostrar(actual + 1), 4500); };
  raiz.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ir-diapositiva], [data-paso-diapositiva]');
    if (!b) return;
    mostrar(b.dataset.irDiapositiva !== undefined ? Number(b.dataset.irDiapositiva) : actual + Number(b.dataset.pasoDiapositiva));
    seguir();
  });
  raiz.addEventListener('mouseenter', detener);
  raiz.addEventListener('mouseleave', seguir);
  document.addEventListener('visibilitychange', seguir);
  mostrar(0); seguir();
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => iniciarPresentacion(document.getElementById('maqueta-portada')));
}
