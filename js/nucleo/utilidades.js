// © 2026 Kitsótaro · KoreStock Ledger · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// UTILIDADES.JS — texto, números leídos de Sheets y fechas LOCALES.
// Heredado de la v2 (core.js/analitica.js) sin cambiar su comportamiento.
//
// Reglas (INVARIANTES 4, 5 y 16):
//   - Todo texto libre que vaya a innerHTML pasa por escaparHTML.
//   - Números leídos de una fila de Sheets: parsearNumero (coma o punto).
//   - Fechas de celda: normalizarFechaCelda (Sheets puede devolver número de serie).
//   - Fechas = texto 'YYYY-MM-DD' en hora LOCAL; nunca toISOString().
//
// Expone: escaparHTML, normalizarTexto, normalizarIdentidad, coincidenPalabras,
//   parsearNumero, normalizarFechaCelda, obtenerFechaLocal, obtenerTimestampLocal,
//   fechaATexto, textoAFecha, sumarDias, restarDias, diasEntre, PRESETS_PERIODO,
//   calcularFechasPreset, periodoAnterior, formatearFechaCorta, formatearNumero,
//   pluralizar, esperar.
// Depende de: nada.
// ============================================================

function escaparHTML(texto) {
  const mapa = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(texto ?? '').replace(/[&<>"']/g, (c) => mapa[c]);
}

// Solo para COMPARAR (nunca para guardar ni mostrar): mayúsculas y espacios de más.
function normalizarTexto(texto) {
  return (texto ?? '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
}

// Comparación de IDENTIDAD de producto (V3 §16.1 y §16.5): además de
// normalizarTexto, ignora tildes y el espacio entre número y unidad, para
// que «500 ml», «500ml» y «500 ML» sean el mismo contenido.
function normalizarIdentidad(texto) {
  return normalizarTexto(texto)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/(\d)\s+([a-z])/g, '$1$2')
    .replace(/(\d),(\d)/g, '$1.$2');
}

// Búsqueda de varias palabras: cada palabra debe aparecer en el texto.
function coincidenPalabras(textoCompleto, consulta) {
  const palabras = normalizarIdentidad(consulta).split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return true;
  const base = normalizarIdentidad(textoCompleto);
  return palabras.every(p => base.includes(p));
}

// Número robusto desde una celda (heredado tal cual de la v2).
function parsearNumero(valor) {
  if (valor === null || valor === undefined || valor === '') return 0;
  if (typeof valor === 'number') return isNaN(valor) ? 0 : valor;
  let texto = String(valor).trim();
  if (texto === '') return 0;
  const tieneComa = texto.includes(',');
  const tienePunto = texto.includes('.');
  if (tieneComa && tienePunto) {
    texto = texto.lastIndexOf(',') > texto.lastIndexOf('.')
      ? texto.replace(/\./g, '').replace(',', '.')
      : texto.replace(/,/g, '');
  } else if (tieneComa) {
    texto = texto.replace(',', '.');
  }
  const n = parseFloat(texto);
  return isNaN(n) ? 0 : n;
}

// Número de serie de Sheets → 'YYYY-MM-DD' (o con hora). Texto: tal cual.
function normalizarFechaCelda(valor) {
  if (typeof valor !== 'number') return valor === null || valor === undefined ? '' : String(valor);
  const epoca = Date.UTC(1899, 11, 30);
  const fecha = new Date(epoca + Math.round(valor * 86400000));
  const pad = (n) => String(n).padStart(2, '0');
  const fechaStr = `${fecha.getUTCFullYear()}-${pad(fecha.getUTCMonth() + 1)}-${pad(fecha.getUTCDate())}`;
  const tieneHora = Math.abs(valor % 1) > 1e-9;
  if (!tieneHora) return fechaStr;
  return `${fechaStr} ${pad(fecha.getUTCHours())}:${pad(fecha.getUTCMinutes())}:${pad(fecha.getUTCSeconds())}`;
}

const pad2 = (n) => String(n).padStart(2, '0');

function fechaATexto(fecha) {
  return `${fecha.getFullYear()}-${pad2(fecha.getMonth() + 1)}-${pad2(fecha.getDate())}`;
}

// 'YYYY-MM-DD' → Date local (sin el corrimiento de zona horaria de parsear texto).
function textoAFecha(texto) {
  const [y, m, d] = String(texto).slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function obtenerFechaLocal() {
  return fechaATexto(new Date());
}

function obtenerTimestampLocal() {
  const ahora = new Date();
  return `${fechaATexto(ahora)} ${pad2(ahora.getHours())}:${pad2(ahora.getMinutes())}:${pad2(ahora.getSeconds())}`;
}

function sumarDias(fechaStr, dias) {
  const f = textoAFecha(fechaStr);
  f.setDate(f.getDate() + dias);
  return fechaATexto(f);
}

function restarDias(fechaStr, dias) {
  return sumarDias(fechaStr, -dias);
}

function diasEntre(desde, hasta) {
  return Math.round((textoAFecha(hasta) - textoAFecha(desde)) / 86400000);
}

// UNA sola lista de períodos para toda la app (INVARIANTE 14).
const PRESETS_PERIODO = [
  { valor: 'HOY', etiqueta: 'Hoy' },
  { valor: 'AYER', etiqueta: 'Ayer' },
  { valor: 'SEMANA', etiqueta: 'Esta semana' },
  { valor: 'QUINCENA', etiqueta: 'Esta quincena' },
  { valor: 'MES', etiqueta: 'Este mes' },
  { valor: 'MES_ANTERIOR', etiqueta: 'Mes anterior' },
  { valor: 'TRIMESTRE', etiqueta: 'Este trimestre' },
  { valor: 'SEMESTRE', etiqueta: 'Este semestre' },
  { valor: 'ANIO', etiqueta: 'Este año' },
  { valor: 'PERSONALIZADO', etiqueta: 'Elegir fechas' }
];

// Devuelve {inicio, fin} en texto local; null para PERSONALIZADO.
function calcularFechasPreset(preset, hoyTexto) {
  const hoy = hoyTexto ? textoAFecha(hoyTexto) : new Date();
  const anio = hoy.getFullYear();
  const mes = hoy.getMonth();
  const dia = hoy.getDate();
  const fmt = (y, m, d) => fechaATexto(new Date(y, m, d));
  const finDeMes = (y, m) => new Date(y, m + 1, 0).getDate();
  switch (preset) {
    case 'HOY': return { inicio: fmt(anio, mes, dia), fin: fmt(anio, mes, dia) };
    case 'AYER': return { inicio: fmt(anio, mes, dia - 1), fin: fmt(anio, mes, dia - 1) };
    case 'SEMANA': {
      const offsetLunes = hoy.getDay() === 0 ? -6 : 1 - hoy.getDay();
      return { inicio: fmt(anio, mes, dia + offsetLunes), fin: fmt(anio, mes, dia + offsetLunes + 6) };
    }
    case 'QUINCENA':
      return dia <= 15 ? { inicio: fmt(anio, mes, 1), fin: fmt(anio, mes, 15) }
        : { inicio: fmt(anio, mes, 16), fin: fmt(anio, mes, finDeMes(anio, mes)) };
    case 'MES': return { inicio: fmt(anio, mes, 1), fin: fmt(anio, mes, finDeMes(anio, mes)) };
    case 'MES_ANTERIOR': return { inicio: fmt(anio, mes - 1, 1), fin: fmt(anio, mes, 0) };
    case 'TRIMESTRE': {
      const m0 = Math.floor(mes / 3) * 3;
      return { inicio: fmt(anio, m0, 1), fin: fmt(anio, m0 + 2, finDeMes(anio, m0 + 2)) };
    }
    case 'SEMESTRE': {
      const m0 = mes < 6 ? 0 : 6;
      return { inicio: fmt(anio, m0, 1), fin: fmt(anio, m0 + 5, finDeMes(anio, m0 + 5)) };
    }
    case 'ANIO': return { inicio: fmt(anio, 0, 1), fin: fmt(anio, 11, 31) };
    default: return null;
  }
}

// El período inmediatamente anterior, de la misma duración (para comparar).
function periodoAnterior(inicio, fin) {
  const dias = diasEntre(inicio, fin) + 1;
  return { inicio: restarDias(inicio, dias), fin: restarDias(inicio, 1) };
}

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// '2026-10-21' → '21 oct' (o '21 oct 2026' si no es del año en curso).
function formatearFechaCorta(fechaStr, conAnio) {
  if (!fechaStr) return '';
  const f = textoAFecha(fechaStr);
  const mismoAnio = f.getFullYear() === new Date().getFullYear();
  return `${f.getDate()} ${MESES_CORTOS[f.getMonth()]}${(conAnio || !mismoAnio) ? ' ' + f.getFullYear() : ''}`;
}

// Número legible con separador de miles (para cantidades, no para dinero).
function formatearNumero(n, decimales) {
  const d = decimales ?? (Number.isInteger(Number(n)) ? 0 : 2);
  const fijo = Number(n || 0).toFixed(d);
  const [ent, frac] = fijo.split('.');
  return ent.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (frac && Number(frac) !== 0 ? '.' + frac.replace(/0+$/, '') : '');
}

function pluralizar(n, singular, plural) {
  return Math.abs(Number(n)) === 1 ? singular : (plural || singular + 's');
}

function esperar(ms) {
  return new Promise(r => setTimeout(r, ms));
}
