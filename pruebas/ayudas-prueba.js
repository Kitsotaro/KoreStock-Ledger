// © 2026 Wilber Adonay Escobar Solórzano (Kitsótaro) · KoreStock Ledger · Código disponible, todos los derechos reservados (ver LICENSE).
// Ayudas para las pruebas: carga la base de prueba (xlsx) en el Drive de demostración.
// Expone: cargarBasePruebaEnDemo, hayBasePrueba.

function hayBasePrueba() {
  return typeof leerArchivoBinario === 'function' && typeof RUTA_BASE_PRUEBA === 'string' && !!leerArchivoBinario(RUTA_BASE_PRUEBA);
}

// Lee el xlsx con SheetJS y lo convierte en una hoja de cálculo del Drive demo.
function cargarBasePruebaEnDemo(bytes, nombre) {
  const libro = XLSX.read(bytes, { type: 'array' });
  const hojas = {};
  libro.SheetNames.forEach(n => {
    hojas[n] = XLSX.utils.sheet_to_json(libro.Sheets[n], { header: 1, raw: true, defval: '' });
  });
  return DriveDemo.crearDesdeDatos(nombre || 'StockCentral_DB', hojas);
}
