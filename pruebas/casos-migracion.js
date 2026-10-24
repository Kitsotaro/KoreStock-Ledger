// © 2026 KoreStock Ledger — un proyecto de Kitsótaro · Código disponible, todos los derechos reservados (ver LICENSE).
// Migración v2 → v3 con la base de prueba (V3 §5, §16.4, §22.4). Requiere la
// base privada; si no está disponible (navegador), estos casos se saltan.

grupo('Migración v2 → v3 (base de prueba)');

async function prepararDemoConBaseV2() {
  DriveDemo.persistir = false;
  DriveDemo.reiniciar();
  Hoja.usar(MotorDemo);
  return cargarBasePruebaEnDemo(leerArchivoBinario(RUTA_BASE_PRUEBA));
}

prueba('detecta la versión 2 y lee todas las hojas', async () => {
  if (!hayBasePrueba()) return;
  const id = await prepararDemoConBaseV2();
  igual((await detectarVersionEsquema(id)).version, 2);
  const datos = await leerBaseV2(id);
  igual(datos.LOG_TRANS.length, 2549, 'movimientos');
  igual(datos.CATALOGO.length, 20, 'productos');
  igual(datos.VEHICULOS.length, 1);
  verdadero(datos.LOG_TRANS[0].fecha.length === 10, 'la fecha de serie se convierte a texto');
});

prueba('propone las fusiones esperadas y ninguna aceptada por defecto', async () => {
  if (!hayBasePrueba()) return;
  const id = await prepararDemoConBaseV2();
  const p = proponerFusiones(await leerBaseV2(id));
  igual(p.filter(x => x.tipo === 'UNIDADES').length, 2, 'huevo grande y huevo mediano');
  igual(p.filter(x => x.tipo === 'VARIANTES').length, 1, 'tortillitas');
  verdadero(p.every(x => !x.aceptada), 'nunca se fusiona en silencio');
  igual(p.find(x => x.tipo === 'UNIDADES').unidadBase, 'huevo');
});

prueba('sin fusiones: totales, stock y valor de bodega idénticos', async () => {
  if (!hayBasePrueba()) return;
  const id = await prepararDemoConBaseV2();
  const r = await migrarBaseV2(id, []);
  verdadero(r.ok, JSON.stringify(r.verificacion && r.verificacion.errores) + JSON.stringify(r.comparacion && r.comparacion.errores));
  igual((await detectarVersionEsquema(r.idNuevo)).version, 3);
  igual(formatearDinero(r.verificacion.resumen.despues.ventas), '$7,303.91');
  igual(formatearDinero(r.verificacion.resumen.despues.utilidad), '$1,846.13');
  igual(formatearDinero(r.verificacion.resumen.despues.inversion), '$5,804.76');
  igual(formatearDinero(r.verificacion.resumen.valorBodegaSinFusionar), '$363.58', 'activos; el obsoleto suma $6.16 aparte');
});

prueba('la base vieja queda intacta', async () => {
  if (!hayBasePrueba()) return;
  const id = await prepararDemoConBaseV2();
  const antes = JSON.stringify(DriveDemo.archivos[id].hojas);
  await migrarBaseV2(id, []);
  igual(JSON.stringify(DriveDemo.archivos[id].hojas), antes);
});

prueba('con fusiones: huevo grande pasa a 780 huevos y el SKU viejo queda de referencia', async () => {
  if (!hayBasePrueba()) return;
  const id = await prepararDemoConBaseV2();
  const propuestas = proponerFusiones(await leerBaseV2(id)).map(x => Object.assign(x, { aceptada: true }));
  const r = await migrarBaseV2(id, propuestas);
  verdadero(r.ok, JSON.stringify(r.verificacion && r.verificacion.errores));
  const v3 = await leerHojas(r.idNuevo, NOMBRES_HOJAS);
  const huevo = v3.CATALOGO.find(p => p.linea === 'Huevo Grande' && p.estado === 'ACTIVO');
  igual(huevo.unidadBase, 'huevo');
  igual(huevo.stockCache, 20 * 30 + 15 * 12);
  igual(stockDerivadoPorProducto(v3.LOG_TRANS)[huevo.idProducto].stock, 780);
  const fusionado = v3.CATALOGO.find(p => p.linea === 'Huevo Grande' && p.estado === 'FUSIONADO');
  igual(fusionado.fusionadoEn, huevo.idProducto);
  const movRef = v3.LOG_TRANS.find(m => m.referencia === fusionado.sku);
  verdadero(movRef && movRef.unidPorEmpaque === 12 && movRef.idProducto === huevo.idProducto, 'el movimiento recuerda su factor y su SKU anterior');
  igual(v3.PRESENTACIONES_VENTA.filter(x => x.idProducto === huevo.idProducto).length, 2, 'cartón 30 y cartón 12 como presentaciones de venta');
  igual(formatearDinero(r.verificacion.resumen.despues.ventas), '$7,303.91');
  const tortillitas = v3.CATALOGO.filter(p => p.linea === 'Tortillitas');
  igual(tortillitas.filter(p => p.estado === 'ACTIVO').length, 1);
  igual(tortillitas.find(p => p.estado === 'ACTIVO').variante, '', 'el sabor deja de ser identidad');
});

prueba('repetible: correrla dos veces da dos bases correctas', async () => {
  if (!hayBasePrueba()) return;
  const id = await prepararDemoConBaseV2();
  const a = await migrarBaseV2(id, []);
  const b = await migrarBaseV2(id, []);
  verdadero(a.ok && b.ok && a.idNuevo !== b.idNuevo);
});

prueba('si el stock guardado no cuadra con el historial, no se activa sin avisar antes', async () => {
  if (!hayBasePrueba()) return;
  const id = await prepararDemoConBaseV2();
  DriveDemo.archivos[id].hojas.CATALOGO[1][8] = 999; // stock alterado a mano
  const r = await migrarBaseV2(id, []);
  verdadero(!r.ok && r.etapa === 'diferencias', 'pide confirmación (ya no bloquea, decisión 2026-10-22)');
  verdadero(r.verificacion.diferencias.some(d => d.guardado === 999));
});

grupo('Esquema e identidad');
prueba('«500 ml», «500ml» y «500 ML» son el mismo contenido', () => {
  igual(normalizarIdentidad('500 ml'), normalizarIdentidad('500ml'));
  igual(normalizarIdentidad('500 ML'), normalizarIdentidad('500ml'));
  igual(normalizarIdentidad('Jalapeño'), normalizarIdentidad('jalapeno'));
});
prueba('columnas v3 al final y letras correctas', () => {
  igual(columnaLetra(27), 'AB');
  igual(ultimaLetra('LOG_TRANS'), 'AC');
  igual(ESQUEMA.LOG_TRANS[19][1], 'ESTADO_MOV', 'las 20 primeras columnas siguen como en la v2');
  igual(ESQUEMA.CATALOGO[15][1], 'STOCK_BONIFICADO');
});
prueba('fila ↔ objeto conserva el dinero exacto', () => {
  const o = filaAObjeto('LOG_TRANS', ['IN-000001', 46275.3125, 46275, 'ENTRADA', 'X-001', 'M', 'L', 'Lata', '355 ml', '', 12, 0, 0.16667, 0.25, 2.00004, 0.08333, '', '', 'Caja', '']);
  igual(o.fecha, '2026-09-10');
  igual(o.costoUnit, 16667);
  igual(o.totalVenta, null);
  const f = objetoAFila('LOG_TRANS', o, true);
  igual(f[12], 0.16667);
  igual(f.length, 19, 'el estado vacío del final no se escribe');
});

prueba('stock guardado distinto del historial: avisa y migra con el historial (auditoría 2026-10-22)', async () => {
  if (!hayBasePrueba()) return;
  DriveDemo.persistir = false; DriveDemo.reiniciar(); Hoja.usar(MotorDemo);
  const id = cargarBasePruebaEnDemo(leerArchivoBinario(RUTA_BASE_PRUEBA));
  const cat = DriveDemo.archivo(id).hojas.CATALOGO;
  const col = cat[0].findIndex(h => /STOCK/i.test(String(h)) && !/BONIF/i.test(String(h)));
  verdadero(col >= 0, 'columna de stock en la v2');
  cat[1][col] = Number(cat[1][col] || 0) + 5;
  const r1 = await migrarBaseV2(id, []);
  igual(r1.ok, false); igual(r1.etapa, 'diferencias');
  igual(r1.verificacion.diferencias.length, 1);
  igual(r1.verificacion.diferencias[0].guardado - r1.verificacion.diferencias[0].historial, 5);
  const r2 = await migrarBaseV2(id, [], null, { aceptarDiferencias: true });
  verdadero(r2.ok, 'migra con el historial');
  await abrirBase(r2.idNuevo);
  igual(Almacen.stock(r1.verificacion.diferencias[0].id), r1.verificacion.diferencias[0].historial);
});

// Ronda de matemática (2026-10-23), caso de la base real de Kitso: dos productos
// con el mismo SKU en el catálogo y movimientos con otro SKU y sin el sabor.
function crearBaseV2Petit() {
  DriveDemo.persistir = false; DriveDemo.reiniciar(); Hoja.usar(MotorDemo);
  const encCat = ['SKU_ITEM', 'MARCA', 'LINEA_PROD', 'PRESENTACION', 'VOLUMEN', 'VARIANTE', 'P_DISTRIBUIDOR', 'P_CONSUMIDOR', 'STOCK_ACTUAL', 'ESTADO_ITEM', 'ULTIMA_MODIF', 'TIPO_EMPAQUE', 'ID_PRODUCTO', 'FECHA_CREACION', 'MODIFICACION_ANTERIOR', 'STOCK_BONIFICADO'];
  const encLog = ['TRANS_ID', 'TIMESTAMP_LOG', 'FECHA_MOV', 'TIPO_MOV', 'SKU_ITEM', 'MARCA', 'LINEA_PROD', 'PRESENTACION', 'VOLUMEN', 'VARIANTE', 'CANTIDAD', 'UNID_BONIF', 'P_DISTRIBUIDOR', 'P_CONSUMIDOR', 'TOTAL_INVERSION', 'MARGEN_UNIT', 'TOTAL_VENTA', 'UTILIDAD_NETA', 'TIPO_EMPAQUE', 'ESTADO_MOV'];
  const id = DriveDemo.crearDesdeDatos('StockCentral_DB', {
    CATALOGO: [encCat,
      ['CBPET-002', 'CBC', 'Petit', 'Tetra', '200 ml', 'uva', 4, 5.5, 4, 'ACTIVO', 46299, 'Sixpack', 5, 46275, '', 1],
      ['CBPET-002', 'CBC', 'Petit', 'Lata', '355 ml', '', 9, 11, 2, 'ACTIVO', 46299, 'Caja', 6, 46275, '', 0]],
    LOG_TRANS: [encLog,
      ['IN-000001', 46275.3, 46275, 'ENTRADA', 'CBPET-001', 'CBC', 'Petit', 'Tetra', '200 ml', '', 5, 1, '4', '5,5', '20', '1,5', '', '', 'Sixpack', ''],
      ['IN-000002', 46275.31, 46275, 'ENTRADA', 'CBPET-002', 'CBC', 'Petit', 'Lata', '355 ml', '', 3, 0, '9', '11', '27', '2', '', '', 'Caja', ''],
      ['FAC-000001', 46276.3, 46276, 'VENTA', 'CBPET-001', 'CBC', 'Petit', 'Tetra', '200 ml', '', -2, 0, '4', '5,5', '8', '1,5', '11', '3', 'Sixpack', ''],
      ['FAC-000002', 46276.31, 46276, 'VENTA', 'CBPET-002', 'CBC', 'Petit', 'Lata', '355 ml', '', -1, 0, '9', '11', '9', '2', '11', '2', 'Caja', '']],
    LOG_HISTORICO_PRECIOS: [['ID_LOG', 'SKU_ITEM', 'P_DIST_ANT', 'P_DIST_NUEVO', 'P_CONS_ANT', 'P_CONS_NUEVO', 'FECHA_CAMBIO', 'USUARIO']],
    UMBRALES: [['TIPO_EMPAQUE', 'STOCK_MIN', 'STOCK_MAX'], ['TODOS', 4, 7]],
    COSTOS_OPERATIVOS: [['ID_GASTO', 'TIMESTAMP_LOG', 'FECHA_GASTO', 'CATEGORIA', 'MONTO', 'DESCRIPCION', 'ESTADO']],
    VEHICULOS: [['PLACA', 'MARCA', 'MODELO', 'COLOR', 'TIPO_COMBUSTIBLE', 'ESTADO']],
    COSTOS_COMBUSTIBLE: [['ID_GASTO', 'TIMESTAMP_LOG', 'FECHA_MOV', 'PLACA', 'ODOMETRO', 'GALONES', 'MONTO_PAGADO', 'ESTADO']]
  });
  return id;
}

prueba('SKU repetido y movimiento sin sabor: se enlaza por marca/producto/presentación y toma su código', async () => {
  const id = crearBaseV2Petit();
  const r = await migrarBaseV2(id, []);
  verdadero(r.ok, JSON.stringify(r.verificacion));
  igual(r.verificacion.diferencias.length, 0, 'sin diferencias de stock');
  const v3 = await leerHojas(r.idNuevo, NOMBRES_HOJAS);
  const tetra = v3.CATALOGO.find(p => p.presentacion === 'Tetra'), lata = v3.CATALOGO.find(p => p.presentacion === 'Lata');
  igual(tetra.sku, 'CBPET-001', 'toma el código de sus movimientos');
  igual(lata.sku, 'CBPET-002');
  igual(tetra.stockCache, 4); igual(lata.stockCache, 2);
  verdadero(v3.LOG_TRANS.every(m => m.idProducto), 'ningún movimiento queda sin producto');
  igual(formatearDinero(calcularResumenPeriodo(v3.LOG_TRANS, null, null).ventas), '$22.00', '«5,5» con coma se lee bien');
});

// Unidad de conteo elegida en el asistente (Kitso, 2026-10-23).
prueba('unidad por producto: «sixpack de 6» pasa a unidades y «por caja» deja todo igual', async () => {
  const id = crearBaseV2Petit();
  const unidades = { 5: { modo: 'CONVERTIR', unidades: 6 }, 6: { modo: 'EMPAQUE' } };
  const r = await migrarBaseV2(id, [], null, { unidades });
  verdadero(r.ok, JSON.stringify(r.verificacion));
  const v3 = await leerHojas(r.idNuevo, NOMBRES_HOJAS);
  const tetra = v3.CATALOGO.find(p => p.presentacion === 'Tetra'), lata = v3.CATALOGO.find(p => p.presentacion === 'Lata');
  igual(tetra.unidadBase, 'tetra'); igual(tetra.stockCache, 24, '4 sixpacks × 6');
  igual(dineroANumero(tetra.costo), 0.66667, '$4.00 ÷ 6 con 5 decimales');
  igual(lata.unidadBase, 'caja'); igual(lata.stockCache, 2);
  const eq = v3.EQUIVALENCIAS.find(e => e.idProducto === tetra.idProducto);
  igual(eq.nombre, 'sixpack'); igual(eq.unidades, 6); igual(eq.nivelInferior, 'tetra');
  const venta = v3.LOG_TRANS.find(m => m.folio === 'FAC-000001');
  igual(venta.cantidad, -12); igual(venta.cantEmpaques, 2); igual(venta.unidPorEmpaque, 6);
  const t = calcularResumenPeriodo(v3.LOG_TRANS, null, null);
  igual(formatearDinero(t.ventas), '$22.00'); igual(formatearDinero(t.inversion), '$47.00'); igual(formatearDinero(t.utilidad), '$5.00');
});

prueba('«empaque de N» sin N no migra y lo dice', async () => {
  const id = crearBaseV2Petit();
  let error = '';
  try { await migrarBaseV2(id, [], null, { unidades: { 5: { modo: 'CONVERTIR' } } }); } catch (e) { error = e.message; }
  verdadero(/cuántas unidades trae el empaque/.test(error), error);
});

// Unión de sabores + «empaque de N» (Kitso, 2026-10-24): la unidad elegida para
// el sabor que queda vale para todos; antes se ignoraba y los fardos pasaban como bolsas.
prueba('sabores unidos: «fardo de N» del que queda convierte a todos los sabores', async () => {
  if (!hayBasePrueba()) return;
  const id = await prepararDemoConBaseV2();
  const datos = await leerBaseV2(id);
  const union = proponerFusiones(datos).find(x => x.tipo === 'VARIANTES');
  union.aceptada = true;
  const N = 20;
  const r = await migrarBaseV2(id, [union], null, { unidades: { [union.destino]: { modo: 'CONVERTIR', unidades: N } } });
  verdadero(r.ok, JSON.stringify(r.verificacion && r.verificacion.errores));
  const v3 = await leerHojas(r.idNuevo, NOMBRES_HOJAS);
  const viejos = datos.CATALOGO.filter(p => union.productos.includes(p.idProducto));
  const destino = v3.CATALOGO.find(p => p.idProducto === union.destino);
  igual(destino.stockCache, viejos.reduce((s, p) => s + p.stockCache, 0) * N, 'todos los sabores × N');
  igual(destino.unidadBase, nombreUnidadV2(viejos[0], 'PRESENTACION'));
  const eqs = v3.EQUIVALENCIAS.filter(e => union.productos.includes(e.idProducto));
  igual(eqs.length, 1, 'un solo empaque, en el que queda');
  igual(eqs[0].idProducto, union.destino); igual(eqs[0].unidades, N);
});
