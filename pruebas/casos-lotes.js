// © 2026 Kitsótaro · KoreStock Ledger · Código disponible, todos los derechos reservados (ver LICENSE).
// Acciones por lote y reversión (V3 §9.5, §10.1).

grupo('Corrección de precio por lote y reversión');

prueba('caso real §9.2: las ventas de huevo a $5.75 pasan a $5.25 con vista previa', async () => {
  if (!hayBasePrueba()) return;
  await abrirBasePruebaV3(false);
  const huevo = productoPor('Huevo Grande', p => p.volumen === '30');
  const prep = prepararCorreccionPrecio({ idProducto: huevo.idProducto, inicio: '2026-06-30', fin: '2026-07-07', precio: dinero('5.25') });
  igual(prep.cambios.length, 7, 'las 7 ventas plantadas');
  const unidades = prep.cambios.reduce((s, c) => s + Math.abs(c.original.cantidad), 0);
  igual(prep.diferenciaUtilidad, -multiplicarDinero(dinero('0.50'), unidades), 'pierde 0.50 por cartón');
  const antes = JSON.stringify(Almacen.movimientos.map(m => Object.assign({}, m, { estado: undefined })));
  const stockAntes = Almacen.stock(huevo.idProducto);
  const r = await ColaEscritura.ejecutar(operacionCorreccionPrecio(prep));
  igual(r.nuevas, 7); igual(r.anuladas, 7);
  igual(Almacen.stock(huevo.idProducto), stockAntes, 'el stock no cambia');
  // Ninguna fila vieja cambió salvo su estado.
  const despues = Almacen.movimientos.slice(0, JSON.parse(antes).length).map(m => Object.assign({}, m, { estado: undefined }));
  igual(JSON.stringify(despues), antes, 'el ledger no se edita');
  const nuevas = Almacen.movimientos.filter(m => m.referencia && m.referencia.startsWith('Corrige'));
  verdadero(nuevas.every(m => m.totalVenta === multiplicarDinero(dinero('5.25'), Math.abs(m.cantidad))));
});

prueba('§10.1: corregir 20+ ventas y revertir deja stock, ventas y utilidad idénticos', async () => {
  if (!hayBasePrueba()) return;
  await abrirBasePruebaV3(false);
  const pepsi = productoPor('Pepsi', p => p.volumen === '600 ml');
  const ini = '2026-08-01', fin = '2026-08-31';
  const foto = () => ({ s: Almacen.stock(pepsi.idProducto), r: calcularResumenPeriodo(Almacen.movimientos, ini, fin) });
  const a = foto();
  const prep = prepararCorreccionPrecio({ idProducto: pepsi.idProducto, inicio: ini, fin, precio: dinero('1.10') });
  verdadero(prep.cambios.length >= 20, `${prep.cambios.length} ventas`);
  const r = await ColaEscritura.ejecutar(operacionCorreccionPrecio(prep));
  verdadero(foto().r.ventas !== a.r.ventas, 'la corrección cambió las ventas');
  const rev = revisarReversion(r.accion.idAccion);
  igual(rev.faltantes.length, 0);
  await ColaEscritura.ejecutar(operacionRevertir(r.accion.idAccion));
  const b = foto();
  igual(b.s, a.s); igual(b.r.ventas, a.r.ventas); igual(b.r.utilidad, a.r.utilidad);
  igual(estadoAccion(Almacen.hojas.LOG_ACCIONES.find(x => x.idAccion === r.accion.idAccion)), 'REVERTIDA');
  await lanza(() => operacionRevertir(r.accion.idAccion), 'no se revierte dos veces');
  // Y queda igual al releer de Drive.
  await abrirBase(Almacen.baseId);
  const c = foto();
  igual(c.r.ventas, a.r.ventas);
});

prueba('ticket anulado y revertido; pasados 7 días ya no se revierte', async () => {
  if (!hayBasePrueba()) return;
  await abrirBasePruebaV3(false);
  const p = productoPor('Churritos');
  const prep = prepararVenta({ lineas: [{ idProducto: p.idProducto, cantidad: 2, totalCobrado: dinero('0.80') }, { idProducto: p.idProducto, cantidad: 1, totalCobrado: dinero('0.40') }] });
  await ColaEscritura.ejecutar(operacionGuardarTicket(prep));
  const stock = Almacen.stock(p.idProducto);
  await ColaEscritura.ejecutar(operacionAnular(prep.filas.map(f => f.folio), { tipo: 'ANULACION_TICKET', alcance: prep.idTicket }));
  const accion = Almacen.hojas.LOG_ACCIONES[Almacen.hojas.LOG_ACCIONES.length - 1];
  igual(Almacen.stock(p.idProducto), stock + 3);
  await ColaEscritura.ejecutar(operacionRevertir(accion.idAccion));
  igual(Almacen.stock(p.idProducto), stock, 'el ticket vuelve a contar');
  igual(estadoAccion({ tipo: 'ANULACION_TICKET', estado: 'VIGENTE', timestamp: '2026-10-01 10:00:00' }, '2026-10-21'), 'EXPIRADA');
  igual(estadoAccion({ tipo: 'MIGRACION', estado: 'VIGENTE', timestamp: '2026-10-21 10:00:00' }, '2026-10-21'), 'NO_REVERTIBLE');
});

prueba('revertir avisa si el stock no alcanza', async () => {
  if (!hayBasePrueba()) return;
  await abrirBasePruebaV3(false);
  const p = productoPor('Pepsi Black');
  const s = Almacen.stock(p.idProducto);
  const prep = prepararVenta({ lineas: [{ idProducto: p.idProducto, cantidad: s, totalCobrado: dinero(10) }] });
  await ColaEscritura.ejecutar(operacionGuardarTicket(prep));
  await ColaEscritura.ejecutar(operacionAnular([prep.filas[0].folio], { tipo: 'ANULACION_TICKET', alcance: prep.idTicket }));
  const accion = Almacen.hojas.LOG_ACCIONES[Almacen.hojas.LOG_ACCIONES.length - 1];
  // Se vuelve a vender todo antes de revertir: ya no alcanza.
  const prep2 = prepararVenta({ lineas: [{ idProducto: p.idProducto, cantidad: s, totalCobrado: dinero(10) }] });
  await ColaEscritura.ejecutar(operacionGuardarTicket(prep2));
  igual(revisarReversion(accion.idAccion).faltantes.length, 1);
});

grupo('Sabores (§16.6)');
prueba('Gatorade: 3 uva, 3 fresa, 4 piña; vender 5 sin sabor; vender 2 de uva; repartir', async () => {
  if (!hayBasePrueba()) return;
  await abrirBasePruebaV3(false);
  const nuevo = { marca: 'Gatorade', linea: 'Gatorade', presentacion: 'Botella', volumen: '500 ml', unidadBase: 'botella' };
  const prep = prepararEntrada({ lineas: [
    { nuevo, cantEmpaques: 3, unidPorEmpaque: 1, totalPagado: dinero(3), variante: 'uva' },
    { nuevo, cantEmpaques: 3, unidPorEmpaque: 1, totalPagado: dinero(3), variante: 'fresa' },
    { nuevo, cantEmpaques: 4, unidPorEmpaque: 1, totalPagado: dinero(4), variante: 'piña' }] });
  await ColaEscritura.ejecutar(operacionGuardarTicket(prep));
  const g = Almacen.productos.find(p => p.marca === 'Gatorade');
  igual(Almacen.productos.filter(p => p.marca === 'Gatorade').length, 1, 'un solo producto aunque tenga 3 sabores');
  await ColaEscritura.ejecutar(operacionGuardarTicket(prepararVenta({ lineas: [{ idProducto: g.idProducto, cantidad: 5, totalCobrado: dinero(6) }] })));
  let e = Almacen.estado(g.idProducto);
  igual(e.stock, 5); igual(e.porVariante[''], -5); igual(e.porVariante.uva + e.porVariante.fresa + e.porVariante['piña'] + e.porVariante[''], 5);
  await ColaEscritura.ejecutar(operacionGuardarTicket(prepararVenta({ lineas: [{ idProducto: g.idProducto, cantidad: 2, totalCobrado: dinero(2.4), variante: 'uva' }] })));
  e = Almacen.estado(g.idProducto);
  igual(e.porVariante.uva, 1); igual(e.stock, 3);
  await ColaEscritura.ejecutar(operacionGuardarTicket(prepararReasignacion(g.idProducto, [{ variante: 'fresa', unidades: 3 }, { variante: 'piña', unidades: 2 }])));
  e = Almacen.estado(g.idProducto);
  igual(e.stock, 3, 'repartir no cambia el total'); igual(e.porVariante[''], 0); igual(e.porVariante.fresa, 0); igual(e.porVariante['piña'], 2);
  igual(formatearDinero(e.fondo), formatearDinero(Almacen.estado(g.idProducto).fondo));
});
