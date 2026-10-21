// © 2026 Kitsótaro · KoreStock Ledger · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// OPERACIONES-CATALOGO.JS — escribir productos, precios, presentaciones de
// venta, equivalencias de empaque y umbrales.
//
// Reglas:
//   - Solo se escribe la FILA que cambia (V3 §22.3 punto 3); se acabó
//     reescribir el catálogo completo (INVARIANTE 10 retirado).
//   - Todo cambio de costo o precio queda en LOG_HISTORICO_PRECIOS con la
//     cuenta de Google de quien lo hizo (D48).
//   - ID_PRODUCTO es la llave y nunca cambia; el SKU se regenera si cambia
//     la identidad (INVARIANTE 7).
//   - El stock del catálogo es solo una copia (D36): se actualiza cuando la
//     fila se escribe por otro motivo; el stock real lo calcula la app.
//
// Expone: rangoFila, prepararProductoNuevo, pasoAgregarProductos,
//   historicoPrecio, operacionActualizarProducto, operacionCambiarPrecio,
//   operacionGuardarPresentaciones, operacionGuardarUmbral, sugerirPrecioTotal.
// Depende de: esquema.js, almacen.js, cola-escritura.js, hoja.js, sku.js,
//   dinero.js, utilidades.js, sesion.js (actorActual), sincronizacion.js.
// ============================================================

function rangoFila(hoja, fila) {
  return `${hoja}!A${fila}:${ultimaLetra(hoja)}${fila}`;
}

function prepararProductoNuevo(datos) {
  const ahora = obtenerTimestampLocal();
  const catalogo = Almacen.productos;
  return {
    idProducto: Almacen.tomarId('ID_PRODUCTO'),
    sku: generarSKU(datos, catalogo),
    marca: String(datos.marca || '').trim(), linea: String(datos.linea || '').trim(),
    presentacion: String(datos.presentacion || '').trim(), volumen: String(datos.volumen || '').trim(), variante: '',
    costo: datos.costo || 0, precio: datos.precio || 0, stockCache: 0, estado: ESTADOS.ACTIVO,
    ultimaModif: ahora, tipoEmpaque: String(datos.tipoEmpaque || '').trim(), fechaCreacion: ahora, modificacionAnterior: '',
    bonifCache: 0, unidadBase: String(datos.unidadBase || 'unidad').trim().toLowerCase(),
    umbralMin: datos.umbralMin ?? null, umbralMax: datos.umbralMax ?? null,
    categoria: String(datos.categoria || '').trim(), decimales: datos.decimales ? 'SI' : '', fusionadoEn: null
  };
}

// Paso de cola: agrega productos nuevos al catálogo y los registra en memoria.
function pasoAgregarProductos(productos) {
  return {
    nombre: 'productos nuevos',
    fn: async () => {
      if (!productos.length) return;
      const r = await Hoja.agregar(Almacen.baseId, 'CATALOGO', productos.map(p => objetoAFila('CATALOGO', p, true)));
      productos.forEach((p, i) => { p._fila = r.primeraFila + i; });
      Almacen.agregarFilas('CATALOGO', productos);
    }
  };
}

function historicoPrecio(producto, antes, despues, detalle) {
  return {
    idLog: `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, sku: producto.sku,
    costoAnt: antes.costo, costoNuevo: despues.costo, precioAnt: antes.precio, precioNuevo: despues.precio,
    fecha: obtenerTimestampLocal(), usuario: actorActual() || 'sin-sesion', idProducto: producto.idProducto, detalle: detalle || ''
  };
}

function marcarModificado(p) {
  const ahora = obtenerTimestampLocal();
  if (p.ultimaModif !== ahora) { p.modificacionAnterior = p.ultimaModif || ''; p.ultimaModif = ahora; }
  const e = Almacen.estado(p.idProducto);
  p.stockCache = e.stock; p.bonifCache = e.bonif;
}

// Pasos comunes: escribir filas de catálogo cambiadas + histórico.
function pasosCatalogoYPrecios(productosCambiados, historicos) {
  return [
    {
      nombre: 'catálogo',
      fn: async () => {
        if (!productosCambiados.length) return;
        await Hoja.actualizar(Almacen.baseId, productosCambiados.map(p => ({ rango: rangoFila('CATALOGO', p._fila), valores: [objetoAFila('CATALOGO', p, false)] })));
        productosCambiados.forEach(p => Almacen.reemplazarFila('CATALOGO', p));
      }
    },
    {
      nombre: 'histórico de precios',
      fn: async () => {
        if (!historicos.length) return;
        const r = await Hoja.agregar(Almacen.baseId, 'LOG_HISTORICO_PRECIOS', historicos.map(h => objetoAFila('LOG_HISTORICO_PRECIOS', h, true)));
        historicos.forEach((h, i) => { h._fila = r.primeraFila + i; });
        Almacen.agregarFilas('LOG_HISTORICO_PRECIOS', historicos);
      }
    }
  ];
}

// Edita un producto (identidad, precios, umbrales, categoría, estado…).
// Si cambia la identidad se regenera el SKU (el ID no cambia nunca).
function operacionActualizarProducto(idProducto, cambios) {
  const actual = Almacen.producto(idProducto);
  if (!actual) throw new Error('Producto no encontrado');
  const nuevo = Object.assign({}, actual, cambios);
  const identidadCambio = claveIdentidadProducto(nuevo) !== claveIdentidadProducto(actual);
  if (identidadCambio) {
    const choque = buscarProductoMismaIdentidad(nuevo, Almacen.productos, idProducto);
    if (choque) throw new Error(`Ya existe un producto igual: ${nombreProducto(choque)} (${choque.sku}).`);
    nuevo.sku = generarSKU(nuevo, Almacen.productos, idProducto);
  }
  marcarModificado(nuevo);
  const historicos = (nuevo.costo !== actual.costo || nuevo.precio !== actual.precio)
    ? [historicoPrecio(nuevo, actual, nuevo, cambios._detallePrecio || '')] : [];
  delete nuevo._detallePrecio;
  const op = crearOperacion('Guardar producto', pasosCatalogoYPrecios([nuevo], historicos).concat([{ nombre: 'copia local', fn: async () => { Almacen.notificar('producto'); guardarCacheBase(); } }]));
  op.contexto.resultado = { producto: nuevo, skuCambio: identidadCambio && nuevo.sku !== actual.sku };
  return op;
}

// Cambio de precio vigente desde Venta o Stock (D18): 2 toques, queda en el histórico.
function operacionCambiarPrecio(idProducto, nuevoPrecio, detalle) {
  return operacionActualizarProducto(idProducto, { precio: nuevoPrecio, _detallePrecio: detalle || 'Cambio de precio vigente' });
}

// Presentaciones de venta (V3 §9.4, hasta 3 al inicio): reemplaza la lista
// del producto. Las que se quitan quedan INACTIVAS (no se borran filas).
function operacionGuardarPresentaciones(idProducto, lista) {
  const producto = Almacen.producto(idProducto);
  const existentes = Almacen.hojas.PRESENTACIONES_VENTA.filter(x => x.idProducto === Number(idProducto));
  const actualizar = [], agregar = [], historicos = [];
  lista.forEach((item, i) => {
    const previo = existentes.find(x => normalizarTexto(x.etiqueta) === normalizarTexto(item.etiqueta) && x.estado !== ESTADOS.INACTIVO) ||
      existentes.find(x => x.cantidad === item.cantidad && x.estado !== ESTADOS.INACTIVO);
    const obj = { idProducto: Number(idProducto), etiqueta: item.etiqueta, cantidad: item.cantidad, precio: item.precio, orden: i + 1, estado: ESTADOS.ACTIVO };
    if (previo) {
      if (previo.precio !== item.precio) historicos.push(historicoPrecio(producto, { costo: producto.costo, precio: previo.precio }, { costo: producto.costo, precio: item.precio }, `Presentación «${item.etiqueta}»`));
      actualizar.push(Object.assign({}, previo, obj));
    } else {
      agregar.push(obj);
      historicos.push(historicoPrecio(producto, { costo: producto.costo, precio: 0 }, { costo: producto.costo, precio: item.precio }, `Presentación nueva «${item.etiqueta}»`));
    }
  });
  existentes.forEach(x => {
    if (x.estado !== ESTADOS.INACTIVO && !actualizar.some(a => a._fila === x._fila)) actualizar.push(Object.assign({}, x, { estado: ESTADOS.INACTIVO }));
  });
  return crearOperacion('Guardar presentaciones', [
    {
      nombre: 'presentaciones',
      fn: async () => {
        if (actualizar.length) {
          await Hoja.actualizar(Almacen.baseId, actualizar.map(o => ({ rango: rangoFila('PRESENTACIONES_VENTA', o._fila), valores: [objetoAFila('PRESENTACIONES_VENTA', o, false)] })));
          actualizar.forEach(o => Almacen.reemplazarFila('PRESENTACIONES_VENTA', o));
        }
        if (agregar.length) {
          const r = await Hoja.agregar(Almacen.baseId, 'PRESENTACIONES_VENTA', agregar.map(o => objetoAFila('PRESENTACIONES_VENTA', o, true)));
          agregar.forEach((o, i) => { o._fila = r.primeraFila + i; });
          Almacen.agregarFilas('PRESENTACIONES_VENTA', agregar);
        }
      }
    },
    pasosCatalogoYPrecios([], historicos)[1],
    { nombre: 'copia local', fn: async () => { Almacen.notificar('presentaciones'); guardarCacheBase(); } }
  ]);
}

function operacionGuardarUmbral(clave, min, max) {
  const existente = Almacen.hojas.UMBRALES.find(u => normalizarTexto(u.clave) === normalizarTexto(clave));
  const obj = Object.assign({}, existente || {}, { clave, min, max });
  return crearOperacion('Guardar umbral', [{
    nombre: 'umbral',
    fn: async () => {
      if (existente) {
        await Hoja.actualizar(Almacen.baseId, [{ rango: rangoFila('UMBRALES', existente._fila), valores: [objetoAFila('UMBRALES', obj, false)] }]);
        Almacen.reemplazarFila('UMBRALES', obj);
      } else {
        const r = await Hoja.agregar(Almacen.baseId, 'UMBRALES', [objetoAFila('UMBRALES', obj, true)]);
        obj._fila = r.primeraFila;
        Almacen.agregarFilas('UMBRALES', [obj]);
      }
      Almacen.notificar('umbrales'); guardarCacheBase();
    }
  }]);
}

// Total sugerido para N unidades (V3 §12.2 punto 4): se llena de la
// presentación más grande a la más chica; lo que sobra va al precio por
// unidad. Ej.: agua, 5 u con «2 por $0.25» → 2 + 2 + 1 suelta.
function sugerirPrecioTotal(idProducto, unidades) {
  const p = Almacen.producto(idProducto);
  if (!p || !unidades) return { total: 0, desglose: [] };
  const presentaciones = Almacen.presentacionesDe(idProducto).filter(x => x.cantidad > 0 && x.cantidad <= unidades);
  let resto = unidades, total = 0;
  const desglose = [];
  presentaciones.forEach(x => {
    const veces = Math.floor(redondearCantidad(resto / x.cantidad));
    if (veces > 0) {
      total = sumarDinero(total, multiplicarDinero(x.precio, veces));
      resto = redondearCantidad(resto - veces * x.cantidad);
      desglose.push({ etiqueta: x.etiqueta, veces, precio: x.precio });
    }
  });
  if (resto > 0) {
    total = sumarDinero(total, multiplicarDinero(p.precio, resto));
    desglose.push({ etiqueta: pluralUnidad(p.unidadBase, resto), veces: resto, precio: p.precio, suelta: true });
  }
  return { total: redondearCentavo(total), desglose };
}

// Unir productos que son el mismo (§15.3): los de origen quedan FUSIONADOS
// apuntando al destino; sus movimientos NO se reescriben, se suman al
// destino al calcular. Solo productos que se cuentan en la misma unidad.
function operacionFusionarProductos(idDestino, idsOrigen) {
  const destino = Almacen.producto(idDestino);
  const origenes = idsOrigen.map(id => Almacen.producto(id)).filter(p => p && p.idProducto !== destino.idProducto);
  if (!destino || !origenes.length) throw new Error('Elige al menos dos productos.');
  const distinta = origenes.find(p => normalizarTexto(p.unidadBase) !== normalizarTexto(destino.unidadBase));
  if (distinta) throw new Error(`«${nombreProducto(distinta)}» se cuenta en ${distinta.unidadBase} y «${nombreProducto(destino)}» en ${destino.unidadBase}: solo se pueden unir productos que se cuentan igual.`);
  const cambiados = origenes.map(p => { const n = Object.assign({}, p, { estado: ESTADOS.FUSIONADO, fusionadoEn: destino.idProducto }); marcarModificado(n); return n; });
  const registro = {
    idAccion: Almacen.tomarFolio('AC-'), timestamp: obtenerTimestampLocal(), tipo: 'FUSION',
    alcance: `${origenes.map(p => p.sku).join(', ')} → ${destino.sku}`, foliosAnulados: '', foliosNuevos: '',
    estado: ESTADOS.ACCION_VIGENTE, timestampReversion: '', actor: actorActual() || 'sin-sesion'
  };
  return crearOperacion('Unir productos', [
    pasosCatalogoYPrecios(cambiados, [])[0],
    { nombre: 'registro', fn: async () => {
      const r = await Hoja.agregar(Almacen.baseId, 'LOG_ACCIONES', [objetoAFila('LOG_ACCIONES', registro, true)]);
      registro._fila = r.primeraFila; Almacen.agregarFilas('LOG_ACCIONES', [registro]);
    } },
    { nombre: 'copia local', fn: async (ctx) => { Almacen.recalcular(); ctx.resultado = { unidos: cambiados.length }; Almacen.notificar('producto'); guardarCacheBase(); } }
  ]);
}

// Asignar categoría a varios productos en UNA escritura (§24.1).
function operacionAsignarCategoria(ids, categoria) {
  const limpia = String(categoria || '').trim();
  const existente = Almacen.categorias().find(c => normalizarIdentidad(c) === normalizarIdentidad(limpia));
  const final = existente || limpia;
  const cambiados = ids.map(id => Almacen.producto(id)).filter(Boolean).map(p => { const n = Object.assign({}, p, { categoria: final }); marcarModificado(n); return n; });
  return crearOperacion('Asignar categoría', [
    pasosCatalogoYPrecios(cambiados, [])[0],
    { nombre: 'copia local', fn: async (ctx) => { ctx.resultado = { cambiados: cambiados.length, categoria: final }; Almacen.notificar('producto'); guardarCacheBase(); } }
  ]);
}
