// © 2026 Kitsótaro · KoreStock Ledger · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// OPERACIONES-MOVIMIENTOS.JS — ventas, entradas y anulaciones.
//
// Ticket (V3 §12.3, estructura C): cada producto es UNA fila de LOG_TRANS
// con su propio folio (IN-/FAC-) y todas las filas del mismo cobro o de la
// misma factura comparten ID_TICKET. Se guarda en UNA sola escritura
// (D35); el carrito se conserva hasta confirmar.
//
// Venta: cantidad en unidades base; el TOTAL COBRADO es el dato (editable,
// D17/D19); el precio por unidad se deriva. Utilidad = cobrado − costo
// vigente × unidades (mismo criterio que la v2: último costo).
// Entrada: «Compré [12] [cartón] de [30] [huevos]» → 360 unidades; el
// TOTAL PAGADO es el dato; el costo por unidad se deriva (V3 §3.3, §4).
// Anular: solo se marca ANULADA (append-only, INVARIANTE 1); el stock se
// recalcula solo (D36).
//
// Expone: prepararVenta, prepararEntrada, operacionGuardarTicket,
//   operacionAnular, describirCantidad, prepararReasignacion.
// Depende de: esquema.js, almacen.js, calculos.js, cola-escritura.js,
//   operaciones-catalogo.js, hoja.js, dinero.js, utilidades.js, sesion.js.
// ============================================================

function denormalizado(p) {
  return { sku: p.sku, marca: p.marca, linea: p.linea, presentacion: p.presentacion, volumen: p.volumen, tipoEmpaque: p.tipoEmpaque, idProducto: p.idProducto };
}

// «41 huevos ≈ 3 cartones» (el equivalente es solo informativo, V3 §3.2).
function describirCantidad(idProducto, unidades) {
  const p = Almacen.producto(idProducto);
  if (!p) return formatearNumero(unidades);
  const base = `${formatearNumero(unidades)} ${pluralUnidad(p.unidadBase, unidades)}`;
  const eq = Almacen.equivalenciasDe(idProducto).filter(e => e.unidades > 1 && normalizarTexto(e.nivelInferior) === normalizarTexto(p.unidadBase))
    .sort((a, b) => b.unidades - a.unidades)[0];
  if (!eq || unidades < eq.unidades) return base;
  const n = Math.floor(unidades / eq.unidades);
  return `${base} ≈ ${n} ${pluralUnidad(eq.nombre, n)}`;
}

// lineas: [{ idProducto, cantidad, totalCobrado, variante }]
function prepararVenta({ lineas, fecha, idCliente, permitirNegativo = false }) {
  if (!lineas || !lineas.length) throw new Error('Agrega al menos un producto.');
  const pedidoPorProducto = {};
  lineas.forEach(l => { pedidoPorProducto[l.idProducto] = redondearCantidad((pedidoPorProducto[l.idProducto] || 0) + Number(l.cantidad)); });
  Object.entries(pedidoPorProducto).forEach(([id, q]) => {
    const p = Almacen.producto(id);
    const stock = Almacen.stock(id);
    if (q > stock && !permitirNegativo) throw new Error(`No hay suficiente ${nombreProducto(p)}: pides ${formatearNumero(q)} y hay ${formatearNumero(stock)}.`);
  });
  const ahora = obtenerTimestampLocal();
  const dia = fecha || obtenerFechaLocal();
  const idTicket = Almacen.tomarFolio('TK-');
  let total = 0, ganancia = 0, unidades = 0, bajoCosto = [];
  const filas = lineas.map(l => {
    const p = Almacen.producto(l.idProducto);
    const q = Number(l.cantidad);
    if (!(q > 0)) throw new Error(`Cantidad inválida para ${nombreProducto(p)}.`);
    if (!p.decimales && !Number.isInteger(q)) throw new Error(`${nombreProducto(p)} se vende en unidades enteras.`);
    const cobrado = redondearCentavo(l.totalCobrado);
    const costoUnit = p.costo;
    const inversion = totalLinea(q, costoUnit);
    const utilidad = restarDinero(cobrado, inversion);
    const precioUnit = precioUnitario(cobrado, q);
    if (utilidad < 0) bajoCosto.push(nombreProducto(p));
    total = sumarDinero(total, cobrado); ganancia = sumarDinero(ganancia, utilidad); unidades += q;
    return Object.assign(denormalizado(p), {
      folio: Almacen.tomarFolio('FAC-'), timestamp: ahora, fecha: l.fecha || dia, tipo: TIPOS_MOV.VENTA, variante: String(l.variante || '').trim(),
      cantidad: -q, bonif: 0, costoUnit, precioUnit, inversion, margenUnit: restarDinero(precioUnit, costoUnit),
      totalVenta: cobrado, utilidad, estado: '', idCliente: idCliente || null, empaqueMov: p.unidadBase, cantEmpaques: q,
      unidPorEmpaque: 1, unidadesTotales: q, idTicket, productoNuevo: '', referencia: l.etiqueta || ''
    });
  });
  return { tipo: TIPOS_MOV.VENTA, idTicket, filas, productosNuevos: [], cambiados: [], historicos: [], equivalenciasNuevas: [], equivalenciasUsadas: [],
    resumen: { total, ganancia, unidades: redondearCantidad(unidades), bajoCosto, lineas: filas.length } };
}

// lineas: [{ producto (existente) | nuevo (datos identidad), cantEmpaques,
//   nombreEmpaque, unidPorEmpaque, niveles: [{nombre, unidades, nivelInferior}],
//   totalPagado | costoPorEmpaque, bonif, variante, nuevoPrecio }]
function prepararEntrada({ lineas, fecha }) {
  if (!lineas || !lineas.length) throw new Error('Agrega al menos un producto.');
  const ahora = obtenerTimestampLocal();
  const dia = fecha || obtenerFechaLocal();
  const idTicket = Almacen.tomarFolio('TK-');
  const productosNuevos = [], cambiados = new Map(), historicos = [], equivalenciasNuevas = [], equivalenciasUsadas = [];
  let total = 0, unidadesTot = 0;
  const filas = lineas.map(l => {
    let p, esNuevo = false;
    if (l.producto) p = Almacen.producto(l.producto.idProducto || l.producto);
    else {
      const enEsteTicket = productosNuevos.find(x => claveIdentidadProducto(x) === claveIdentidadProducto(l.nuevo));
      const repetido = buscarProductoMismaIdentidad(l.nuevo, Almacen.productos);
      if (repetido) throw new Error(`«${nombreProducto(repetido)}» ya existe. Elígelo de la lista en vez de crearlo de nuevo.`);
      if (enEsteTicket) p = enEsteTicket;
      else { p = prepararProductoNuevo(l.nuevo); productosNuevos.push(p); esNuevo = true; }
    }
    const cantEmp = Number(l.cantEmpaques || 0);
    const porEmp = Number(l.unidPorEmpaque || 1);
    const unidades = redondearCantidad(cantEmp * porEmp);
    const bonif = Number(l.bonif || 0);
    if (!(unidades > 0) && !(bonif > 0)) throw new Error(`Indica cuánto entró de ${nombreProducto(p)}.`);
    const pagado = l.totalPagado !== undefined && l.totalPagado !== null ? redondearCentavo(l.totalPagado)
      : redondearCentavo(multiplicarDinero(l.costoPorEmpaque || 0, cantEmp));
    const costoUnit = unidades > 0 ? precioUnitario(pagado, unidades) : p.costo;
    total = sumarDinero(total, pagado); unidadesTot += unidades + bonif;

    // Último costo y precio vigente del producto (por unidad base).
    const delTicket = productosNuevos.includes(p); // creado en este mismo ticket: se ajusta directo
    const base = delTicket ? p : (cambiados.get(p.idProducto) || Object.assign({}, p));
    const antes = { costo: base.costo, precio: base.precio };
    if (unidades > 0) base.costo = costoUnit;
    if (l.nuevoPrecio !== undefined && l.nuevoPrecio !== null && l.nuevoPrecio !== '') base.precio = l.nuevoPrecio;
    if (!delTicket) {
      if (base.costo !== p.costo || base.precio !== p.precio) {
        historicos.push(historicoPrecio(base, antes, { costo: base.costo, precio: base.precio }, 'Entrada'));
      }
      cambiados.set(p.idProducto, base);
    }

    // Equivalencias usadas: se recuerdan para sugerirlas la próxima vez.
    (l.niveles || []).forEach(n => {
      if (!n.nombre || !(n.unidades > 1)) return;
      const existente = Almacen.hojas.EQUIVALENCIAS.find(e => normalizarTexto(e.nombre) === normalizarTexto(n.nombre) && e.unidades === n.unidades &&
        normalizarTexto(e.nivelInferior) === normalizarTexto(n.nivelInferior) && (e.idProducto === p.idProducto || !e.idProducto));
      if (existente) equivalenciasUsadas.push(Object.assign({}, existente, { ultimoUso: dia }));
      else if (!equivalenciasNuevas.some(e => normalizarTexto(e.nombre) === normalizarTexto(n.nombre) && e.unidades === n.unidades && e.idProducto === p.idProducto)) {
        equivalenciasNuevas.push({ idEquiv: Almacen.tomarId('ID_EQUIV'), nombre: n.nombre.trim().toLowerCase(), unidades: n.unidades,
          nivelInferior: String(n.nivelInferior || p.unidadBase).trim().toLowerCase(), idProducto: p.idProducto, ultimoUso: dia });
      }
    });

    return Object.assign(denormalizado(p), {
      folio: Almacen.tomarFolio('IN-'), timestamp: ahora, fecha: l.fecha || dia, tipo: TIPOS_MOV.ENTRADA, variante: String(l.variante || '').trim(),
      cantidad: unidades, bonif, costoUnit, precioUnit: base.precio, inversion: pagado, margenUnit: restarDinero(base.precio, costoUnit),
      totalVenta: null, utilidad: null, estado: '', idCliente: null, empaqueMov: String(l.nombreEmpaque || p.unidadBase).trim().toLowerCase(),
      cantEmpaques: cantEmp, unidPorEmpaque: porEmp, unidadesTotales: unidades, idTicket, productoNuevo: esNuevo ? 'SI' : '', referencia: ''
    });
  });
  // Los productos nuevos toman el costo y precio de su primera entrada.
  return { tipo: TIPOS_MOV.ENTRADA, idTicket, filas, productosNuevos, cambiados: [...cambiados.values()], historicos, equivalenciasNuevas, equivalenciasUsadas,
    resumen: { total, unidades: redondearCantidad(unidadesTot), lineas: filas.length, nuevos: productosNuevos.length } };
}

// Una sola operación para todo el ticket. Orden: productos nuevos →
// historial → catálogo/precios → equivalencias. Si falla a medias, al
// reintentar sigue desde el paso pendiente (no duplica el historial).
function operacionGuardarTicket(prep) {
  const pasoHistorial = {
    nombre: 'historial',
    fn: async (ctx) => {
      const r = await Hoja.agregar(Almacen.baseId, 'LOG_TRANS', prep.filas.map(f => objetoAFila('LOG_TRANS', f, true)));
      prep.filas.forEach((f, i) => { f._fila = r.primeraFila + i; });
      Almacen.agregarFilas('LOG_TRANS', prep.filas);
      ctx.resultado = prep.resumen;
    }
  };
  const productosNuevosConStock = {
    nombre: 'copia del stock en catálogo',
    fn: async () => {
      // Los productos tocados por una ENTRADA se reescriben con su stock al día (copia, D36).
      prep.cambiados.forEach(p => marcarModificado(p));
      prep.productosNuevos.forEach(p => { marcarModificado(p); if (!prep.cambiados.includes(p)) prep.cambiados.push(p); });
    }
  };
  const pasosPrecio = pasosCatalogoYPrecios(prep.cambiados, prep.historicos);
  const pasoEquivalencias = {
    nombre: 'equivalencias',
    fn: async () => {
      if (prep.equivalenciasUsadas.length) {
        await Hoja.actualizar(Almacen.baseId, prep.equivalenciasUsadas.map(e => ({ rango: rangoFila('EQUIVALENCIAS', e._fila), valores: [objetoAFila('EQUIVALENCIAS', e, false)] })));
        prep.equivalenciasUsadas.forEach(e => Almacen.reemplazarFila('EQUIVALENCIAS', e));
      }
      if (prep.equivalenciasNuevas.length) {
        const r = await Hoja.agregar(Almacen.baseId, 'EQUIVALENCIAS', prep.equivalenciasNuevas.map(e => objetoAFila('EQUIVALENCIAS', e, true)));
        prep.equivalenciasNuevas.forEach((e, i) => { e._fila = r.primeraFila + i; });
        Almacen.agregarFilas('EQUIVALENCIAS', prep.equivalenciasNuevas);
      }
    }
  };
  const pasoFinal = { nombre: 'copia local', fn: async () => { Almacen.notificar('movimientos'); guardarCacheBase(); } };
  const pasos = [pasoAgregarProductos(prep.productosNuevos), pasoHistorial];
  if (prep.tipo === TIPOS_MOV.ENTRADA) pasos.push(productosNuevosConStock, ...pasosPrecio, pasoEquivalencias);
  pasos.push(pasoFinal);
  return crearOperacion(prep.tipo === TIPOS_MOV.VENTA ? 'Cobrar y guardar' : 'Guardar entrada', pasos);
}

// Anula movimientos (una línea, un ticket o un lote). `accion` opcional
// registra el cambio en LOG_ACCIONES (reversible, V3 §10.1).
function operacionAnular(folios, accion) {
  const movs = folios.map(f => Almacen.movimientoPorFolio(f)).filter(m => m && esMovValido(m));
  if (!movs.length) throw new Error('No hay movimientos válidos para anular.');
  const col = columnaLetra(indiceColumna('LOG_TRANS', 'estado'));
  const pasos = [{
    nombre: 'anular',
    fn: async () => {
      await Hoja.actualizar(Almacen.baseId, movs.map(m => ({ rango: `LOG_TRANS!${col}${m._fila}`, valores: [[ESTADOS.MOV_ANULADA]] })));
      movs.forEach(m => Almacen.reemplazarFila('LOG_TRANS', Object.assign({}, m, { estado: ESTADOS.MOV_ANULADA })));
    }
  }];
  if (accion) {
    const registro = {
      idAccion: Almacen.tomarFolio('AC-'), timestamp: obtenerTimestampLocal(), tipo: accion.tipo, alcance: accion.alcance || '',
      foliosAnulados: movs.map(m => m.folio).join(' '), foliosNuevos: (accion.foliosNuevos || []).join(' '),
      estado: ESTADOS.ACCION_VIGENTE, timestampReversion: '', actor: actorActual() || 'sin-sesion'
    };
    pasos.push({
      nombre: 'registro de la acción',
      fn: async (ctx) => {
        const r = await Hoja.agregar(Almacen.baseId, 'LOG_ACCIONES', [objetoAFila('LOG_ACCIONES', registro, true)]);
        registro._fila = r.primeraFila;
        Almacen.agregarFilas('LOG_ACCIONES', [registro]);
        ctx.accion = registro;
      }
    });
  }
  pasos.push({ nombre: 'copia local', fn: async (ctx) => { ctx.resultado = { anulados: movs.length }; Almacen.notificar('anulacion'); guardarCacheBase(); } });
  return crearOperacion('Anular', pasos);
}

// Repartir sabores (T24, §16.2): mueve unidades entre «sin asignar» y un
// sabor con un PAR de filas REASIGNACION (−n de un lado, +n del otro). El
// total y el valor del producto no cambian; el historial no se reescribe.
// asignaciones: [{ variante, unidades }] (unidades > 0).
function prepararReasignacion(idProducto, asignaciones) {
  const p = Almacen.producto(idProducto);
  const e = Almacen.estado(p.idProducto);
  const sinAsignar = e.porVariante[''] || 0;
  const total = asignaciones.reduce((s, a) => s + Number(a.unidades || 0), 0);
  if (!total) throw new Error('Indica cuánto va a cada sabor.');
  if (total > Math.abs(sinAsignar)) throw new Error(`Solo hay ${formatearNumero(Math.abs(sinAsignar))} sin asignar.`);
  // sinAsignar < 0: ventas sin sabor que en realidad fueron de un sabor → baja ese sabor, sube «sin asignar».
  // sinAsignar > 0: unidades sin sabor que son de un sabor → sube ese sabor, baja «sin asignar».
  const signo = sinAsignar < 0 ? -1 : 1;
  const ahora = obtenerTimestampLocal(), dia = obtenerFechaLocal();
  const idTicket = Almacen.tomarFolio('TK-');
  const fila = (variante, cantidad) => Object.assign(denormalizado(p), {
    folio: Almacen.tomarFolio('RA-'), timestamp: ahora, fecha: dia, tipo: TIPOS_MOV.REASIGNACION, variante, cantidad, bonif: 0,
    costoUnit: 0, precioUnit: 0, inversion: 0, margenUnit: 0, totalVenta: null, utilidad: null, estado: '', idCliente: null,
    empaqueMov: p.unidadBase, cantEmpaques: Math.abs(cantidad), unidPorEmpaque: 1, unidadesTotales: Math.abs(cantidad), idTicket, productoNuevo: '', referencia: 'Repartir sabores'
  });
  const filas = [];
  asignaciones.filter(a => a.unidades > 0 && String(a.variante || '').trim()).forEach(a => {
    filas.push(fila(String(a.variante).trim(), signo * a.unidades));
    filas.push(fila('', -signo * a.unidades));
  });
  return { tipo: TIPOS_MOV.REASIGNACION, idTicket, filas, productosNuevos: [], cambiados: [], historicos: [], equivalenciasNuevas: [], equivalenciasUsadas: [], resumen: { unidades: total } };
}
