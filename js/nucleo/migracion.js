// © 2026 Kitsótaro · KoreStock Ledger · Código disponible, todos los derechos reservados (ver LICENSE).
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
//   HOJAS_V2, sugerirUnidadBase.
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

// Conversión PURA v2 → v3. `fusiones` = propuestas con aceptada === true.
function convertirAV3(datos, fusiones, opciones) {
  const { actor = '', ahora = obtenerTimestampLocal() } = opciones || {};
  const aceptadas = (fusiones || []).filter(f => f.aceptada);
  const avisos = [];

  const porId = new Map(datos.CATALOGO.filter(p => p.idProducto).map(p => [p.idProducto, p]));
  const destinoDe = new Map(), factorDe = new Map(), fusionDe = new Map();
  aceptadas.forEach(f => f.productos.forEach(id => {
    destinoDe.set(id, f.destino); factorDe.set(id, f.tipo === 'UNIDADES' ? f.factores[id] : 1); fusionDe.set(id, f);
  }));

  // Índices para enlazar cada movimiento viejo (que solo trae SKU y datos
  // copiados) con su producto. El SKU podía repetirse en la v2, así que
  // primero se busca por identidad completa.
  const claveIdentidad = (x) => [x.marca, x.linea, x.presentacion, x.volumen, x.variante].map(normalizarIdentidad).join('|');
  const porIdentidad = new Map(), porSku = new Map();
  datos.CATALOGO.forEach(p => {
    porIdentidad.set(claveIdentidad(p), p);
    if (!porSku.has(p.sku)) porSku.set(p.sku, []);
    porSku.get(p.sku).push(p);
  });
  const productoDeMov = (m) => {
    const ident = porIdentidad.get(claveIdentidad(m));
    if (ident && ident.sku === m.sku) return ident;
    const conSku = porSku.get(m.sku) || [];
    if (conSku.length === 1) return conSku[0];
    return ident || conSku[0] || null;
  };

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
    log.push(n);
  });
  if (sinProducto) avisos.push(`${sinProducto} movimiento(s) no se pudieron enlazar con un producto del catálogo; se copiaron sin producto.`);

  // ----- Catálogo -----
  const stockNuevo = stockDerivadoPorProducto(log);
  const catalogo = datos.CATALOGO.map(p => {
    const n = Object.assign({}, p);
    delete n._fila;
    const fusion = fusionDe.get(p.idProducto);
    const esDestino = fusion && fusion.destino === p.idProducto;
    const f = factorDe.get(p.idProducto) || 1;
    const u = umbralDe(p);
    n.unidadBase = String(p.presentacion || p.tipoEmpaque || 'unidad').toLowerCase();
    n.umbralMin = u.min; n.umbralMax = u.max;
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

  // ----- Histórico de precios, gastos, vehículos, combustible -----
  const historico = datos.LOG_HISTORICO_PRECIOS.map(h => {
    const n = Object.assign({}, h); delete n._fila;
    const p = (porSku.get(h.sku) || [])[0];
    if (p) {
      n.idProducto = destinoDe.get(p.idProducto) || p.idProducto;
      const fusion = fusionDe.get(p.idProducto);
      if (fusion && fusion.tipo === 'UNIDADES') n.detalle = `Precio por ${String(p.presentacion).toLowerCase()} de ${p.volumen} (antes de unificar)`;
    }
    return n;
  });
  const copiar = (lista) => lista.map(x => { const n = Object.assign({}, x); delete n._fila; return n; });

  const acciones = [{
    idAccion: 'AC-000001', timestamp: ahora, tipo: 'MIGRACION',
    alcance: `Base v2 → v3 · ${log.length} movimientos · ${aceptadas.length} fusión(es)`,
    foliosAnulados: '', foliosNuevos: '', estado: ESTADOS.ACCION_VIGENTE, timestampReversion: '', actor
  }];

  return {
    hojas: {
      LOG_TRANS: log, CATALOGO: catalogo, LOG_HISTORICO_PRECIOS: historico, UMBRALES: copiar(datos.UMBRALES),
      COSTOS_OPERATIVOS: copiar(datos.COSTOS_OPERATIVOS), VEHICULOS: copiar(datos.VEHICULOS),
      COSTOS_COMBUSTIBLE: copiar(datos.COSTOS_COMBUSTIBLE), EQUIVALENCIAS: equivalencias,
      PRESENTACIONES_VENTA: presentaciones, CLIENTES: [], LOG_ACCIONES: acciones
    },
    destinoDe, factorDe, avisos
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
    valorAntes = sumarDinero(valorAntes, multiplicarDinero(p.costo, p.stockCache));
  });
  v3.CATALOGO.forEach(p => {
    if (!p.idProducto || p.estado !== ESTADOS.ACTIVO || resultado.destinoDe.has(p.idProducto) || conDiferencia.has(p.idProducto)) return;
    valorDespues = sumarDinero(valorDespues, multiplicarDinero(p.costo, p.stockCache));
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
  const resultado = convertirAV3(datos, fusiones, { actor });
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
