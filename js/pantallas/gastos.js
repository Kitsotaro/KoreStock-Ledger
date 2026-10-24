// © 2026 KoreStock Ledger — un proyecto de Kitsótaro · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// PANTALLA GASTOS (T17) — misma estructura que Venta y Entrada (§23.2):
// formulario compacto arriba (categoría con autocompletado y «Agregar»
// para una nueva, en naranja; monto, descripción, fecha), cifras del
// período y reparto por categoría, historial por día con el detalle
// desplegable («Anular» dentro); al guardar, resumen con Aceptar /
// Deshacer. Lista con «Cargar más» (D37).
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
            <div class="campo"><label for="gasto-categoria">Categoría</label><div class="control"><input id="gasto-categoria" list="gasto-categorias" data-permite-nuevo placeholder="Alquiler, luz, sueldos…" autocomplete="off" required></div><span class="nuevo-valor" id="gasto-cat-nueva" hidden>Categoría nueva</span></div>
            <div class="campo"><label for="gasto-monto">Monto</label><div class="control"><span class="prefijo">$</span><input id="gasto-monto" placeholder="0.00" required></div></div>
          </div>
          <div class="campo"><label for="gasto-descripcion">Descripción <span class="t-tenue">(opcional)</span></label><div class="control"><input id="gasto-descripcion" placeholder="Recibo de octubre" autocomplete="off"></div></div>
          <div class="fila-separada">
            <label class="fila t-pequeno" for="gasto-fecha">${seguro(icono('calendario', 'icono-sm'))}<span class="control"><input type="date" id="gasto-fecha"></span></label>
            <span class="cifra t-pequeno t-secundario" id="gasto-folio"></span>
          </div>
          <button type="submit" class="boton boton-primario boton-bloque" id="gasto-guardar">${seguro(icono('check'))}Guardar gasto</button>
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
    cat.addEventListener('input', marcarCategoriaNueva);
    $('#form-gasto', el).addEventListener('submit', (e) => { e.preventDefault(); guardarGastoUI(e.submitter || $('#form-gasto button[type="submit"]', el)); });
    delegar(el, 'click', { 'anular-gasto': (b, e) => { e.preventDefault(); anularGastoUI(b.dataset.folio); } });
    Almacen.suscribir((m) => { if (Shell.actual === 'gastos' && m !== 'carga') pintarGastos(); });
  },
  mostrar() { gastosUI.filtros.pintar(); pintarGastos(); }
});

// Categoría nueva: aviso, campo y botón en naranja (regla de cambios importantes).
function marcarCategoriaNueva() {
  const el = gastosUI.el, cat = $('#gasto-categoria', el);
  const nueva = !!cat.value.trim() && !sugerirCategoriasGasto().some(c => normalizarIdentidad(c) === normalizarIdentidad(cat.value));
  $('#gasto-cat-nueva', el).hidden = !nueva;
  cat.parentElement.classList.toggle('precio-cambiado', nueva);
  $('#gasto-guardar', el).classList.toggle('boton-aviso', nueva);
}

// Ícono por categoría conocida; las demás llevan uno neutro. Cada categoría base
// tiene su propio dibujo (Kitso, 2026-10-24): lo específico va primero, así
// «Seguro del vehículo» (escudo) y «Mantenimiento vehicular» (llave) no se repiten.
const ICONOS_GASTO = [[/seguro/, 'escudo'], [/manten|repar/, 'herramienta'], [/combust|gasolin|diesel/, 'combustible'], [/vehic|transporte|flete/, 'vehiculo'],
  [/alquiler|local|renta/, 'tienda'], [/energ|luz|electric/, 'foco'], [/agua/, 'agua'], [/internet|wifi/, 'wifi'], [/telefon|celular|movil/, 'telefono'],
  [/sueldo|salario|planilla|ayudante|pago de personal/, 'cartera'], [/viatic|viaje/, 'maleta'], [/comida|almuerzo|aliment/, 'cubiertos'],
  [/publicid|anunci|propaganda/, 'megafono'], [/impuest|tribut|alcaldia/, 'legal'], [/banco|comision/, 'billete'], [/papeler|oficina/, 'documento']];
function iconoGasto(categoria) {
  const c = normalizarIdentidad(categoria || '');
  const par = ICONOS_GASTO.find(([re]) => re.test(c));
  return par ? par[1] : 'etiqueta';
}

function pintarGastos() {
  $('#gasto-categorias', gastosUI.el).innerHTML = sugerirCategoriasGasto().map(c => html`<option value="${c}" data-icono="${iconoGasto(c)}"></option>`.texto).join('');
  $('#gasto-folio', gastosUI.el).textContent = Almacen.verFolioSiguiente('GO-');
  pintarListaGastos();
}

function pintarListaGastos() {
  const est = estadoGastos;
  const todos = Almacen.hojas.COSTOS_OPERATIVOS.filter(g => g.estado !== ESTADOS.GASTO_ARCHIVADO && enPeriodo(g.fecha, est.inicio, est.fin))
    .sort((a, b) => (b.timestamp || b.fecha) > (a.timestamp || a.fecha) ? 1 : -1);
  const validos = todos.filter(esGastoValido);
  const total = sumarDinero(validos.map(g => g.monto));
  const porCategoria = {};
  validos.forEach(g => { porCategoria[g.categoria] = sumarDinero(porCategoria[g.categoria] || 0, g.monto); });
  const categorias = Object.entries(porCategoria).sort((a, b) => b[1] - a[1]);
  $('#gastos-cifras', gastosUI.el).innerHTML = validos.length ? html`
    <div class="cifra-tarjeta"><div class="etiqueta">Gastos del período</div><div class="valor">${formatearDinero(total)}</div><div class="comparacion igual">${validos.length} ${pluralizar(validos.length, 'registro')}</div>
      ${seguro(anilloGastosHTML(categorias, total))}</div>
    <div class="cifra-tarjeta por-categoria"><div class="etiqueta">Por categoría</div>
      ${categorias.slice(0, 4).map(([c, m], i) => { const pct = total ? m / total * 100 : 0; return html`<div class="cat-gasto"><div class="fila-separada"><span class="recortar">${c}</span><span class="cifra">${pct.toFixed(0)} %</span></div>
        <div class="mini-barra"><span style="width:${Math.max(2, pct).toFixed(0)}%;background:var(--grafico-${i + 1})"></span></div></div>`; })}
      ${categorias.length > 4 ? html`<div class="t-mini t-tenue">y ${categorias.length - 4} más</div>` : ''}</div>`.texto : '';
  // Lista por día (Hoy, Ayer, «lun 20 oct») con el total gastado ese día.
  const hoy = obtenerFechaLocal(), ayer = restarDias(hoy, 1);
  const porDia = new Map();
  validos.forEach(g => porDia.set(g.fecha, sumarDinero(porDia.get(g.fecha) || 0, g.monto)));
  const lista = [];
  let ultimo = '';
  todos.forEach(g => {
    if (g.fecha !== ultimo) {
      ultimo = g.fecha;
      lista.push({ encabezado: true, nombre: g.fecha === hoy ? 'Hoy' : g.fecha === ayer ? 'Ayer' : textoAFecha(g.fecha).toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' }), total: porDia.get(g.fecha) || 0 });
    }
    lista.push(g);
  });
  pintarPaginado({
    contenedor: $('#gastos-lista', gastosUI.el), items: lista, tope: 30, cuenta: (x) => !x.encabezado,
    vacio: html`<div class="vacio">${seguro(icono('recibo', 'icono-xl'))}<strong>Sin gastos en el período</strong><p>Registra arriba tu primer gasto.</p></div>`,
    pintarItem: (g) => g.encabezado ? html`<div class="encabezado-dia"><span>${g.nombre}</span>${g.total ? html`<span class="cifra">Gastado ${formatearDinero(g.total)}</span>` : ''}</div>` : filaGastoHTML(g)
  });
}

// Anillo del reparto por categoría (SVG propio, sin cargar Chart.js): se recalcula
// con el período elegido. Siete categorías con color y el resto como «Otras».
function anilloGastosHTML(categorias, total) {
  if (!total) return '';
  const partes = categorias.slice(0, 7).map(([c, m], i) => ({ c, m, color: `var(--grafico-${i + 1})` }));
  const resto = sumarDinero(categorias.slice(7).map(x => x[1]));
  if (resto) partes.push({ c: 'Otras', m: resto, color: 'var(--grafico-8)' });
  let acumulado = 0;
  const arcos = partes.map(x => {
    const pct = x.m / total * 100;
    const arco = html`<circle r="15.9155" cx="18" cy="18" fill="none" stroke="${x.color}" stroke-width="4.2" stroke-dasharray="${pct.toFixed(3)} ${(100 - pct).toFixed(3)}" stroke-dashoffset="${(25 - acumulado).toFixed(3)}"><title>${x.c}: ${pct.toFixed(1)} % · ${formatearDinero(x.m)}</title></circle>`;
    acumulado += pct;
    return arco;
  });
  const mayor = partes[0];
  return html`<div class="anillo-gastos" role="img" aria-label="Reparto del gasto por categoría">
    <svg viewBox="0 0 36 36"><circle r="15.9155" cx="18" cy="18" fill="none" stroke="var(--superficie-3)" stroke-width="4.2"></circle>${arcos}</svg>
    <div class="anillo-centro"><strong class="cifra">${(mayor.m / total * 100).toFixed(0)} %</strong><span class="recortar">${mayor.c}</span></div></div>`.texto;
}

function filaGastoHTML(g) {
  const anulado = g.estado === ESTADOS.GASTO_ANULADO;
  return html`<details class="desplegable">
    <summary class="fila-lista ${anulado ? 'anulada' : ''}">
      <span class="icono-gasto">${seguro(icono(iconoGasto(g.categoria), 'icono-sm'))}</span>
      <div class="crece"><div class="titulo recortar">${g.categoria}${anulado ? html` <span class="insignia anulada">Anulado</span>` : ''}</div>
        <div class="sub recortar">${g.descripcion || g.folio}</div></div>
      <span class="monto">${formatearDinero(g.monto)}</span>
      ${seguro(icono('chevron-abajo', 'icono-sm chevron'))}
    </summary>
    <div class="desplegable-cuerpo">
      <div class="t-mini t-secundario">${g.folio} · ${formatearFechaCorta(g.fecha, true)}${g.timestamp ? html` · capturado ${String(g.timestamp).slice(11, 16)}` : ''}${g.descripcion ? html` · ${g.descripcion}` : ''}</div>
      ${anulado ? '' : html`<button type="button" class="boton boton-secundario boton-sm peligro" data-accion="anular-gasto" data-folio="${g.folio}" style="justify-self:start">${seguro(icono('papelera', 'icono-sm'))}Anular gasto</button>`}
    </div></details>`;
}

async function guardarGastoUI(boton) {
  const el = gastosUI.el;
  let op;
  try {
    op = operacionGuardarGasto({ categoria: $('#gasto-categoria', el).value, monto: leerDineroCampo($('#gasto-monto', el)), descripcion: $('#gasto-descripcion', el).value, fecha: $('#gasto-fecha', el).value });
  } catch (e) { mostrarDialogo({ titulo: 'Revisa el gasto', mensaje: e.message }); return; }
  const g = await ejecutarOperacion(op, { boton });
  if (!g) return;
  $('#gasto-monto', el).value = ''; $('#gasto-descripcion', el).value = ''; $('#gasto-categoria', el).value = ''; marcarCategoriaNueva();
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
