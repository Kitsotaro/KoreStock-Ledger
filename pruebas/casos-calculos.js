// © 2026 KoreStock Ledger — un proyecto de Kitsótaro · Código disponible, todos los derechos reservados (ver LICENSE).
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
prueba('bonificaciones primero: suman stock, no bajan el CPP de lo pagado y salen antes al vender (Kitso 2026-10-24)', () => {
  // 10 a $1.00 + 10 a $1.20 con 2 gratis → 22 en bodega; pagadas 20 por $22.00 → CPP $1.10.
  const compras = [mov('ENTRADA', 1, 10, { inversion: 10 }), mov('ENTRADA', 1, 10, { inversion: 12, bonif: 2 })];
  const e = calcularEstadoProductos(compras)[1];
  igual(e.stock, 22); igual(e.bonif, 2); igual(e.bonifEnBodega, 2);
  igual(formatearDinero(e.cpp, { decimales: 5 }), '$1.10000');
  // Vender 3: salen las 2 gratis ($0) y 1 pagada ($1.10).
  const salidas = [];
  const d = calcularEstadoProductos(compras.concat([mov('VENTA', 1, 3, { cobrado: 4.5, utilidad: 0 })]), { alSalir: (m, x) => salidas.push(x) })[1];
  igual(formatearDinero(salidas[0]), '$1.10'); igual(d.bonifEnBodega, 0); igual(d.stock, 19);
  igual(formatearDinero(d.fondo), '$20.90'); igual(formatearDinero(d.cpp, { decimales: 5 }), '$1.10000');
});
prueba('venta antes de su compra: lo vendido de más se cubre con la próxima entrada y «Real» no se infla (Kitso 2026-10-24)', () => {
  // Vende 8 sin stock; luego compra 13 a $6.75 c/u con 2 gratis; luego compra 15 más.
  const movs = [mov('VENTA', 1, 8), mov('ENTRADA', 1, 13, { inversion: 87.75, bonif: 2 }), mov('ENTRADA', 1, 15, { inversion: 101.25 })];
  const e = calcularEstadoProductos(movs)[1];
  igual(e.stock, 22); igual(e.faltante, 0);
  igual(e.unidadesFondo + e.bonifEnBodega, 22, 'pagadas + gratis = stock');
  igual(formatearDinero(e.fondo), '$135.00', '20 pagadas × $6.75 (las 2 gratis van aparte)');
  const v = valorBodega([{ idProducto: 1, costo: dinero(6.75), estado: ESTADOS.ACTIVO }], { 1: e });
  verdadero(v.real <= v.bruto, 'el real nunca supera al neto sin gratis de por medio');
});
prueba('ajuste por conteo: la merma sale a costo promedio sin ser venta; el sobrante entra a $0 como gratis (Kitso 2026-10-24)', () => {
  // 10 a $1.00 con 2 gratis → 12. Conteo físico: 9 → merma de 3 (salen 2 gratis y 1 pagada = $1.00).
  const base = [mov('ENTRADA', 1, 10, { inversion: 10, bonif: 2 })];
  const salidas = [];
  const e = calcularEstadoProductos(base.concat([mov('AJUSTE', 1, -3)]), { alSalir: (m, x) => salidas.push(x) })[1];
  igual(e.stock, 9); igual(e.bonifEnBodega, 0); igual(e.unidadesFondo, 9);
  igual(formatearDinero(e.merma), '$1.00'); igual(e.unidadesMerma, 3);
  igual(e.unidadesVendidas, 0, 'no cuenta como venta'); igual(salidas.length, 0, 'no entra al costo de lo vendido');
  // Conteo físico: 14 → sobran 2: entran a $0 como gratis; el fondo no cambia.
  const s2 = calcularEstadoProductos(base.concat([mov('AJUSTE', 1, 2)]))[1];
  igual(s2.stock, 14); igual(s2.bonifEnBodega, 4); igual(formatearDinero(s2.fondo), '$10.00'); igual(s2.unidadesCompradas, 12, 'el sobrante no cuenta como compra');
  // Ninguno toca ventas, ganancia ni inversión del período.
  const r = calcularResumenPeriodo(base.concat([mov('AJUSTE', 1, -3), mov('AJUSTE', 1, 2)]), null, null);
  igual(formatearDinero(r.ventas), '$0.00'); igual(formatearDinero(r.inversion), '$10.00');
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
  // Período que incluye la primera carga: sus galones no se recorrieron en esos km (ronda de matemática).
  const todo = calcularResumenCombustible(cargas, '2026-01-01', '2026-01-31');
  igual(todo.P1.km, 150); igual(todo.P1.galones, 10, 'lo cargado sí suma'); igual(todo.P1.rendimiento, 30, '150 km ÷ 5 gal, no ÷ 10');
});
prueba('proyección: «últimos 30 días» son 30 días contando hoy', () => {
  const movs = [mov('ENTRADA', 1, 100, { fecha: '2026-01-01' }), mov('VENTA', 1, 30, { fecha: '2026-01-31' }), mov('VENTA', 1, 60, { fecha: '2026-03-02' })];
  // 2026-03-02 menos 29 días = 2026-02-01: la venta del 31 de enero queda fuera.
  const r = calcularProyeccion(movs, { 1: { stock: 10 } }, 30, '2026-03-02');
  igual(r[1].ventasVentana, 60); igual(r[1].ritmoDiario, 2); igual(r[1].diasRestantes, 5);
});
prueba('ventas de la v2 sin ticket cuentan una por folio', () => {
  const movs = [mov('VENTA', 1, 1, { cobrado: 1, utilidad: 0 }), mov('VENTA', 2, 1, { cobrado: 1, utilidad: 0 })];
  igual(calcularResumenPeriodo(movs, null, null).nTickets, 2);
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

grupo('Colores de la leyenda (hoja COLORES)');
prueba('vale el último color de cada nivel y nombre; vacío vuelve al automático', () => {
  const antes = Almacen.hojas.COLORES;
  Almacen.hojas.COLORES = [
    { nivel: 'marca', nombre: 'Pepsi', color: '#112233' },
    { nivel: 'marca', nombre: 'Diana', color: '#445566' },
    { nivel: 'marca', nombre: 'pepsi', color: '#AABBCC' }
  ];
  igual(Almacen.colorGrafico('marca', 'Pepsi'), '#AABBCC');
  igual(Almacen.colorGrafico('linea', 'Pepsi'), '');
  Almacen.hojas.COLORES.push({ nivel: 'marca', nombre: 'Pepsi', color: '' });
  igual(Almacen.colorGrafico('marca', 'Pepsi'), '');
  igual(Almacen.colorGrafico('marca', 'Diana'), '#445566');
  Almacen.hojas.COLORES = antes;
});

grupo('Decisiones de Kitso 2026-10-23: valor de bodega y comparación');
prueba('valor neto incluye lo gratis; real = pagadas que quedan; bonificación = gratis que quedan', () => {
  // 10 pagadas a $1 + 10 gratis; se venden 15 → salen las 10 gratis y 5 pagadas: quedan 5 pagadas ($5).
  const movs = [mov('ENTRADA', 1, 10, { inversion: 10, bonif: 10 }), mov('VENTA', 1, 15, { cobrado: 30, utilidad: 15 })];
  const v = valorBodega([{ idProducto: 1, costo: dinero(1) }], calcularEstadoProductos(movs));
  igual(formatearDinero(v.bruto), '$5.00', '5 en bodega × $1');
  igual(formatearDinero(v.real), '$5.00', 'las gratis salieron primero');
  igual(formatearDinero(v.bonificacion), '$0.00');
  // Si solo se venden 4: quedan 6 gratis y 10 pagadas → real $10, bonificación 6 × $1 = $6.
  const w = valorBodega([{ idProducto: 1, costo: dinero(1) }], calcularEstadoProductos([movs[0], mov('VENTA', 1, 4, { cobrado: 8, utilidad: 4 })]));
  igual(formatearDinero(w.bruto), '$16.00'); igual(formatearDinero(w.real), '$10.00'); igual(formatearDinero(w.bonificacion), '$6.00');
});
prueba('«Este mes» en curso se compara con los mismos días del mes anterior', () => {
  const p = periodoComparable('2026-10-01', '2026-10-31', 'MES', '2026-10-23');
  igual(p.inicio, '2026-09-01'); igual(p.fin, '2026-09-23'); igual(p.finActual, '2026-10-23');
  const s = periodoComparable('2026-10-19', '2026-10-25', 'SEMANA', '2026-10-21'); // miércoles
  igual(s.inicio, '2026-10-12'); igual(s.fin, '2026-10-14');
  const m = periodoComparable('2026-03-01', '2026-03-31', 'MES', '2026-03-31'); // mes completo; febrero tiene 28
  igual(m.inicio, '2026-02-01'); igual(m.fin, '2026-02-28');
  const a = periodoComparable('2026-10-01', '2026-10-31', 'MES_ANTERIOR', '2026-11-05');
  igual(a.inicio, '2026-09-01'); igual(a.fin, '2026-09-30');
  const x = periodoComparable('2026-10-10', '2026-10-19', 'PERSONALIZADO', '2026-10-23');
  igual(x.inicio, '2026-09-30'); igual(x.fin, '2026-10-09');
});

grupo('Total en bodega por empaque (Kitso, 2026-10-24)');
prueba('cada producto usa su propio empaque, no el de otro con la misma unidad', () => {
  const antes = Almacen.hojas;
  Almacen.cargar({
    CATALOGO: [
      { idProducto: 1, sku: 'Q', marca: 'Diana', linea: 'Quesitos', unidadBase: 'bolsa', estado: ESTADOS.ACTIVO },
      { idProducto: 2, sku: 'T', marca: 'Diana', linea: 'Tortillitas', unidadBase: 'bolsa', estado: ESTADOS.ACTIVO },
      { idProducto: 3, sku: 'T2', marca: 'Diana', linea: 'Tortillitas', unidadBase: 'bolsa', estado: ESTADOS.FUSIONADO, fusionadoEn: 2 },
      { idProducto: 4, sku: 'N', marca: 'Nivea', linea: 'Crema', unidadBase: 'frasco', estado: ESTADOS.ACTIVO }
    ],
    EQUIVALENCIAS: [
      { idEquiv: 1, nombre: 'caja', unidades: 24, nivelInferior: 'bolsa', idProducto: 1 },
      { idEquiv: 2, nombre: 'fardo', unidades: 20, nivelInferior: 'bolsa', idProducto: 3 }
    ]
  });
  igual(Almacen.empaqueMayor(1).nombre, 'caja');
  igual(Almacen.empaqueMayor(2).nombre, 'fardo', 'el del sabor unido, no la caja de Quesitos');
  igual(Almacen.empaqueMayor(4), null, 'sin empaque propio no toma ninguno');
  Almacen.cargar(antes);
});
