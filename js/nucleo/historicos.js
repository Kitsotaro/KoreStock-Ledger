// © 2026 Kitsótaro · KoreStock Ledger · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// HISTORICOS.JS — archivo histórico (rotación) y períodos que cruzan
// bases (T20; V3 §18.3, §21, §22.1, D26, D31, D32).
//
// ROTAR (con aviso y botón, nunca solo): cuando la base cumple 6 meses o
// llega a un tope de filas, la base actual pasa a ser «Histórico» (solo
// lectura; NO se le borra nada) y se crea una base principal NUEVA con:
//   - catálogo, clientes, vehículos, umbrales, presentaciones,
//     equivalencias, histórico de precios y acciones completos;
//   - un movimiento APERTURA por producto (stock, bonificado y valor del
//     fondo de costo al corte): stock y CPP siguen idénticos;
//   - los movimientos desde el corte (último mes);
//   - la última carga de combustible de cada vehículo (base del rendimiento);
//   - copias ARCHIVADA/ARCHIVADO del último folio de cada serie para no
//     repetir folios (no cuentan para nada).
// Antes: respaldo obligatorio. Después: verificación (stock, CPP, valor de
// bodega, ventas y utilidad de la ventana, folios) y relectura.
//
// PERÍODOS LARGOS: si el período empieza antes que la base principal, se
// leen solo los históricos que se cruzan con él, se unen y se quitan
// duplicados por folio. Lo leído se guarda en el dispositivo (los
// históricos no cambian). Sin confirmación, salvo que haya que leer más de
// un archivo o muchas filas que aún no están guardadas (D32, §22.1).
//
// Expone: MESES_PARA_ROTAR, FILAS_PARA_ROTAR, desdeBase, necesitaRotacion,
//   redirigirFusionados, prepararRotacion, verificarRotacion, rotarBase,
//   listarHistoricos, historicosParaPeriodo, cargarHistoricos, unirConHistoricos,
//   PeriodosLargos.
// Depende de: hoja.js, base-datos.js, esquema.js, calculos.js, almacen.js,
//   respaldos.js, migracion.js (compararReleida), cache-local.js, dinero.js.
// ============================================================

const MESES_PARA_ROTAR = 6;
const FILAS_PARA_ROTAR = 100000;   // tope por volumen (§22.3 punto 1); ajustar con pruebas
const DIAS_VENTANA = 30;           // «el último mes» que se conserva
const FILAS_CONFIRMAR_HISTORICOS = 100000;

// Primer día cubierto por la base (la APERTURA o el primer movimiento).
function desdeBase(movs) {
  let min = '';
  for (const m of movs) { if (m.fecha && (!min || m.fecha < min) && m.estado !== ESTADOS.MOV_ARCHIVADA) min = m.fecha; }
  return min;
}

function necesitaRotacion(movs, hoy) {
  const desde = desdeBase(movs);
  if (!desde) return { rotar: false };
  const f = textoAFecha(desde); f.setMonth(f.getMonth() + MESES_PARA_ROTAR);
  const limite = fechaATexto(f);
  const porTiempo = (hoy || obtenerFechaLocal()) >= limite;
  const porVolumen = movs.length >= FILAS_PARA_ROTAR;
  return { rotar: porTiempo || porVolumen, porTiempo, porVolumen, desde, filas: movs.length };
}

// Movimientos de productos unidos cuentan para el producto que quedó.
function redirigirFusionados(movs, catalogo) {
  const destino = new Map(catalogo.filter(p => p.estado === ESTADOS.FUSIONADO && p.fusionadoEn).map(p => [p.idProducto, p.fusionadoEn]));
  if (!destino.size) return movs;
  const efectivo = (id) => { let a = id, n = 0; while (destino.has(a) && n++ < 10) a = destino.get(a); return a; };
  return movs.map(m => (destino.has(m.idProducto) ? Object.assign({}, m, { idProducto: efectivo(m.idProducto) }) : m));
}

function sinFila(o) { const n = Object.assign({}, o); delete n._fila; return n; }

// Conversión PURA: hojas de la base actual → hojas de la base principal nueva.
function prepararRotacion(hojas, opciones) {
  const { hoy = obtenerFechaLocal(), corte = restarDias(hoy, DIAS_VENTANA) } = opciones || {};
  const movs = hojas.LOG_TRANS;
  const catalogo = hojas.CATALOGO;
  const efectivos = redirigirFusionados(movs, catalogo);
  const estadosCorte = calcularEstadoProductos(efectivos, { hasta: restarDias(corte, 1) });
  const productos = catalogo.filter(p => p.idProducto && p.estado !== ESTADOS.FUSIONADO);
  let maxAP = 0;
  movs.forEach(m => { if (String(m.folio).startsWith('AP-')) maxAP = Math.max(maxAP, parseInt(m.folio.slice(3), 10) || 0); });
  const aperturas = construirAperturas(estadosCorte, productos, corte, `${corte} 00:00:00`, maxAP + 1);

  const ventana = movs.filter(m => m.fecha >= corte).map(sinFila);
  const enVentana = new Set(ventana.map(m => m.folio));
  // Último folio de cada serie (y el último ticket), como copia ARCHIVADA si quedó fuera.
  const copias = new Map();
  const ultimoDe = (lista, claveDe) => lista.reduce((mejor, x) => {
    const k = claveDe(x); if (!k) return mejor;
    return (!mejor || k > claveDe(mejor)) ? x : mejor;
  }, null);
  ['IN-', 'FAC-', 'RA-'].forEach(pre => {
    const u = ultimoDe(movs.filter(m => String(m.folio).startsWith(pre)), m => m.folio);
    if (u && !enVentana.has(u.folio)) copias.set(u.folio, Object.assign(sinFila(u), { estado: ESTADOS.MOV_ARCHIVADA }));
  });
  const ultTicket = ultimoDe(movs.filter(m => m.idTicket), m => m.idTicket);
  if (ultTicket && !ventana.some(m => m.idTicket === ultTicket.idTicket) && !copias.has(ultTicket.folio)) {
    copias.set(ultTicket.folio, Object.assign(sinFila(ultTicket), { estado: ESTADOS.MOV_ARCHIVADA }));
  }
  const log = aperturas.concat([...copias.values()], ventana);

  const gastosVentana = hojas.COSTOS_OPERATIVOS.filter(g => g.fecha >= corte).map(sinFila);
  const ultGasto = ultimoDe(hojas.COSTOS_OPERATIVOS, g => g.folio);
  const gastos = (ultGasto && !gastosVentana.some(g => g.folio === ultGasto.folio))
    ? [Object.assign(sinFila(ultGasto), { estado: ESTADOS.GASTO_ARCHIVADO })].concat(gastosVentana) : gastosVentana;

  const cargasVentana = hojas.COSTOS_COMBUSTIBLE.filter(c => c.fecha >= corte).map(sinFila);
  const previas = [];
  const placas = new Set(hojas.COSTOS_COMBUSTIBLE.map(c => c.placa));
  placas.forEach(placa => {
    const antes = hojas.COSTOS_COMBUSTIBLE.filter(c => c.placa === placa && c.fecha < corte && esGastoValido(c));
    const ult = antes.sort((a, b) => (a.fecha === b.fecha ? (a.timestamp < b.timestamp ? -1 : 1) : (a.fecha < b.fecha ? -1 : 1))).pop();
    if (ult) previas.push(sinFila(ult));
  });
  let cargas = previas.concat(cargasVentana);
  const ultCarga = ultimoDe(hojas.COSTOS_COMBUSTIBLE, c => c.folio);
  if (ultCarga && !cargas.some(c => c.folio === ultCarga.folio)) cargas = [Object.assign(sinFila(ultCarga), { estado: ESTADOS.GASTO_ARCHIVADO })].concat(cargas);

  // Catálogo con la copia del stock al día.
  const estadosHoy = calcularEstadoProductos(efectivos);
  const catalogoNuevo = catalogo.map(p => Object.assign(sinFila(p), {
    stockCache: (estadosHoy[p.idProducto] || {}).stock || 0, bonifCache: (estadosHoy[p.idProducto] || {}).bonif || 0
  }));
  const copiar = (n) => (hojas[n] || []).map(sinFila);
  return {
    corte,
    desdeAnterior: desdeBase(movs),
    hojas: {
      LOG_TRANS: log, CATALOGO: catalogoNuevo, LOG_HISTORICO_PRECIOS: copiar('LOG_HISTORICO_PRECIOS'), UMBRALES: copiar('UMBRALES'),
      COSTOS_OPERATIVOS: gastos, VEHICULOS: copiar('VEHICULOS'), COSTOS_COMBUSTIBLE: cargas, EQUIVALENCIAS: copiar('EQUIVALENCIAS'),
      PRESENTACIONES_VENTA: copiar('PRESENTACIONES_VENTA'), CLIENTES: copiar('CLIENTES'), LOG_ACCIONES: copiar('LOG_ACCIONES')
    }
  };
}

function contadoresDe(hojas) {
  const c = {};
  const subir = (pre, f) => { f = String(f || ''); if (f.startsWith(pre)) c[pre] = Math.max(c[pre] || 0, parseInt(f.slice(pre.length), 10) || 0); };
  hojas.LOG_TRANS.forEach(m => { ['IN-', 'FAC-', 'RA-'].forEach(p => subir(p, m.folio)); subir('TK-', m.idTicket); });
  hojas.COSTOS_OPERATIVOS.forEach(g => subir('GO-', g.folio));
  hojas.COSTOS_COMBUSTIBLE.forEach(g => subir('CB-', g.folio));
  return c;
}

// Compara la base actual con la rotada. Devuelve { ok, errores }.
function verificarRotacion(hojasViejas, rot) {
  const errores = [];
  const nuevas = rot.hojas;
  const ev = calcularEstadoProductos(redirigirFusionados(hojasViejas.LOG_TRANS, hojasViejas.CATALOGO));
  const en = calcularEstadoProductos(redirigirFusionados(nuevas.LOG_TRANS, nuevas.CATALOGO));
  const ids = new Set(Object.keys(ev).concat(Object.keys(en)));
  ids.forEach(id => {
    const a = ev[id] || { stock: 0, fondo: 0, cpp: 0 }, b = en[id] || { stock: 0, fondo: 0, cpp: 0 };
    if (a.stock !== b.stock) errores.push(`Stock del producto ${id}: ${a.stock} → ${b.stock}`);
    if (a.fondo !== b.fondo) errores.push(`Valor a costo promedio del producto ${id} cambió`);
    if (a.cpp !== b.cpp) errores.push(`Costo promedio del producto ${id} cambió`);
    const va = a.porVariante || {}, vb = b.porVariante || {};
    new Set(Object.keys(va).concat(Object.keys(vb))).forEach(v => {
      if ((va[v] || 0) !== (vb[v] || 0)) errores.push(`Sabor «${v || 'sin sabor'}» del producto ${id}: ${va[v] || 0} → ${vb[v] || 0}`);
    });
  });
  const fin = '9999-12-31';
  const ra = calcularResumenPeriodo(hojasViejas.LOG_TRANS, rot.corte, fin), rb = calcularResumenPeriodo(nuevas.LOG_TRANS, rot.corte, fin);
  ['ventas', 'utilidad', 'inversion'].forEach(k => { if (ra[k] !== rb[k]) errores.push(`El total de ${k} desde el corte cambió`); });
  const prods = (c) => c.filter(p => p.estado === ESTADOS.ACTIVO);
  if (valorBodega(prods(hojasViejas.CATALOGO), ev).bruto !== valorBodega(prods(nuevas.CATALOGO), en).bruto) errores.push('El valor de bodega cambió');
  const ca = contadoresDe(hojasViejas), cb = contadoresDe(nuevas);
  Object.keys(ca).forEach(k => { if (ca[k] !== cb[k]) errores.push(`El último folio ${k} no se conservó`); });
  return { ok: errores.length === 0, errores };
}

// Orquestador: respaldo → convertir → verificar → base nueva → releer →
// la nueva pasa a principal y la actual a histórico (solo nombre y
// propiedades). Devuelve el id nuevo para que quien llama lo abra.
async function rotarBase(baseId, alProgreso) {
  const avisar = (p, t) => { if (alProgreso) alProgreso(p, t); };
  avisar(1, 'Haciendo un respaldo antes de archivar…');
  await hacerRespaldo(baseId, 'antes de archivar');
  avisar(2, 'Leyendo tu base…');
  const hojas = await leerHojas(baseId, NOMBRES_HOJAS);
  avisar(3, 'Preparando la base nueva…');
  const rot = prepararRotacion(hojas);
  const ver = verificarRotacion(hojas, rot);
  if (!ver.ok) return { ok: false, etapa: 'verificacion', errores: ver.errores };
  avisar(4, 'Creando la base nueva…');
  const idNuevo = await crearBaseV3({ hojas: rot.hojas, propiedades: { tipo: 'pendiente', origen: baseId, desde: rot.corte } });
  avisar(5, 'Comprobando la base nueva…');
  const releido = await leerHojas(idNuevo, NOMBRES_HOJAS);
  const comp = compararReleida(rot.hojas, releido);
  if (!comp.ok) {
    await Hoja.actualizarArchivo(idNuevo, { propiedades: { tipo: 'fallida' } });
    return { ok: false, etapa: 'relectura', errores: comp.errores };
  }
  avisar(6, 'Guardando la base anterior como histórico…');
  const hasta = restarDias(rot.corte, 1);
  await activarBaseNueva(idNuevo, baseId, {
    nombre: `${NOMBRE_BASE} · histórico ${rot.desdeAnterior} a ${hasta}`,
    propiedades: { tipo: 'historico', desde: rot.desdeAnterior, hasta, sucesor: idNuevo, filas: String(hojas.LOG_TRANS.length) }
  });
  return { ok: true, idNuevo, corte: rot.corte };
}

// ---------- Históricos en reportes ----------
async function listarHistoricos() {
  return (await Hoja.listarArchivos({ propiedades: { korestock: 'base', tipo: 'historico' } }))
    .sort((a, b) => (a.propiedades.desde || '') < (b.propiedades.desde || '') ? -1 : 1);
}

function historicosParaPeriodo(historicos, inicio, fin) {
  return historicos.filter(h => (!fin || (h.propiedades.desde || '') <= fin) && (!inicio || (h.propiedades.hasta || '9999') >= inicio));
}

const HOJAS_HISTORICO = ['LOG_TRANS', 'COSTOS_OPERATIVOS', 'COSTOS_COMBUSTIBLE'];

// Lee (o toma de la copia local) los históricos indicados.
async function cargarHistoricos(lista, alProgreso) {
  const salida = [];
  for (let i = 0; i < lista.length; i++) {
    const h = lista[i];
    let datos = await CacheLocal.leer(h.id, 'historicos');
    if (!datos) {
      if (alProgreso) alProgreso(i + 1, lista.length);
      const hojas = await leerHojas(h.id, HOJAS_HISTORICO);
      datos = { id: h.id, hojas, desde: h.propiedades.desde, hasta: h.propiedades.hasta };
      await CacheLocal.guardar(datos, 'historicos');
    }
    salida.push(datos);
  }
  return salida;
}

// Une históricos con la base principal, sin duplicados por folio. Las
// copias ARCHIVADA de la principal se descartan si el original está en un
// histórico. La APERTURA solo se conserva del archivo MÁS ANTIGUO leído:
// las de los siguientes resumen justamente lo que ya está en las filas
// reales (§21.1 punto 4), así stock y CPP salen igual que sin rotar.
function unirConHistoricos(principal, historicos) {
  const fuentes = historicos.slice().sort((a, b) => ((a.desde || '') < (b.desde || '') ? -1 : 1))
    .map(h => h.hojas).concat([principal]);
  const unir = (clave) => {
    const porFolio = new Map();
    fuentes.forEach((hojas, i) => (hojas[clave] || []).forEach(x => {
      if (i > 0 && x.tipo === TIPOS_MOV.APERTURA) return;
      const archivada = x.estado === ESTADOS.MOV_ARCHIVADA || x.estado === ESTADOS.GASTO_ARCHIVADO;
      if (archivada && porFolio.has(x.folio)) return;
      // Lo más reciente manda (p. ej. una venta del mes anulada después de archivar).
      porFolio.set(x.folio, i < fuentes.length - 1 ? Object.assign({}, x, { _historico: true }) : x);
    }));
    return [...porFolio.values()];
  };
  return { LOG_TRANS: unir('LOG_TRANS'), COSTOS_OPERATIVOS: unir('COSTOS_OPERATIVOS'), COSTOS_COMBUSTIBLE: unir('COSTOS_COMBUSTIBLE') };
}

// ---------- Períodos que empiezan antes que la base principal ----------
// Guarda en memoria lo leído en esta sesión y la unión ya hecha. Las
// pantallas piden hojasPara(inicio): si los históricos de ese período aún
// no están, reciben la base principal y piden preparar(...) aparte.
const PeriodosLargos = {
  lista: null,             // históricos en Drive (se consulta una vez por sesión)
  datos: new Map(),        // id → hojas leídas
  rechazado: null,         // inicio que el usuario prefirió no leer
  _union: null, _clave: '',

  reiniciar() { this.lista = null; this.datos = new Map(); this.rechazado = null; this._union = null; this._clave = ''; },

  // Primer día que falta para cubrir `inicio` con la base principal ('' si no falta nada).
  faltaDesde(inicio) {
    const desde = desdeBase(Almacen.movimientos);
    return inicio && desde && inicio < desde ? desde : '';
  },

  necesarios(inicio) {
    const desde = this.faltaDesde(inicio);
    if (!desde || !this.lista) return [];
    return historicosParaPeriodo(this.lista, inicio, restarDias(desde, 1));
  },

  cubre(inicio) {
    if (!this.faltaDesde(inicio)) return true;
    return !!this.lista && this.necesarios(inicio).every(h => this.datos.has(h.id));
  },

  // Movimientos (con productos unidos redirigidos), gastos y cargas para el período.
  hojasPara(inicio) {
    const necesarios = this.necesarios(inicio).filter(h => this.datos.has(h.id));
    if (!necesarios.length) {
      return { LOG_TRANS: Almacen.movimientosEfectivos(), COSTOS_OPERATIVOS: Almacen.hojas.COSTOS_OPERATIVOS, COSTOS_COMBUSTIBLE: Almacen.hojas.COSTOS_COMBUSTIBLE };
    }
    const clave = necesarios.map(h => h.id).join(',');
    if (!this._union || this._clave !== clave) {
      const u = unirConHistoricos(Almacen.hojas, necesarios.map(h => this.datos.get(h.id)));
      u.LOG_TRANS = redirigirFusionados(u.LOG_TRANS, Almacen.productos);
      this._union = u; this._clave = clave;
    }
    return this._union;
  },

  // Lee lo que falte. confirmarLectura({ archivos, filas }) → Promise<boolean>
  // solo se llama si hay que leer de Drive más de un archivo o muchas filas
  // (D32, §22.1). Devuelve true si cambió algo.
  async preparar(inicio, { confirmarLectura, alProgreso, sinRed } = {}) {
    if (!this.faltaDesde(inicio) || this.rechazado === inicio) return false;
    if (!this.lista) {
      if (sinRed) return false;
      this.lista = await listarHistoricos();
    }
    const faltan = this.necesarios(inicio).filter(h => !this.datos.has(h.id));
    if (!faltan.length) return false;
    const sinCopia = [];
    for (const h of faltan) {
      const copia = await CacheLocal.leer(h.id, 'historicos');
      if (copia) this.datos.set(h.id, copia); else sinCopia.push(h);
    }
    if (sinCopia.length && !sinRed) {
      const filas = sinCopia.reduce((s, h) => s + (Number(h.propiedades.filas) || 0), 0);
      const pedir = sinCopia.length > 1 || filas > FILAS_CONFIRMAR_HISTORICOS;
      if (pedir && confirmarLectura && !(await confirmarLectura({ archivos: sinCopia.length, filas }))) { this.rechazado = inicio; }
      else (await cargarHistoricos(sinCopia, alProgreso)).forEach(d => this.datos.set(d.id, d));
    }
    this._union = null;
    return true;
  }
};

// Cualquier cambio en la base principal invalida la unión hecha.
Almacen.suscribir(() => { PeriodosLargos._union = null; });
