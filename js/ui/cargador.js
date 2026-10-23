// © 2026 KoreStock Ledger — un proyecto de Kitsótaro · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// CARGADOR.JS — carga bajo demanda de librerías pesadas (gráficos, Excel,
// textos legales) y de los scripts de Google, para que la app abra rápido
// en un teléfono de gama baja. También pinta los íconos marcados con
// data-icono y abre los documentos legales en un diálogo.
//
// Expone: cargarScript, cargarChart, cargarXLSX, cargarMarked,
//   cargarGoogle, pintarIconos, abrirDocumento.
// Depende de: componentes.js (icono, mostrarDialogo).
// ============================================================

const _scriptsCargados = new Map();

function cargarScript(src) {
  if (_scriptsCargados.has(src)) return _scriptsCargados.get(src);
  const p = new Promise((resolver, rechazar) => {
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = () => resolver();
    s.onerror = () => { _scriptsCargados.delete(src); rechazar(new Error('No se pudo cargar ' + src)); };
    document.head.appendChild(s);
  });
  _scriptsCargados.set(src, p);
  return p;
}

const cargarChart = () => (typeof Chart !== 'undefined' ? Promise.resolve() : cargarScript('lib/chart.umd.min.js'));
const cargarXLSX = () => (typeof XLSX !== 'undefined' ? Promise.resolve() : cargarScript('lib/xlsx.full.min.js'));
const cargarMarked = () => (typeof marked !== 'undefined' ? Promise.resolve() : cargarScript('lib/marked.umd.js'));
const cargarGoogle = () => Promise.all([
  cargarScript('https://accounts.google.com/gsi/client'),
  cargarScript('https://apis.google.com/js/api.js')
]);

// <span data-icono="caja" data-icono-clase="icono-sm"></span> → <svg>
function pintarIconos(raiz) {
  $$('[data-icono]', raiz || document).forEach(el => {
    if (el.dataset.iconoPintado) return;
    el.innerHTML = icono(el.dataset.icono, el.dataset.iconoClase || '');
    el.dataset.iconoPintado = '1';
    el.style.display = 'inline-flex';
  });
}

// Documentos legales (PRIVACY.md, TERMS.md) con formato, dentro de la app.
// El texto lo escribe el dueño en el repo: se convierte con marked sin escapar.
async function abrirDocumento(archivo, titulo) {
  mostrarDialogo({ titulo, contenido: seguro('<div class="documento-legal"><p class="t-tenue">Cargando…</p></div>'), textoConfirmar: 'Cerrar', clase: 'dialogo-documento' });
  const contenedor = document.querySelector('.dialogo-documento .documento-legal');
  try {
    const [texto] = await Promise.all([fetch(archivo).then(r => r.text()), cargarMarked()]);
    if (contenedor) contenedor.innerHTML = marked.parse(texto);
  } catch (e) {
    if (contenedor) contenedor.innerHTML = `<p>No se pudo cargar el documento. <a href="${archivo}" target="_blank" rel="noopener">Ábrelo aquí</a>.</p>`;
  }
}

document.addEventListener('click', (e) => {
  const enlace = e.target.closest('a[data-documento]');
  if (!enlace) return;
  e.preventDefault();
  abrirDocumento(enlace.dataset.documento, enlace.dataset.titulo || enlace.textContent);
});
