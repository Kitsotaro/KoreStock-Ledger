// © 2026 Wilber Adonay Escobar Solórzano (Kitsótaro) · KoreStock Ledger · Código disponible, todos los derechos reservados (ver LICENSE).
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
