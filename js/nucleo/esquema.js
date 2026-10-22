// © 2026 Kitsótaro · KoreStock Ledger · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// ESQUEMA.JS — hojas y columnas de la base v3, en UN solo lugar.
//
// Cada hoja declara sus columnas EN ORDEN (índice = posición, INVARIANTE 3):
// las columnas nuevas solo se agregan AL FINAL. Cada columna tiene un
// nombre de campo (para el objeto en memoria), su encabezado (para el
// Sheet) y su tipo:
//   t  texto · n  número · n? número o vacío (null) · e  entero o vacío · d  dinero (entero de escala)
//   d? dinero o vacío (null) · f  fecha/hora (texto local)
//
// Expone: VERSION_ESQUEMA, ESQUEMA, NOMBRES_HOJAS, columnaLetra,
//   ultimaLetra, rangoDatos, rangoEncabezados, filaAObjeto, objetoAFila,
//   encabezadosDe, TIPOS_MOV, ESTADOS, FIRMA_V3.
// Depende de: dinero.js, utilidades.js (parsearNumero, normalizarFechaCelda).
// ============================================================

const VERSION_ESQUEMA = 3;

const TIPOS_MOV = { ENTRADA: 'ENTRADA', VENTA: 'VENTA', APERTURA: 'APERTURA', REASIGNACION: 'REASIGNACION' };
const ESTADOS = {
  MOV_ANULADA: 'ANULADA', GASTO_ANULADO: 'ANULADO',
  // Copias que una base rotada guarda SOLO para seguir los folios (T20); no cuentan para nada.
  MOV_ARCHIVADA: 'ARCHIVADA', GASTO_ARCHIVADO: 'ARCHIVADO',
  ACTIVO: 'ACTIVO', OBSOLETO: 'OBSOLETO', FUSIONADO: 'FUSIONADO', INACTIVO: 'INACTIVO',
  ACCION_VIGENTE: 'VIGENTE', ACCION_REVERTIDA: 'REVERTIDA', ACCION_EXPIRADA: 'EXPIRADA'
};

// [campo, ENCABEZADO, tipo]
const ESQUEMA = {
  LOG_TRANS: [
    ['folio', 'TRANS_ID', 't'], ['timestamp', 'TIMESTAMP_LOG', 'f'], ['fecha', 'FECHA_MOV', 'f'],
    ['tipo', 'TIPO_MOV', 't'], ['sku', 'SKU_ITEM', 't'], ['marca', 'MARCA', 't'], ['linea', 'LINEA_PROD', 't'],
    ['presentacion', 'PRESENTACION', 't'], ['volumen', 'VOLUMEN', 't'], ['variante', 'VARIANTE', 't'],
    ['cantidad', 'CANTIDAD', 'n'], ['bonif', 'UNID_BONIF', 'n'], ['costoUnit', 'P_DISTRIBUIDOR', 'd'],
    ['precioUnit', 'P_CONSUMIDOR', 'd'], ['inversion', 'TOTAL_INVERSION', 'd'], ['margenUnit', 'MARGEN_UNIT', 'd'],
    ['totalVenta', 'TOTAL_VENTA', 'd?'], ['utilidad', 'UTILIDAD_NETA', 'd?'], ['tipoEmpaque', 'TIPO_EMPAQUE', 't'],
    ['estado', 'ESTADO_MOV', 't'],
    // v3 (al final)
    ['idCliente', 'ID_CLIENTE', 'e'], ['empaqueMov', 'EMPAQUE_MOV', 't'], ['cantEmpaques', 'CANT_EMPAQUES', 'n?'],
    ['unidPorEmpaque', 'UNID_POR_EMPAQUE', 'n?'], ['unidadesTotales', 'UNIDADES_TOTALES', 'n?'],
    ['idTicket', 'ID_TICKET', 't'], ['productoNuevo', 'PRODUCTO_NUEVO', 't'], ['idProducto', 'ID_PRODUCTO', 'e'],
    ['referencia', 'REFERENCIA', 't']
  ],
  CATALOGO: [
    ['sku', 'SKU_ITEM', 't'], ['marca', 'MARCA', 't'], ['linea', 'LINEA_PROD', 't'], ['presentacion', 'PRESENTACION', 't'],
    ['volumen', 'VOLUMEN', 't'], ['variante', 'VARIANTE', 't'], ['costo', 'P_DISTRIBUIDOR', 'd'], ['precio', 'P_CONSUMIDOR', 'd'],
    ['stockCache', 'STOCK_ACTUAL', 'n'], ['estado', 'ESTADO_ITEM', 't'], ['ultimaModif', 'ULTIMA_MODIF', 'f'],
    ['tipoEmpaque', 'TIPO_EMPAQUE', 't'], ['idProducto', 'ID_PRODUCTO', 'e'], ['fechaCreacion', 'FECHA_CREACION', 'f'],
    ['modificacionAnterior', 'MODIFICACION_ANTERIOR', 'f'], ['bonifCache', 'STOCK_BONIFICADO', 'n'],
    // v3
    ['unidadBase', 'UNIDAD_BASE', 't'], ['umbralMin', 'UMBRAL_MIN', 'e'], ['umbralMax', 'UMBRAL_MAX', 'e'],
    ['categoria', 'CATEGORIA', 't'], ['decimales', 'PERMITE_DECIMALES', 't'], ['fusionadoEn', 'FUSIONADO_EN', 'e']
  ],
  LOG_HISTORICO_PRECIOS: [
    ['idLog', 'ID_LOG', 't'], ['sku', 'SKU_ITEM', 't'], ['costoAnt', 'P_DIST_ANT', 'd'], ['costoNuevo', 'P_DIST_NUEVO', 'd'],
    ['precioAnt', 'P_CONS_ANT', 'd'], ['precioNuevo', 'P_CONS_NUEVO', 'd'], ['fecha', 'FECHA_CAMBIO', 'f'],
    ['usuario', 'USUARIO', 't'], ['idProducto', 'ID_PRODUCTO', 'e'], ['detalle', 'DETALLE', 't']
  ],
  UMBRALES: [['clave', 'TIPO_EMPAQUE', 't'], ['min', 'STOCK_MIN', 'n'], ['max', 'STOCK_MAX', 'n']],
  COSTOS_OPERATIVOS: [
    ['folio', 'ID_GASTO', 't'], ['timestamp', 'TIMESTAMP_LOG', 'f'], ['fecha', 'FECHA_GASTO', 'f'],
    ['categoria', 'CATEGORIA', 't'], ['monto', 'MONTO', 'd'], ['descripcion', 'DESCRIPCION', 't'], ['estado', 'ESTADO', 't']
  ],
  VEHICULOS: [
    ['placa', 'PLACA', 't'], ['marca', 'MARCA', 't'], ['modelo', 'MODELO', 't'], ['color', 'COLOR', 't'],
    ['tipoCombustible', 'TIPO_COMBUSTIBLE', 't'], ['estado', 'ESTADO', 't']
  ],
  COSTOS_COMBUSTIBLE: [
    ['folio', 'ID_GASTO', 't'], ['timestamp', 'TIMESTAMP_LOG', 'f'], ['fecha', 'FECHA_MOV', 'f'], ['placa', 'PLACA', 't'],
    ['odometro', 'ODOMETRO', 'n'], ['galones', 'GALONES', 'n'], ['monto', 'MONTO_PAGADO', 'd'], ['estado', 'ESTADO', 't']
  ],
  EQUIVALENCIAS: [
    ['idEquiv', 'ID_EQUIV', 'e'], ['nombre', 'NOMBRE_EMPAQUE', 't'], ['unidades', 'UNIDADES_CONTENIDAS', 'n'],
    ['nivelInferior', 'NIVEL_INFERIOR', 't'], ['idProducto', 'ID_PRODUCTO', 'e'], ['ultimoUso', 'ULTIMO_USO', 'f']
  ],
  PRESENTACIONES_VENTA: [
    ['idProducto', 'ID_PRODUCTO', 'e'], ['etiqueta', 'ETIQUETA', 't'], ['cantidad', 'CANT_UNIDADES_BASE', 'n'],
    ['precio', 'PRECIO', 'd'], ['orden', 'ORDEN', 'e'], ['estado', 'ESTADO', 't']
  ],
  CLIENTES: [['idCliente', 'ID_CLIENTE', 'e'], ['nombre', 'NOMBRE', 't'], ['estado', 'ESTADO', 't']],
  LOG_ACCIONES: [
    ['idAccion', 'ID_ACCION', 't'], ['timestamp', 'TIMESTAMP', 'f'], ['tipo', 'TIPO', 't'], ['alcance', 'ALCANCE', 't'],
    ['foliosAnulados', 'FOLIOS_ANULADOS', 't'], ['foliosNuevos', 'FOLIOS_NUEVOS', 't'], ['estado', 'ESTADO_ACCION', 't'],
    ['timestampReversion', 'TIMESTAMP_REVERSION', 'f'], ['actor', 'ACTOR', 't']
  ]
};

const NOMBRES_HOJAS = Object.keys(ESQUEMA);

// La firma que identifica una base v3 (la detecta migracion.js mirando los
// encabezados, sin hoja de ajustes — D23).
const FIRMA_V3 = { hoja: 'LOG_TRANS', columna: 'ID_PRODUCTO', indice: 27 };

function columnaLetra(indice) { // 0 → A, 27 → AB
  let n = indice + 1, s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function ultimaLetra(hoja) { return columnaLetra(ESQUEMA[hoja].length - 1); }

function rangoDatos(hoja, filaDesde) {
  return `${hoja}!A${filaDesde || 2}:${ultimaLetra(hoja)}`;
}

function rangoEncabezados(hoja) {
  return `${hoja}!A1:${ultimaLetra(hoja)}1`;
}

function encabezadosDe(hoja) { return ESQUEMA[hoja].map(c => c[1]); }

function indiceColumna(hoja, campo) {
  const i = ESQUEMA[hoja].findIndex(c => c[0] === campo);
  if (i < 0) throw new Error(`Columna desconocida ${hoja}.${campo}`);
  return i;
}

function leerValor(valor, tipo) {
  switch (tipo) {
    case 't': return valor === null || valor === undefined ? '' : String(valor).trim();
    case 'n': return parsearNumero(valor);
    case 'n?': return (valor === '' || valor === null || valor === undefined) ? null : parsearNumero(valor);
    case 'e': { if (valor === '' || valor === null || valor === undefined) return null; const n = parseInt(parsearNumero(valor), 10); return isNaN(n) ? null : n; }
    case 'd': return dinero(valor);
    case 'd?': return (valor === '' || valor === null || valor === undefined) ? null : dinero(valor);
    case 'f': return normalizarFechaCelda(valor);
    default: return valor;
  }
}

function escribirValor(valor, tipo) {
  if (valor === null || valor === undefined) return '';
  switch (tipo) {
    case 'd': case 'd?': return dineroANumero(valor);
    case 'n': return Number(valor) || 0;
    case 'n?': return Number(valor);
    case 'e': return valor === '' ? '' : Number(valor);
    default: return valor;
  }
}

// Fila cruda del Sheet → objeto. `fila` (número de fila del Sheet) se guarda
// aparte en el objeto como _fila cuando se conoce (para anular por posición).
function filaAObjeto(hoja, fila, numeroFila) {
  const obj = {};
  ESQUEMA[hoja].forEach(([campo, , tipo], i) => { obj[campo] = leerValor(fila ? fila[i] : undefined, tipo); });
  if (numeroFila !== undefined) obj._fila = numeroFila;
  return obj;
}

// recortar=true solo para AGREGAR filas (Sheets omite las celdas vacías del
// final); al ACTUALIZAR una fila existente se escribe completa para que una
// celda que quedó vacía de verdad se borre.
function objetoAFila(hoja, obj, recortar) {
  const fila = ESQUEMA[hoja].map(([campo, , tipo]) => escribirValor(obj[campo], tipo));
  if (recortar) while (fila.length && fila[fila.length - 1] === '') fila.pop();
  return fila;
}
