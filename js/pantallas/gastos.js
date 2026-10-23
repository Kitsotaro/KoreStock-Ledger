// © 2026 KoreStock Ledger — un proyecto de Kitsótaro · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// PANTALLA GASTOS (T17) — misma estructura que Venta y Entrada (§23.2):
// formulario compacto arriba (categoría con autocompletado, monto,
// descripción, fecha), historial debajo con el período abajo y «Anular»
// por fila; al guardar, resumen con Aceptar / Deshacer. Lista con
// «Cargar más» (D37).
//
// Expone: (registra la pantalla 'gastos').
// Depende de: shell.js, componentes.js, campos.js, filtros.js, operaciones-gastos.js.
// ============================================================

const estadoGastos = crearEstadoFiltros('MES');
const gastosUI = { el: null, filtros: null };

registrarPantalla('gastos', {
  titulo: 'Gastos',
  montar(el) {
    gastosUI.el = el;
    el.innerHTML = html`
      <div class="columna">
        <form class="tarjeta columna" id="form-gasto" novalidate>
          <div class="rejilla-campos">
            <div class="campo"><label for="gasto-categoria">Categoría</label><div class="control"><input id="gasto-categoria" list="gasto-categorias" placeholder="Alquiler, luz, sueldos…" autocomplete="off" required></div><span class="nuevo-valor" id="gasto-cat-nueva" hidden>Categoría nueva</span></div>
            <div class="campo"><label for="gasto-monto">Monto</label><div class="control"><span class="prefijo">$</span><input id="gasto-monto" placeholder="0.00" required></div></div>
          </div>
          <div class="campo"><label for="gasto-descripcion">Descripción <span class="t-tenue">(opcional)</span></label><div class="control"><input id="gasto-descripcion" placeholder="Recibo de octubre" autocomplete="off"></div></div>
          <div class="fila-separada">
            <label class="fila t-pequeno" for="gasto-fecha">${seguro(icono('calendario', 'icono-sm'))}<span class="control"><input type="date" id="gasto-fecha"></span></label>
            <span class="cifra t-pequeno t-secundario" id="gasto-folio"></span>
          </div>
          <button type="submit" class="boton boton-primario boton-bloque">${seguro(icono('check'))}Guardar gasto</button>
          <datalist id="gasto-categorias"></datalist>
        </form>
        <div class="cifras" id="gastos-cifras"></div>
        <div id="gastos-lista"></div>
      </div>
      <div id="gastos-filtros"></div>`.texto;
    gastosUI.filtros = crearFiltrosAbajo({ contenedor: $('#gastos-filtros', el), estado: estadoGastos, usar: ['periodo'], alCambiar: () => pintarListaGastos() });
    prepararCampoNumerico($('#gasto-monto', el), { decimales: 2 });
    const fecha = $('#gasto-fecha', el); fecha.value = obtenerFechaLocal(); fecha.max = obtenerFechaLocal();
    const cat = $('#gasto-categoria', el);
    cat.addEventListener('input', () => { $('#gasto-cat-nueva', el).hidden = !cat.value.trim() || sugerirCategoriasGasto().some(c => normalizarIdentidad(c) === normalizarIdentidad(cat.value)); });
    $('#form-gasto', el).addEventListener('submit', (e) => { e.preventDefault(); guardarGastoUI(e.submitter || $('#form-gasto button[type="submit"]', el)); });
    delegar(el, 'click', { 'anular-gasto': (b) => anularGastoUI(b.dataset.folio) });
    Almacen.suscribir((m) => { if (Shell.actual === 'gastos' && m !== 'carga') pintarGastos(); });
  },
  mostrar() { gastosUI.filtros.pintar(); pintarGastos(); }
});

function pintarGastos() {
  $('#gasto-categorias', gastosUI.el).innerHTML = sugerirCategoriasGasto().map(c => html`<option value="${c}"></option>`.texto).join('');
  $('#gasto-folio', gastosUI.el).textContent = Almacen.verFolioSiguiente('GO-');
  pintarListaGastos();
}

function pintarListaGastos() {
  const est = estadoGastos;
  const lista = Almacen.hojas.COSTOS_OPERATIVOS.filter(g => g.estado !== ESTADOS.GASTO_ARCHIVADO && enPeriodo(g.fecha, est.inicio, est.fin))
    .sort((a, b) => (b.timestamp || b.fecha) > (a.timestamp || a.fecha) ? 1 : -1);
  const validos = lista.filter(esGastoValido);
  const total = sumarDinero(validos.map(g => g.monto));
  const porCategoria = {};
  validos.forEach(g => { porCategoria[g.categoria] = sumarDinero(porCategoria[g.categoria] || 0, g.monto); });
  const mayor = Object.entries(porCategoria).sort((a, b) => b[1] - a[1])[0];
  $('#gastos-cifras', gastosUI.el).innerHTML = html`
    <div class="cifra-tarjeta"><div class="etiqueta">Gastos del período</div><div class="valor">${formatearDinero(total)}</div><div class="comparacion igual">${validos.length} ${pluralizar(validos.length, 'registro')}</div></div>
    ${mayor ? html`<div class="cifra-tarjeta"><div class="etiqueta">Mayor gasto</div><div class="valor t-grande" style="font-size:var(--t-lg)">${mayor[0]}</div><div class="comparacion igual">${formatearDinero(mayor[1])}</div></div>` : ''}`.texto;
  pintarPaginado({
    contenedor: $('#gastos-lista', gastosUI.el), items: lista, tope: 30,
    vacio: html`<div class="vacio">${seguro(icono('recibo', 'icono-xl'))}<strong>Sin gastos en el período</strong><p>Registra arriba tu primer gasto.</p></div>`,
    pintarItem: (g) => html`<div class="fila-lista ${g.estado === ESTADOS.GASTO_ANULADO ? 'anulada' : ''}"><div class="crece"><div class="titulo recortar">${g.categoria}</div>
      <div class="sub">${formatearFechaCorta(g.fecha)} · ${g.folio}${g.descripcion ? html` · ${g.descripcion}` : ''}${g.estado === ESTADOS.GASTO_ANULADO ? html` <span class="insignia anulada">Anulado</span>` : ''}</div></div>
      <span class="monto">${formatearDinero(g.monto)}</span>
      ${g.estado !== ESTADOS.GASTO_ANULADO ? html`<button type="button" class="boton boton-texto boton-sm peligro" data-accion="anular-gasto" data-folio="${g.folio}">Anular</button>` : ''}</div>`
  });
}

async function guardarGastoUI(boton) {
  const el = gastosUI.el;
  let op;
  try {
    op = operacionGuardarGasto({ categoria: $('#gasto-categoria', el).value, monto: leerDineroCampo($('#gasto-monto', el)), descripcion: $('#gasto-descripcion', el).value, fecha: $('#gasto-fecha', el).value });
  } catch (e) { mostrarDialogo({ titulo: 'Revisa el gasto', mensaje: e.message }); return; }
  const g = await ejecutarOperacion(op, { boton });
  if (!g) return;
  $('#gasto-monto', el).value = ''; $('#gasto-descripcion', el).value = ''; $('#gasto-categoria', el).value = ''; $('#gasto-cat-nueva', el).hidden = true;
  await mostrarResumen({
    titulo: 'Gasto guardado', total: formatearDinero(g.monto), detalle: `${g.categoria} · ${g.folio}`,
    alDeshacer: async () => { const r = await ejecutarOperacion(operacionAnularGasto(g.folio)); if (r) avisar('Gasto anulado.'); }
  });
}

async function anularGastoUI(folio) {
  const g = Almacen.hojas.COSTOS_OPERATIVOS.find(x => x.folio === folio);
  if (!(await confirmar({ titulo: '¿Anular este gasto?', mensaje: `${g.categoria} · ${formatearDinero(g.monto)} · ${formatearFechaCorta(g.fecha)}\n\nNo se borra: queda marcado como anulado.`, textoConfirmar: 'Anular', peligro: true }))) return;
  const r = await ejecutarOperacion(operacionAnularGasto(folio));
  if (r) avisar('Gasto anulado.');
}
