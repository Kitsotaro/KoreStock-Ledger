// ============================================================
// TEMA.JS — Interruptor de tema claro/oscuro (un solo botón).
//
// El atributo data-theme del <html> ya se define muy temprano, en un
// <script> chiquito al inicio de index.html (antes de que carguen los
// estilos), para evitar el "parpadeo" de un color equivocado al recargar.
// ============================================================

const CLAVE_TEMA = 'finanzas-tema';

function alternarTema() {
  const actual = document.documentElement.getAttribute('data-theme') || 'oscuro';
  const nuevo = actual === 'oscuro' ? 'claro' : 'oscuro';
  document.documentElement.setAttribute('data-theme', nuevo);
  localStorage.setItem(CLAVE_TEMA, nuevo);
  actualizarBotonTema(nuevo);

  // Chart.js no se actualiza solo: si el gráfico de Stock está visible,
  // se vuelve a dibujar para que sus textos usen los colores del tema nuevo.
  const tabStock = document.getElementById('tab-stock');
  if (tabStock && tabStock.classList.contains('active') && typeof renderizarGraficoStock === 'function') {
    try {
      renderizarGraficoStock();
    } catch (err) {
      console.warn('No se pudo redibujar el gráfico de Stock al cambiar de tema:', err);
    }
  }
}

function actualizarBotonTema(tema) {
  const botones = document.querySelectorAll('.btn-icon-tema');
  if (!botones.length) return;
  // Hay dos copias del botón (nav de la app y footer del login) — ambas
  // deben quedar sincronizadas.
  const vaA = tema === 'oscuro' ? 'claro' : 'oscuro';
  const icono = tema === 'oscuro' ? '☀️' : '🌙';
  botones.forEach((btn) => {
    btn.textContent = icono;
    btn.setAttribute('aria-label', `Cambiar a modo ${vaA}`);
  });
}

window.addEventListener('DOMContentLoaded', () => {
  const temaActual = document.documentElement.getAttribute('data-theme') || 'oscuro';
  actualizarBotonTema(temaActual);
});
