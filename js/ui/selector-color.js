// © 2026 KoreStock Ledger — un proyecto de Kitsótaro · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// SELECTOR-COLOR.JS — colores de la leyenda de los gráficos (fase UI, 2026-10-23):
//   - Modos automáticos: Sobrio (paleta del tema), Pastel, Vívido y
//     Monocromo (tonos de un color base elegido).
//   - Selector propio, con el estilo de la app (no el del sistema):
//     sugerencias «Del modo», «Variaciones» del color actual y «Recientes»,
//     «Otro color…» (selector del sistema) y «Automático» para volver atrás.
//   - Ventana flotante anclada genérica (abrirFlotante), reutilizable.
//
// Expone: MODOS_COLOR, paletaAutomatica, leerModoColor, textoModoColor,
//   abrirFlotante, cerrarFlotante, abrirSelectorColor, abrirSelectorModoColor, aHex.
// Depende de: componentes.js (html, seguro, icono), almacen.js (colorGrafico).
// ============================================================

const MODOS_COLOR = {
  SOBRIO: 'Sobrio', PASTEL: 'Pastel', VIVIDO: 'Vívido', MONOCROMO: 'Monocromo'
};
const PALETA_PASTEL = ['#A5B4FC', '#99F6E4', '#FCD34D', '#CBD5E1', '#FDA4AF', '#BEF264', '#D8B4FE', '#A5F3FC'];
const PALETA_VIVIDA = ['#2563EB', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];

// <input type="color"> y las mezclas solo aceptan #RRGGBB.
function aHex(color) {
  const c = String(color || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(c)) return c.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(c)) return ('#' + c.slice(1).split('').map(x => x + x).join('')).toUpperCase();
  const m = c.match(/\d+/g);
  return m && m.length >= 3 ? ('#' + m.slice(0, 3).map(n => Number(n).toString(16).padStart(2, '0')).join('')).toUpperCase() : '#888888';
}
// Mezcla un color con blanco (t > 0) o con negro (t < 0).
function mezclarColor(hex, t) {
  const h = aHex(hex);
  const rgb = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const destino = t >= 0 ? 255 : 0, k = Math.abs(t);
  return aHex(`rgb(${rgb.map(v => Math.round(v + (destino - v) * k)).join(',')})`);
}

// Modo guardado en la hoja COLORES (NIVEL «_MODO», NOMBRE = gráfico): «PASTEL», «MONOCROMO #1E3A8A»…
function leerModoColor(grafico) {
  const v = (Almacen.colorGrafico('_MODO', grafico) || 'SOBRIO').split(' ');
  return { modo: MODOS_COLOR[v[0]] ? v[0] : 'SOBRIO', base: v[1] || '#1E3A8A' };
}
function textoModoColor(m) { return m.modo === 'MONOCROMO' ? `MONOCROMO ${aHex(m.base)}` : m.modo; }

// n colores automáticos para el modo (Sobrio usa la paleta del tema actual).
function paletaAutomatica(m, n) {
  if (m.modo === 'PASTEL') return Array.from({ length: n }, (_, i) => PALETA_PASTEL[i % 8]);
  if (m.modo === 'VIVIDO') return Array.from({ length: n }, (_, i) => PALETA_VIVIDA[i % 8]);
  if (m.modo === 'MONOCROMO') {
    // Del tono más oscuro al más claro, sin llegar al blanco.
    return Array.from({ length: n }, (_, i) => mezclarColor(m.base, n <= 1 ? 0 : -0.35 + (i / (n - 1)) * 1.05));
  }
  const estilo = getComputedStyle(document.documentElement);
  return Array.from({ length: n }, (_, i) => aHex(estilo.getPropertyValue(`--grafico-${(i % 8) + 1}`).trim()));
}

// ---------- Ventana flotante anclada ----------
let flotanteAbierto = null;
function cerrarFlotante() { if (flotanteAbierto) { flotanteAbierto.cerrar(); } }
function abrirFlotante(ancla, { titulo, contenido, alMontar }) {
  cerrarFlotante();
  const caja = document.createElement('div');
  caja.className = 'flotante';
  caja.setAttribute('role', 'dialog');
  caja.setAttribute('aria-label', titulo);
  caja.innerHTML = html`<div class="flotante-cabecera"><strong>${titulo}</strong><button type="button" class="boton-info" data-cerrar-flotante aria-label="Cerrar">${seguro(icono('cerrar', 'icono-sm'))}</button></div>
    <div class="flotante-cuerpo">${seguro(contenido.texto !== undefined ? contenido.texto : contenido)}</div>`.texto;
  document.body.appendChild(caja);
  const r = ancla.getBoundingClientRect();
  const ancho = Math.min(caja.offsetWidth, window.innerWidth - 24);
  const izq = Math.max(12, Math.min(r.left, window.innerWidth - ancho - 12));
  const debajo = r.bottom + 8 + caja.offsetHeight < window.innerHeight - 24;
  caja.style.left = `${izq}px`;
  caja.style.top = `${debajo ? r.bottom + 8 : Math.max(12, r.top - caja.offsetHeight - 8)}px`;
  const fuera = (e) => { if (!caja.contains(e.target) && e.target !== ancla && !ancla.contains(e.target)) control.cerrar(); };
  const tecla = (e) => { if (e.key === 'Escape') control.cerrar(); };
  const control = {
    el: caja,
    cerrar: () => {
      document.removeEventListener('pointerdown', fuera, true); document.removeEventListener('keydown', tecla);
      caja.remove(); if (flotanteAbierto === control) flotanteAbierto = null;
    }
  };
  setTimeout(() => { document.addEventListener('pointerdown', fuera, true); document.addEventListener('keydown', tecla); }, 0);
  $('[data-cerrar-flotante]', caja).addEventListener('click', control.cerrar);
  flotanteAbierto = control;
  requestAnimationFrame(() => caja.classList.add('visible'));
  if (alMontar) alMontar(caja, control);
  return control;
}

function muestrasHTML(colores, actual) {
  return html`<div class="muestras">${colores.map(c => html`<button type="button" class="muestra-opcion" data-elegir-color="${c}" style="background:${c}" aria-label="Color ${c}" aria-pressed="${String(aHex(c) === aHex(actual))}"></button>`)}</div>`;
}

// Selector de un color. alElegir('#RRGGBB') o alElegir('') para «Automático».
function abrirSelectorColor(ancla, { titulo, actual, delModo, recientes = [], personalizado, alElegir }) {
  const base = aHex(actual);
  const variaciones = [-0.45, -0.3, -0.15, 0.2, 0.4, 0.6].map(t => mezclarColor(base, t));
  const grupos = [['Del modo actual', delModo], ['Variaciones de este color', variaciones]];
  if (recientes.length) grupos.push(['Usados antes', recientes.slice(0, 8)]);
  return abrirFlotante(ancla, {
    titulo,
    contenido: html`${grupos.map(([t, cs]) => html`<div class="grupo-muestras"><span class="t-mini t-secundario">${t}</span>${muestrasHTML(cs, base)}</div>`)}
      <div class="fila-separada acciones-color">
        <label class="boton boton-secundario boton-sm">${seguro(icono('paleta', 'icono-sm'))}Otro color…<input type="color" class="solo-lector" value="${base}" data-otro-color></label>
        <button type="button" class="boton boton-texto boton-sm" data-elegir-color="" ${personalizado ? '' : 'disabled'}>${seguro(icono('deshacer', 'icono-sm'))}Automático</button>
      </div>`,
    alMontar: (caja, control) => {
      caja.addEventListener('click', (e) => {
        const b = e.target.closest('[data-elegir-color]');
        if (b) { control.cerrar(); alElegir(b.dataset.elegirColor); }
      });
      $('[data-otro-color]', caja).addEventListener('change', (e) => { control.cerrar(); alElegir(aHex(e.target.value)); });
    }
  });
}

// Selector del modo automático (y del color base del monocromo).
function abrirSelectorModoColor(ancla, { actual, alElegir }) {
  const opcion = (m) => {
    const vista = paletaAutomatica({ modo: m, base: actual.base }, 6);
    return html`<button type="button" class="opcion-modo-color" data-modo-color="${m}" aria-pressed="${String(actual.modo === m)}">
      <span class="crece">${MODOS_COLOR[m]}</span><span class="tira-colores">${vista.map(c => html`<span style="background:${c}"></span>`)}</span></button>`;
  };
  const bases = ['#1E3A8A', '#0F766E', '#B45309', '#9F1239', '#6D28D9', '#334155'];
  return abrirFlotante(ancla, {
    titulo: 'Colores automáticos',
    contenido: html`${Object.keys(MODOS_COLOR).map(opcion)}
      <div class="grupo-muestras"><span class="t-mini t-secundario">Color base del monocromo</span>${muestrasHTML(bases, actual.modo === 'MONOCROMO' ? actual.base : '')}</div>
      <p class="t-mini t-tenue">Los colores que elegiste a mano se mantienen; «Automático» en cada uno lo devuelve a este modo.</p>`,
    alMontar: (caja, control) => {
      caja.addEventListener('click', (e) => {
        const m = e.target.closest('[data-modo-color]');
        if (m) { control.cerrar(); alElegir({ modo: m.dataset.modoColor, base: actual.base }); return; }
        const b = e.target.closest('[data-elegir-color]');
        if (b) { control.cerrar(); alElegir({ modo: 'MONOCROMO', base: b.dataset.elegirColor }); }
      });
    }
  });
}
