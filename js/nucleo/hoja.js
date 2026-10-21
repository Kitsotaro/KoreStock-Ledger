// © 2026 Kitsótaro · KoreStock Ledger · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// HOJA.JS — puerta ÚNICA a los datos (Sheets y Drive).
//
// Ningún otro archivo llama a gapi directamente para leer o escribir datos:
// todo pasa por `Hoja`, que delega en un MOTOR intercambiable:
//   - MotorGoogle (hoja-google.js): Google Sheets/Drive reales.
//   - MotorDemo (demo/hoja-demo.js): datos en memoria, solo en localhost.
// Así la misma lógica (migración, guardado, lectura) se prueba sin Google.
//
// Reglas:
//   - Las lecturas devuelven valores SIN formato (números reales, fechas
//     como número de serie o texto): se interpretan con esquema.js.
//   - Las escrituras son en bruto (RAW): un texto que empieza con «=» se
//     guarda como texto, nunca como fórmula.
//
// Expone: Hoja, rangoA1, filaDeRango.
// Depende de: un motor asignado con Hoja.usar(motor).
// ============================================================

const Hoja = {
  motor: null,
  usar(motor) { this.motor = motor; },
  get nombreMotor() { return this.motor ? this.motor.nombre : 'ninguno'; },
  _m() { if (!this.motor) throw new Error('No hay conexión de datos activa'); return this.motor; },

  // Lee varios rangos en UNA sola petición. Devuelve un arreglo de filas por rango.
  leerVarios(id, rangos) { return this._m().leerVarios(id, rangos); },
  async leer(id, rango) { return (await this.leerVarios(id, [rango]))[0]; },
  // Agrega filas al final de una hoja. Devuelve { primeraFila, ultimaFila }.
  agregar(id, hoja, filas) { return this._m().agregar(id, hoja, filas); },
  // Escribe varios rangos en UNA sola petición: [{ rango, valores }].
  actualizar(id, datos) { return this._m().actualizar(id, datos); },
  titulosHojas(id) { return this._m().titulosHojas(id); },
  agregarHojas(id, titulos) { return this._m().agregarHojas(id, titulos); },
  existe(id) { return this._m().existe(id); },
  // Crea una hoja de cálculo con estas pestañas (y sin la pestaña por defecto).
  crearHojaCalculo(opciones) { return this._m().crearHojaCalculo(opciones); },
  buscarCarpeta(nombre, propiedades) { return this._m().buscarCarpeta(nombre, propiedades); },
  crearCarpeta(nombre, propiedades) { return this._m().crearCarpeta(nombre, propiedades); },
  listarArchivos(filtro) { return this._m().listarArchivos(filtro); },
  copiarArchivo(id, opciones) { return this._m().copiarArchivo(id, opciones); },
  actualizarArchivo(id, cambios) { return this._m().actualizarArchivo(id, cambios); },
  buscarPorNombre(nombre) { return this._m().buscarPorNombre(nombre); },
  correoUsuario() { return this._m().correoUsuario(); }
};

// Separa 'HOJA!A2:AC' en partes. Columnas como letras; filas pueden faltar.
function rangoA1(rango) {
  const m = /^([^!]+)!([A-Z]+)(\d*)(?::([A-Z]+)(\d*))?$/.exec(rango);
  if (!m) throw new Error('Rango inválido: ' + rango);
  const letraANumero = (l) => l.split('').reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0) - 1;
  return {
    hoja: m[1].replace(/^'|'$/g, ''),
    col1: letraANumero(m[2]),
    fila1: m[3] ? Number(m[3]) : 1,
    col2: m[4] ? letraANumero(m[4]) : letraANumero(m[2]),
    fila2: m[5] ? Number(m[5]) : (m[4] ? null : (m[3] ? Number(m[3]) : null))
  };
}

// 'LOG_TRANS!A2504:AC2510' → 2504 (primera fila de un rango devuelto por Sheets).
function filaDeRango(rango) {
  const m = /![A-Z]+(\d+)/.exec(rango || '');
  return m ? Number(m[1]) : null;
}
