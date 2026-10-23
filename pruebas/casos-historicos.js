// © 2026 Wilber Adonay Escobar Solórzano (Kitsótaro) · KoreStock Ledger · Código disponible, todos los derechos reservados (ver LICENSE).
// Archivo histórico, períodos largos y carga (V3 §18.4, §21.2, §22.3 punto 1, §22.5).

grupo('Archivo histórico y períodos largos');

prueba('cuándo toca archivar: 6 meses o tope de filas', () => {
  const movs = [{ fecha: '2026-04-01', estado: '' }, { fecha: '2026-09-15', estado: '' }];
  igual(necesitaRotacion(movs, '2026-09-30').rotar, false);
  igual(necesitaRotacion(movs, '2026-10-01').rotar, true);
  const muchas = { length: FILAS_PARA_ROTAR, [Symbol.iterator]: function* () { yield { fecha: '2026-09-01', estado: '' }; } };
  const r = necesitaRotacion(muchas, '2026-09-02');
  verdadero(r.rotar && r.porVolumen && !r.porTiempo, 'por volumen');
});

prueba('§18.4: archivar conserva stock, sabores, CPP, bodega, ventas del mes y folios', async () => {
  if (!hayBasePrueba()) return;
  const id = await abrirBasePruebaV3(false);
  const hojas = await leerHojas(id, NOMBRES_HOJAS);
  const rot = prepararRotacion(hojas, { hoy: '2026-10-21' });
  const ver = verificarRotacion(hojas, rot);
  verdadero(ver.ok, ver.errores.slice(0, 5).join('; '));
  verdadero(rot.hojas.LOG_TRANS.length < hojas.LOG_TRANS.length / 2, 'la base nueva es mucho más chica');
  verdadero(rot.hojas.LOG_TRANS.some(m => m.tipo === TIPOS_MOV.APERTURA));
  // La APERTURA no cuenta como compra.
  const a = calcularResumenPeriodo(rot.hojas.LOG_TRANS, null, null);
  const b = calcularResumenPeriodo(hojas.LOG_TRANS.filter(m => m.fecha >= rot.corte), null, null);
  igual(a.inversion, b.inversion, 'inversión solo del mes');
  // Cada vehículo conserva su carga anterior para el rendimiento.
  hojas.VEHICULOS.forEach(v => {
    const tenia = hojas.COSTOS_COMBUSTIBLE.some(c => c.placa === v.placa && esGastoValido(c));
    if (tenia) verdadero(rot.hojas.COSTOS_COMBUSTIBLE.some(c => c.placa === v.placa && esGastoValido(c)), `carga de ${v.placa}`);
  });
});

prueba('§18.4.2 y §21.2: tras archivar, folios siguen y el semestre con históricos da lo mismo', async () => {
  if (!hayBasePrueba()) return;
  const id = await abrirBasePruebaV3(false);
  const completo = await leerHojas(id, NOMBRES_HOJAS);
  const ultimoFAC = completo.LOG_TRANS.filter(m => String(m.folio).startsWith('FAC-')).map(m => m.folio).sort().pop();
  const r = await rotarBase(id);
  verdadero(r.ok, (r.errores || []).slice(0, 5).join('; '));
  // Respaldo previo hecho; la anterior quedó como histórico y la nueva como principal.
  verdadero((await listarRespaldos(id)).length >= 1, 'respaldo antes de archivar');
  igual(DriveDemo.archivo(id).propiedades.tipo, 'historico');
  igual(DriveDemo.archivo(r.idNuevo).propiedades.tipo, 'principal');
  await abrirBase(r.idNuevo);
  verdadero(Almacen.verFolioSiguiente('FAC-') > ultimoFAC, 'el siguiente folio no repite');
  igual(necesitaRotacion(Almacen.movimientos, '2026-10-21').rotar, false);

  const lista = historicosParaPeriodo(await listarHistoricos(), '2026-04-01', '2026-10-21');
  igual(lista.length, 1);
  const hist = await cargarHistoricos(lista);
  const unida = unirConHistoricos(Almacen.hojas, hist);
  const reales = (l) => l.filter(m => esMovValido(m) && m.tipo !== TIPOS_MOV.APERTURA).length;
  igual(reales(unida.LOG_TRANS), reales(completo.LOG_TRANS), 'sin duplicados');
  igual(unida.LOG_TRANS.filter(m => m.tipo === TIPOS_MOV.APERTURA).length, completo.LOG_TRANS.filter(m => m.tipo === TIPOS_MOV.APERTURA).length, 'solo la APERTURA del archivo más antiguo');
  const ini = '2026-04-01', fin = '2026-10-21';
  const roiA = calcularROI(completo.LOG_TRANS, ini, fin), roiB = calcularROI(unida.LOG_TRANS, ini, fin);
  igual(roiB.gananciaGlobal, roiA.gananciaGlobal); igual(roiB.inversionGlobal, roiA.inversionGlobal);
  const resA = calcularResumenPeriodo(completo.LOG_TRANS, ini, fin), resB = calcularResumenPeriodo(unida.LOG_TRANS, ini, fin);
  igual(resB.ventas, resA.ventas); igual(resB.utilidad, resA.utilidad);
  // CPP idéntico con la APERTURA (solo principal) y recorriendo todo el historial.
  const conAp = calcularEstadoProductos(Almacen.movimientos), sinAp = calcularEstadoProductos(unida.LOG_TRANS);
  Object.keys(conAp).forEach(p => { igual(sinAp[p].cpp, conAp[p].cpp, `CPP ${p}`); igual(sinAp[p].stock, conAp[p].stock, `stock ${p}`); });
  // Filtrar por cliente en fecha antigua.
  const conCliente = completo.LOG_TRANS.find(m => m.idCliente && m.fecha < '2026-08-01');
  if (conCliente) {
    const f = (m) => m.idCliente === conCliente.idCliente;
    igual(calcularResumenPeriodo(unida.LOG_TRANS, ini, fin, f).ventas, calcularResumenPeriodo(completo.LOG_TRANS, ini, fin, f).ventas, 'por cliente');
  }
  // Gastos y combustible del semestre.
  const gA = sumarDinero(completo.COSTOS_OPERATIVOS.filter(esGastoValido).map(g => g.monto));
  const gB = sumarDinero(unida.COSTOS_OPERATIVOS.filter(esGastoValido).map(g => g.monto));
  igual(gB, gA, 'gastos');
});

grupo('Carga (§22.5)');

prueba('500 ventas con carrito en un día: folios únicos y stock exacto', async () => {
  if (!hayBasePrueba()) return;
  await abrirBasePruebaV3(false);
  const productos = Almacen.productosActivos().slice(0, 6);
  // Mercadería suficiente para el día.
  await ColaEscritura.ejecutar(operacionGuardarTicket(prepararEntrada({
    lineas: productos.map(p => ({ producto: p.idProducto, cantEmpaques: 1000, unidPorEmpaque: 1, totalPagado: dinero(500) })) })));
  const esperado = new Map(productos.map(p => [p.idProducto, Almacen.stock(p.idProducto)]));
  // Sin la pausa entre escrituras (protege la cuota de Google, no al motor de prueba).
  ColaEscritura.esperaMinimaMs = 0;
  const inicio = Date.now();
  try {
    for (let i = 0; i < 500; i++) {
      const a = productos[i % productos.length], b = productos[(i + 1) % productos.length];
      const prep = prepararVenta({ lineas: [{ idProducto: a.idProducto, cantidad: 1, totalCobrado: dinero('1.00') }, { idProducto: b.idProducto, cantidad: 1, totalCobrado: dinero('1.00') }] });
      await ColaEscritura.ejecutar(operacionGuardarTicket(prep));
      esperado.set(a.idProducto, esperado.get(a.idProducto) - 1); esperado.set(b.idProducto, esperado.get(b.idProducto) - 1);
    }
  } finally { ColaEscritura.esperaMinimaMs = ESPERA_MINIMA_ENTRE_ESCRITURAS_MS; }
  const ms = Date.now() - inicio;
  const folios = Almacen.movimientos.map(m => m.folio);
  igual(new Set(folios).size, folios.length, 'sin folios repetidos');
  esperado.forEach((q, idp) => igual(Almacen.stock(idp), redondearCantidad(q), `stock ${idp}`));
  await abrirBase(Almacen.baseId);
  esperado.forEach((q, idp) => igual(Almacen.stock(idp), redondearCantidad(q), `al releer, stock ${idp}`));
  verdadero(ms < 60000, `tardó ${ms} ms`);
  // Calcular todo con 100 000 filas sigue siendo usable.
  const grandes = [];
  while (grandes.length < 100000) grandes.push(...Almacen.movimientos);
  const t = Date.now();
  calcularEstadoProductos(grandes.slice(0, 100000));
  calcularResumenPeriodo(grandes.slice(0, 100000), null, null);
  verdadero(Date.now() - t < 5000, `cálculo de 100 000 filas: ${Date.now() - t} ms`);
});
