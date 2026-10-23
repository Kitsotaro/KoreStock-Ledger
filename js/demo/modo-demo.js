// © 2026 KoreStock Ledger — un proyecto de Kitsótaro · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// MODO-DEMO.JS — demostración local sin Google (solo en localhost con ?demo).
// Sirve para ver y probar las pantallas con la base de prueba: los datos
// viven únicamente en este navegador. En producción nunca se activa.
//
// Expone: esEntornoLocal, esModoDemo, cargarXlsxEnDemo, cargarBasePruebaDemo.
// Depende de: hoja-demo.js (DriveDemo), cargador.js (cargarXLSX).
// ============================================================

const RUTA_BASE_PRUEBA_DEMO = '_privado/pruebas/StockCentral_DB_Prueba.xlsx';

function esEntornoLocal() {
  const h = location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h.endsWith('.localhost');
}

function esModoDemo() {
  return esEntornoLocal() && new URLSearchParams(location.search).has('demo');
}

async function cargarXlsxEnDemo(bytes, nombre) {
  await cargarXLSX();
  const libro = XLSX.read(bytes, { type: 'array' });
  const hojas = {};
  libro.SheetNames.forEach(n => { hojas[n] = XLSX.utils.sheet_to_json(libro.Sheets[n], { header: 1, raw: true, defval: '' }); });
  return DriveDemo.crearDesdeDatos(nombre, hojas);
}

// Carga la base de prueba v2 (6 meses simulados) en el Drive de demostración.
async function cargarBasePruebaDemo() {
  const resp = await fetch(RUTA_BASE_PRUEBA_DEMO, { cache: 'no-store' });
  if (!resp.ok) throw new Error('No se encontró la base de prueba en este equipo.');
  return cargarXlsxEnDemo(new Uint8Array(await resp.arrayBuffer()), NOMBRE_BASE_V2);
}
