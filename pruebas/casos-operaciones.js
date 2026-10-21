// © 2026 Kitsótaro · KoreStock Ledger · Código disponible, todos los derechos reservados (ver LICENSE).
// Tickets, entradas con unidades, anulaciones, cola de escritura y sesión (T09).

grupo('Tickets, entradas y anulaciones');

async function abrirBasePruebaV3(fusionar) {
  DriveDemo.persistir = false; DriveDemo.reiniciar(); Hoja.usar(MotorDemo); Sesion.modoDemo = true; Sesion.correo = 'demo@korestock.local';
  await CacheLocal.borrarTodo();
  const id = cargarBasePruebaEnDemo(leerArchivoBinario(RUTA_BASE_PRUEBA));
  let fusiones = [];
  if (fusionar) fusiones = proponerFusiones(await leerBaseV2(id)).map(x => Object.assign(x, { aceptada: true }));
  const r = await migrarBaseV2(id, fusiones);
  await abrirBase(r.idNuevo);
  return r.idNuevo;
}
const productoPor = (linea, extra) => Almacen.productosActivos().find(p => p.linea === linea && (!extra || extra(p)));

prueba('criterio §12.3: ticket de 3 productos, anular el segundo y luego el ticket completo', async () => {
  if (!hayBasePrueba()) return;
  await abrirBasePruebaV3(false);
  const a = productoPor('Pepsi', p => p.volumen === '600 ml'), b = productoPor('Pilsener', p => p.presentacion === 'Botella' && p.volumen === '355 ml'), c = productoPor('Churritos');
  const stock = [a, b, c].map(p => Almacen.stock(p.idProducto));
  const ventasAntes = calcularResumenPeriodo(Almacen.movimientos, '2026-10-21', '2026-10-21').ventas;
  const prep = prepararVenta({ fecha: '2026-10-21', lineas: [
    { idProducto: a.idProducto, cantidad: 2, totalCobrado: dinero('1.90') },
    { idProducto: b.idProducto, cantidad: 3, totalCobrado: dinero('2.70') },
    { idProducto: c.idProducto, cantidad: 1, totalCobrado: dinero('0.40') }] });
  await ColaEscritura.ejecutar(operacionGuardarTicket(prep));
  igual(formatearDinero(prep.resumen.total), '$5.00');
  igual(Almacen.movimientosDeTicket(prep.idTicket).length, 3, 'una fila por producto, mismo ticket');
  igual(Almacen.stock(b.idProducto), stock[1] - 3);
  await ColaEscritura.ejecutar(operacionAnular([prep.filas[1].folio]));
  igual(Almacen.stock(b.idProducto), stock[1], 'anular la línea devuelve el stock');
  igual(formatearDinero(calcularResumenPeriodo(Almacen.movimientos, '2026-10-21', '2026-10-21').ventas - ventasAntes), '$2.30');
  await ColaEscritura.ejecutar(operacionAnular(prep.filas.map(f => f.folio), { tipo: 'ANULACION_TICKET', alcance: prep.idTicket }));
  igual(Almacen.stock(a.idProducto), stock[0]); igual(Almacen.stock(c.idProducto), stock[2]);
  igual(Almacen.hojas.LOG_ACCIONES[Almacen.hojas.LOG_ACCIONES.length - 1].tipo, 'ANULACION_TICKET');
  await abrirBase(Almacen.baseId);
  igual(Almacen.stock(b.idProducto), stock[1], 'al releer de Drive, igual');
});

prueba('no deja vender más de lo que hay', async () => {
  if (!hayBasePrueba()) return;
  await abrirBasePruebaV3(false);
  const p = productoPor('Pepsi Black');
  await lanza(() => prepararVenta({ lineas: [{ idProducto: p.idProducto, cantidad: Almacen.stock(p.idProducto) + 1, totalCobrado: dinero(1) }] }));
});

prueba('entrada «3 cajas de 6 cartones de 30 huevos» suma 540 y recuerda la equivalencia', async () => {
  if (!hayBasePrueba()) return;
  await abrirBasePruebaV3(true);
  const huevo = productoPor('Huevo Grande');
  const antes = Almacen.stock(huevo.idProducto);
  const prep = prepararEntrada({ lineas: [{ producto: huevo.idProducto, cantEmpaques: 3, nombreEmpaque: 'caja', unidPorEmpaque: 180,
    niveles: [{ nombre: 'caja', unidades: 6, nivelInferior: 'cartón' }, { nombre: 'cartón', unidades: 30, nivelInferior: 'huevo' }],
    totalPagado: dinero('90.00') }] });
  await ColaEscritura.ejecutar(operacionGuardarTicket(prep));
  igual(Almacen.stock(huevo.idProducto), antes + 540);
  igual(formatearDinero(Almacen.producto(huevo.idProducto).costo, { decimales: 5 }), '$0.16667', 'costo por huevo');
  verdadero(Almacen.equivalenciasDe(huevo.idProducto).some(e => e.nombre === 'caja' && e.unidades === 6), 'caja = 6 cartones');
  verdadero(describirCantidad(huevo.idProducto, 41).includes('≈ 1 cartón'), describirCantidad(huevo.idProducto, 41));
});

prueba('producto nuevo: SKU único, marca «nuevo» y aviso si ya existe (§13, D54)', async () => {
  if (!hayBasePrueba()) return;
  await abrirBasePruebaV3(false);
  const prep = prepararEntrada({ lineas: [{ nuevo: { marca: 'Gatorade', linea: 'Gatorade', presentacion: 'Botella', volumen: '500 ml', unidadBase: 'botella', tipoEmpaque: 'Caja' },
    cantEmpaques: 2, unidPorEmpaque: 12, nombreEmpaque: 'caja', totalPagado: dinero('18.00'), nuevoPrecio: dinero('1.25') }] });
  await ColaEscritura.ejecutar(operacionGuardarTicket(prep));
  const g = Almacen.productos.find(p => p.marca === 'Gatorade');
  igual(Almacen.stock(g.idProducto), 24);
  igual(prep.filas[0].productoNuevo, 'SI');
  igual(Almacen.productos.filter(p => p.sku === g.sku).length, 1);
  igual(g.precio, dinero('1.25'));
  await lanza(() => prepararEntrada({ lineas: [{ nuevo: { marca: 'gatorade', linea: 'GATORADE', presentacion: 'botella', volumen: '500ml' }, cantEmpaques: 1, unidPorEmpaque: 1, totalPagado: 1 }] }));
});

prueba('el SKU ya no se repite tras obsoletar (§6)', () => {
  const catalogo = [{ idProducto: 1, marca: 'CBC', linea: 'Petit', presentacion: 'Tetra', volumen: '200 ml', sku: 'CBPE-001', estado: 'ACTIVO' },
    { idProducto: 2, marca: 'CBC', linea: 'Petit', presentacion: 'Lata', volumen: '355 ml', sku: 'CBPE-003', estado: 'OBSOLETO' }];
  igual(generarSKU({ marca: 'CBC', linea: 'Petit', presentacion: 'Botella', volumen: '1 L' }, catalogo), 'CBPE-004');
  igual(generarSKU({ marca: 'cbc', linea: 'petit', presentacion: 'tetra', volumen: '200ML' }, catalogo), 'CBPE-001');
});

prueba('precio sugerido por presentaciones: 5 aguas con «2 por 0.75» = 2 + 2 + 1', async () => {
  if (!hayBasePrueba()) return;
  await abrirBasePruebaV3(false);
  const agua = productoPor('Agua', p => p.volumen === '600 ml');
  await ColaEscritura.ejecutar(operacionGuardarPresentaciones(agua.idProducto, [{ etiqueta: '2 por 0.75', cantidad: 2, precio: dinero('0.75') }]));
  const s = sugerirPrecioTotal(agua.idProducto, 5);
  igual(formatearDinero(s.total), '$2.00');
  igual(s.desglose.length, 2);
});

prueba('cambiar el precio queda en el histórico con el actor', async () => {
  if (!hayBasePrueba()) return;
  await abrirBasePruebaV3(false);
  const huevo = productoPor('Huevo Grande', p => p.volumen === '30');
  const n = Almacen.hojas.LOG_HISTORICO_PRECIOS.length;
  await ColaEscritura.ejecutar(operacionCambiarPrecio(huevo.idProducto, dinero('4.99')));
  igual(Almacen.producto(huevo.idProducto).precio, dinero('4.99'));
  const h = Almacen.hojas.LOG_HISTORICO_PRECIOS[n];
  igual(h.usuario, 'demo@korestock.local'); igual(h.precioAnt, dinero('5.25'));
});

grupo('Cola de escritura');
prueba('si falla a medias, reintentar no duplica el historial', async () => {
  if (!hayBasePrueba()) return;
  await abrirBasePruebaV3(true);
  const huevo = productoPor('Huevo Grande');
  const prep = prepararEntrada({ lineas: [{ producto: huevo.idProducto, cantEmpaques: 1, unidPorEmpaque: 30, nombreEmpaque: 'cartón', totalPagado: dinero('5.10') }] });
  const op = operacionGuardarTicket(prep);
  const original = MotorDemo.actualizar;
  let fallar = true;
  MotorDemo.actualizar = async (...a) => { if (fallar) { fallar = false; throw new Error('cuota'); } return original.apply(MotorDemo, a); };
  const filasAntes = Almacen.movimientos.length;
  try { await ColaEscritura.ejecutar(op); } catch (e) { /* el primer intento falla en el catálogo */ }
  MotorDemo.actualizar = original;
  igual(Almacen.movimientos.length, filasAntes + 1, 'el historial ya quedó escrito');
  await ColaEscritura.ejecutar(op);
  igual(Almacen.movimientos.length, filasAntes + 1, 'no se duplicó');
  await abrirBase(Almacen.baseId);
  igual(Almacen.movimientos.length, filasAntes + 1);
});
prueba('sin conexión no escribe', async () => {
  Almacen.sinConexion = true;
  try { await lanza(() => ColaEscritura.ejecutar(crearOperacion('x', [{ nombre: 'a', fn: async () => {} }]))); }
  finally { Almacen.sinConexion = false; }
});

grupo('Sesión y verificador (D63, D68)');
prueba('respuesta que no es JSON = error del servidor, no «sin autorización»', async () => {
  const fetchOriginal = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ text: async () => '<html>Error de Google</html>' });
    Sesion.modoDemo = false;
    igual(await Sesion.verificarAcceso('a@b.com', 't'), 'error-servidor');
    globalThis.fetch = async () => ({ text: async () => '{"autorizado":false}' });
    igual(await Sesion.verificarAcceso('a@b.com', 't'), 'no-autorizado');
    globalThis.fetch = async (url) => { verdadero(url.includes('token=t')); return { text: async () => '{"autorizado":true}' }; };
    igual(await Sesion.verificarAcceso('a@b.com', 't'), 'autorizado');
  } finally { globalThis.fetch = fetchOriginal; Sesion.modoDemo = true; }
});
