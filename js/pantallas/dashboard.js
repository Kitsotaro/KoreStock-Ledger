// © 2026 KoreStock Ledger — un proyecto de Kitsótaro · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// PANTALLA DASHBOARD (T15) — estructura aprobada (D25, V3 §17):
//   - Resumen | Movimientos. Filtros abajo (período, producto «Solo» o
//     «Excluir», marca, categoría, cliente, sabor), apilables.
//   - Resumen (solo conglomerados): Ventas · Utilidad · Entradas con
//     comparación contra el período anterior; tendencia en línea doble;
//     rankings de producto, marca y cliente («último pedido hace X días»).
//   - Movimientos: entradas y ventas AGRUPADAS POR TICKET, desplegables;
//     anular una línea o el ticket completo (registrado y reversible).
//     Insignia «Nuevo» en las entradas que crearon un producto (D54).
//   - Por modo: Bodega ve cifras y Movimientos; Tienda y Pro, todo.
//   Todo sale de la copia local: filtrar no relee Drive.
//
// Expone: (registra la pantalla 'dashboard'), estadoDashboard.
// Depende de: shell.js, componentes.js, filtros.js, almacen.js, calculos.js,
//   operaciones-movimientos.js, cargador.js (Chart).
// ============================================================

const estadoDashboard = Object.assign(crearEstadoFiltros('HOY'), { vista: 'MOVIMIENTOS', tipo: 'TODO', texto: '', soloNuevos: false, verCostoPromedio: false });
const dashUI = { el: null, filtros: null, grafico: null };

registrarPantalla('dashboard', {
  titulo: 'Dashboard',
  montar(el) {
    dashUI.el = el;
    el.innerHTML = html`
      <div class="columna">
        <div class="segmentado" role="group" aria-label="Vista">
          <button type="button" data-accion="vista" data-valor="MOVIMIENTOS">Movimientos</button>
          <button type="button" data-accion="vista" data-valor="RESUMEN">Resumen</button>
        </div>
        <div id="dash-cuerpo"></div>
      </div>
      <div id="dash-filtros"></div>`.texto;
    dashUI.filtros = crearFiltrosAbajo({
      contenedor: $('#dash-filtros', el), estado: estadoDashboard,
      usar: ['periodo', 'producto', 'marca', 'categoria', 'cliente', 'sabor'], alCambiar: () => pintarDashboard()
    });
    delegar(el, 'click', accionesDashboard);
    Almacen.suscribir(() => { if (Shell.actual === 'dashboard') pintarDashboard(); });
    Shell.alCambiarTema(() => { if (Shell.actual === 'dashboard') pintarDashboard(); });
  },
  mostrar() { dashUI.filtros.pintar(); pintarDashboard(); }
});

function pintarDashboard() {
  if (Shell.modo === 'bodega' && estadoDashboard.vista === 'RESUMEN') { /* Bodega: cifras sin tendencia ni rankings */ }
  $$('[data-accion="vista"]', dashUI.el).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.valor === estadoDashboard.vista)));
  if (estadoDashboard.vista === 'RESUMEN') pintarResumenDashboard();
  else pintarMovimientosDashboard();
  pintarIconos(dashUI.el);
}

function comparacionHTML(actual, anterior, esDinero, neutral) {
  if (!anterior && !actual) return html`<div class="comparacion igual">Sin datos</div>`;
  if (!anterior) return html`<div class="comparacion sube">${seguro(icono('flecha-arriba', 'icono-sm'))}Nuevo</div>`;
  const pct = ((actual - anterior) / Math.abs(anterior)) * 100;
  const clase = Math.abs(pct) < 0.5 ? 'igual' : pct > 0 ? 'sube' : 'baja';
  return html`<div class="comparacion ${neutral ? 'igual' : clase}" title="Período anterior: ${esDinero ? formatearDinero(anterior) : formatearNumero(anterior)}">${seguro(icono(clase === 'baja' ? 'flecha-abajo' : 'flecha-arriba', 'icono-sm'))}${Math.abs(pct).toFixed(0)}% vs. anterior</div>`;
}

function pintarResumenDashboard() {
  const est = estadoDashboard;
  const filtro = predicadoFiltros(est);
  const ant = periodoAnterior(est.inicio, est.fin);
  const desde = ant.inicio && ant.inicio < est.inicio ? ant.inicio : est.inicio;
  const movs = PeriodosLargos.hojasPara(desde).LOG_TRANS;
  incluirHistoricosUI(desde, pintarDashboard);
  const r = calcularResumenPeriodo(movs, est.inicio, est.fin, filtro);
  const ra = calcularResumenPeriodo(movs, ant.inicio, ant.fin, filtro);
  // Ganancia: por defecto la guardada (último costo); el chip «Costo promedio» la cambia.
  const ganancia = est.verCostoPromedio ? calcularUtilidadCostoPromedio(movs, est.inicio, est.fin, filtro).utilidad : r.utilidad;
  const gananciaAnt = est.verCostoPromedio ? calcularUtilidadCostoPromedio(movs, ant.inicio, ant.fin, filtro).utilidad : ra.utilidad;
  const bodega = Shell.modo === 'bodega';
  const ranking = (claveDe, nombreDe, conUltimo) => rankingProductos(movs, est.inicio, est.fin, claveDe, filtro).slice(0, 5)
    .map(x => html`<li class="fila-lista"><div class="crece"><div class="titulo recortar">${nombreDe(x.clave)}</div>
      <div class="sub">${formatearNumero(x.unidades)} ${pluralizar(x.unidades, 'unidad', 'unidades')}${conUltimo ? html` · último pedido ${x.ultimo === obtenerFechaLocal() ? 'hoy' : `hace ${diasEntre(x.ultimo, obtenerFechaLocal())} ${pluralizar(diasEntre(x.ultimo, obtenerFechaLocal()), 'día')}`}` : ''}</div></div>
      <div class="lado"><div class="monto">${formatearDinero(x.ventas)}</div><div class="sub">gana ${formatearDinero(x.utilidad)}</div></div></li>`);
  const rankProd = ranking(m => m.idProducto, id => nombreProducto(Almacen.producto(id), { conVariante: false }));
  const rankMarca = ranking(m => { const p = Almacen.producto(m.idProducto); return p ? p.marca : ''; }, x => x);
  const rankCli = ranking(m => m.idCliente || null, id => (Almacen.cliente(id) || {}).nombre || 'Cliente', true);
  $('#dash-cuerpo', dashUI.el).innerHTML = html`
    ${notaHistoricosHTML(est.inicio)}
    <div class="cifras">
      <div class="cifra-tarjeta"><div class="etiqueta">Ventas ${botonInfo('Ventas', 'Suma de lo que cobraste en las ventas del período (lo cobrado es el dato, aunque hayas hecho rebaja). No incluye anuladas.'+' El porcentaje compara con el período anterior de igual duración; deja el cursor sobre él para ver ese monto.')}</div><div class="valor">${formatearDinero(r.ventas)}</div>${comparacionHTML(r.ventas, ra.ventas, true)}<div class="t-mini t-secundario">${formatearNumero(r.unidadesVendidas)} ${pluralizar(r.unidadesVendidas, 'vendida', 'vendidas')}</div></div>
      <div class="cifra-tarjeta"><div class="etiqueta">Ganancia ${botonInfo('Ganancia', '**La utilidad es lo que ganaste**: lo cobrado menos lo que te costó cada producto.\n\n- **Último costo** (por defecto): el costo de tu compra más reciente al momento de vender, como lo calcularías a mano.\n- **Costo promedio** (chip de la tarjeta): el promedio de todo lo que tienes en bodega.\n\nNo incluye anuladas.'+' El porcentaje compara con el período anterior de igual duración; deja el cursor sobre él para ver ese monto.')}</div><div class="valor ${ganancia < 0 ? 't-peligro' : ''}">${formatearDinero(ganancia)}</div>${comparacionHTML(ganancia, gananciaAnt, true)}
        <button type="button" class="chip chip-mini" data-accion="ver-costo-promedio" aria-pressed="${String(!!est.verCostoPromedio)}">${seguro(icono(est.verCostoPromedio ? 'check' : 'intercambiar', 'icono-sm'))}Costo promedio</button></div>
      <div class="cifra-tarjeta"><div class="etiqueta">Invertido ${botonInfo('Invertido', 'Suma de lo que pagaste en las entradas (compras) del período. Las unidades ingresadas incluyen las bonificadas. No incluye anuladas.'+' El porcentaje compara con el período anterior de igual duración; deja el cursor sobre él para ver ese monto.')}</div><div class="valor">${formatearDinero(r.inversion)}</div>${comparacionHTML(r.inversion, ra.inversion, true, true)}<div class="t-mini t-secundario">${formatearNumero(r.unidadesEntradas)} ${pluralizar(r.unidadesEntradas, 'ingresada', 'ingresadas')}</div></div>
    </div>
    ${bodega ? '' : html`
    <div class="tarjeta">
      <div class="tarjeta-titulo"><h2>${seguro(icono('tendencia', 'icono-sm'))} Tendencia</h2><span class="t-pequeno t-secundario">${formatearFechaCorta(est.inicio)} – ${formatearFechaCorta(est.fin)}</span></div>
      <div class="contenedor-grafico"><canvas id="dash-tendencia" role="img" aria-label="Ventas y ganancia por día"></canvas></div>
    </div>
    <div class="tarjeta"><div class="tarjeta-titulo"><h2>Productos que más venden</h2></div>${rankProd.length ? html`<ul class="lista">${rankProd}</ul>` : html`<p class="t-tenue t-pequeno">Sin ventas en el período.</p>`}</div>
    <div class="tarjeta"><div class="tarjeta-titulo"><h2>Marcas</h2></div>${rankMarca.length ? html`<ul class="lista">${rankMarca}</ul>` : html`<p class="t-tenue t-pequeno">Sin ventas en el período.</p>`}</div>
    ${Almacen.hojas.CLIENTES.length ? html`<div class="tarjeta"><div class="tarjeta-titulo"><h2>Clientes</h2></div>${rankCli.length ? html`<ul class="lista">${rankCli}</ul>` : html`<p class="t-tenue t-pequeno">Ninguna venta con cliente en el período.</p>`}</div>` : ''}`}
  `.texto;
  if (!bodega) pintarTendencia(movs, est, filtro);
}

async function pintarTendencia(movs, est, filtro) {
  try { await cargarChart(); } catch (e) { return; }
  const lienzo = $('#dash-tendencia', dashUI.el);
  if (!lienzo) return;
  let serie = serieDiaria(movs, est.inicio, est.fin, filtro);
  // Períodos largos: por semana o por mes para que la línea se lea.
  const agrupar = (claveDe) => {
    const m = new Map();
    serie.forEach(d => { const k = claveDe(d.fecha); const e = m.get(k) || { fecha: k, ventas: 0, utilidad: 0 }; e.ventas = sumarDinero(e.ventas, d.ventas); e.utilidad = sumarDinero(e.utilidad, d.utilidad); m.set(k, e); });
    return [...m.values()];
  };
  if (serie.length > 400) serie = agrupar(f => f.slice(0, 7));
  else if (serie.length > 62) serie = agrupar(f => { const d = textoAFecha(f); const off = d.getDay() === 0 ? -6 : 1 - d.getDay(); d.setDate(d.getDate() + off); return fechaATexto(d); });
  const estilo = getComputedStyle(document.documentElement);
  const color = (v) => estilo.getPropertyValue(v).trim();
  if (dashUI.grafico) dashUI.grafico.destroy();
  // Ventas y ganancia superpuestas: cada una con su propio eje (ventas a la
  // izquierda, ganancia a la derecha) para que la ganancia no quede aplastada
  // abajo; áreas transparentes como en la referencia. El tooltip da el margen.
  const area = (ctx, c) => {
    const { chartArea, ctx: g } = ctx.chart;
    if (!chartArea) return c;
    const grad = g.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    grad.addColorStop(0, c + '55'); grad.addColorStop(1, c + '00');
    return grad;
  };
  const cVenta = color('--venta'), cGanancia = color('--primario');
  dashUI.grafico = new Chart(lienzo, {
    type: 'line',
    data: {
      labels: serie.map(d => formatearFechaCorta(d.fecha)),
      datasets: [
        { label: 'Ventas', yAxisID: 'yVentas', data: serie.map(d => dineroANumero(d.ventas)), borderColor: cVenta, backgroundColor: (c) => area(c, cVenta), fill: 'origin', tension: 0.35, pointRadius: 0, pointHoverRadius: 4, borderWidth: 2.5 },
        { label: 'Ganancia', yAxisID: 'yGanancia', data: serie.map(d => dineroANumero(d.utilidad)), borderColor: cGanancia, backgroundColor: (c) => area(c, cGanancia), fill: 'origin', tension: 0.35, pointRadius: 0, pointHoverRadius: 4, borderWidth: 2.5 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 300 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: color('--texto-2'), usePointStyle: true, pointStyle: 'line' } },
        tooltip: { callbacks: {
          label: (c) => ` ${c.dataset.label}: ${formatearDinero(dinero(c.raw))}`,
          footer: (items) => { const v = items.find(i => i.dataset.label === 'Ventas'), g = items.find(i => i.dataset.label === 'Ganancia'); return v && g && v.raw ? `Margen: ${(g.raw / v.raw * 100).toFixed(1)} %` : ''; }
        } }
      },
      scales: {
        x: { ticks: { color: color('--texto-3'), maxRotation: 0, autoSkip: true, maxTicksLimit: 6 }, grid: { display: false } },
        yVentas: { position: 'left', beginAtZero: true, ticks: { color: cVenta, maxTicksLimit: 5, callback: (v) => '$' + v }, grid: { color: color('--borde') } },
        yGanancia: { position: 'right', beginAtZero: true, ticks: { color: cGanancia, maxTicksLimit: 5, callback: (v) => '$' + v }, grid: { display: false } }
      }
    }
  });
}

// ---------- Movimientos agrupados por ticket ----------
// Movimientos que ve el dashboard: la base principal y, si el período
// empieza antes, los históricos (sus filas no se pueden anular, §18.3 regla 5).
function movimientosDashboard() {
  incluirHistoricosUI(estadoDashboard.inicio, pintarDashboard);
  return PeriodosLargos.hojasPara(estadoDashboard.inicio).LOG_TRANS;
}

function gruposMovimientos() {
  const est = estadoDashboard;
  const filtro = predicadoFiltros(est);
  const grupos = new Map();
  movimientosDashboard().forEach(m => {
    if (!esMovVisible(m) || !enPeriodo(m.fecha, est.inicio, est.fin)) return;
    if (filtro && !filtro(m)) return;
    if (est.tipo === 'VENTA' && m.tipo !== TIPOS_MOV.VENTA) return;
    if (est.tipo === 'ENTRADA' && m.tipo !== TIPOS_MOV.ENTRADA) return;
    if (est.soloNuevos && m.productoNuevo !== 'SI') return;
    if (est.texto) {
      const p = Almacen.producto(m.idProducto);
      const c = Almacen.cliente(m.idCliente);
      if (!coincidenPalabras([m.folio, m.idTicket, m.sku, m.variante, p ? textoBuscableProducto(p) : '', c ? c.nombre : ''].join(' '), est.texto)) return;
    }
    const clave = m.idTicket || m.folio;
    if (!grupos.has(clave)) grupos.set(clave, { clave, tipo: m.tipo, fecha: m.fecha, timestamp: m.timestamp, lineas: [], idCliente: m.idCliente });
    const g = grupos.get(clave);
    g.lineas.push(m);
    if (m.timestamp > g.timestamp) g.timestamp = m.timestamp;
  });
  return [...grupos.values()].sort((a, b) => (b.timestamp || b.fecha) > (a.timestamp || a.fecha) ? 1 : -1);
}

function totalGrupo(g) {
  const validas = g.lineas.filter(esMovValido);
  return g.tipo === TIPOS_MOV.VENTA ? sumarDinero(validas.map(m => m.totalVenta || 0)) : sumarDinero(validas.map(m => m.inversion || 0));
}

function filaGrupoHTML(g) {
  const anuladas = g.lineas.filter(m => !esMovValido(m)).length;
  const todoAnulado = anuladas === g.lineas.length;
  const cliente = g.idCliente ? Almacen.cliente(g.idCliente) : null;
  const esVenta = g.tipo === TIPOS_MOV.VENTA;
  const etiquetaTipo = { VENTA: 'Venta', ENTRADA: 'Entrada', APERTURA: 'Apertura', REASIGNACION: 'Sabores' }[g.tipo] || g.tipo;
  const hayNuevo = g.lineas.some(m => m.productoNuevo === 'SI');
  const nombre1 = (m) => { const p = Almacen.producto(m.idProducto); return p ? nombreProducto(p, { conVariante: false }) : m.sku; };
  return html`<details class="desplegable">
    <summary class="fila-lista ${todoAnulado ? 'anulada' : ''}">
      <span class="insignia ${esVenta ? 'venta' : 'entrada'}">${etiquetaTipo}</span>
      <div class="crece"><div class="titulo recortar">${g.lineas.length === 1 ? nombre1(g.lineas[0]) : `${g.lineas.length} productos`}${hayNuevo ? html` <span class="insignia nuevo">Nuevo</span>` : ''}${g.lineas.some(m => m.bonif > 0) ? html` <span class="insignia">+Bonif.</span>` : ''}</div>
        <div class="sub">${formatearFechaCorta(g.fecha)} ${String(g.timestamp || '').slice(11, 16)} · ${g.clave}${cliente ? html` · ${cliente.nombre}` : ''}${anuladas && !todoAnulado ? html` · ${anuladas} anulada${anuladas > 1 ? 's' : ''}` : ''}</div></div>
      <span class="monto">${formatearDinero(totalGrupo(g))}</span>
      ${seguro(icono('chevron-abajo', 'icono-sm chevron'))}
    </summary>
    <div class="desplegable-cuerpo">
      ${g.lineas.map(m => { const p = Almacen.producto(m.idProducto); const u = p ? pluralUnidad(p.unidadBase, Math.abs(m.cantidad)) : ''; return html`
        <div class="linea-mov ${esMovValido(m) ? '' : 'anulada'}">
          <div class="crece"><div class="t-pequeno t-fuerte">${nombre1(m)}${m.variante ? html` · ${m.variante}` : ''}${m.productoNuevo === 'SI' ? html` <span class="insignia nuevo">Nuevo</span>` : ''}${esMovValido(m) ? '' : html` <span class="insignia anulada">Anulada</span>`}</div>
            <div class="t-mini t-secundario">${m.folio} · ${formatearNumero(Math.abs(m.cantidad))} ${u}${m.bonif ? html` + ${formatearNumero(m.bonif)} gratis` : ''}${m.unidPorEmpaque > 1 ? html` (${formatearNumero(m.cantEmpaques)} ${m.empaqueMov} de ${formatearNumero(m.unidPorEmpaque)})` : ''}${esVenta ? html` · gana ${formatearDinero(m.utilidad || 0)}` : ''}</div>
            <div class="t-mini t-tenue">Código ${m.sku || '—'} · capturado ${String(m.timestamp || '').slice(0, 16) || '—'} · costo ${formatearDinero(m.costoUnit || 0, { detalle: true })} · precio ${formatearDinero(m.precioUnit || 0)}</div></div>
          <span class="cifra t-pequeno">${formatearDinero(esVenta ? (m.totalVenta || 0) : m.inversion)}</span>
          ${esMovValido(m) && !m._historico && (m.tipo === TIPOS_MOV.VENTA || m.tipo === TIPOS_MOV.ENTRADA) ? html`<button type="button" class="boton boton-texto boton-sm peligro" data-accion="anular-linea" data-folio="${m.folio}">Anular</button>` : ''}
        </div>`; })}
      ${g.lineas.length > 1 && !g.lineas.some(m => m._historico) && g.lineas.filter(esMovValido).length > 1 ? html`<button type="button" class="boton boton-secundario boton-sm" data-accion="anular-ticket" data-ticket="${g.clave}" style="justify-self:start">${seguro(icono('papelera', 'icono-sm'))}Anular ticket completo</button>` : ''}
    </div></details>`;
}

function pintarMovimientosDashboard() {
  const est = estadoDashboard;
  const grupos = gruposMovimientos();
  const cuerpo = $('#dash-cuerpo', dashUI.el);
  // Fase UI: buscador y botón de ajustes en una fila; las acciones de alto
  // nivel (corregir precio, anular lo filtrado, acciones recientes) quedan
  // ocultas en ese panel, marcadas en rojo porque cambian el historial.
  cuerpo.innerHTML = html`
    <div class="fila-busqueda">
      <div class="buscador crece"><div class="control">${seguro(icono('buscar', 'icono-sm'))}<input id="dash-buscar" type="search" placeholder="Buscar folio, producto o cliente" value="${est.texto}" autocomplete="off"></div></div>
      <button type="button" class="boton boton-icono boton-ajustes-criticos" data-solo-modo="pro" data-accion="ajustes-movimientos" aria-expanded="${String(!!est.ajustesAbiertos)}" aria-label="Ajustes de movimientos">${seguro(icono('ajustes'))}</button>
    </div>
    <div class="ajustes-criticos" id="dash-ajustes" data-solo-modo="pro" ${est.ajustesAbiertos ? '' : 'hidden'}>
      <div class="ajustes-criticos-aviso">${seguro(icono('peligro', 'icono-sm'))}<span><strong>Ajustes de alto nivel.</strong> Cambian tu historial: revisa la vista previa antes de confirmar. Se pueden revertir durante ${DIAS_REVERSION} días.</span></div>
      <div class="grupo-botones" data-solo-modo="tienda pro" id="dash-acciones-lote"></div>
      <div id="dash-acciones-recientes"></div>
    </div>
    <div class="fila-chips" role="group" aria-label="Tipo">
      ${[['TODO', 'Todo'], ['VENTA', 'Ventas'], ['ENTRADA', 'Entradas']].map(([v, t]) => html`<button type="button" class="chip" data-accion="tipo" data-valor="${v}" aria-pressed="${String(est.tipo === v)}">${t}</button>`)}
      <button type="button" class="chip" data-accion="solo-nuevos" aria-pressed="${String(est.soloNuevos)}">${seguro(icono('archivo-nuevo', 'icono-sm'))}Productos nuevos</button>
    </div>
    <div id="dash-lista"></div>`.texto;
  const buscar = $('#dash-buscar', cuerpo);
  buscar.addEventListener('input', () => { est.texto = buscar.value; pintarListaMovimientos(); });
  if (typeof pintarBotonesLote === 'function') pintarBotonesLote($('#dash-acciones-lote', cuerpo));
  if (typeof pintarAccionesRecientes === 'function') pintarAccionesRecientes($('#dash-acciones-recientes', cuerpo));
  pintarListaMovimientos(grupos);
}

function pintarListaMovimientos(grupos) {
  const lista = grupos || gruposMovimientos();
  pintarPaginado({
    contenedor: $('#dash-lista', dashUI.el), items: lista, tope: 30, pintarItem: filaGrupoHTML,
    vacio: html`<div class="vacio">${seguro(icono('recibo', 'icono-xl'))}<strong>Sin movimientos</strong><p>Prueba con otro período o quita filtros.</p></div>`
  });
  pintarIconos($('#dash-lista', dashUI.el));
}

async function anularConConfirmacion(folios, accion) {
  const movs = folios.map(f => Almacen.movimientoPorFolio(f)).filter(Boolean);
  const deOtroDia = movs.some(m => m.fecha !== obtenerFechaLocal());
  const unidades = movs.map(m => { const p = Almacen.producto(m.idProducto); return `${m.folio}: ${formatearNumero(Math.abs(m.cantidad))} ${p ? pluralUnidad(p.unidadBase, Math.abs(m.cantidad)) : ''}`; });
  const ok = await confirmar({
    titulo: movs.length > 1 ? `¿Anular ${movs.length} movimientos?` : '¿Anular este movimiento?',
    mensaje: `${unidades.slice(0, 6).join('\n')}${unidades.length > 6 ? '\n…' : ''}\n\nNo se borra: queda marcado como anulado y el stock se recalcula.${deOtroDia ? '\n\nOjo: es de otro día; tus cifras de ese día cambiarán.' : ''}`,
    textoConfirmar: 'Anular', peligro: true
  });
  if (!ok) return;
  const r = await ejecutarOperacion(operacionAnular(folios, accion));
  if (r) avisar(`${movs.length > 1 ? 'Ticket anulado' : 'Movimiento anulado'}. Puedes revertirlo en «Acciones recientes» (7 días).`);
}

const accionesDashboard = {
  'vista': (b) => { estadoDashboard.vista = b.dataset.valor; pintarDashboard(); },
  'ajustes-movimientos': (b) => { const e = estadoDashboard; e.ajustesAbiertos = !e.ajustesAbiertos; b.setAttribute('aria-expanded', String(e.ajustesAbiertos)); $('#dash-ajustes', dashUI.el).hidden = !e.ajustesAbiertos; },
  'ver-costo-promedio': () => { estadoDashboard.verCostoPromedio = !estadoDashboard.verCostoPromedio; pintarDashboard(); },
  'tipo': (b) => { estadoDashboard.tipo = b.dataset.valor; pintarMovimientosDashboard(); },
  'solo-nuevos': () => { estadoDashboard.soloNuevos = !estadoDashboard.soloNuevos; pintarMovimientosDashboard(); },
  // Toda anulación queda registrada para poder revertirla (7 días), también una línea suelta.
  'anular-linea': (b) => anularConConfirmacion([b.dataset.folio], { tipo: 'ANULACION_LINEA', alcance: b.dataset.folio }),
  'anular-ticket': (b) => {
    const folios = Almacen.movimientosDeTicket(b.dataset.ticket).filter(esMovValido).map(m => m.folio);
    anularConConfirmacion(folios, { tipo: 'ANULACION_TICKET', alcance: `Ticket ${b.dataset.ticket}` });
  }
};
