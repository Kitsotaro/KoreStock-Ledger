// © 2026 Kitsótaro · KoreStock Ledger · Código disponible, todos los derechos reservados (ver LICENSE).
// ARRANQUE.JS — se carga en <head> ANTES de pintar: tema, tamaño de texto y modo
// guardados en este navegador (D23: comodidades locales). Sin tema guardado se
// sigue al sistema. Debe ser mínimo y no depender de nada.
(function () {
  var raiz = document.documentElement;
  var leer = function (clave) { try { return localStorage.getItem(clave); } catch (e) { return null; } };
  var tema = leer('finanzas-tema');
  if (tema !== 'claro' && tema !== 'oscuro') {
    tema = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'oscuro' : 'claro';
  }
  raiz.setAttribute('data-tema', tema);
  var tamano = leer('korestock-tamano-texto');
  if (tamano === 'grande' || tamano === 'muy-grande') raiz.setAttribute('data-tamano-texto', tamano);
  document.addEventListener('DOMContentLoaded', function () {
    var modo = leer('korestock-modo');
    if (modo === 'bodega' || modo === 'tienda' || modo === 'pro') document.body.setAttribute('data-modo', modo);
  });
})();
