// © 2026 KoreStock Ledger — un proyecto de Kitsótaro · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// MIGRACION.JS — detecta la versión de una base y migra v2 → v3.
//
// Reglas (V3 §5, §16.4, D23, D36):
//   1. La base vieja NO se modifica: se crea una nueva en la carpeta
//      KoreStock y se copia. La vieja queda como respaldo.
//   2. Los productos pasan con unidad base = su presentación y factor 1;
//      nada cambia hasta que el usuario active unidades.
//   3. Los movimientos se copian tal cual, incluidas las anulaciones.
//   4. Verificación automática: mismo stock por producto, mismas ventas,
//      utilidad e inversión, mismo valor de bodega (productos no
//      fusionados), mismos folios. Si algo no cuadra NO se activa.
//   5. Repetible: si falla, se vuelve a correr desde la base vieja.
//   6. Fusiones SOLO con confirmación del usuario, una por una:
//      - UNIDADES: «Huevo Grande 30» + «Huevo Grande 12» → un producto
//        con unidad base «huevo»; cantidades × factor.
//      - VARIANTES: «Tortillitas Jalapeño» + «Nacho» → un producto; el
//        sabor queda como dato de cada movimiento (D24).
//      Cada movimiento conserva el SKU antiguo en REFERENCIA.
//
// La versión se detecta mirando la estructura (encabezados y pestañas),
// igual que hacía asegurarColumnaStockBonificado en la v2 (D23).
//
// Expone: detectarVersionEsquema, leerBaseV2, proponerFusiones,
//   convertirAV3, verificarMigracion, compararReleida, migrarBaseV2,
//   HOJAS_V2, sugerirUnidadBase, MODOS_UNIDAD, unidadesPorDefecto, nombreUnidadV2,
//   crearEnlazadorV2, movimientosSinProducto.
// Depende de: hoja.js, esquema.js, base-datos.js, dinero.js,
//   utilidades.js, calculos.js.
// ============================================================

const HOJAS_V2 = ['LOG_TRANS', 'CATALOGO', 'LOG_HISTORICO_PRECIOS', 'UMBRALES', 'COSTOS_OPERATIVOS', 'VEHICULOS', 'COSTOS_COMBUSTIBLE'];
const COLUMNAS_V2 = { LOG_TRANS: 'T', CATALOGO: 'P', LOG_HISTORICO_PRECIOS: 'H', UMBRALES: 'C', COSTOS_OPERATIVOS: 'G', VEHICULOS: 'F', COSTOS_COMBUSTIBLE: 'H' };

// Devuelve { version: 0 (no es base) | 2 | 3, titulos }.
async function detectarVersionEsquema(id) {
  const titulos = await Hoja.titulosHojas(id);
  if (!titulos.includes('LOG_TRANS') || !titulos.includes('CATALOGO')) return { version: 0, titulos };
  const [enc] = await Hoja.leerVarios(id, [`LOG_TRANS!A1:${ultimaLetra('LOG_TRANS')}1`]);
  const fila = (enc[0] || []).map(v => String(v).trim());
  return { version: fila[FIRMA_V3.indice] === FIRMA_V3.columna ? 3 : 2, titulos };
}

// Lee una base v2 completa como objetos (las columnas v2 coinciden con las
// primeras de v3, así que se interpretan con el mismo esquema).
async function leerBaseV2(id) {
  const titulos = await Hoja.titulosHojas(id);
  const presentes = HOJAS_V2.filter(h => titulos.includes(h));
  const rangos = presentes.map(h => `${h}!A2:${COLUMNAS_V2[h]}`);
  const filas = await Hoja.leerVarios(id, rangos);
  const datos = {};
  HOJAS_V2.forEach(h => { datos[h] = []; });
  presentes.forEach((h, i) => {
    filas[i].forEach((f, j) => {
      if (!f || f.length === 0 || f.every(v => v === '' || v === null)) return;
      datos[h].push(filaAObjeto(h, f, j + 2));
    });
  });
  return datos;
}

function agrupar(lista, claveDe) {
  const mapa = new Map();
  lista.forEach(x => { const k = claveDe(x); if (!mapa.has(k)) mapa.set(k, []); mapa.get(k).push(x); });
  return mapa;
}

function sugerirUnidadBase(producto) {
  const palabra = String(producto.linea || '').trim().split(/\s+/)[0] || 'unidad';
  return palabra.toLowerCase();
}

function nombreProductoV2(p) {
  return [p.marca, p.linea, p.presentacion, p.volumen, p.variante].filter(Boolean).join(' ');
}

// Propone fusiones (sin aplicarlas). Cada propuesta empieza SIN aceptar:
// el usuario debe confirmarla.
function proponerFusiones(datos) {
  const activos = datos.CATALOGO.filter(p => p.idProducto && p.estado !== ESTADOS.OBSOLETO);
  const propuestas = [];
  const usados = new Set();

  // A) Mismo producto en empaques con distinto número de unidades.
  const conConteo = activos.filter(p => /^\d+$/.test(String(p.volumen).trim()) && Number(p.volumen) > 0);
  agrupar(conConteo, p => [p.marca, p.linea, p.presentacion, p.variante].map(normalizarIdentidad).join('|'))
    .forEach(prods => {
      const volumenes = new Set(prods.map(p => Number(p.volumen)));
      if (prods.length < 2 || volumenes.size !== prods.length) return;
      prods.sort((a, b) => Number(b.volumen) - Number(a.volumen) || a.idProducto - b.idProducto);
      const destino = Math.min(...prods.map(p => p.idProducto));
      const factores = {};
      prods.forEach(p => { factores[p.idProducto] = Number(p.volumen); usados.add(p.idProducto); });
      propuestas.push({
        clave: 'U' + destino, tipo: 'UNIDADES', productos: prods.map(p => p.idProducto), destino,
        unidadBase: sugerirUnidadBase(prods[0]), factores, preciosDistintos: false, aceptada: false,
        descripcion: prods.map(p => nombreProductoV2(p))
      });
    });

  // B) Mismo producto con distintos sabores/variantes (D24).
  agrupar(activos.filter(p => !usados.has(p.idProducto)),
    p => [p.marca, p.linea, p.presentacion, p.volumen].map(normalizarIdentidad).join('|'))
    .forEach(prods => {
      if (prods.length < 2) return;
      const variantes = new Set(prods.map(p => normalizarIdentidad(p.variante)));
      if (variantes.size !== prods.length || !prods.some(p => p.variante)) return;
      prods.sort((a, b) => a.idProducto - b.idProducto);
      const preciosIguales = prods.every(p => p.costo === prods[0].costo && p.precio === prods[0].precio);
      const destino = prods[0].idProducto;
      const factores = {};
      prods.forEach(p => { factores[p.idProducto] = 1; });
      propuestas.push({
        clave: 'V' + destino, tipo: 'VARIANTES', productos: prods.map(p => p.idProducto), destino,
        unidadBase: null, factores, preciosDistintos: !preciosIguales, aceptada: false,
        descripcion: prods.map(p => nombreProductoV2(p))
      });
    });
  return propuestas;
}

function capitalizar(t) { t = String(t || ''); return t.charAt(0).toUpperCase() + t.slice(1); }

// Unidad de conteo de cada producto (Kitso, 2026-10-23): en la v2 la misma
// columna TIPO_EMPAQUE a veces era el empaque en que llega lo que se cuenta
// por unidad (lata a $0.52, «Caja») y a veces lo que de verdad se contaba
// (Pepsi 3 Lts a $8.50 la caja). El asistente pregunta, producto por producto:
//   PRESENTACION → se cuenta en la presentación (botella), sin cambios.
//   EMPAQUE      → se cuenta en el empaque (caja), sin cambios en cantidades.
//   CONVERTIR    → «caja de N botellas»: cantidades × N, costos y precios ÷ N,
//                  y la caja queda como empaque conocido (EQUIVALENCIAS).
const MODOS_UNIDAD = ['PRESENTACION', 'EMPAQUE', 'CONVERTIR'];
function unidadesPorDefecto(datos) {
  const r = {};
  datos.CATALOGO.forEach(p => { if (p.idProducto) r[p.idProducto] = { modo: 'PRESENTACION', unidades: 1 }; });
  return r;
}
function nombreUnidadV2(p, modo) {
  const t = String((modo === 'EMPAQUE' ? p.tipoEmpaque : p.presentacion) || p.tipoEmpaque || p.presentacion || 'unidad').trim().toLowerCase();
  return t || 'unidad';
}

// Enlaza cada movimiento viejo (que solo trae SKU y datos copiados) con su
// producto. El SKU podía repetirse en la v2, así que primero se busca por
// identidad completa. Si no hay coincidencia exacta, se intenta sin el sabor
// (la v2 guardaba el sabor del catálogo, p. ej. «uva», pero el movimiento podía
// venir vacío) cuando hay UN solo producto con esa marca, producto, presentación
// y contenido. Devuelve null si no encuentra (p. ej. un SKU mal escrito).
function crearEnlazadorV2(catalogo) {
  const claveIdentidad = (x) => [x.marca, x.linea, x.presentacion, x.volumen, x.variante].map(normalizarIdentidad).join('|');
  const claveSinSabor = (x) => [x.marca, x.linea, x.presentacion, x.volumen].map(normalizarIdentidad).join('|');
  const porIdentidad = new Map(), porSku = new Map(), porSinSabor = new Map();
  catalogo.forEach(p => {
    porIdentidad.set(claveIdentidad(p), p);
    if (!porSku.has(p.sku)) porSku.set(p.sku, []);
    porSku.get(p.sku).push(p);
    if (!porSinSabor.has(claveSinSabor(p))) porSinSabor.set(claveSinSabor(p), []);
    porSinSabor.get(claveSinSabor(p)).push(p);
  });
  const productoDeMov = (m) => {
    const ident = porIdentidad.get(claveIdentidad(m));
    if (ident && ident.sku === m.sku) return ident;
    const conSku = porSku.get(m.sku) || [];
    if (conSku.length === 1 && claveSinSabor(conSku[0]) === claveSinSabor(m)) return conSku[0];
    if (ident) return ident;
    const sinSabor = porSinSabor.get(claveSinSabor(m)) || [];
    if (sinSabor.length === 1) return sinSabor[0];
    return conSku[0] || null;
  };
  return { productoDeMov, porSku };
}

// Movimientos que no encuentran su producto, agrupados por cómo vienen escritos
// (Kitso, 2026-10-24: una entrada con el código AGBO-001 mal escrito dejó el
// stock de Agua Fría en negativo). El asistente pregunta a cuál unir cada grupo;
// `sugerido` = el único producto activo de esa marca, si lo hay.
function movimientosSinProducto(datos) {
  const { productoDeMov } = crearEnlazadorV2(datos.CATALOGO);
  const grupos = new Map();
  datos.LOG_TRANS.forEach(m => {
    if (productoDeMov(m)) return;
    const clave = [m.sku, m.marca, m.linea, m.presentacion, m.volumen].map(normalizarIdentidad).join('|');
    if (!grupos.has(clave)) {
      const deMarca = datos.CATALOGO.filter(p => p.idProducto && normalizarIdentidad(p.marca) === normalizarIdentidad(m.marca) && p.estado !== ESTADOS.OBSOLETO);
      grupos.set(clave, { clave, sku: m.sku, descripcion: nombreProductoV2(m), folios: [], unidades: 0, sugerido: deMarca.length === 1 ? deMarca[0].idProducto : null });
    }
    const g = grupos.get(clave);
    g.folios.push(m.folio);
    g.unidades += Number(m.cantidad || 0) + Number(m.bonif || 0);
  });
  return [...grupos.values()];
}

// Conversión PURA v2 → v3. `fusiones` = propuestas con aceptada === true.
// opciones.unidades = { [idProducto]: { modo, unidades } } (ver MODOS_UNIDAD).
// opciones.enlaces = { [folio]: idProducto } para movimientos sin producto.
function convertirAV3(datos, fusiones, opciones) {
  const { actor = '', ahora = obtenerTimestampLocal(), unidades = {}, enlaces = {} } = opciones || {};
  const aceptadas = (fusiones || []).filter(f => f.aceptada);
  const avisos = [];

  const porId = new Map(datos.CATALOGO.filter(p => p.idProducto).map(p => [p.idProducto, p]));
  const destinoDe = new Map(), factorDe = new Map(), fusionDe = new Map();
  aceptadas.forEach(f => f.productos.forEach(id => {
    destinoDe.set(id, f.destino); factorDe.set(id, f.tipo === 'UNIDADES' ? f.factores[id] : 1); fusionDe.set(id, f);
  }));
  // Unidad elegida por producto. Unión por empaques: la unidad de la unión.
  // Unión de sabores: todos se cuentan como el producto que queda (Kitso,
  // 2026-10-24: antes se ignoraba y «11 fardos» de Tortillitas pasaban como bolsas).
  const modoDe = new Map(), conversionDe = new Map();
  datos.CATALOGO.forEach(p => {
    if (!p.idProducto) return;
    const fusion = fusionDe.get(p.idProducto);
    if (fusion && fusion.tipo === 'UNIDADES') return;
    const u = unidades[fusion ? fusion.destino : p.idProducto] || {};
    const modo = MODOS_UNIDAD.includes(u.modo) ? u.modo : 'PRESENTACION';
    const n = Number(u.unidades);
    if (modo === 'CONVERTIR') {
      if (!(Number.isInteger(n) && n > 1)) throw new Error(`Indica cuántas unidades trae el empaque de «${nombreProductoV2(p)}» (un número entero mayor que 1).`);
      conversionDe.set(p.idProducto, n); factorDe.set(p.idProducto, n);
    }
    modoDe.set(p.idProducto, modo);
  });

  // Enlace de movimientos (ver crearEnlazadorV2); los que no se encuentran
  // usan el producto que eligió el usuario en el asistente (si eligió).
  const enlazador = crearEnlazadorV2(datos.CATALOGO);
  const porSku = enlazador.porSku;
  const productoDeMov = (m) => enlazador.productoDeMov(m) || (enlaces[m.folio] ? porId.get(Number(enlaces[m.folio])) || null : null);

  const umbralDe = (p) => {
    const u = datos.UMBRALES.find(x => normalizarTexto(x.clave) === normalizarTexto(p.tipoEmpaque)) ||
      datos.UMBRALES.find(x => x.clave === 'TODOS');
    return u ? { min: u.min, max: u.max } : { min: 4, max: 6 };
  };

  // ----- Movimientos -----
  const log = [];
  let sinProducto = 0;
  datos.LOG_TRANS.forEach(m => {
    const n = Object.assign({}, m);
    delete n._fila;
    const p = productoDeMov(m);
    if (!p || !p.idProducto) { sinProducto++; n.idProducto = null; log.push(n); return; }
    const idDestino = destinoDe.get(p.idProducto) || p.idProducto;
    n.idProducto = idDestino;
    // Unido a mano en el asistente: toma el código del producto y guarda el que traía.
    if (enlaces[m.folio] && m.sku !== p.sku) { n.referencia = m.sku; n.sku = p.sku; }
    const fusion = fusionDe.get(p.idProducto);
    if (fusion) {
      const destino = porId.get(idDestino);
      if (destino.sku !== m.sku || idDestino !== p.idProducto) { n.referencia = m.sku; n.sku = destino.sku; }
      if (fusion.tipo === 'UNIDADES') {
        const f = factorDe.get(p.idProducto);
        n.cantidad = m.cantidad * f;
        n.bonif = m.bonif * f;
        n.costoUnit = dividirDinero(m.costoUnit, f);
        n.precioUnit = dividirDinero(m.precioUnit, f);
        n.margenUnit = dividirDinero(m.margenUnit, f);
        n.empaqueMov = String(p.presentacion || 'empaque').toLowerCase();
        n.cantEmpaques = Math.abs(m.cantidad);
        n.unidPorEmpaque = f;
        n.unidadesTotales = Math.abs(m.cantidad) * f;
      }
    }
    if (!(fusion && fusion.tipo === 'UNIDADES') && conversionDe.has(p.idProducto)) {
      // «Caja de N»: lo registrado eran cajas; se guarda en unidades.
      const f = conversionDe.get(p.idProducto);
      n.cantidad = m.cantidad * f;
      n.bonif = m.bonif * f;
      n.costoUnit = dividirDinero(m.costoUnit, f);
      n.precioUnit = dividirDinero(m.precioUnit, f);
      n.margenUnit = dividirDinero(m.margenUnit, f);
      n.empaqueMov = nombreUnidadV2(p, 'EMPAQUE');
      n.cantEmpaques = Math.abs(m.cantidad);
      n.unidPorEmpaque = f;
      n.unidadesTotales = Math.abs(m.cantidad) * f;
    }
    log.push(n);
  });
  if (sinProducto) avisos.push(`${sinProducto} movimiento(s) no se pudieron enlazar con un producto del catálogo; se copiaron sin producto.`);

  // SKU repetido en el catálogo v2 (dos productos con el mismo código): el que
  // no lo usa en sus movimientos toma el código con el que sí se registraron.
  const skuNuevo = new Map();
  porSku.forEach((lista, sku) => {
    if (lista.length < 2) return;
    lista.forEach(p => {
      const usados = new Set(log.filter(m => m.idProducto === p.idProducto && !m.referencia).map(m => m.sku));
      if (usados.size === 1 && !usados.has(sku)) {
        const otro = [...usados][0];
        if (!porSku.has(otro)) { skuNuevo.set(p.idProducto, otro); avisos.push(`El código ${sku} estaba repetido: «${[p.marca, p.linea, p.presentacion, p.volumen].filter(Boolean).join(' ')}» queda con ${otro}, el de sus movimientos.`); }
      }
    });
  });

  // ----- Catálogo -----
  const stockNuevo = stockDerivadoPorProducto(log);
  const catalogo = datos.CATALOGO.map(p => {
    const n = Object.assign({}, p);
    delete n._fila;
    if (skuNuevo.has(p.idProducto)) n.sku = skuNuevo.get(p.idProducto);
    const fusion = fusionDe.get(p.idProducto);
    const esDestino = fusion && fusion.destino === p.idProducto;
    const f = factorDe.get(p.idProducto) || 1;
    const u = umbralDe(p);
    n.unidadBase = nombreUnidadV2(p, modoDe.get(p.idProducto));
    n.umbralMin = u.min; n.umbralMax = u.max;
    if (conversionDe.has(p.idProducto)) {
      const c = conversionDe.get(p.idProducto);
      n.costo = dividirDinero(p.costo, c);
      n.precio = dividirDinero(p.precio, c);
      n.umbralMin = Math.round(u.min * c); n.umbralMax = Math.round(u.max * c);
    }
    n.categoria = ''; n.decimales = ''; n.fusionadoEn = null;
    if (fusion && !esDestino) {
      n.estado = ESTADOS.FUSIONADO;
      n.fusionadoEn = fusion.destino;
      n.stockCache = 0; n.bonifCache = 0;
      if (fusion.tipo === 'UNIDADES') n.unidadBase = fusion.unidadBase;
      return n;
    }
    if (fusion && fusion.tipo === 'UNIDADES') {
      n.unidadBase = fusion.unidadBase;
      n.volumen = '';
      n.costo = dividirDinero(p.costo, f);
      n.precio = dividirDinero(p.precio, f);
      n.umbralMin = Math.round(u.min * f); n.umbralMax = Math.round(u.max * f);
    }
    if (fusion && fusion.tipo === 'VARIANTES') n.variante = '';
    const s = stockNuevo[p.idProducto] || { stock: 0, bonif: 0 };
    n.stockCache = s.stock; n.bonifCache = s.bonif;
    return n;
  });

  // ----- Equivalencias y presentaciones de venta (fusiones por unidades) -----
  const equivalencias = [], presentaciones = [];
  let idEquiv = 0;
  aceptadas.filter(f => f.tipo === 'UNIDADES').forEach(f => {
    const miembros = f.productos.map(id => porId.get(id)).sort((a, b) => f.factores[b.idProducto] - f.factores[a.idProducto]);
    miembros.forEach((p, orden) => {
      const usos = log.filter(m => m.referencia === p.sku || (m.idProducto === f.destino && m.unidPorEmpaque === f.factores[p.idProducto]));
      const ultimoUso = usos.reduce((max, m) => (m.fecha > max ? m.fecha : max), '');
      equivalencias.push({ idEquiv: ++idEquiv, nombre: String(p.presentacion || 'empaque').toLowerCase(), unidades: f.factores[p.idProducto],
        nivelInferior: f.unidadBase, idProducto: f.destino, ultimoUso });
      presentaciones.push({ idProducto: f.destino, etiqueta: `${capitalizar(p.presentacion || 'Empaque')} ${f.factores[p.idProducto]}`,
        cantidad: f.factores[p.idProducto], precio: p.precio, orden: orden + 1, estado: ESTADOS.ACTIVO });
    });
  });

  // El empaque de los productos convertidos queda como empaque conocido.
  conversionDe.forEach((c, id) => {
    if (destinoDe.has(id) && destinoDe.get(id) !== id) return; // sabor unido: el empaque queda en el que queda
    const p = porId.get(id);
    const usos = log.filter(m => m.idProducto === id && m.unidPorEmpaque === c);
    equivalencias.push({ idEquiv: ++idEquiv, nombre: nombreUnidadV2(p, 'EMPAQUE'), unidades: c, nivelInferior: nombreUnidadV2(p, 'PRESENTACION'),
      idProducto: id, ultimoUso: usos.reduce((max, m) => (m.fecha > max ? m.fecha : max), '') });
  });

  // ----- Histórico de precios, gastos, vehículos, combustible -----
  const historico = datos.LOG_HISTORICO_PRECIOS.map(h => {
    const n = Object.assign({}, h); delete n._fila;
    const p = (porSku.get(h.sku) || [])[0];
    if (p) {
      n.idProducto = destinoDe.get(p.idProducto) || p.idProducto;
      const fusion = fusionDe.get(p.idProducto);
      if (fusion && fusion.tipo === 'UNIDADES') n.detalle = `Precio por ${String(p.presentacion).toLowerCase()} de ${p.volumen} (antes de unificar)`;
      if (conversionDe.has(p.idProducto)) n.detalle = `Precio por ${nombreUnidadV2(p, 'EMPAQUE')} de ${conversionDe.get(p.idProducto)} (antes de contar por ${nombreUnidadV2(p, 'PRESENTACION')})`;
    }
    return n;
  });
  const copiar = (lista) => lista.map(x => { const n = Object.assign({}, x); delete n._fila; return n; });

  const acciones = [{
    idAccion: 'AC-000001', timestamp: ahora, tipo: 'MIGRACION',
    alcance: `Base v2 → v3 · ${log.length} movimientos · ${aceptadas.length} fusión(es)${conversionDe.size ? ` · ${conversionDe.size} producto(s) pasados a unidades` : ''}`,
    foliosAnulados: '', foliosNuevos: '', estado: ESTADOS.ACCION_VIGENTE, timestampReversion: '', actor
  }];

  return {
    hojas: {
      LOG_TRANS: log, CATALOGO: catalogo, LOG_HISTORICO_PRECIOS: historico, UMBRALES: copiar(datos.UMBRALES),
      COSTOS_OPERATIVOS: copiar(datos.COSTOS_OPERATIVOS), VEHICULOS: copiar(datos.VEHICULOS),
      COSTOS_COMBUSTIBLE: copiar(datos.COSTOS_COMBUSTIBLE), EQUIVALENCIAS: equivalencias,
      PRESENTACIONES_VENTA: presentaciones, CLIENTES: [], LOG_ACCIONES: acciones
    },
    destinoDe, factorDe, conversionDe, avisos
  };
}

function ultimoFolio(lista, prefijo) {
  let max = 0;
  lista.forEach(x => { const f = String(x.folio || ''); if (f.startsWith(prefijo)) max = Math.max(max, parseInt(f.slice(prefijo.length), 10) || 0); });
  return max;
}

function totalesControl(log) {
  const t = { ventas: 0, utilidad: 0, inversion: 0, anuladas: 0, filas: log.length };
  log.forEach(m => {
    if (!esMovValido(m)) { t.anuladas++; return; }
    if (m.tipo === TIPOS_MOV.VENTA) { t.ventas = sumarDinero(t.ventas, m.totalVenta || 0); t.utilidad = sumarDinero(t.utilidad, m.utilidad || 0); }
    if (m.tipo === TIPOS_MOV.ENTRADA) t.inversion = sumarDinero(t.inversion, m.inversion);
  });
  return t;
}

// Compara la base vieja con el resultado. Devuelve { ok, errores, avisos, resumen }.
function verificarMigracion(datos, resultado) {
  const errores = [], avisos = [].concat(resultado.avisos || []);
  const v3 = resultado.hojas;
  const antes = totalesControl(datos.LOG_TRANS), despues = totalesControl(v3.LOG_TRANS);
  [['filas', 'movimientos'], ['anuladas', 'anulaciones']].forEach(([k, nombre]) => {
    if (antes[k] !== despues[k]) errores.push(`Cantidad de ${nombre}: antes ${antes[k]}, después ${despues[k]}.`);
  });
  [['ventas', 'Ventas totales'], ['utilidad', 'Utilidad total'], ['inversion', 'Inversión en entradas']].forEach(([k, nombre]) => {
    if (antes[k] !== despues[k]) errores.push(`${nombre}: antes ${formatearDinero(antes[k])}, después ${formatearDinero(despues[k])}.`);
  });
  ['COSTOS_OPERATIVOS', 'COSTOS_COMBUSTIBLE', 'VEHICULOS', 'LOG_HISTORICO_PRECIOS'].forEach(h => {
    if (datos[h].length !== v3[h].length) errores.push(`Filas de ${h}: antes ${datos[h].length}, después ${v3[h].length}.`);
  });
  [['IN-', 'LOG_TRANS'], ['FAC-', 'LOG_TRANS'], ['GO-', 'COSTOS_OPERATIVOS'], ['CB-', 'COSTOS_COMBUSTIBLE']].forEach(([pre, h]) => {
    if (ultimoFolio(datos[h], pre) !== ultimoFolio(v3[h], pre)) errores.push(`El último folio ${pre} cambió.`);
  });

  // Stock por producto: el del historial nuevo debe ser igual a la suma de
  // los productos de origen × su factor (y al stock guardado en la v2).
  const stockV3 = stockDerivadoPorProducto(v3.LOG_TRANS);
  const esperado = {}, guardado = {};
  datos.CATALOGO.forEach(p => {
    if (!p.idProducto) return;
    const destino = resultado.destinoDe.get(p.idProducto) || p.idProducto;
    const f = resultado.factorDe.get(p.idProducto) || 1;
    guardado[destino] = (guardado[destino] || 0) + p.stockCache * f;
  });
  Object.keys(guardado).forEach(id => { esperado[id] = guardado[id]; });
  // Si el stock guardado en la v2 no coincide con su historial, YA NO se
  // bloquea (Kitso, 2026-10-22): se migra con el stock del historial y se
  // devuelve la lista de diferencias para advertir al usuario.
  const nombre = (id) => { const p = v3.CATALOGO.find(x => String(x.idProducto) === String(id)); return p ? nombreProductoV2(p) : `producto ${id}`; };
  const diferencias = [];
  Object.keys(esperado).forEach(id => {
    const calc = Math.round(((stockV3[id] && stockV3[id].stock) || 0) * 1000) / 1000;
    const esp = Math.round(esperado[id] * 1000) / 1000;
    if (calc !== esp) diferencias.push({ id: Number(id), nombre: nombre(id), guardado: esp, historial: calc });
  });
  const conDiferencia = new Set(diferencias.map(d => d.id));

  // Valor de bodega (costo vigente × stock) de los productos NO fusionados.
  let valorAntes = 0, valorDespues = 0;
  datos.CATALOGO.forEach(p => {
    if (!p.idProducto || p.estado === ESTADOS.OBSOLETO || resultado.destinoDe.has(p.idProducto) || conDiferencia.has(p.idProducto)) return;
    if (resultado.conversionDe && resultado.conversionDe.has(p.idProducto)) return; // se revisa aparte (abajo)
    valorAntes = sumarDinero(valorAntes, multiplicarDinero(p.costo, p.stockCache));
  });
  v3.CATALOGO.forEach(p => {
    if (!p.idProducto || p.estado !== ESTADOS.ACTIVO || resultado.destinoDe.has(p.idProducto) || conDiferencia.has(p.idProducto)) return;
    if (resultado.conversionDe && resultado.conversionDe.has(p.idProducto)) return;
    valorDespues = sumarDinero(valorDespues, multiplicarDinero(p.costo, p.stockCache));
  });
  // Convertidos a unidades: mismo valor salvo fracciones de centavo por el costo ÷ N (5 decimales).
  (resultado.conversionDe || new Map()).forEach((c, id) => {
    if (conDiferencia.has(id) || resultado.destinoDe.has(id)) return; // los unidos se avisan aparte
    const viejo = datos.CATALOGO.find(x => x.idProducto === id), nuevo = v3.CATALOGO.find(x => x.idProducto === id);
    if (!viejo || !nuevo || viejo.estado === ESTADOS.OBSOLETO) return;
    const a = multiplicarDinero(viejo.costo, viejo.stockCache), b = multiplicarDinero(nuevo.costo, nuevo.stockCache);
    if (Math.abs(redondearCentavo(a) - redondearCentavo(b)) > dinero(0.01)) errores.push(`Valor de bodega de «${nombreProductoV2(viejo)}» al pasarlo a unidades: antes ${formatearDinero(a)}, después ${formatearDinero(b)}.`);
  });
  if (redondearCentavo(valorAntes) !== redondearCentavo(valorDespues)) {
    errores.push(`Valor de bodega (productos sin fusionar): antes ${formatearDinero(valorAntes)}, después ${formatearDinero(valorDespues)}.`);
  }
  if (resultado.destinoDe.size) avisos.push('En los productos fusionados el valor de bodega se recalcula con el costo por unidad del producto que queda; el stock en unidades sí es idéntico.');

  return {
    ok: errores.length === 0, errores, avisos, diferencias,
    resumen: { antes, despues, valorBodegaSinFusionar: valorDespues, productos: v3.CATALOGO.filter(p => p.estado === ESTADOS.ACTIVO).length }
  };
}

// Compara lo que se escribió con lo que se vuelve a leer del archivo nuevo.
function compararReleida(escrito, releido) {
  const errores = [];
  NOMBRES_HOJAS.forEach(h => {
    const a = escrito[h] || [], b = releido[h] || [];
    if (a.length !== b.length) errores.push(`${h}: se escribieron ${a.length} filas y se leyeron ${b.length}.`);
  });
  const ta = totalesControl(escrito.LOG_TRANS || []), tb = totalesControl(releido.LOG_TRANS || []);
  ['ventas', 'utilidad', 'inversion', 'anuladas'].forEach(k => { if (ta[k] !== tb[k]) errores.push(`Al releer, ${k} no coincide.`); });
  const sa = stockDerivadoPorProducto(escrito.LOG_TRANS || []), sb = stockDerivadoPorProducto(releido.LOG_TRANS || []);
  Object.keys(sa).forEach(id => { if (!sb[id] || Math.abs(sa[id].stock - sb[id].stock) > 1e-9) errores.push(`Al releer, el stock del producto ${id} no coincide.`); });
  return { ok: errores.length === 0, errores };
}

// Orquestador: lee la base v2, convierte, verifica, escribe una base NUEVA,
// la relee y la verifica otra vez. No activa nada: devuelve el resultado
// para que quien llama decida (y guarde el id solo si todo está bien).
// opciones.aceptarDiferencias: el usuario ya vio las diferencias de stock y acepta migrar con el historial.
async function migrarBaseV2(idViejo, fusiones, alProgreso, opciones) {
  const avisar = (paso, texto) => { if (alProgreso) alProgreso(paso, texto); };
  avisar(1, 'Leyendo tu base actual…');
  const datos = await leerBaseV2(idViejo);
  avisar(2, 'Preparando la estructura nueva…');
  let actor = '';
  try { actor = await Hoja.correoUsuario(); } catch (e) { /* sin correo: se deja vacío */ }
  const resultado = convertirAV3(datos, fusiones, { actor, unidades: (opciones && opciones.unidades) || {}, enlaces: (opciones && opciones.enlaces) || {} });
  avisar(3, 'Comprobando que todo cuadre…');
  const verificacion = verificarMigracion(datos, resultado);
  if (!verificacion.ok) return { ok: false, etapa: 'verificacion', verificacion };
  if (verificacion.diferencias.length && !(opciones && opciones.aceptarDiferencias)) return { ok: false, etapa: 'diferencias', verificacion };
  avisar(4, 'Creando tu base nueva en la carpeta KoreStock…');
  const idNuevo = await crearBaseV3({ hojas: resultado.hojas, propiedades: { origen: idViejo, migrada: obtenerFechaLocal() } });
  avisar(5, 'Releyendo la base nueva para confirmar…');
  const releido = await leerHojas(idNuevo, NOMBRES_HOJAS);
  const comparacion = compararReleida(resultado.hojas, releido);
  if (!comparacion.ok) {
    await Hoja.actualizarArchivo(idNuevo, { nombre: `${NOMBRE_BASE} (migración fallida ${obtenerFechaLocal()})`, propiedades: { tipo: 'fallida' } });
    return { ok: false, etapa: 'relectura', verificacion, comparacion, idNuevo };
  }
  avisar(6, 'Listo.');
  return { ok: true, idNuevo, verificacion, comparacion };
}
