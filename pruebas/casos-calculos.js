// © 2026 Kitsótaro · KoreStock Ledger · Código disponible, todos los derechos reservados (ver LICENSE).
// Stock derivado (D36), CPP como fondo exacto y APERTURA (V3 §18.3, §21.2).

grupo('Stock derivado y costo promedio');

let _folio = 0;
function mov(tipo, idProducto, cantidad, opciones) {
  const o = opciones || {};
  return Object.assign({
    folio: `T-${++_folio}`, fecha: o.fecha || '2026-01-01', tipo, idProducto, cantidad: tipo === 'VENTA' ? -Math.abs(cantidad) : cantidad,
    bonif: o.bonif || 0, inversion: o.inversion !== undefined ? dinero(o.inversion) : 0, totalVenta: o.cobrado !== undefined ? dinero(o.cobrado) : null,
    utilidad: o.utilidad !== undefined ? dinero(o.utilidad) : null, estado: o.anulada ? 'ANULADA' : '', variante: o.variante || ''
  }, o.extra || {});
}

prueba('criterio §3.6: 2 cartones de 12 + 1 de 30 = 54 huevos; vender 13 deja 41', () => {
  const movs = [mov('ENTRADA', 1, 24, { inversion: 4.40 }), mov('ENTRADA', 1, 30, { inversion: 5.00 }), mov('VENTA', 1, 13)];
  igual(calcularEstadoProductos(movs.slice(0, 2))[1].stock, 54);
  igual(calcularEstadoProductos(movs)[1].stock, 41);
});
prueba('criterio §3.6: 3 cajas × 6 cartones × 30 = 540 huevos y costo por huevo correcto', () => {
  const e = calcularEstadoProductos([mov('ENTRADA', 1, 540, { inversion: 90 })])[1];
  igual(e.stock, 540);
  igual(formatearDinero(e.cpp, { decimales: 5 }), '$0.16667');
});
prueba('anular un movimiento recalcula el stock sin tocar nada más', () => {
  const movs = [mov('ENTRADA', 1, 10, { inversion: 10 }), mov('VENTA', 1, 4)];
  igual(calcularEstadoProductos(movs)[1].stock, 6);
  movs[1].estado = 'ANULADA';
  igual(calcularEstadoProductos(movs)[1].stock, 10);
});
prueba('la bonificación suma unidades y baja el CPP (fórmula v2)', () => {
  const e = calcularEstadoProductos([mov('ENTRADA', 1, 10, { inversion: 10 }), mov('ENTRADA', 1, 10, { inversion: 12, bonif: 2 })])[1];
  igual(e.stock, 22);
  igual(e.bonif, 2);
  igual(formatearDinero(e.cpp, { decimales: 5 }), '$1.00000');
});
prueba('el fondo de costo no pierde centavos al vender en partes', () => {
  const movs = [mov('ENTRADA', 1, 3, { inversion: 10 })];
  for (let i = 0; i < 3; i++) movs.push(mov('VENTA', 1, 1));
  const e = calcularEstadoProductos(movs)[1];
  igual(e.stock, 0); igual(e.fondo, 0);
});
prueba('sabores: vender sin sabor deja «sin asignar» negativo y el total cuadra (§16.6)', () => {
  const movs = [
    mov('ENTRADA', 7, 3, { inversion: 3, variante: 'uva' }), mov('ENTRADA', 7, 3, { inversion: 3, variante: 'fresa' }),
    mov('ENTRADA', 7, 4, { inversion: 4, variante: 'piña' }), mov('VENTA', 7, 5)
  ];
  let e = calcularEstadoProductos(movs)[7];
  igual(e.stock, 5); igual(e.porVariante[''], -5); igual(e.porVariante.uva, 3);
  movs.push(mov('VENTA', 7, 2, { variante: 'uva' }));
  e = calcularEstadoProductos(movs)[7];
  igual(e.stock, 3); igual(e.porVariante.uva, 1);
  movs.push(mov('REASIGNACION', 7, -1, { variante: 'uva' }), mov('REASIGNACION', 7, 1, { variante: '' }));
  e = calcularEstadoProductos(movs)[7];
  igual(e.stock, 3, 'reasignar no cambia el total'); igual(e.porVariante.uva, 0);
});
prueba('cantidades con decimales (libras) sin ruido', () => {
  const e = calcularEstadoProductos([mov('ENTRADA', 2, 10, { inversion: 30 }), mov('VENTA', 2, 0.1), mov('VENTA', 2, 0.2)])[2];
  igual(e.stock, 9.7);
});

grupo('APERTURA y ROI');
prueba('APERTURA no cuenta como compra en ROI ni en el resumen', () => {
  const movs = [mov('APERTURA', 1, 50, { inversion: 100 }), mov('VENTA', 1, 5, { cobrado: 15, utilidad: 5, fecha: '2026-01-02' })];
  const roi = calcularROI(movs, '2026-01-01', '2026-01-31');
  igual(roi.inversionGlobal, 0);
  igual(calcularResumenPeriodo(movs, '2026-01-01', '2026-01-31').inversion, 0);
  igual(calcularEstadoProductos(movs)[1].stock, 45);
});
prueba('rotar con APERTURA da el mismo stock y CPP que el historial completo (base de prueba)', async () => {
  if (!hayBasePrueba()) return;
  DriveDemo.persistir = false; DriveDemo.reiniciar(); Hoja.usar(MotorDemo);
  const id = cargarBasePruebaEnDemo(leerArchivoBinario(RUTA_BASE_PRUEBA));
  const r = await migrarBaseV2(id, []);
  const v3 = await leerHojas(r.idNuevo, NOMBRES_HOJAS);
  const corte = '2026-08-31';
  const completo = calcularEstadoProductos(v3.LOG_TRANS);
  const alCorte = calcularEstadoProductos(v3.LOG_TRANS, { hasta: corte });
  const aperturas = construirAperturas(alCorte, v3.CATALOGO, sumarDias(corte, 1), sumarDias(corte, 1) + ' 00:00:00');
  const rotado = aperturas.concat(v3.LOG_TRANS.filter(m => m.fecha > corte));
  const despues = calcularEstadoProductos(rotado);
  Object.keys(completo).forEach(idp => {
    igual(despues[idp].stock, completo[idp].stock, `stock ${idp}`);
    igual(despues[idp].cpp, completo[idp].cpp, `CPP ${idp}`);
  });
  // Y el ROI de septiembre-octubre es idéntico con y sin rotar.
  const a = calcularROI(v3.LOG_TRANS, '2026-09-01', '2026-10-31'), b = calcularROI(rotado, '2026-09-01', '2026-10-31');
  igual(a.gananciaGlobal, b.gananciaGlobal); igual(a.inversionGlobal, b.inversionGlobal);
});

grupo('Equilibrio, combustible y resumen');
prueba('punto de equilibrio = gastos ÷ margen; sin margen no hay punto', () => {
  const movs = [mov('VENTA', 1, 10, { cobrado: 100, utilidad: 25 })];
  const gastos = [{ fecha: '2026-01-05', monto: dinero(50), estado: '' }, { fecha: '2026-01-06', monto: dinero(999), estado: 'ANULADO' }];
  const r = calcularPuntoEquilibrio(movs, gastos, '2026-01-01', '2026-01-31');
  igual(formatearDinero(r.gastosFijos), '$50.00');
  igual(formatearDinero(r.puntoEquilibrio), '$200.00');
  igual(calcularPuntoEquilibrio([], gastos, '2026-01-01', '2026-01-31').puntoEquilibrio, null);
});
prueba('rendimiento por carga y resumen del período', () => {
  const cargas = [
    { folio: 'CB-1', fecha: '2026-01-01', timestamp: '2026-01-01 08:00:00', placa: 'P1', odometro: 1000, galones: 5, monto: dinero(20), estado: '' },
    { folio: 'CB-2', fecha: '2026-01-05', timestamp: '2026-01-05 08:00:00', placa: 'P1', odometro: 1150, galones: 5, monto: dinero(20), estado: '' }
  ];
  igual(calcularRendimientos(cargas).get('CB-2').rendimiento, 30);
  igual(calcularRendimientos(cargas).get('CB-1').rendimiento, null);
  const r = calcularResumenCombustible(cargas, '2026-01-02', '2026-01-31');
  igual(r.P1.km, 150);
});
prueba('el resumen cuenta tickets y unidades', () => {
  const movs = [mov('VENTA', 1, 2, { cobrado: 2, utilidad: 1, extra: { idTicket: 'TK-1' } }), mov('VENTA', 2, 1, { cobrado: 1, utilidad: 0.5, extra: { idTicket: 'TK-1' } })];
  const r = calcularResumenPeriodo(movs, '2026-01-01', '2026-01-01');
  igual(r.nTickets, 1); igual(r.unidadesVendidas, 3); igual(formatearDinero(r.ventas), '$3.00');
});

prueba('equilibrio con la base de prueba completa coincide con el cálculo a mano (D51)', async () => {
  if (!hayBasePrueba()) return;
  DriveDemo.persistir = false; DriveDemo.reiniciar(); Hoja.usar(MotorDemo);
  const id = cargarBasePruebaEnDemo(leerArchivoBinario(RUTA_BASE_PRUEBA));
  const r = await migrarBaseV2(id, []);
  const v3 = await leerHojas(r.idNuevo, NOMBRES_HOJAS);
  const ini = '2026-09-01', fin = '2026-09-30';
  let gastos = 0, ventas = 0, util = 0;
  v3.COSTOS_OPERATIVOS.forEach(g => { if (g.estado !== 'ANULADO' && g.fecha >= ini && g.fecha <= fin) gastos += dineroANumero(g.monto); });
  v3.LOG_TRANS.forEach(m => { if (m.tipo === 'VENTA' && m.estado !== 'ANULADA' && m.fecha >= ini && m.fecha <= fin) { ventas += dineroANumero(m.totalVenta); util += dineroANumero(m.utilidad); } });
  const esperado = gastos / (util / ventas);
  const e = calcularPuntoEquilibrio(v3.LOG_TRANS, v3.COSTOS_OPERATIVOS, ini, fin);
  verdadero(Math.abs(dineroANumero(e.puntoEquilibrio) - esperado) < 0.01, `${dineroANumero(e.puntoEquilibrio)} vs ${esperado}`);
  verdadero(gastos > 600 && ventas > 800, 'septiembre tiene gastos y ventas');
});

grupo('Utilidad con costo promedio (interruptor del Dashboard)');
prueba('10 a $1 + 10 a $2; vender 5 a $10: guardada $0 (último costo), con promedio $2.50', () => {
  const movs = [mov('ENTRADA', 1, 10, { inversion: 10 }), mov('ENTRADA', 1, 10, { inversion: 20, fecha: '2026-01-02' }),
    mov('VENTA', 1, 5, { cobrado: 10, utilidad: 0, fecha: '2026-01-03' })];
  igual(formatearDinero(calcularResumenPeriodo(movs, null, null).utilidad), '$0.00');
  const r = calcularUtilidadCostoPromedio(movs, '2026-01-03', '2026-01-03');
  igual(formatearDinero(r.costo), '$7.50'); igual(formatearDinero(r.utilidad), '$2.50');
  // Ventas fuera del período no suman, pero sí mueven el fondo.
  const mas = movs.concat([mov('VENTA', 1, 5, { cobrado: 10, fecha: '2026-01-04' })]);
  igual(formatearDinero(calcularUtilidadCostoPromedio(mas, '2026-01-04', '2026-01-04').utilidad), '$2.50');
});
