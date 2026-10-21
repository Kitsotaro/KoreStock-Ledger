// © 2026 Kitsótaro · KoreStock Ledger · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// CALCULOS.JS — funciones PURAS de negocio sobre movimientos ya leídos.
// Reciben arreglos de objetos (esquema.js) y devuelven resultados; no leen
// Sheets ni tocan la pantalla. Así se prueban en Node y sirven igual para
// la base principal, los históricos o una simulación (excluir productos).
//
// Expone: esMovValido, stockDerivadoPorProducto (ampliado en T07).
// Depende de: esquema.js (TIPOS_MOV, ESTADOS), dinero.js.
// ============================================================

function esMovValido(m) { return (m.estado || '') !== ESTADOS.MOV_ANULADA; }

// Stock de cada producto = suma de sus movimientos válidos (cantidad con
// signo + bonificación). D36: el historial es la verdad; el catálogo solo
// guarda una copia.
function stockDerivadoPorProducto(movimientos) {
  const r = {};
  for (const m of movimientos) {
    if (!esMovValido(m) || !m.idProducto) continue;
    const e = r[m.idProducto] || (r[m.idProducto] = { stock: 0, bonif: 0 });
    e.stock += Number(m.cantidad || 0) + Number(m.bonif || 0);
    if (m.tipo === TIPOS_MOV.ENTRADA || m.tipo === TIPOS_MOV.APERTURA) e.bonif += Number(m.bonif || 0);
  }
  return r;
}
