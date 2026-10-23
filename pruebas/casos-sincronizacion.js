// © 2026 Wilber Adonay Escobar Solórzano (Kitsótaro) · KoreStock Ledger · Código disponible, todos los derechos reservados (ver LICENSE).
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
