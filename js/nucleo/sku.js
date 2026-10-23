// © 2026 KoreStock Ledger — un proyecto de Kitsótaro · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// SKU.JS — código corto del producto (heredado de la v2, ajustado a v3).
//
// Formato: [2-3 letras de Marca][2-3 letras de Producto]-[NNN]  p. ej. CAHU-001
//
// Cambios v3:
//   - El sabor/variante YA NO es identidad (D24): «Gatorade 500 ml» es un
//     producto aunque tenga cinco sabores.
//   - Identidad = marca + producto + presentación + contenido, comparados
//     con normalizarIdentidad («500 ml» = «500ml»).
//   - El correlativo es el MAYOR usado + 1 (antes: cuántos había + 1, lo que
//     repetía SKU si se había borrado u obsoletado un producto, §6) y se
//     comprueba que no exista.
//
// Expone: limpiarLetras, repartirCodigosDeLetras, claveIdentidadProducto,
//   buscarProductoMismaIdentidad, generarSKU.
// Depende de: utilidades.js (normalizarIdentidad), esquema.js (ESTADOS).
// ============================================================

function limpiarLetras(texto) {
  const limpio = (texto || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z]/g, '');
  return limpio || 'XX';
}

function repartirCodigosDeLetras(valoresEnOrden) {
  const codigoPorValor = new Map();
  const usados = new Set();
  valoresEnOrden.forEach(valor => {
    const clave = normalizarIdentidad(valor);
    if (codigoPorValor.has(clave)) return;
    const letras = limpiarLetras(valor);
    let largo = 2, codigo = letras.substring(0, largo);
    while (usados.has(codigo) && largo < letras.length) { largo++; codigo = letras.substring(0, largo); }
    while (usados.has(codigo)) codigo += '2';
    usados.add(codigo);
    codigoPorValor.set(clave, codigo);
  });
  return codigoPorValor;
}

function claveIdentidadProducto(p) {
  return [p.marca, p.linea, p.presentacion, p.volumen].map(normalizarIdentidad).join('|');
}

function buscarProductoMismaIdentidad(datos, catalogo, excluirId) {
  const clave = claveIdentidadProducto(datos);
  return catalogo.find(p => p.idProducto !== excluirId && p.estado !== ESTADOS.FUSIONADO && claveIdentidadProducto(p) === clave) || null;
}

// excluirId: al editar un producto, para no compararlo consigo mismo.
function generarSKU(datos, catalogo, excluirId) {
  const existente = buscarProductoMismaIdentidad(datos, catalogo, excluirId);
  if (existente) return existente.sku;
  const otros = catalogo.filter(p => p.idProducto !== excluirId);
  const marcas = [];
  otros.forEach(p => { if (p.marca) marcas.push(p.marca); });
  marcas.push(datos.marca);
  const codigoMarca = repartirCodigosDeLetras(marcas).get(normalizarIdentidad(datos.marca));
  const lineas = [];
  otros.forEach(p => { if (normalizarIdentidad(p.marca) === normalizarIdentidad(datos.marca) && p.linea) lineas.push(p.linea); });
  lineas.push(datos.linea);
  const codigoProducto = repartirCodigosDeLetras(lineas).get(normalizarIdentidad(datos.linea));
  const prefijo = `${codigoMarca}${codigoProducto}-`;
  const usados = new Set(otros.map(p => p.sku));
  let n = otros.reduce((max, p) => (String(p.sku || '').startsWith(prefijo) ? Math.max(max, parseInt(p.sku.slice(prefijo.length), 10) || 0) : max), 0) + 1;
  let sku = `${prefijo}${String(n).padStart(3, '0')}`;
  while (usados.has(sku)) { n++; sku = `${prefijo}${String(n).padStart(3, '0')}`; }
  return sku;
}
