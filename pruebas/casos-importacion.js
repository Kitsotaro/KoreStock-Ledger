// © 2026 Kitsótaro · KoreStock Ledger · Código disponible, todos los derechos reservados (ver LICENSE).
// Importación Excel (T36: fechas sin corrimiento de día) y clientes.

grupo('Importación Excel y fechas (T36)');

prueba('las fechas de Excel no se corren un día en UTC−6', () => {
  igual(normalizarFechaImportada(46315), '2026-10-20');
  igual(normalizarFechaImportada(46315.99), '2026-10-20', 'una fecha con hora sigue en el mismo día');
  igual(normalizarFechaImportada(new Date(2026, 9, 20, 23, 30)), '2026-10-20', 'Date a las 23:30 locales');
  igual(normalizarFechaImportada('20/10/2026'), '2026-10-20', 'día/mes/año');
  igual(normalizarFechaImportada('2026-10-20'), '2026-10-20');
  igual(normalizarFechaImportada('mañana'), null);
});

prueba('analiza filas: entrada nueva, venta existente, errores y stock negativo', async () => {
  if (!hayBasePrueba()) return;
  await abrirBasePruebaV3(false);
  const agua = productoPor('Agua', p => p.volumen === '600 ml');
  const a = analizarFilasImportadas([
    { 'Fecha': '2026-10-21', 'Marca': 'Gatorade', 'Producto': 'Gatorade', 'Presentacion': 'Botella', 'Contenido_Vol': '500 ml', 'Cantidad': 24, 'Cantidad_Bonificada': 0, 'Precio_Distribuidor': 0.75, 'Precio_Consumidor': 1.25, 'Variante': 'Uva', 'Unidad_Base': 'botella' },
    { 'Fecha': '21/10/2026', 'Marca': 'Cristal', 'Producto': 'Agua', 'Presentacion': 'Botella', 'Contenido_Vol': '600ml', 'Cantidad': -(Almacen.stock(agua.idProducto) + 2), 'Precio_Consumidor': '' },
    { 'Fecha': '', 'Marca': '', 'Producto': 'X', 'Cantidad': 1 },
    { 'Fecha': '2026-10-21', 'Marca': 'Nadie', 'Producto': 'Nada', 'Cantidad': -1 }
  ]);
  igual(a.entradas.length, 1); igual(a.ventas.length, 1); igual(a.errores.length, 2);
  igual(a.advertencias.length, 1, 'stock negativo es aviso, no error');
  igual(a.nuevos, 1);
  igual(a.ventas[0].idProducto, agua.idProducto, '«600ml» y «600 ml» son el mismo producto');
  const prep = prepararEntrada({ lineas: a.entradas });
  await ColaEscritura.ejecutar(operacionGuardarTicket(prep));
  const g = Almacen.productos.find(p => p.marca === 'Gatorade');
  igual(Almacen.stock(g.idProducto), 24); igual(Almacen.estado(g.idProducto).porVariante.Uva, 24);
  const pv = prepararVenta({ lineas: a.ventas, permitirNegativo: true });
  await ColaEscritura.ejecutar(operacionGuardarTicket(pv));
  igual(Almacen.stock(agua.idProducto), -2);
});

grupo('Clientes (§10.3)');
prueba('vender a un cliente, renombrarlo y el historial conserva la relación', async () => {
  if (!hayBasePrueba()) return;
  await abrirBasePruebaV3(false);
  const op = operacionCrearCliente('Tienda Doña Rosa');
  const c = await ColaEscritura.ejecutar(op);
  await lanza(() => operacionCrearCliente('tienda  doña rosa'), 'nombre único');
  const p = productoPor('Churritos');
  const prep = prepararVenta({ lineas: [{ idProducto: p.idProducto, cantidad: 2, totalCobrado: dinero('0.80') }], idCliente: c.idCliente });
  await ColaEscritura.ejecutar(operacionGuardarTicket(prep));
  await ColaEscritura.ejecutar(operacionActualizarCliente(c.idCliente, { nombre: 'Rosa Martínez' }));
  await abrirBase(Almacen.baseId);
  const venta = Almacen.movimientoPorFolio(prep.filas[0].folio);
  igual(Almacen.cliente(venta.idCliente).nombre, 'Rosa Martínez');
  const r = calcularResumenPeriodo(Almacen.movimientos, '2000-01-01', '2099-12-31', m => m.idCliente === c.idCliente);
  igual(formatearDinero(r.ventas), '$0.80');
});
