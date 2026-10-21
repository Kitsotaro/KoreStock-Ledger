// © 2026 Kitsótaro · KoreStock Ledger · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// ALMACEN.JS — los datos de la base activa, en memoria, y lo que se
// deriva de ellos (stock, CPP, búsquedas, folios).
//
// Todas las pantallas leen de aquí; nadie lee Sheets para pintar. Tras un
// guardado exitoso, la cola de escritura agrega aquí las filas nuevas y
// se recalcula (sin recarga completa: INVARIANTE 11 deja de aplicar).
// Las pantallas se enteran con Almacen.suscribir(fn).
//
// Expone: Almacen, nombreProducto, textoBuscableProducto, pluralUnidad.
// Depende de: esquema.js, calculos.js, utilidades.js, dinero.js.
// ============================================================

function nombreProducto(p, opciones) {
  if (!p) return '';
  const { conVariante = true } = opciones || {};
  // «Pilsener Pilsener Lata» → «Pilsener Lata»: si el producto ya empieza con la marca, no se repite.
  const marca = normalizarIdentidad(p.linea).startsWith(normalizarIdentidad(p.marca)) ? '' : p.marca;
  return [marca, p.linea, p.presentacion, p.volumen, conVariante ? p.variante : '']
    .map(x => String(x || '').trim()).filter(Boolean).join(' ');
}

function textoBuscableProducto(p) {
  return [p.sku, p.marca, p.linea, p.presentacion, p.volumen, p.variante, p.categoria, p.unidadBase].join(' ');
}

// Plural en español para nombres de unidad: huevo → huevos, cartón → cartones.
function pluralUnidad(palabra, cantidad) {
  const p = String(palabra || 'unidad').trim();
  if (Math.abs(Number(cantidad)) === 1) return p;
  if (/[aeiou]$/i.test(p)) return p + 's';
  if (/[áéíóú]n$/i.test(p)) return p.slice(0, -2) + p.slice(-2, -1).normalize('NFD').replace(/[̀-ͯ]/g, '') + 'nes';
  if (/z$/i.test(p)) return p.slice(0, -1) + 'ces';
  if (/s$/i.test(p)) return p;
  return p + 'es';
}

const PREFIJOS_FOLIO = { ENTRADA: 'IN-', VENTA: 'FAC-', GASTO: 'GO-', COMBUSTIBLE: 'CB-', TICKET: 'TK-', ACCION: 'AC-', APERTURA: 'AP-', REASIGNACION: 'RA-' };

const Almacen = {
  baseId: null,
  hojas: {},
  estados: {},
  porId: new Map(),
  clientesPorId: new Map(),
  contadores: {},
  sinConexion: false,
  actualizadoEn: '',
  _oyentes: new Set(),

  cargar(hojas, baseId) {
    this.baseId = baseId || this.baseId;
    this.hojas = {};
    NOMBRES_HOJAS.forEach(n => { this.hojas[n] = (hojas && hojas[n]) ? hojas[n] : []; });
    this.reindexar();
    this.recalcular();
    this.reiniciarContadores();
    this.notificar('carga');
  },

  reindexar() {
    this.porId = new Map(this.hojas.CATALOGO.filter(p => p.idProducto).map(p => [p.idProducto, p]));
    this.clientesPorId = new Map(this.hojas.CLIENTES.filter(c => c.idCliente).map(c => [c.idCliente, c]));
  },

  // Un producto unido a otro (FUSIONADO) suma sus movimientos al que queda
  // (§15.3). Los movimientos no se reescriben: solo se redirigen al calcular.
  idEfectivo(id) {
    let actual = Number(id), saltos = 0;
    while (saltos++ < 10) {
      const p = this.porId.get(actual);
      if (!p || p.estado !== ESTADOS.FUSIONADO || !p.fusionadoEn) return actual;
      actual = p.fusionadoEn;
    }
    return actual;
  },

  movimientosEfectivos() {
    const hayFusiones = this.productos.some(p => p.estado === ESTADOS.FUSIONADO && p.fusionadoEn);
    if (!hayFusiones) return this.hojas.LOG_TRANS;
    return this.hojas.LOG_TRANS.map(m => {
      const id = this.idEfectivo(m.idProducto);
      return id === m.idProducto ? m : Object.assign({}, m, { idProducto: id });
    });
  },

  recalcular() {
    this.estados = calcularEstadoProductos(this.movimientosEfectivos());
  },

  suscribir(fn) { this._oyentes.add(fn); return () => this._oyentes.delete(fn); },
  notificar(motivo) { this._oyentes.forEach(fn => { try { fn(motivo); } catch (e) { console.error(e); } }); },

  // ---------- Lecturas ----------
  get movimientos() { return this.hojas.LOG_TRANS || []; },
  get productos() { return this.hojas.CATALOGO || []; },
  producto(id) { return this.porId.get(Number(id)) || null; },
  productosVisibles() { return this.productos.filter(p => p.idProducto && p.estado !== ESTADOS.FUSIONADO); },
  productosActivos() { return this.productos.filter(p => p.idProducto && p.estado === ESTADOS.ACTIVO); },
  estado(id) {
    return this.estados[id] || { stock: 0, bonif: 0, fondo: 0, unidadesFondo: 0, cpp: 0, porVariante: {}, ultimaEntrada: '', ultimaVenta: '', unidadesVendidas: 0, unidadesCompradas: 0 };
  },
  stock(id) { return this.estado(id).stock; },

  buscarProductos(texto, opciones) {
    const { incluirObsoletos = false, limite = 8 } = opciones || {};
    const lista = incluirObsoletos ? this.productosVisibles() : this.productosActivos();
    const q = String(texto || '').trim();
    if (!q) return [];
    const resultado = lista.filter(p => coincidenPalabras(textoBuscableProducto(p), q));
    // Primero los que empiezan igual; luego los que más se venden.
    const qn = normalizarIdentidad(q);
    resultado.sort((a, b) => {
      const ia = normalizarIdentidad(nombreProducto(a)).startsWith(qn) ? 0 : 1;
      const ib = normalizarIdentidad(nombreProducto(b)).startsWith(qn) ? 0 : 1;
      return ia - ib || this.estado(b.idProducto).unidadesVendidas - this.estado(a.idProducto).unidadesVendidas;
    });
    return limite ? resultado.slice(0, limite) : resultado;
  },

  // «Más vendidos» de la cinta de Venta: últimos N días (V3 §31 punto 16).
  masVendidos(dias, limite, hoy) {
    const fin = hoy || obtenerFechaLocal();
    const inicio = restarDias(fin, dias || 30);
    const conteo = {};
    this.movimientos.forEach(m => {
      if (!esMovValido(m) || m.tipo !== TIPOS_MOV.VENTA || !enPeriodo(m.fecha, inicio, fin)) return;
      conteo[m.idProducto] = (conteo[m.idProducto] || 0) + 1;
    });
    return Object.entries(conteo).sort((a, b) => b[1] - a[1]).map(([id]) => this.producto(id))
      .filter(p => p && p.estado === ESTADOS.ACTIVO).slice(0, limite || 12);
  },

  presentacionesDe(idProducto) {
    return this.hojas.PRESENTACIONES_VENTA.filter(x => x.idProducto === Number(idProducto) && x.estado !== ESTADOS.INACTIVO)
      .sort((a, b) => b.cantidad - a.cantidad || a.orden - b.orden);
  },

  // Equivalencias del producto primero, luego las generales y las de otros
  // productos con la misma unidad base (V3 §10.2: se recuerdan y se sugieren).
  equivalenciasDe(idProducto) {
    const p = this.producto(idProducto);
    const unidad = p ? normalizarTexto(p.unidadBase) : '';
    const propias = [], otras = [];
    this.hojas.EQUIVALENCIAS.forEach(e => {
      if (e.idProducto === Number(idProducto)) propias.push(e);
      else if (!e.idProducto || normalizarTexto(e.nivelInferior) === unidad) otras.push(e);
    });
    const vistos = new Set();
    return propias.concat(otras).sort((a, b) => (b.ultimoUso || '') > (a.ultimoUso || '') ? 1 : -1)
      .filter(e => { const k = `${normalizarTexto(e.nombre)}|${e.unidades}|${normalizarTexto(e.nivelInferior)}`; if (vistos.has(k)) return false; vistos.add(k); return true; });
  },

  // Sabores ya usados con este producto (D24: el sabor es dato del movimiento).
  variantesDe(idProducto) {
    const vistos = new Map();
    this.movimientos.forEach(m => {
      if (m.idProducto === Number(idProducto) && m.variante) vistos.set(normalizarIdentidad(m.variante), m.variante);
    });
    return [...vistos.values()].sort((a, b) => a.localeCompare(b, 'es'));
  },

  clientesActivos() { return this.hojas.CLIENTES.filter(c => c.estado !== ESTADOS.INACTIVO).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')); },
  cliente(id) { return this.clientesPorId.get(Number(id)) || null; },
  vehiculosActivos() { return this.hojas.VEHICULOS.filter(v => v.estado !== ESTADOS.INACTIVO); },
  categorias() {
    const vistos = new Map();
    this.productosVisibles().forEach(p => { if (p.categoria) vistos.set(normalizarIdentidad(p.categoria), p.categoria); });
    return [...vistos.values()].sort((a, b) => a.localeCompare(b, 'es'));
  },
  umbral(clave) {
    const u = this.hojas.UMBRALES.find(x => normalizarTexto(x.clave) === normalizarTexto(clave));
    return u ? { min: u.min, max: u.max } : null;
  },

  // ---------- Folios y correlativos (desde la copia local: §22.3 punto 5) ----------
  reiniciarContadores() {
    const c = {};
    const subir = (prefijo, folio) => {
      const f = String(folio || '');
      if (!f.startsWith(prefijo)) return;
      const n = parseInt(f.slice(prefijo.length), 10) || 0;
      if (!c[prefijo] || n > c[prefijo]) c[prefijo] = n;
    };
    this.movimientos.forEach(m => {
      ['IN-', 'FAC-', 'AP-', 'RA-'].forEach(p => subir(p, m.folio));
      subir('TK-', m.idTicket);
    });
    this.hojas.COSTOS_OPERATIVOS.forEach(g => subir('GO-', g.folio));
    this.hojas.COSTOS_COMBUSTIBLE.forEach(g => subir('CB-', g.folio));
    this.hojas.LOG_ACCIONES.forEach(a => subir('AC-', a.idAccion));
    c.ID_PRODUCTO = this.productos.reduce((m, p) => Math.max(m, p.idProducto || 0), 0);
    c.ID_CLIENTE = this.hojas.CLIENTES.reduce((m, x) => Math.max(m, x.idCliente || 0), 0);
    c.ID_EQUIV = this.hojas.EQUIVALENCIAS.reduce((m, x) => Math.max(m, x.idEquiv || 0), 0);
    this.contadores = c;
  },

  tomarFolio(prefijo) {
    this.contadores[prefijo] = (this.contadores[prefijo] || 0) + 1;
    return `${prefijo}${String(this.contadores[prefijo]).padStart(6, '0')}`;
  },
  verFolioSiguiente(prefijo) {
    return `${prefijo}${String((this.contadores[prefijo] || 0) + 1).padStart(6, '0')}`;
  },
  tomarId(clave) {
    this.contadores[clave] = (this.contadores[clave] || 0) + 1;
    return this.contadores[clave];
  },

  // ---------- Cambios locales tras escribir en Sheets ----------
  agregarFilas(hoja, objetos) {
    this.hojas[hoja].push(...objetos);
    if (hoja === 'CATALOGO' || hoja === 'CLIENTES') this.reindexar();
    if (hoja === 'LOG_TRANS' || hoja === 'CATALOGO') this.recalcular();
  },

  reemplazarFila(hoja, objeto) {
    const lista = this.hojas[hoja];
    const i = lista.findIndex(x => x._fila === objeto._fila);
    if (i >= 0) lista[i] = objeto; else lista.push(objeto);
    if (hoja === 'CATALOGO' || hoja === 'CLIENTES') this.reindexar();
    if (hoja === 'LOG_TRANS' || (hoja === 'CATALOGO' && objeto.estado === ESTADOS.FUSIONADO)) this.recalcular();
  },

  movimientoPorFolio(folio) { return this.movimientos.find(m => m.folio === folio) || null; },
  movimientosDeTicket(idTicket) { return this.movimientos.filter(m => m.idTicket === idTicket); },

  instantanea() {
    return { id: this.baseId, hojas: this.hojas, guardado: obtenerTimestampLocal(), version: VERSION_ESQUEMA };
  }
};
