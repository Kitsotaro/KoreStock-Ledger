// © 2026 Wilber Adonay Escobar Solórzano (Kitsótaro) · KoreStock Ledger · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// LOTES.JS — interfaz de las acciones por lote dentro de Dashboard →
// Movimientos (V3 §17.3): «Corregir precio» y «Anular lo filtrado» sobre la
// lista filtrada, con vista previa y confirmación fuerte (escribir
// CONFIRMAR, §10.1); y «Acciones recientes» con «Revertir» (7 días).
//
// Expone: pintarBotonesLote, pintarAccionesRecientes.
// Depende de: componentes.js, campos.js, operaciones-lotes.js,
//   pantallas/dashboard.js (estadoDashboard, gruposMovimientos).
// ============================================================

function pintarBotonesLote(contenedor) {
  contenedor.innerHTML = html`
    <button type="button" class="boton boton-secundario boton-sm" data-lote="corregir">${seguro(icono('precio', 'icono-sm'))}Corregir precio por lote</button>
    <button type="button" class="boton boton-secundario boton-sm" data-lote="anular">${seguro(icono('lote', 'icono-sm'))}Anular lo filtrado</button>`.texto;
  $('[data-lote="corregir"]', contenedor).addEventListener('click', abrirCorreccionPrecio);
  $('[data-lote="anular"]', contenedor).addEventListener('click', abrirAnulacionLote);
}

function abrirCorreccionPrecio() {
  const est = estadoDashboard;
  const unico = est.modoProducto === 'SOLO' && est.productos.size === 1 ? [...est.productos][0] : null;
  let idProducto = unico;
  const opcionesPor = (p) => [{ valor: 1, texto: `por ${p.unidadBase}` }].concat(Almacen.presentacionesDe(p.idProducto).map(x => ({ valor: x.cantidad, texto: `por ${x.etiqueta} (${formatearNumero(x.cantidad)})` })));
  const control = abrirHoja({
    titulo: 'Corregir precio por lote',
    contenido: html`<p class="t-pequeno t-secundario">Para cuando vendiste con un precio equivocado. Las ventas del período se anulan y se registran de nuevo con el precio correcto. Nada se borra y puedes revertirlo durante ${DIAS_REVERSION} días.</p>
      <div class="buscador"><label class="etiqueta-campo" for="lote-producto">Producto</label><div class="control">${seguro(icono('buscar', 'icono-sm'))}<input id="lote-producto" placeholder="Buscar producto" autocomplete="off"></div></div>
      <p class="t-fuerte" id="lote-producto-nombre"></p>
      <div class="rejilla-campos">
        <div class="campo"><label for="lote-inicio">Desde</label><div class="control"><input type="date" id="lote-inicio" value="${est.inicio}"></div></div>
        <div class="campo"><label for="lote-fin">Hasta</label><div class="control"><input type="date" id="lote-fin" value="${est.fin}"></div></div>
      </div>
      <div class="rejilla-campos">
        <div class="campo"><label for="lote-precio">Precio correcto</label><div class="control"><span class="prefijo">$</span><input id="lote-precio" placeholder="0.00"></div></div>
        <div class="campo"><label for="lote-por">Precio</label><div class="control"><select id="lote-por"></select></div></div>
      </div>
      <div id="lote-vista" class="tarjeta-plana" hidden></div>`,
    acciones: [{ texto: 'Ver efecto', fn: () => vista() }, { texto: 'Aplicar', clase: 'boton-primario', fn: (c) => aplicar(c) }],
    alMontar: (hoja) => {
      prepararCampoNumerico($('#lote-precio', hoja), { decimales: 2 });
      crearBuscador({ input: $('#lote-producto', hoja), obtener: (q) => Almacen.buscarProductos(q, { incluirObsoletos: true, limite: 6 }).map(p => ({ valor: p, html: filaProductoHTML(p) })),
        alElegir: (p) => { idProducto = p.idProducto; $('#lote-producto', hoja).value = ''; elegido(hoja); } });
      if (idProducto) elegido(hoja);
    }
  });
  function elegido(hoja) {
    const p = Almacen.producto(idProducto);
    $('#lote-producto-nombre', hoja).textContent = nombreProducto(p, { conVariante: false });
    $('#lote-por', hoja).innerHTML = opcionesPor(p).map(o => html`<option value="${o.valor}">${o.texto}</option>`.texto).join('');
  }
  function preparar() {
    if (!idProducto) { avisar('Elige el producto.'); return null; }
    const h = control.el;
    try {
      return prepararCorreccionPrecio({ idProducto, inicio: $('#lote-inicio', h).value, fin: $('#lote-fin', h).value, precio: leerDineroCampo($('#lote-precio', h)), porUnidades: Number($('#lote-por', h).value) || 1 });
    } catch (e) { avisar(e.message); return null; }
  }
  function textoVista(prep) {
    return html`<p><strong>${prep.cambios.length}</strong> ${pluralizar(prep.cambios.length, 'venta cambia', 'ventas cambian')}.</p>
      <p class="t-pequeno">Cobrado: ${formatearDinero(prep.totalAntes)} → <strong>${formatearDinero(prep.totalDespues)}</strong></p>
      <p class="t-pequeno">Utilidad: ${formatearDinero(prep.utilAntes)} → <strong>${formatearDinero(prep.utilDespues)}</strong> (${prep.diferenciaUtilidad >= 0 ? '+' : ''}${formatearDinero(prep.diferenciaUtilidad)})</p>`;
  }
  function vista() {
    const prep = preparar(); if (!prep) return;
    const v = $('#lote-vista', control.el);
    v.hidden = false;
    v.innerHTML = prep.cambios.length ? textoVista(prep).texto : html`<p class="t-pequeno">Ninguna venta cambia con ese precio en esas fechas.</p>`.texto;
  }
  async function aplicar(c) {
    const prep = preparar(); if (!prep) return;
    if (!prep.cambios.length) { vista(); return; }
    c.cerrar();
    const ok = await confirmarFuerte({ titulo: 'Corregir precio por lote', mensaje: 'Se anulan estas ventas y se registran de nuevo con el precio correcto.', vistaPrevia: textoVista(prep).texto, textoConfirmar: 'Aplicar' });
    if (!ok) return;
    const r = await ejecutarOperacion(operacionCorreccionPrecio(prep));
    if (r) avisar(`Listo: ${r.nuevas} ${pluralizar(r.nuevas, 'venta corregida', 'ventas corregidas')}. Puedes revertirlo en «Acciones recientes».`, { duracion: 6000 });
  }
}

async function abrirAnulacionLote() {
  const movs = gruposMovimientos().flatMap(g => g.lineas);
  const prep = prepararAnulacionLote(movs);
  if (!prep.n) { avisar('No hay movimientos válidos en la lista filtrada.'); return; }
  const est = estadoDashboard;
  const vista = html`<div class="tarjeta-plana t-pequeno"><p><strong>${prep.n}</strong> ${pluralizar(prep.n, 'movimiento')} de ${formatearFechaCorta(est.inicio)} a ${formatearFechaCorta(est.fin)}.</p>
    ${prep.ventas ? html`<p>Ventas que se quitan: ${formatearDinero(prep.ventas)} (utilidad ${formatearDinero(prep.utilidad)})</p>` : ''}
    ${prep.inversion ? html`<p>Entradas que se quitan: ${formatearDinero(prep.inversion)}</p>` : ''}</div>`;
  const ok = await confirmarFuerte({ titulo: 'Anular lo filtrado', mensaje: 'Se anulan todos los movimientos de la lista filtrada. El stock se recalcula. Puedes revertirlo durante 7 días.', vistaPrevia: vista.texto, textoConfirmar: 'Anular' });
  if (!ok) return;
  const r = await ejecutarOperacion(operacionAnulacionLote(prep, `${prep.n} movimientos · ${est.inicio} a ${est.fin}`));
  if (r) avisar(`${r.anuladas} movimientos anulados.`);
}

function pintarAccionesRecientes(contenedor) {
  const acciones = Almacen.hojas.LOG_ACCIONES.slice().sort((a, b) => (b.timestamp > a.timestamp ? 1 : -1)).slice(0, 10);
  if (!acciones.length) { contenedor.innerHTML = ''; return; }
  const nombres = { CORRECCION_PRECIO: 'Corrección de precio', ANULACION_TICKET: 'Ticket anulado', ANULACION_LINEA: 'Línea anulada', ANULACION_LOTE: 'Anulación por lote', REVERSION: 'Reversión', MIGRACION: 'Actualización de la base', FUSION: 'Productos unidos' };
  contenedor.innerHTML = html`<details class="tarjeta" ${acciones.some(a => estadoAccion(a) === ESTADOS.ACCION_VIGENTE) ? '' : ''}>
    <summary>${seguro(icono('reciente', 'icono-sm'))}<span class="crece">Acciones recientes</span>${seguro(icono('chevron-abajo', 'icono-sm icono-giro'))}</summary>
    <div class="lista">${acciones.map(a => {
      const est = estadoAccion(a);
      return html`<div class="fila-lista"><div class="crece"><div class="titulo">${nombres[a.tipo] || a.tipo}</div>
        <div class="sub">${String(a.timestamp).slice(0, 16)} · ${a.alcance}${a.actor ? html` · ${a.actor}` : ''}</div>
        <span class="insignia ${est === ESTADOS.ACCION_REVERTIDA ? 'anulada' : est === ESTADOS.ACCION_VIGENTE ? 'nuevo' : ''}">${{ VIGENTE: `Se puede revertir (${DIAS_REVERSION} días)`, REVERTIDA: 'Revertida', EXPIRADA: 'Ya no se puede revertir', NO_REVERTIBLE: 'Registro' }[est]}</span></div>
        ${est === ESTADOS.ACCION_VIGENTE ? html`<button type="button" class="boton boton-secundario boton-sm" data-revertir="${a.idAccion}">${seguro(icono('deshacer', 'icono-sm'))}Revertir</button>` : ''}</div>`;
    })}</div></details>`.texto;
  $$('[data-revertir]', contenedor).forEach(b => b.addEventListener('click', () => revertirUI(b.dataset.revertir, b)));
}

async function revertirUI(idAccion, boton) {
  let rev;
  try { rev = revisarReversion(idAccion); } catch (e) { mostrarDialogo({ titulo: 'No se puede revertir', mensaje: e.message }); return; }
  const partes = [`Se ${rev.reactivar.length === 1 ? 'reactiva 1 movimiento' : `reactivan ${rev.reactivar.length} movimientos`}${rev.anular.length ? ` y se ${rev.anular.length === 1 ? 'anula 1' : `anulan ${rev.anular.length}`}` : ''}.`];
  if (rev.faltantes.length) partes.push(`Ojo: el stock no alcanza y quedaría negativo en ${rev.faltantes.map(f => `${nombreProducto(f.p, { conVariante: false })} (${formatearNumero(f.queda)})`).join(', ')}.`);
  const ok = await confirmar({ titulo: '¿Revertir esta acción?', mensaje: partes.join('\n\n'), textoConfirmar: rev.faltantes.length ? 'Revertir de todos modos' : 'Revertir', peligro: !!rev.faltantes.length });
  if (!ok) return;
  let op;
  try { op = operacionRevertir(idAccion); } catch (e) { mostrarDialogo({ titulo: 'No se puede revertir', mensaje: e.message }); return; }
  const r = await ejecutarOperacion(op, { boton });
  if (r) avisar('Acción revertida.');
}
