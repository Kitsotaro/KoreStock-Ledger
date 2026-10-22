// © 2026 Kitsótaro · KoreStock Ledger · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// RESPALDOS.JS — copias de seguridad y exportar/restaurar (T19).
//
// Respaldo diario (D26, §18.2): al abrir la app, si hoy no hay respaldo,
// se copia la base dentro de la carpeta KoreStock. La copia se VERIFICA
// (debe tener todas las filas que la app conoce) y solo entonces se
// descartan las viejas: quedan 2 generaciones. Protege contra borrados
// accidentales, no contra perder la cuenta: para eso está la descarga.
//
// Exportar (§14 v3): un .xlsx con todas las hojas en valores crudos y una
// hoja MANIFIESTO (versión del esquema, filas por hoja y totales de
// control). Restaurar: solo acepta archivos exportados por KoreStock, los
// valida contra su manifiesto y crea una base NUEVA (nunca mezcla).
//
// Expone: GENERACIONES_RESPALDO, listarRespaldos, hacerRespaldo,
//   respaldoDiarioSiHaceFalta, totalesManifiesto, construirLibroExportacion,
//   leerLibroRestauracion, restaurarDesdeLibro, activarBaseNueva.
// Depende de: hoja.js, base-datos.js, esquema.js, almacen.js, calculos.js,
//   dinero.js, migracion.js (compararReleida); XLSX en tiempo de ejecución.
// ============================================================

const GENERACIONES_RESPALDO = 2;
const HOJA_MANIFIESTO = 'MANIFIESTO';

async function listarRespaldos(baseId) {
  const lista = await Hoja.listarArchivos({ propiedades: { korestock: 'base', tipo: 'respaldo', origen: baseId } });
  return lista.sort((a, b) => ((b.propiedades.creado || b.creado || '') > (a.propiedades.creado || a.creado || '') ? 1 : -1));
}

// Copia la base y la verifica antes de borrar las copias viejas.
async function hacerRespaldo(baseId, motivo) {
  const carpeta = await asegurarCarpeta();
  const ahora = obtenerTimestampLocal();
  const idCopia = await Hoja.copiarArchivo(baseId, {
    nombre: `${NOMBRE_BASE} · respaldo ${ahora.slice(0, 16)}`, carpetaId: carpeta,
    propiedades: { korestock: 'base', tipo: 'respaldo', origen: baseId, fecha: ahora.slice(0, 10), creado: ahora, motivo: motivo || 'diario' }
  });
  // Verificación: la última fila conocida del historial está en la copia y no falta nada.
  if (Almacen.baseId === baseId && Almacen.movimientos.length) {
    const ultima = Almacen.movimientos.reduce((max, m) => Math.max(max, m._fila || 0), 0);
    const ultimoFolio = (Almacen.movimientos.find(m => m._fila === ultima) || {}).folio;
    const [r] = await Hoja.leerVarios(idCopia, [`LOG_TRANS!A${ultima}:A${ultima}`]);
    if (!r[0] || String(r[0][0]) !== String(ultimoFolio)) {
      await Hoja.papelera(idCopia);
      throw new Error('La copia de respaldo no salió completa; se descartó y se conserva la anterior.');
    }
  }
  const respaldos = await listarRespaldos(baseId);
  for (const viejo of respaldos.slice(GENERACIONES_RESPALDO)) await Hoja.papelera(viejo.id);
  try { localStorage.setItem(CLAVES_LOCALES.ULTIMO_RESPALDO, ahora); } catch (e) { /* sin almacenamiento */ }
  return { id: idCopia, fecha: ahora };
}

// Al abrir: un respaldo por día, sin bloquear la app si falla.
async function respaldoDiarioSiHaceFalta(baseId) {
  const hoy = obtenerFechaLocal();
  let ultimo = '';
  try { ultimo = localStorage.getItem(CLAVES_LOCALES.ULTIMO_RESPALDO) || ''; } catch (e) { ultimo = ''; }
  if (ultimo.slice(0, 10) === hoy) return null;
  const existentes = await listarRespaldos(baseId);
  if (existentes.some(r => r.propiedades.fecha === hoy)) {
    try { localStorage.setItem(CLAVES_LOCALES.ULTIMO_RESPALDO, existentes[0].propiedades.creado || hoy); } catch (e) { /* nada */ }
    return null;
  }
  return hacerRespaldo(baseId, 'diario');
}

// Totales de control para el manifiesto y para verificar.
function totalesManifiesto(hojas) {
  const movs = hojas.LOG_TRANS || [];
  const r = calcularResumenPeriodo(movs, null, null);
  const estados = calcularEstadoProductos(movs);
  const unidades = Object.values(estados).reduce((s, e) => s + e.stock, 0);
  const productos = (hojas.CATALOGO || []).filter(p => p.estado === ESTADOS.ACTIVO);
  return {
    VENTAS: dineroANumero(r.ventas), UTILIDAD: dineroANumero(r.utilidad), INVERSION: dineroANumero(r.inversion),
    UNIDADES_STOCK: redondearCantidad(unidades), VALOR_BODEGA: dineroANumero(valorBodega(productos, estados).bruto)
  };
}

// Libro de SheetJS con todas las hojas en valores crudos + MANIFIESTO.
function construirLibroExportacion(hojas) {
  const libro = XLSX.utils.book_new();
  const filasManifiesto = [['CLAVE', 'VALOR'], ['APP', NOMBRE_APP], ['ESQUEMA', VERSION_ESQUEMA], ['EXPORTADO', obtenerTimestampLocal()]];
  NOMBRES_HOJAS.forEach(n => {
    const filas = [encabezadosDe(n)].concat((hojas[n] || []).map(o => objetoAFila(n, o, false)));
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(filas), n);
    filasManifiesto.push([`FILAS_${n}`, (hojas[n] || []).length]);
  });
  Object.entries(totalesManifiesto(hojas)).forEach(([k, v]) => filasManifiesto.push([`TOTAL_${k}`, v]));
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(filasManifiesto), HOJA_MANIFIESTO);
  return libro;
}

// Lee y valida un archivo exportado. Devuelve { hojas, manifiesto } o lanza un error claro.
function leerLibroRestauracion(libro) {
  if (!libro.SheetNames.includes(HOJA_MANIFIESTO)) throw new Error('Este archivo no es una copia exportada por KoreStock (no tiene la hoja MANIFIESTO).');
  const man = {};
  XLSX.utils.sheet_to_json(libro.Sheets[HOJA_MANIFIESTO], { header: 1, raw: true, defval: '' }).slice(1).forEach(([k, v]) => { man[k] = v; });
  if (Number(man.ESQUEMA) !== VERSION_ESQUEMA) throw new Error(`La copia es de otra versión de la estructura (${man.ESQUEMA}).`);
  const hojas = {};
  NOMBRES_HOJAS.forEach(n => {
    if (!libro.SheetNames.includes(n)) throw new Error(`Falta la hoja ${n} en el archivo.`);
    const filas = XLSX.utils.sheet_to_json(libro.Sheets[n], { header: 1, raw: true, defval: '' });
    const enc = (filas[0] || []).map(String);
    if (encabezadosDe(n).some((e, i) => enc[i] !== e)) throw new Error(`Los encabezados de ${n} no coinciden: el archivo fue modificado.`);
    hojas[n] = filas.slice(1).filter(f => f.some(v => v !== '' && v !== null)).map(f => { const o = filaAObjeto(n, f); return o; });
    if (Number(man[`FILAS_${n}`]) !== hojas[n].length) throw new Error(`La hoja ${n} tiene ${hojas[n].length} filas y el manifiesto dice ${man[`FILAS_${n}`]}.`);
  });
  const t = totalesManifiesto(hojas);
  Object.entries(t).forEach(([k, v]) => {
    if (Math.abs(Number(man[`TOTAL_${k}`]) - v) > 0.005) throw new Error(`El total ${k} no coincide con el manifiesto: el archivo no está completo.`);
  });
  return { hojas, manifiesto: man };
}

// Crea una base NUEVA con la copia, la relee y la compara. No activa nada.
async function restaurarDesdeLibro(libro) {
  const { hojas, manifiesto } = leerLibroRestauracion(libro);
  const idNuevo = await crearBaseV3({ hojas, titulo: `${NOMBRE_BASE} (restaurada ${obtenerFechaLocal()})`, propiedades: { tipo: 'pendiente', origen: 'restauracion', restaurada: obtenerFechaLocal(), exportada: String(manifiesto.EXPORTADO || '') } });
  const releido = await leerHojas(idNuevo, NOMBRES_HOJAS);
  const comparacion = compararReleida(hojas, releido);
  if (!comparacion.ok) {
    await Hoja.actualizarArchivo(idNuevo, { propiedades: { tipo: 'fallida' } });
    return { ok: false, comparacion };
  }
  return { ok: true, idNuevo, manifiesto };
}

// Pasa a usar una base nueva (restaurada o rotada). La nueva queda como
// principal ANTES de retirar la anterior: si algo se corta a la mitad, la
// app encuentra la nueva (es la más reciente) y la anterior sigue intacta.
async function activarBaseNueva(idNuevo, idAnterior, cambiosAnterior) {
  await Hoja.actualizarArchivo(idNuevo, { propiedades: { tipo: 'principal' } });
  try { localStorage.setItem(CLAVES_LOCALES.BASE, idNuevo); } catch (e) { /* sin almacenamiento */ }
  if (idAnterior) await Hoja.actualizarArchivo(idAnterior, cambiosAnterior || { propiedades: { tipo: 'reemplazada', sucesor: idNuevo } });
}
