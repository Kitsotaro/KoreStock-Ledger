// © 2026 KoreStock Ledger — un proyecto de Kitsótaro · Código disponible, todos los derechos reservados (ver LICENSE).
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
  // Candado de SOLO LECTURA: mientras haya uno activo, toda escritura o cambio en
  // Drive/Sheets (agregar, actualizar, crear, copiar, renombrar, papelera) se rechaza
  // antes de llegar al motor. Lo usa «Actualizar base de datos». `permitir` lista las
  // únicas operaciones que ese candado deja pasar (p. ej. ['copiarArchivo'] para el
  // respaldo previo: crea un archivo NUEVO y nunca modifica el original).
  _candados: [],
  async enSoloLectura(fn, permitir) {
    const candado = Array.isArray(permitir) ? permitir.slice() : [];
    this._candados.push(candado);
    try { return await fn(); } finally { const i = this._candados.indexOf(candado); if (i >= 0) this._candados.splice(i, 1); }
  },
  _escritura(nombre) {
    if (this._candados.some(c => !c.includes(nombre))) throw new Error(`Bloqueado: «${nombre}» escribe en Drive y la app está en modo solo lectura.`);
    return this._m();
  },
  _m() { if (!this.motor) throw new Error('No hay conexión de datos activa'); return this.motor; },

  // Lee varios rangos en UNA sola petición. Devuelve un arreglo de filas por rango.
  leerVarios(id, rangos) { return this._m().leerVarios(id, rangos); },
  async leer(id, rango) { return (await this.leerVarios(id, [rango]))[0]; },
  // Agrega filas al final de una hoja. Devuelve { primeraFila, ultimaFila }.
  agregar(id, hoja, filas) { return this._escritura('agregar').agregar(id, hoja, filas); },
  // Escribe varios rangos en UNA sola petición: [{ rango, valores }].
  actualizar(id, datos) { return this._escritura('actualizar').actualizar(id, datos); },
  titulosHojas(id) { return this._m().titulosHojas(id); },
  agregarHojas(id, titulos) { return this._escritura('agregarHojas').agregarHojas(id, titulos); },
  existe(id) { return this._m().existe(id); },
  // Crea una hoja de cálculo con estas pestañas (y sin la pestaña por defecto).
  crearHojaCalculo(opciones) { return this._escritura('crearHojaCalculo').crearHojaCalculo(opciones); },
  buscarCarpeta(nombre, propiedades) { return this._m().buscarCarpeta(nombre, propiedades); },
  crearCarpeta(nombre, propiedades) { return this._escritura('crearCarpeta').crearCarpeta(nombre, propiedades); },
  listarArchivos(filtro) { return this._m().listarArchivos(filtro); },
  copiarArchivo(id, opciones) { return this._escritura('copiarArchivo').copiarArchivo(id, opciones); },
  actualizarArchivo(id, cambios) { return this._escritura('actualizarArchivo').actualizarArchivo(id, cambios); },
  buscarPorNombre(nombre) { return this._m().buscarPorNombre(nombre); },
  // Manda a la papelera de Drive un archivo que la app creó (se puede recuperar desde Drive 30 días).
  papelera(id) { return this._escritura('papelera').papelera(id); },
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
