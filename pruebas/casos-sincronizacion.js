// © 2026 KoreStock Ledger — un proyecto de Kitsótaro · Código disponible, todos los derechos reservados (ver LICENSE).
// Copia local y sincronización incremental (V3 §15.4, §22.3, §22.6).

grupo('Copia local y sincronización');

async function baseV3DePrueba() {
  DriveDemo.persistir = false; DriveDemo.reiniciar(); Hoja.usar(MotorDemo);
  await CacheLocal.borrarTodo();
  const id = cargarBasePruebaEnDemo(leerArchivoBinario(RUTA_BASE_PRUEBA));
  return (await migrarBaseV2(id, [])).idNuevo;
}

prueba('primera apertura lee todo; la segunda sale de la copia local y solo lee lo nuevo', async () => {
  if (!hayBasePrueba()) return;
  const id = await baseV3DePrueba();
  const a = await abrirBase(id);
  igual(a.modo, 'completo');
  igual(Almacen.movimientos.length, 2549);
  const b = await abrirBase(id);
  igual(b.modo, 'incremental'); igual(b.nuevas, 0);
});

prueba('una fila nueva y una anulación hechas en Drive llegan al dispositivo', async () => {
  if (!hayBasePrueba()) return;
  const id = await baseV3DePrueba();
  await abrirBase(id);
  const ultima = Almacen.movimientos[Almacen.movimientos.length - 1];
  const nueva = Object.assign({}, ultima, { folio: 'FAC-009999', estado: '' });
  await Hoja.agregar(id, 'LOG_TRANS', [objetoAFila('LOG_TRANS', nueva, true)]);
  const victima = Almacen.movimientos.find(m => m.tipo === 'VENTA' && !m.estado);
  await Hoja.actualizar(id, [{ rango: `LOG_TRANS!T${victima._fila}`, valores: [['ANULADA']] }]);
  const stockAntes = Almacen.stock(victima.idProducto);
  const r = await abrirBase(id);
  igual(r.modo, 'incremental'); igual(r.nuevas, 1);
  igual(Almacen.movimientoPorFolio(victima.folio).estado, 'ANULADA');
  igual(Almacen.stock(victima.idProducto), stockAntes + Math.abs(victima.cantidad) - (victima.idProducto === nueva.idProducto ? Math.abs(nueva.cantidad) : 0));
});

prueba('si la hoja se editó a mano y no coincide, se relee completa', async () => {
  if (!hayBasePrueba()) return;
  const id = await baseV3DePrueba();
  await abrirBase(id);
  const ultima = Almacen.movimientos[Almacen.movimientos.length - 1];
  await Hoja.actualizar(id, [{ rango: `LOG_TRANS!A${ultima._fila}`, valores: [['FAC-EDITADO']] }]);
  igual((await abrirBase(id)).modo, 'completo');
});

prueba('folios siguientes salen de la copia local', async () => {
  if (!hayBasePrueba()) return;
  const id = await baseV3DePrueba();
  await abrirBase(id);
  igual(Almacen.verFolioSiguiente('FAC-'), 'FAC-002321');
  igual(Almacen.verFolioSiguiente('IN-'), 'IN-000230');
  igual(Almacen.tomarFolio('TK-'), 'TK-000001');
  igual(Almacen.tomarId('ID_PRODUCTO'), 21);
});

prueba('sin conexión, con copia local, abre en solo lectura', async () => {
  if (!hayBasePrueba()) return;
  const id = await baseV3DePrueba();
  await abrirBase(id);
  const original = MotorDemo.leerVarios;
  MotorDemo.leerVarios = async () => { throw new Error('sin red'); };
  try {
    const r = await abrirBase(id);
    verdadero(r.sinConexion && Almacen.sinConexion);
    igual(Almacen.movimientos.length, 2549);
  } finally { MotorDemo.leerVarios = original; }
});

prueba('plural de unidades', () => {
  igual(pluralUnidad('cartón', 3), 'cartones'); igual(pluralUnidad('huevo', 2), 'huevos');
  igual(pluralUnidad('unidad', 5), 'unidades'); igual(pluralUnidad('lata', 1), 'lata');
  igual(pluralUnidad('sixpack', 4), 'sixpacks', 'préstamo en consonante');
});

prueba('la copia del dispositivo vence a los 3 días y se borra (auditoría 2026-10-22)', async () => {
  await CacheLocal.borrarTodo();
  await CacheLocal.guardar({ id: 'base-x', hojas: {}, guardado: '2026-10-01 10:00:00', version: VERSION_ESQUEMA });
  await CacheLocal.guardar({ id: 'base-x', hojas: { LOG_TRANS: [] }, desde: '2026-01-01' }, 'historicos');
  igual(await CacheLocal.purgarVencidas(new Date(2026, 9, 4, 9, 59).getTime()), false, 'aún dentro de los 3 días');
  verdadero(!!(await CacheLocal.leer('base-x')));
  igual(await CacheLocal.purgarVencidas(new Date(2026, 9, 4, 10, 0, 1).getTime()), true, 'pasados los 3 días');
  igual(await CacheLocal.leer('base-x'), null);
  igual(await CacheLocal.leer('base-x', 'historicos'), null, 'también los históricos');
});

// Base mínima (sin el archivo xlsx de prueba): 1 producto y 2 movimientos.
async function baseMinimaV3() {
  DriveDemo.persistir = false; DriveDemo.reiniciar(); Hoja.usar(MotorDemo); Sesion.modoDemo = true;
  await CacheLocal.borrarTodo();
  const fila = (hoja, obj) => obj;
  return crearBaseV3({ hojas: {
    CATALOGO: [fila('CATALOGO', { idProducto: 1, estado: 'ACTIVO' })],
    LOG_TRANS: [fila('LOG_TRANS', { folio: 'FAC-000001', idProducto: 1, tipo: 'ENTRADA' }), fila('LOG_TRANS', { folio: 'FAC-000002', idProducto: 1, tipo: 'ENTRADA' })]
  } });
}

prueba('Actualizar base de datos: el candado de solo lectura rechaza toda escritura', async () => {
  const id = await baseMinimaV3();
  let bloqueada = 0;
  await Hoja.enSoloLectura(async () => {
    for (const f of [() => Hoja.agregar(id, 'LOG_TRANS', [[1]]), () => Hoja.actualizar(id, [{ rango: 'LOG_TRANS!A2', valores: [['x']] }]),
      () => Hoja.papelera(id), () => Hoja.agregarHojas(id, ['X']), () => Hoja.actualizarArchivo(id, {}), () => Hoja.copiarArchivo(id, {}),
      () => Hoja.crearCarpeta('x'), () => Hoja.crearHojaCalculo({ titulo: 'x', hojas: [] })]) {
      try { await f(); } catch (e) { if (/solo lectura/.test(e.message)) bloqueada++; }
    }
  });
  igual(bloqueada, 8);
  igual(Hoja._candados.length, 0); // no queda pegado
  await Hoja.agregar(id, 'LOG_TRANS', [objetoAFila('LOG_TRANS', { folio: 'FAC-000003', idProducto: 1, tipo: 'ENTRADA' }, true)]); // fuera del candado sí escribe
});

prueba('Actualizar base de datos: no modifica Drive y reemplaza la copia local', async () => {
  const id = await baseMinimaV3();
  await abrirBase(id);
  const antes = JSON.stringify(await Hoja.leerVarios(id, NOMBRES_HOJAS.map(n => rangoDatos(n, 2))));
  await CacheLocal.guardar(Object.assign({}, Almacen.instantanea(), { hojas: Object.assign({}, Almacen.hojas, { LOG_TRANS: Almacen.hojas.LOG_TRANS.slice(0, 1) }) })); // copia local "dañada"
  const r = await recargarBaseCompleta(id);
  igual(r.movimientos, 2);
  igual(JSON.stringify(await Hoja.leerVarios(id, NOMBRES_HOJAS.map(n => rangoDatos(n, 2)))), antes); // Drive idéntico
  igual((await CacheLocal.leer(id)).hojas.LOG_TRANS.length, 2); // copia reparada
  igual(Almacen.movimientos.length, 2);
});

prueba('Actualizar base de datos: si Drive devuelve vacío, conserva la copia local', async () => {
  const id = await baseMinimaV3();
  await abrirBase(id);
  const original = Hoja.leerVarios;
  Hoja.leerVarios = async (i, rangos) => rangos.map(() => []);
  let fallo = false;
  try { await recargarBaseCompleta(id); } catch (e) { fallo = true; } finally { Hoja.leerVarios = original; }
  igual(fallo, true);
  igual(Almacen.movimientos.length, 2);
  igual((await CacheLocal.leer(id)).hojas.LOG_TRANS.length, 2);
});

prueba('Actualizar base de datos: respaldo previo = solo una copia nueva; el original no cambia y nada se borra', async () => {
  const id = await baseMinimaV3();
  await abrirBase(id);
  const leerTodo = async (i) => JSON.stringify(await Hoja.leerVarios(i, NOMBRES_HOJAS.map(n => rangoDatos(n, 2))));
  const antes = await leerTodo(id);
  const archivosAntes = (await Hoja.listarArchivos({})).length;
  const llamadas = [];
  const orig = { p: Hoja.papelera, a: Hoja.actualizar, g: Hoja.agregar, u: Hoja.actualizarArchivo };
  Hoja.papelera = (...x) => { llamadas.push('papelera'); return orig.p.apply(Hoja, x); };
  Hoja.actualizar = (...x) => { llamadas.push('actualizar'); return orig.a.apply(Hoja, x); };
  Hoja.agregar = (...x) => { llamadas.push('agregar'); return orig.g.apply(Hoja, x); };
  Hoja.actualizarArchivo = (...x) => { llamadas.push('actualizarArchivo'); return orig.u.apply(Hoja, x); };
  let r;
  try { r = await recargarBaseCompleta(id); } finally { Hoja.papelera = orig.p; Hoja.actualizar = orig.a; Hoja.agregar = orig.g; Hoja.actualizarArchivo = orig.u; }
  igual(llamadas.length, 0); // ni papelera, ni escrituras, ni renombres
  igual(await leerTodo(id), antes); // original idéntico
  igual((await Hoja.listarArchivos({})).length, archivosAntes + 1); // exactamente una copia nueva
  igual(r.respaldo.filas, 2);
  igual(await leerTodo(r.respaldo.id), antes); // la copia tiene lo mismo que el original
  const previos = await Hoja.listarArchivos({ propiedades: { korestock: 'base', tipo: 'respaldo-previo', origen: id } });
  igual(previos.length, 1);
  const diarios = await listarRespaldos(id);
  igual(diarios.length, 0); // no se mezcla con la rotación del respaldo diario
});

prueba('Actualizar base de datos: si el respaldo previo falla, no se actualiza nada', async () => {
  const id = await baseMinimaV3();
  await abrirBase(id);
  const orig = Hoja.copiarArchivo;
  Hoja.copiarArchivo = async () => { throw new Error('cuota'); };
  let fase = '';
  try { await recargarBaseCompleta(id); } catch (e) { fase = e.fase; } finally { Hoja.copiarArchivo = orig; }
  igual(fase, 'respaldo');
  igual(Almacen.movimientos.length, 2);
  igual((await CacheLocal.leer(id)).hojas.LOG_TRANS.length, 2);
});

prueba('Actualizar base de datos: el candado con excepción solo deja pasar copiarArchivo', async () => {
  const id = await baseMinimaV3();
  let bloqueadas = 0, copia = null;
  await Hoja.enSoloLectura(async () => {
    copia = await Hoja.copiarArchivo(id, { nombre: 'x', propiedades: {} });
    for (const f of [() => Hoja.agregar(id, 'LOG_TRANS', [[1]]), () => Hoja.papelera(copia), () => Hoja.actualizarArchivo(id, { nombre: 'y' })]) {
      try { await f(); } catch (e) { if (/solo lectura/.test(e.message)) bloqueadas++; }
    }
  }, ['copiarArchivo']);
  igual(bloqueadas, 3);
  igual(Hoja._candados.length, 0);
});
