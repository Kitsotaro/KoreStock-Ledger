// © 2026 Wilber Adonay Escobar Solórzano (Kitsótaro) · KoreStock Ledger · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// SINCRONIZACION.JS — abre la base activa: primero la copia local (al
// instante) y luego actualiza desde Drive leyendo SOLO lo nuevo.
//
// Cómo se actualiza (V3 §15.4 y corrección de §22.6):
//   - El historial (LOG_TRANS) solo crece: se leen las filas después de la
//     última que ya está en el dispositivo.
//   - Anular cambia una fila vieja: se relee la columna de estado (una sola
//     columna) para enterarse de anulaciones y reversiones.
//   - Si la última fila guardada ya no coincide (alguien editó la hoja a
//     mano), se descarta la copia y se lee todo.
//   - Las demás hojas son pequeñas: se leen completas.
//   Todo en UNA sola petición de lectura (batchGet).
//
// Sin conexión (D27): si hay copia local, la app abre en solo lectura.
//
// Expone: abrirBase, sincronizarBase, guardarCacheBase, HOJAS_COMPLETAS.
// Depende de: hoja.js, esquema.js, base-datos.js, cache-local.js, almacen.js.
// ============================================================

const HOJAS_COMPLETAS = NOMBRES_HOJAS.filter(n => n !== 'LOG_TRANS');
let _temporizadorCache = null;

function guardarCacheBase() {
  clearTimeout(_temporizadorCache);
  _temporizadorCache = setTimeout(() => { CacheLocal.guardar(Almacen.instantanea()); }, 400);
}

function ultimaFilaLog(movs) {
  return movs.reduce((max, m) => Math.max(max, m._fila || 0), 1);
}

// Actualiza desde Drive. Devuelve { modo: 'completo'|'incremental', nuevas }.
async function sincronizarBase(id, hojasLocales) {
  const ultletra = ultimaLetra('LOG_TRANS');
  const colEstado = columnaLetra(indiceColumna('LOG_TRANS', 'estado'));
  if (!hojasLocales || !hojasLocales.LOG_TRANS) {
    const todas = await leerHojas(id, NOMBRES_HOJAS);
    return { modo: 'completo', hojas: todas, nuevas: todas.LOG_TRANS.length };
  }
  const movs = hojasLocales.LOG_TRANS;
  const ultima = ultimaFilaLog(movs);
  const ultimoLocal = movs.find(m => m._fila === ultima);
  const rangos = [
    `LOG_TRANS!A${ultima + 1}:${ultletra}`,
    `LOG_TRANS!A${ultima}:A${ultima}`,
    `LOG_TRANS!${colEstado}2:${colEstado}${Math.max(2, ultima)}`
  ].concat(HOJAS_COMPLETAS.map(n => rangoDatos(n, 2)));
  const r = await Hoja.leerVarios(id, rangos);

  const folioRemoto = r[1][0] && r[1][0][0] !== undefined ? String(r[1][0][0]) : '';
  if (ultima > 1 && (!ultimoLocal || folioRemoto !== String(ultimoLocal.folio))) {
    const todas = await leerHojas(id, NOMBRES_HOJAS);
    return { modo: 'completo', hojas: todas, nuevas: todas.LOG_TRANS.length };
  }

  const hojas = {};
  // Estados (anulaciones y reversiones) de las filas ya conocidas.
  const estados = r[2];
  const actualizados = movs.map(m => {
    const fila = estados[m._fila - 2];
    const estadoRemoto = fila && fila[0] !== undefined ? String(fila[0]).trim() : '';
    if (estadoRemoto === (m.estado || '')) return m;
    return Object.assign({}, m, { estado: estadoRemoto });
  });
  const nuevas = [];
  r[0].forEach((f, j) => {
    if (!f || !f.length || f.every(v => v === '' || v === null)) return;
    nuevas.push(filaAObjeto('LOG_TRANS', f, ultima + 1 + j));
  });
  hojas.LOG_TRANS = actualizados.concat(nuevas);
  HOJAS_COMPLETAS.forEach((n, i) => {
    hojas[n] = [];
    r[3 + i].forEach((f, j) => {
      if (!f || !f.length || f.every(v => v === '' || v === null)) return;
      hojas[n].push(filaAObjeto(n, f, j + 2));
    });
  });
  return { modo: 'incremental', hojas, nuevas: nuevas.length };
}

// Abre la base: copia local → pantalla; luego Drive → pantalla y copia.
// alCargar(origen) se llama cuando hay datos para pintar ('local' y/o 'drive').
async function abrirBase(id, alCargar) {
  const local = await CacheLocal.leer(id);
  if (local && local.hojas && local.version === VERSION_ESQUEMA) {
    Almacen.cargar(local.hojas, id);
    Almacen.actualizadoEn = local.guardado || '';
    if (alCargar) alCargar('local');
  }
  try {
    const r = await sincronizarBase(id, local && local.version === VERSION_ESQUEMA ? local.hojas : null);
    Almacen.sinConexion = false;
    Almacen.cargar(r.hojas, id);
    Almacen.actualizadoEn = obtenerTimestampLocal();
    await CacheLocal.guardar(Almacen.instantanea());
    if (alCargar) alCargar('drive');
    return { ok: true, modo: r.modo, nuevas: r.nuevas };
  } catch (err) {
    if (local && local.hojas) {
      Almacen.sinConexion = true;
      Almacen.notificar('sin-conexion');
      return { ok: false, sinConexion: true, error: err };
    }
    throw err;
  }
}
