// © 2026 Wilber Adonay Escobar Solórzano (Kitsótaro) · KoreStock Ledger · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// OPERACIONES-LOTES.JS — acciones drásticas por lote, registradas en
// LOG_ACCIONES y reversibles por 7 días (V3 §10.1, §9.4 punto 7, D19).
//
//   Corrección de precio por lote: elegir producto, fechas y precio
//   correcto → vista previa (cuántas ventas cambian y cuánto cambia la
//   utilidad) → anula las ventas y las vuelve a registrar con el precio
//   correcto (mismo día, cantidad, costo, cliente y ticket). El ledger no
//   se edita: se agregan filas nuevas y se marcan las viejas.
//   Anulación por lote: anula todo lo filtrado, con vista previa.
//   Revertir: anula los folios nuevos y deja otra vez VÁLIDOS los
//   originales. Es la ÚNICA excepción a «una anulada no se reactiva»
//   (invariante nuevo). Antes se comprueba que el stock alcance.
//
// Expone: DIAS_REVERSION, TIPOS_REVERTIBLES, prepararCorreccionPrecio,
//   operacionCorreccionPrecio, prepararAnulacionLote, estadoAccion,
//   revisarReversion, operacionRevertir.
// Depende de: almacen.js, esquema.js, calculos.js, cola-escritura.js, hoja.js,
//   dinero.js, sesion.js (actorActual), operaciones-catalogo.js (rangoFila).
// ============================================================

const DIAS_REVERSION = 7;
const TIPOS_REVERTIBLES = ['CORRECCION_PRECIO', 'ANULACION_TICKET', 'ANULACION_LOTE', 'ANULACION_LINEA'];

// precio: dinero por `porUnidades` unidades base (1 = por unidad; 30 = por cartón).
function prepararCorreccionPrecio({ idProducto, inicio, fin, precio, porUnidades = 1 }) {
  if (!(precio > 0)) throw new Error('Escribe el precio correcto.');
  const ventas = Almacen.movimientos.filter(m => m.idProducto === Number(idProducto) && m.tipo === TIPOS_MOV.VENTA && esMovValido(m) && enPeriodo(m.fecha, inicio, fin));
  const cambios = [];
  ventas.forEach(m => {
    const q = Math.abs(m.cantidad);
    const nuevoTotal = redondearCentavo(dividirDinero(multiplicarDinero(precio, q), porUnidades));
    if (nuevoTotal === m.totalVenta) return;
    cambios.push({ original: m, nuevoTotal, nuevaUtilidad: restarDinero(nuevoTotal, m.inversion) });
  });
  const totalAntes = sumarDinero(cambios.map(c => c.original.totalVenta || 0));
  const totalDespues = sumarDinero(cambios.map(c => c.nuevoTotal));
  const utilAntes = sumarDinero(cambios.map(c => c.original.utilidad || 0));
  const utilDespues = sumarDinero(cambios.map(c => c.nuevaUtilidad));
  return { idProducto: Number(idProducto), inicio, fin, precio, porUnidades, cambios, totalAntes, totalDespues, utilAntes, utilDespues, diferenciaUtilidad: restarDinero(utilDespues, utilAntes) };
}

function registroAccion(tipo, alcance, anulados, nuevos) {
  return {
    idAccion: Almacen.tomarFolio('AC-'), timestamp: obtenerTimestampLocal(), tipo, alcance,
    foliosAnulados: anulados.join(' '), foliosNuevos: nuevos.join(' '), estado: ESTADOS.ACCION_VIGENTE,
    timestampReversion: '', actor: actorActual() || 'sin-sesion'
  };
}

function operacionCorreccionPrecio(prep) {
  if (!prep.cambios.length) throw new Error('No hay ventas que cambiar con ese precio.');
  const ahora = obtenerTimestampLocal();
  const p = Almacen.producto(prep.idProducto);
  const nuevas = prep.cambios.map(c => Object.assign({}, c.original, {
    folio: Almacen.tomarFolio('FAC-'), timestamp: ahora, totalVenta: c.nuevoTotal, utilidad: c.nuevaUtilidad,
    precioUnit: precioUnitario(c.nuevoTotal, Math.abs(c.original.cantidad)),
    margenUnit: restarDinero(precioUnitario(c.nuevoTotal, Math.abs(c.original.cantidad)), c.original.costoUnit),
    estado: '', referencia: `Corrige ${c.original.folio}`, _fila: undefined
  }));
  nuevas.forEach(n => { delete n._fila; });
  const originales = prep.cambios.map(c => c.original);
  const registro = registroAccion('CORRECCION_PRECIO',
    `${p ? p.sku : prep.idProducto} · ${prep.inicio} a ${prep.fin} · ${formatearDinero(prep.precio)}${prep.porUnidades > 1 ? ` por ${prep.porUnidades}` : ''}`,
    originales.map(m => m.folio), nuevas.map(m => m.folio));
  return operacionLote('Corrección de precio', nuevas, originales, registro);
}

function prepararAnulacionLote(movimientos) {
  const validos = movimientos.filter(m => esMovValido(m) && (m.tipo === TIPOS_MOV.VENTA || m.tipo === TIPOS_MOV.ENTRADA));
  const r = calcularResumenPeriodo(validos, null, null);
  return { movimientos: validos, ventas: r.ventas, utilidad: r.utilidad, inversion: r.inversion, n: validos.length };
}

function operacionAnulacionLote(prep, alcance) {
  if (!prep.n) throw new Error('No hay movimientos válidos para anular.');
  const registro = registroAccion('ANULACION_LOTE', alcance, prep.movimientos.map(m => m.folio), []);
  return operacionLote('Anulación por lote', [], prep.movimientos, registro);
}

// Pasos comunes: agregar filas nuevas → marcar viejas → registrar acción.
function operacionLote(nombre, nuevas, aAnular, registro) {
  const col = columnaLetra(indiceColumna('LOG_TRANS', 'estado'));
  return crearOperacion(nombre, [
    { nombre: 'filas nuevas', fn: async () => {
      if (!nuevas.length) return;
      const r = await Hoja.agregar(Almacen.baseId, 'LOG_TRANS', nuevas.map(n => objetoAFila('LOG_TRANS', n, true)));
      nuevas.forEach((n, i) => { n._fila = r.primeraFila + i; });
      Almacen.agregarFilas('LOG_TRANS', nuevas);
    } },
    { nombre: 'anular', fn: async () => {
      await Hoja.actualizar(Almacen.baseId, aAnular.map(m => ({ rango: `LOG_TRANS!${col}${m._fila}`, valores: [[ESTADOS.MOV_ANULADA]] })));
      aAnular.forEach(m => Almacen.reemplazarFila('LOG_TRANS', Object.assign({}, m, { estado: ESTADOS.MOV_ANULADA })));
    } },
    { nombre: 'registro', fn: async (ctx) => {
      const r = await Hoja.agregar(Almacen.baseId, 'LOG_ACCIONES', [objetoAFila('LOG_ACCIONES', registro, true)]);
      registro._fila = r.primeraFila;
      Almacen.agregarFilas('LOG_ACCIONES', [registro]);
      ctx.resultado = { accion: registro, nuevas: nuevas.length, anuladas: aAnular.length };
      Almacen.notificar('lote'); guardarCacheBase();
    } }
  ]);
}

// VIGENTE (se puede revertir), REVERTIDA, EXPIRADA (pasaron los 7 días) o NO_REVERTIBLE.
function estadoAccion(a, hoy) {
  if (a.estado === ESTADOS.ACCION_REVERTIDA) return ESTADOS.ACCION_REVERTIDA;
  if (!TIPOS_REVERTIBLES.includes(a.tipo)) return 'NO_REVERTIBLE';
  if (diasEntre(String(a.timestamp).slice(0, 10), hoy || obtenerFechaLocal()) > DIAS_REVERSION) return ESTADOS.ACCION_EXPIRADA;
  return a.estado || ESTADOS.ACCION_VIGENTE;
}

// Qué pasaría al revertir: filas a reactivar/anular y si el stock alcanza.
function revisarReversion(idAccion) {
  const a = Almacen.hojas.LOG_ACCIONES.find(x => x.idAccion === idAccion);
  if (!a) throw new Error('Acción no encontrada');
  const lista = (t) => String(t || '').split(/\s+/).filter(Boolean).map(f => Almacen.movimientoPorFolio(f)).filter(Boolean);
  const reactivar = lista(a.foliosAnulados).filter(m => !esMovValido(m));
  const anular = lista(a.foliosNuevos).filter(esMovValido);
  // Stock tras revertir, por producto.
  const delta = {};
  reactivar.forEach(m => { delta[m.idProducto] = (delta[m.idProducto] || 0) + m.cantidad + m.bonif; });
  anular.forEach(m => { delta[m.idProducto] = (delta[m.idProducto] || 0) - (m.cantidad + m.bonif); });
  const faltantes = Object.entries(delta).map(([id, d]) => ({ p: Almacen.producto(id), queda: redondearCantidad(Almacen.stock(Almacen.idEfectivo(Number(id))) + d) }))
    .filter(x => x.queda < 0);
  return { accion: a, reactivar, anular, faltantes };
}

function operacionRevertir(idAccion) {
  const rev = revisarReversion(idAccion);
  const a = rev.accion;
  if (estadoAccion(a) !== ESTADOS.ACCION_VIGENTE) throw new Error('Esta acción ya no se puede revertir.');
  const col = columnaLetra(indiceColumna('LOG_TRANS', 'estado'));
  const ahora = obtenerTimestampLocal();
  const actualizada = Object.assign({}, a, { estado: ESTADOS.ACCION_REVERTIDA, timestampReversion: ahora });
  const nueva = registroAccion('REVERSION', `Revierte ${a.idAccion} (${a.tipo})`, rev.anular.map(m => m.folio), rev.reactivar.map(m => m.folio));
  return crearOperacion('Revertir', [
    { nombre: 'filas', fn: async () => {
      const datos = rev.anular.map(m => ({ rango: `LOG_TRANS!${col}${m._fila}`, valores: [[ESTADOS.MOV_ANULADA]] }))
        .concat(rev.reactivar.map(m => ({ rango: `LOG_TRANS!${col}${m._fila}`, valores: [['']] })));
      if (datos.length) await Hoja.actualizar(Almacen.baseId, datos);
      rev.anular.forEach(m => Almacen.reemplazarFila('LOG_TRANS', Object.assign({}, m, { estado: ESTADOS.MOV_ANULADA })));
      rev.reactivar.forEach(m => Almacen.reemplazarFila('LOG_TRANS', Object.assign({}, m, { estado: '' })));
    } },
    { nombre: 'acción', fn: async () => {
      await Hoja.actualizar(Almacen.baseId, [{ rango: rangoFila('LOG_ACCIONES', actualizada._fila), valores: [objetoAFila('LOG_ACCIONES', actualizada, false)] }]);
      Almacen.reemplazarFila('LOG_ACCIONES', actualizada);
    } },
    { nombre: 'registro', fn: async (ctx) => {
      const r = await Hoja.agregar(Almacen.baseId, 'LOG_ACCIONES', [objetoAFila('LOG_ACCIONES', nueva, true)]);
      nueva._fila = r.primeraFila; Almacen.agregarFilas('LOG_ACCIONES', [nueva]);
      ctx.resultado = { reactivadas: rev.reactivar.length, anuladas: rev.anular.length };
      Almacen.notificar('lote'); guardarCacheBase();
    } }
  ]);
}
