// © 2026 Kitsótaro · KoreStock Ledger · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// CAMPOS.JS — campos numéricos y de dinero.
//   - En el teléfono abren el teclado numérico (inputmode); en la PC solo
//     aceptan dígitos (y punto/coma si se permiten decimales).
//   - Dinero: se lee con dinero() (coma o punto) y se muestra sin «$».
//
// Expone: prepararCampoNumerico, leerCantidad, leerDineroCampo,
//   valorCampoDinero, limitarDecimales.
// Depende de: dinero.js, utilidades.js.
// ============================================================

const TECLAS_PERMITIDAS = ['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Enter', 'Escape'];

// opciones: { decimales: 0..5 }
function prepararCampoNumerico(input, opciones) {
  const { decimales = 0 } = opciones || {};
  input.setAttribute('inputmode', decimales > 0 ? 'decimal' : 'numeric');
  input.setAttribute('autocomplete', 'off');
  input.dataset.decimales = String(decimales);
  if (input.dataset.preparado) return;
  input.dataset.preparado = '1';
  input.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || TECLAS_PERMITIDAS.includes(e.key)) return;
    const dec = Number(input.dataset.decimales || 0);
    if (/^\d$/.test(e.key)) return;
    if (dec > 0 && (e.key === '.' || e.key === ',') && !/[.,]/.test(input.value)) return;
    e.preventDefault();
  });
  input.addEventListener('input', () => limitarDecimales(input));
}

function limitarDecimales(input) {
  const dec = Number(input.dataset.decimales || 0);
  let v = input.value.replace(',', '.').replace(/[^\d.]/g, '');
  const partes = v.split('.');
  if (partes.length > 2) v = partes[0] + '.' + partes.slice(1).join('');
  if (dec === 0) v = v.replace('.', '');
  else if (partes[1] && partes[1].length > dec) v = partes[0] + '.' + partes[1].slice(0, dec);
  if (v !== input.value) input.value = v;
}

function leerCantidad(input) {
  const n = parsearNumero(input.value);
  return isFinite(n) ? n : 0;
}

function leerDineroCampo(input) {
  return dinero(input.value);
}

// Texto para poner en un campo de dinero (sin símbolo ni separador de miles).
function valorCampoDinero(d, decimales) {
  return dineroANumero(redondearDinero(d || 0, decimales ?? 2)).toFixed(decimales ?? 2);
}

// Reloj de captura (heredado de la v2): la hora exacta con la que se
// guardará el registro, visible junto a la fecha en Venta y Entrada.
setInterval(() => {
  const relojes = document.querySelectorAll('[data-reloj]');
  if (!relojes.length) return;
  const hora = obtenerTimestampLocal().slice(11, 19);
  relojes.forEach(e => { if (e.offsetParent) e.textContent = hora; });
}, 1000);
