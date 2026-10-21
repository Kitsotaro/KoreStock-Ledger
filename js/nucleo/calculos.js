// © 2026 Kitsótaro · KoreStock Ledger · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// CALCULOS.JS — funciones PURAS de negocio sobre movimientos ya leídos.
//
// Reciben arreglos de objetos (esquema.js) y devuelven resultados; no leen
// Sheets ni tocan la pantalla. Así se prueban en Node y sirven igual para
// la base principal, los históricos unidos o una simulación (excluir
// productos, filtrar por cliente o sabor).
//
// STOCK DERIVADO (D36): el stock de cada producto es la suma de sus
// movimientos válidos (cantidad con signo + bonificación). El catálogo solo
// guarda una copia. Anular un movimiento recalcula solo, sin tocar nada.
//
// COSTO PROMEDIO (CPP) como «fondo»: se lleva el VALOR total del inventario
// (entero exacto, dinero.js) y las unidades. Una entrada suma su total
// pagado; una venta saca la parte proporcional. CPP = fondo ÷ unidades. Es
// la misma fórmula de la v2 (la bonificación suma unidades, no costo), sin
// acumular redondeos.
//
// APERTURA (V3 §18.3 regla 1, §21.1): fija el estado de un producto al
// inicio de una base rotada: cantidad = stock pagado, bonif = stock
// bonificado, inversión = valor del fondo. Cuenta para stock y CPP, NUNCA
// como compra (ROI, total comprado, Dashboard). Al unir históricos se
// ignora (ignorarApertura) y el resultado debe ser el mismo.
//
// Expone: esMovValido, stockDerivadoPorProducto, calcularEstadoProductos,
//   redondearCantidad, enPeriodo, calcularResumenPeriodo, serieDiaria,
//   calcularROI, calcularProyeccion, calcularPuntoEquilibrio,
//   calcularRendimientos, calcularResumenCombustible, diasSinCarga,
//   valorBodega, semaforoStock, rankingProductos, construirAperturas.
// Depende de: esquema.js (TIPOS_MOV, ESTADOS), dinero.js, utilidades.js.
// ============================================================

function esMovValido(m) { return (m.estado || '') !== ESTADOS.MOV_ANULADA; }

function redondearCantidad(n) { return Math.round(Number(n || 0) * 1000) / 1000; }

function enPeriodo(fecha, inicio, fin) {
  return (!inicio || fecha >= inicio) && (!fin || fecha <= fin);
}

// Estado completo por producto, recorriendo el historial en orden.
// opciones: { ignorarApertura, hasta (fecha 'YYYY-MM-DD' inclusive), filtro(m) }
function calcularEstadoProductos(movimientos, opciones) {
  const { ignorarApertura = false, hasta = null, filtro = null } = opciones || {};
  const r = {};
  for (const m of movimientos) {
    if (!esMovValido(m) || !m.idProducto) continue;
    if (hasta && m.fecha > hasta) continue;
    if (filtro && !filtro(m)) continue;
    if (m.tipo === TIPOS_MOV.APERTURA && ignorarApertura) continue;
    const e = r[m.idProducto] || (r[m.idProducto] = {
      stock: 0, bonif: 0, fondo: 0, unidadesFondo: 0, porVariante: {},
      ultimaEntrada: '', ultimaVenta: '', unidadesVendidas: 0, unidadesCompradas: 0
    });
    const cantidad = Number(m.cantidad || 0);
    const bonif = Number(m.bonif || 0);
    const variante = m.variante || '';
    e.stock += cantidad + bonif;
    e.porVariante[variante] = (e.porVariante[variante] || 0) + cantidad + bonif;

    if (m.tipo === TIPOS_MOV.ENTRADA) {
      e.bonif += bonif;
      e.fondo = sumarDinero(e.fondo, m.inversion);
      e.unidadesFondo += cantidad + bonif;
      e.unidadesCompradas += cantidad + bonif;
      if (m.fecha > e.ultimaEntrada) e.ultimaEntrada = m.fecha;
    } else if (m.tipo === TIPOS_MOV.APERTURA) {
      e.bonif += bonif;
      e.fondo = sumarDinero(e.fondo, m.inversion);
      e.unidadesFondo += cantidad + bonif;
    } else if (m.tipo === TIPOS_MOV.VENTA) {
      const q = Math.abs(cantidad);
      if (e.unidadesFondo > 0) {
        const salida = q >= e.unidadesFondo ? e.fondo : dividirDinero(multiplicarDinero(e.fondo, q), e.unidadesFondo);
        e.fondo = restarDinero(e.fondo, salida);
        e.unidadesFondo = redondearCantidad(e.unidadesFondo - q);
        if (e.unidadesFondo <= 0) { e.unidadesFondo = 0; e.fondo = 0; }
      }
      e.unidadesVendidas += q;
      if (m.fecha > e.ultimaVenta) e.ultimaVenta = m.fecha;
    }
    // REASIGNACION: solo mueve unidades entre sabores (su suma es 0).
  }
  Object.values(r).forEach(e => {
    e.stock = redondearCantidad(e.stock);
    e.bonif = redondearCantidad(e.bonif);
    e.cpp = e.unidadesFondo > 0 ? dividirDinero(e.fondo, e.unidadesFondo) : 0;
    Object.keys(e.porVariante).forEach(k => { e.porVariante[k] = redondearCantidad(e.porVariante[k]); });
  });
  return r;
}

function stockDerivadoPorProducto(movimientos, opciones) {
  const estado = calcularEstadoProductos(movimientos, opciones);
  const r = {};
  Object.entries(estado).forEach(([id, e]) => { r[id] = { stock: e.stock, bonif: e.bonif }; });
  return r;
}

// Valor de bodega (V2, DATOS §2): Bruto = Σ stock × costo vigente;
// Neto = Σ (stock − bonificado en bodega) × costo vigente.
function valorBodega(productos, estados) {
  let bruto = 0, neto = 0, unidades = 0;
  productos.forEach(p => {
    const e = estados[p.idProducto];
    const stock = e ? e.stock : 0;
    if (stock <= 0) return;
    const bonif = Math.min(e ? e.bonif : 0, stock);
    bruto = sumarDinero(bruto, multiplicarDinero(p.costo, stock));
    neto = sumarDinero(neto, multiplicarDinero(p.costo, stock - bonif));
    unidades += stock;
  });
  return { bruto: redondearCentavo(bruto), neto: redondearCentavo(neto), unidades: redondearCantidad(unidades) };
}

// Semáforo con el umbral PROPIO del producto (V3 §15.2).
function semaforoStock(stock, producto) {
  const min = producto.umbralMin ?? 4;
  const max = producto.umbralMax ?? 6;
  if (stock <= 0) return 'agotado';
  if (stock <= min) return 'bajo';
  if (stock <= max) return 'medio';
  return 'optimo';
}

// Resumen de un período: ventas, utilidad, entradas (inversión), unidades.
function calcularResumenPeriodo(movimientos, inicio, fin, filtro) {
  const r = { ventas: 0, utilidad: 0, inversion: 0, unidadesVendidas: 0, unidadesEntradas: 0, nVentas: 0, nEntradas: 0, tickets: new Set() };
  for (const m of movimientos) {
    if (!esMovValido(m) || !enPeriodo(m.fecha, inicio, fin)) continue;
    if (filtro && !filtro(m)) continue;
    if (m.tipo === TIPOS_MOV.VENTA) {
      r.ventas = sumarDinero(r.ventas, m.totalVenta || 0);
      r.utilidad = sumarDinero(r.utilidad, m.utilidad || 0);
      r.unidadesVendidas += Math.abs(m.cantidad);
      r.nVentas++;
      if (m.idTicket) r.tickets.add(m.idTicket);
    } else if (m.tipo === TIPOS_MOV.ENTRADA) {
      r.inversion = sumarDinero(r.inversion, m.inversion);
      r.unidadesEntradas += Number(m.cantidad || 0) + Number(m.bonif || 0);
      r.nEntradas++;
    }
  }
  r.unidadesVendidas = redondearCantidad(r.unidadesVendidas);
  r.unidadesEntradas = redondearCantidad(r.unidadesEntradas);
  r.nTickets = r.tickets.size;
  delete r.tickets;
  return r;
}

// Serie por día para la tendencia (Ventas y Utilidad).
function serieDiaria(movimientos, inicio, fin, filtro) {
  const dias = [];
  for (let f = inicio; f <= fin; f = sumarDias(f, 1)) dias.push(f);
  const porDia = {};
  dias.forEach(d => { porDia[d] = { ventas: 0, utilidad: 0 }; });
  for (const m of movimientos) {
    if (!esMovValido(m) || m.tipo !== TIPOS_MOV.VENTA || !porDia[m.fecha]) continue;
    if (filtro && !filtro(m)) continue;
    porDia[m.fecha].ventas = sumarDinero(porDia[m.fecha].ventas, m.totalVenta || 0);
    porDia[m.fecha].utilidad = sumarDinero(porDia[m.fecha].utilidad, m.utilidad || 0);
  }
  return dias.map(d => ({ fecha: d, ventas: porDia[d].ventas, utilidad: porDia[d].utilidad }));
}

// ROI global y por producto (V2 calcularROI). La APERTURA no es compra.
function calcularROI(movimientos, inicio, fin, filtro) {
  let inversionGlobal = 0, gananciaGlobal = 0;
  const porProducto = {};
  for (const m of movimientos) {
    if (!esMovValido(m) || !enPeriodo(m.fecha, inicio, fin) || !m.idProducto) continue;
    if (filtro && !filtro(m)) continue;
    const e = porProducto[m.idProducto] || (porProducto[m.idProducto] = { inversion: 0, ganancia: 0, unidadesVendidas: 0, unidadesCompradas: 0 });
    if (m.tipo === TIPOS_MOV.ENTRADA) {
      inversionGlobal = sumarDinero(inversionGlobal, m.inversion);
      e.inversion = sumarDinero(e.inversion, m.inversion);
      e.unidadesCompradas += Number(m.cantidad || 0) + Number(m.bonif || 0);
    } else if (m.tipo === TIPOS_MOV.VENTA) {
      gananciaGlobal = sumarDinero(gananciaGlobal, m.utilidad || 0);
      e.ganancia = sumarDinero(e.ganancia, m.utilidad || 0);
      e.unidadesVendidas += Math.abs(m.cantidad);
    }
  }
  Object.values(porProducto).forEach(e => { e.roi = e.inversion > 0 ? porcentajeDe(e.ganancia, e.inversion) : 0; });
  return { roiGlobal: inversionGlobal > 0 ? porcentajeDe(gananciaGlobal, inversionGlobal) : 0, inversionGlobal, gananciaGlobal, porProducto };
}

// Proyección de agotamiento: ritmo = ventas de los últimos N días ÷ N.
function calcularProyeccion(movimientos, estados, ventanaDias, hoy, filtro) {
  const fin = hoy || obtenerFechaLocal();
  const inicio = restarDias(fin, ventanaDias);
  const ventas = {};
  for (const m of movimientos) {
    if (!esMovValido(m) || m.tipo !== TIPOS_MOV.VENTA || !enPeriodo(m.fecha, inicio, fin)) continue;
    if (filtro && !filtro(m)) continue;
    ventas[m.idProducto] = (ventas[m.idProducto] || 0) + Math.abs(m.cantidad);
  }
  const r = {};
  Object.keys(estados).forEach(id => {
    const v = ventas[id] || 0;
    const ritmo = v / ventanaDias;
    const stock = estados[id].stock;
    r[id] = { ventasVentana: redondearCantidad(v), ritmoDiario: ritmo, diasRestantes: ritmo > 0 ? Math.max(0, stock) / ritmo : null };
  });
  return r;
}

// Punto de equilibrio (V2): gastos fijos ÷ margen de contribución.
// D8 (§29.7 punto 2, default): el combustible NO suma a gastos fijos.
function calcularPuntoEquilibrio(movimientos, gastos, inicio, fin, filtro) {
  let gastosFijos = 0;
  gastos.forEach(g => {
    if ((g.estado || '') === ESTADOS.GASTO_ANULADO || !enPeriodo(g.fecha, inicio, fin)) return;
    gastosFijos = sumarDinero(gastosFijos, g.monto);
  });
  const res = calcularResumenPeriodo(movimientos, inicio, fin, filtro);
  const margen = res.ventas > 0 ? porcentajeDe(res.utilidad, res.ventas) : 0;
  const puntoEquilibrio = margen > 0 ? dividirDinero(multiplicarDinero(gastosFijos, 100), margen) : null;
  return { gastosFijos, margenContribucion: margen, ventaTotal: res.ventas, utilidadTotal: res.utilidad, puntoEquilibrio };
}

// Rendimiento por carga: Δodómetro ÷ galones contra la carga anterior del
// mismo vehículo. Nunca se guarda (INVARIANTE 13). Recibe cargas en orden de captura.
function calcularRendimientos(cargas) {
  const anterior = {};
  const orden = cargas.slice().sort((a, b) => (a.fecha === b.fecha ? (a.timestamp < b.timestamp ? -1 : 1) : (a.fecha < b.fecha ? -1 : 1)));
  const r = new Map();
  orden.forEach(c => {
    if ((c.estado || '') === ESTADOS.GASTO_ANULADO) return;
    const prev = anterior[c.placa];
    if (prev && c.galones > 0 && c.odometro >= prev.odometro) {
      const km = c.odometro - prev.odometro;
      r.set(c.folio, { km, rendimiento: km / c.galones });
    } else {
      r.set(c.folio, { km: null, rendimiento: null });
    }
    anterior[c.placa] = c;
  });
  return r;
}

// Resumen de combustible por vehículo en un período (V2).
function calcularResumenCombustible(cargas, inicio, fin) {
  const orden = cargas.slice().sort((a, b) => (a.fecha === b.fecha ? (a.timestamp < b.timestamp ? -1 : 1) : (a.fecha < b.fecha ? -1 : 1)));
  const r = {};
  orden.forEach(c => {
    if ((c.estado || '') === ESTADOS.GASTO_ANULADO || c.fecha > fin) return;
    const e = r[c.placa] || (r[c.placa] = { galones: 0, gastado: 0, kmInicio: null, kmFin: null, cargas: 0 });
    if (c.fecha < inicio) { e.kmInicio = c.odometro; return; }
    if (e.kmInicio === null) e.kmInicio = c.odometro;
    e.kmFin = c.odometro;
    e.galones += c.galones;
    e.gastado = sumarDinero(e.gastado, c.monto);
    e.cargas++;
  });
  Object.values(r).forEach(e => {
    e.km = (e.kmInicio !== null && e.kmFin !== null) ? Math.max(0, e.kmFin - e.kmInicio) : null;
    e.rendimiento = e.km && e.galones > 0 ? e.km / e.galones : null;
  });
  return r;
}

function diasSinCarga(cargas, placa, hoy) {
  const validas = cargas.filter(c => c.placa === placa && (c.estado || '') !== ESTADOS.GASTO_ANULADO);
  if (!validas.length) return null;
  const ultima = validas.reduce((max, c) => (c.fecha > max ? c.fecha : max), '');
  return diasEntre(ultima, hoy || obtenerFechaLocal());
}

// Rankings del período por producto, marca o cliente (V3 §17.2).
function rankingProductos(movimientos, inicio, fin, claveDe, filtro) {
  const r = {};
  for (const m of movimientos) {
    if (!esMovValido(m) || m.tipo !== TIPOS_MOV.VENTA || !enPeriodo(m.fecha, inicio, fin)) continue;
    if (filtro && !filtro(m)) continue;
    const k = claveDe(m);
    if (k === null || k === undefined || k === '') continue;
    const e = r[k] || (r[k] = { clave: k, ventas: 0, utilidad: 0, unidades: 0, ultimo: '' });
    e.ventas = sumarDinero(e.ventas, m.totalVenta || 0);
    e.utilidad = sumarDinero(e.utilidad, m.utilidad || 0);
    e.unidades += Math.abs(m.cantidad);
    if (m.fecha > e.ultimo) e.ultimo = m.fecha;
  }
  return Object.values(r).sort((a, b) => b.ventas - a.ventas);
}

// Movimientos APERTURA para empezar una base rotada en `fecha` (T20). Uno
// por producto con stock o con valor: guarda stock pagado, bonificado y el
// valor exacto del fondo de costo, para que stock y CPP sigan idénticos.
function construirAperturas(estados, productos, fecha, timestamp, folioDesde) {
  const filas = [];
  let n = folioDesde || 1;
  productos.forEach(p => {
    const e = estados[p.idProducto];
    if (!e || (e.stock === 0 && e.fondo === 0)) return;
    const bonif = Math.max(0, Math.min(e.bonif, e.stock));
    filas.push({
      folio: `AP-${String(n++).padStart(6, '0')}`, timestamp, fecha, tipo: TIPOS_MOV.APERTURA, sku: p.sku,
      marca: p.marca, linea: p.linea, presentacion: p.presentacion, volumen: p.volumen, variante: '',
      cantidad: redondearCantidad(e.stock - bonif), bonif, costoUnit: e.cpp, precioUnit: p.precio,
      inversion: e.fondo, margenUnit: 0, totalVenta: null, utilidad: null, tipoEmpaque: p.tipoEmpaque, estado: '',
      idCliente: null, empaqueMov: '', cantEmpaques: null, unidPorEmpaque: null, unidadesTotales: null,
      idTicket: '', productoNuevo: '', idProducto: p.idProducto, referencia: 'APERTURA'
    });
  });
  return filas;
}
