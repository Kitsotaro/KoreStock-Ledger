// © 2026 Wilber Adonay Escobar Solórzano (Kitsótaro) · KoreStock Ledger · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// PANTALLA COMBUSTIBLE (T17 + T28) — §23.2 y D50:
//   - Formulario compacto: vehículo (buscador con «Agregar vehículo»),
//     odómetro, galones, monto, fecha. Al guardar, el resumen muestra el
//     rendimiento de esa carga.
//   - Gráfico: línea de rendimiento por carga (km/galón) del vehículo
//     elegido; sale del cálculo que ya existe y nunca se guarda.
//   - Historial con período abajo, «Anular» por fila y «Cargar más».
//   - Vehículos: editar y desactivar (antes faltaban).
//
// Expone: (registra la pantalla 'combustible').
// Depende de: shell.js, componentes.js, campos.js, filtros.js,
//   operaciones-gastos.js, calculos.js, cargador.js (Chart).
// ============================================================

const estadoCombustible = crearEstadoFiltros('MES');
const combUI = { el: null, filtros: null, placa: '', grafico: null };

registrarPantalla('combustible', {
  titulo: 'Combustible',
  montar(el) {
    combUI.el = el;
    el.innerHTML = html`
      <div class="columna">
        <form class="tarjeta columna" id="form-carga" novalidate>
          <div class="buscador"><label for="carga-vehiculo" class="etiqueta-campo">Vehículo</label>
            <div class="control">${seguro(icono('vehiculo', 'icono-sm'))}<input id="carga-vehiculo" placeholder="Placa, marca o modelo" autocomplete="off"></div></div>
          <p class="t-pequeno t-secundario" id="carga-vehiculo-info"></p>
          <div class="rejilla-campos">
            <div class="campo"><label for="carga-odometro">Odómetro</label><div class="control"><input id="carga-odometro" placeholder="Lectura actual"><span class="sufijo">km</span></div><span class="ayuda-campo" id="carga-odometro-ayuda"></span></div>
            <div class="campo"><label for="carga-galones">Galones</label><div class="control"><input id="carga-galones" placeholder="0.000"></div></div>
            <div class="campo"><label for="carga-monto">Monto pagado</label><div class="control"><span class="prefijo">$</span><input id="carga-monto" placeholder="0.00"></div></div>
          </div>
          <div class="fila-separada">
            <label class="fila t-pequeno" for="carga-fecha">${seguro(icono('calendario', 'icono-sm'))}<span class="control"><input type="date" id="carga-fecha"></span></label>
            <span class="cifra t-pequeno t-secundario" id="carga-folio"></span>
          </div>
          <button type="submit" class="boton boton-primario boton-bloque">${seguro(icono('combustible'))}Guardar carga</button>
        </form>
        <div class="tarjeta" id="comb-grafico-tarjeta" hidden>
          <div class="tarjeta-titulo"><h2>${seguro(icono('tendencia', 'icono-sm'))} Rendimiento por carga</h2><span class="t-pequeno t-secundario" id="comb-grafico-placa"></span></div>
          <div class="contenedor-grafico"><canvas id="comb-grafico" role="img" aria-label="Kilómetros por galón en cada carga"></canvas></div>
        </div>
        <div class="tarjeta"><div class="tarjeta-titulo"><h2>Vehículos</h2><button type="button" class="boton boton-texto boton-sm" data-accion="nuevo-vehiculo">${seguro(icono('mas', 'icono-sm'))}Agregar</button></div><div id="comb-vehiculos"></div></div>
        <div id="comb-lista"></div>
      </div>
      <div id="comb-filtros"></div>`.texto;
    combUI.filtros = crearFiltrosAbajo({ contenedor: $('#comb-filtros', el), estado: estadoCombustible, usar: ['periodo'], alCambiar: () => pintarListaCargas() });
    prepararCampoNumerico($('#carga-odometro', el), { decimales: 0 });
    prepararCampoNumerico($('#carga-galones', el), { decimales: 5 });
    prepararCampoNumerico($('#carga-monto', el), { decimales: 2 });
    const fecha = $('#carga-fecha', el); fecha.value = obtenerFechaLocal(); fecha.max = obtenerFechaLocal();
    crearBuscador({
      input: $('#carga-vehiculo', el),
      obtener: (q) => Almacen.vehiculosActivos().filter(v => coincidenPalabras([v.placa, v.marca, v.modelo, v.color].join(' '), q)).map(v => ({ valor: v, html: html`${seguro(icono('vehiculo', 'icono-sm'))}<span>${v.placa} · ${v.marca} ${v.modelo}</span>` })),
      alEnfocarVacio: () => Almacen.vehiculosActivos().map(v => ({ valor: v, html: html`${seguro(icono('vehiculo', 'icono-sm'))}<span>${v.placa} · ${v.marca} ${v.modelo}</span>` })),
      alElegir: (v) => elegirVehiculo(v.placa),
      nuevo: { html: (q) => html`${seguro(icono('mas', 'icono-sm'))}<span>Agregar vehículo «${q}»</span>`, fn: (q) => editarVehiculo(null, q) }
    });
    $('#form-carga', el).addEventListener('submit', (e) => { e.preventDefault(); guardarCargaUI($('#form-carga button[type="submit"]', el)); });
    delegar(el, 'click', {
      'anular-carga': (b) => anularCargaUI(b.dataset.folio),
      'nuevo-vehiculo': () => editarVehiculo(null, ''),
      'editar-vehiculo': (b) => editarVehiculo(b.dataset.placa),
      'elegir-vehiculo': (b) => elegirVehiculo(b.dataset.placa)
    });
    Almacen.suscribir((m) => { if (Shell.actual === 'combustible' && m !== 'carga') pintarCombustible(); });
    Shell.alCambiarTema(() => { if (Shell.actual === 'combustible') pintarGraficoCombustible(); });
  },
  mostrar() {
    if (!combUI.placa) { const v = Almacen.vehiculosActivos(); if (v.length === 1) combUI.placa = v[0].placa; }
    combUI.filtros.pintar(); pintarCombustible();
  }
});

function elegirVehiculo(placa) {
  combUI.placa = placa;
  $('#carga-vehiculo', combUI.el).value = '';
  pintarCombustible();
  setTimeout(() => $('#carga-odometro', combUI.el).focus(), 50);
}

function pintarCombustible() {
  const v = Almacen.hojas.VEHICULOS.find(x => x.placa === combUI.placa);
  const ult = v ? ultimoOdometro(v.placa) : 0;
  $('#carga-vehiculo-info', combUI.el).innerHTML = v ? html`<strong>${v.placa}</strong> · ${v.marca} ${v.modelo} · ${v.tipoCombustible}`.texto : 'Elige un vehículo o agrega uno nuevo.';
  $('#carga-odometro-ayuda', combUI.el).textContent = v && ult ? `Última lectura: ${formatearNumero(ult)} km` : '';
  $('#carga-folio', combUI.el).textContent = Almacen.verFolioSiguiente('CB-');
  const vehiculos = Almacen.hojas.VEHICULOS;
  $('#comb-vehiculos', combUI.el).innerHTML = vehiculos.length ? `<div class="lista">${vehiculos.map(x => {
    const dias = diasSinCarga(Almacen.hojas.COSTOS_COMBUSTIBLE, x.placa);
    return html`<div class="fila-lista"><button type="button" class="boton boton-texto crece" data-accion="elegir-vehiculo" data-placa="${x.placa}" style="justify-content:flex-start;padding:0">
        <span class="crece" style="text-align:left"><span class="titulo">${x.placa}${x.placa === combUI.placa ? ' ✓' : ''}</span><span class="sub" style="display:block">${x.marca} ${x.modelo}${x.estado === ESTADOS.INACTIVO ? ' · inactivo' : ''}${dias !== null ? ` · última carga hace ${dias} ${pluralizar(dias, 'día')}` : ''}</span></span></button>
      <button type="button" class="boton boton-icono" data-accion="editar-vehiculo" data-placa="${x.placa}" aria-label="Editar ${x.placa}">${seguro(icono('editar', 'icono-sm'))}</button></div>`.texto;
  }).join('')}</div>` : html`<p class="t-tenue t-pequeno">Todavía no hay vehículos.</p>`.texto;
  pintarListaCargas();
  pintarGraficoCombustible();
  pintarIconos(combUI.el);
}

function pintarListaCargas() {
  const est = estadoCombustible;
  const rend = calcularRendimientos(Almacen.hojas.COSTOS_COMBUSTIBLE);
  const lista = Almacen.hojas.COSTOS_COMBUSTIBLE.filter(c => c.estado !== ESTADOS.GASTO_ARCHIVADO && enPeriodo(c.fecha, est.inicio, est.fin))
    .sort((a, b) => (b.timestamp || b.fecha) > (a.timestamp || a.fecha) ? 1 : -1);
  pintarPaginado({
    contenedor: $('#comb-lista', combUI.el), items: lista, tope: 30,
    vacio: html`<div class="vacio">${seguro(icono('combustible', 'icono-xl'))}<strong>Sin cargas en el período</strong></div>`,
    pintarItem: (c) => { const r = rend.get(c.folio) || {}; const anulada = c.estado === ESTADOS.GASTO_ANULADO; return html`<div class="fila-lista ${anulada ? 'anulada' : ''}"><div class="crece">
      <div class="titulo">${c.placa} · ${c.galones} gal${anulada ? html` <span class="insignia anulada">Anulada</span>` : ''}</div>
      <div class="sub">${formatearFechaCorta(c.fecha)} · ${c.folio} · ${formatearNumero(c.odometro)} km${r.rendimiento ? ` · ${r.rendimiento.toFixed(1)} km/gal` : ''}</div></div>
      <span class="monto">${formatearDinero(c.monto)}</span>
      ${anulada ? '' : html`<button type="button" class="boton boton-texto boton-sm peligro" data-accion="anular-carga" data-folio="${c.folio}">Anular</button>`}</div>`; }
  });
}

async function pintarGraficoCombustible() {
  const tarjeta = $('#comb-grafico-tarjeta', combUI.el);
  const rend = calcularRendimientos(Almacen.hojas.COSTOS_COMBUSTIBLE);
  const puntos = Almacen.hojas.COSTOS_COMBUSTIBLE.filter(c => c.placa === combUI.placa && esGastoValido(c))
    .sort((a, b) => (a.fecha === b.fecha ? (a.timestamp < b.timestamp ? -1 : 1) : (a.fecha < b.fecha ? -1 : 1)))
    .map(c => ({ c, r: rend.get(c.folio) })).filter(x => x.r && x.r.rendimiento);
  tarjeta.hidden = puntos.length < 2;
  if (tarjeta.hidden) return;
  $('#comb-grafico-placa', combUI.el).textContent = combUI.placa;
  try { await cargarChart(); } catch (e) { return; }
  const estilo = getComputedStyle(document.documentElement);
  const color = (v) => estilo.getPropertyValue(v).trim();
  if (combUI.grafico) combUI.grafico.destroy();
  combUI.grafico = new Chart($('#comb-grafico', combUI.el), {
    type: 'line',
    data: { labels: puntos.map(x => formatearFechaCorta(x.c.fecha)), datasets: [{ label: 'km/galón', data: puntos.map(x => Number(x.r.rendimiento.toFixed(2))), borderColor: color('--primario'), backgroundColor: color('--primario'), tension: 0.25, pointRadius: 3, borderWidth: 2.5 }] },
    options: { responsive: true, maintainAspectRatio: false, animation: { duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 300 },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.raw} km/galón` } } },
      scales: { x: { ticks: { color: color('--texto-3'), maxTicksLimit: 6, maxRotation: 0 }, grid: { display: false } }, y: { ticks: { color: color('--texto-3') }, grid: { color: color('--borde') } } } }
  });
}

async function guardarCargaUI(boton) {
  const el = combUI.el;
  const datos = { placa: combUI.placa, odometro: Math.round(leerCantidad($('#carga-odometro', el))), galones: leerCantidad($('#carga-galones', el)), monto: leerDineroCampo($('#carga-monto', el)), fecha: $('#carga-fecha', el).value };
  let op;
  try { op = operacionGuardarCarga(datos); } catch (e) { mostrarDialogo({ titulo: 'Revisa la carga', mensaje: e.message }); return; }
  const c = await ejecutarOperacion(op, { boton });
  if (!c) return;
  ['#carga-odometro', '#carga-galones', '#carga-monto'].forEach(s => { $(s, el).value = ''; });
  const r = calcularRendimientos(Almacen.hojas.COSTOS_COMBUSTIBLE).get(c.folio) || {};
  await mostrarResumen({
    titulo: 'Carga guardada', total: formatearDinero(c.monto),
    detalle: `${c.placa} · ${c.galones} galones · ${r.rendimiento ? `${r.rendimiento.toFixed(1)} km por galón (${formatearNumero(r.km)} km desde la carga anterior)` : 'primera carga: el rendimiento se calcula desde la próxima'}`,
    alDeshacer: async () => { const x = await ejecutarOperacion(operacionAnularCarga(c.folio)); if (x) avisar('Carga anulada.'); }
  });
}

async function anularCargaUI(folio) {
  const c = Almacen.hojas.COSTOS_COMBUSTIBLE.find(x => x.folio === folio);
  if (!(await confirmar({ titulo: '¿Anular esta carga?', mensaje: `${c.placa} · ${c.galones} gal · ${formatearDinero(c.monto)}\n\nEl rendimiento de las demás cargas se recalcula solo.`, textoConfirmar: 'Anular', peligro: true }))) return;
  const r = await ejecutarOperacion(operacionAnularCarga(folio));
  if (r) avisar('Carga anulada.');
}

function editarVehiculo(placa, textoInicial) {
  const v = placa ? Almacen.hojas.VEHICULOS.find(x => x.placa === placa) : { placa: String(textoInicial || '').toUpperCase(), marca: '', modelo: '', color: '', tipoCombustible: 'Gasolina', estado: ESTADOS.ACTIVO };
  const control = abrirHoja({
    titulo: placa ? `Vehículo ${placa}` : 'Agregar vehículo',
    contenido: html`<div class="rejilla-campos">
        <div class="campo"><label for="veh-placa">Placa</label><div class="control"><input id="veh-placa" value="${v.placa}" ${placa ? 'disabled' : ''} autocomplete="off"></div>${placa ? html`<span class="ayuda-campo">La placa identifica al vehículo y no cambia.</span>` : ''}</div>
        <div class="campo"><label for="veh-marca">Marca</label><div class="control"><input id="veh-marca" value="${v.marca}"></div></div>
        <div class="campo"><label for="veh-modelo">Modelo</label><div class="control"><input id="veh-modelo" value="${v.modelo}"></div></div>
        <div class="campo"><label for="veh-color">Color</label><div class="control"><input id="veh-color" value="${v.color}"></div></div>
      </div>
      <div class="campo"><label for="veh-combustible">Combustible</label><div class="control"><select id="veh-combustible">${['Gasolina', 'Diésel'].map(t => html`<option ${t === v.tipoCombustible ? 'selected' : ''}>${t}</option>`)}</select></div></div>
      ${placa ? html`<label class="casilla"><input type="checkbox" id="veh-activo" ${v.estado !== ESTADOS.INACTIVO ? 'checked' : ''}> Activo (los inactivos no aparecen al registrar cargas)</label>` : ''}`,
    acciones: [{ texto: 'Cancelar', fn: (c) => c.cerrar() }, { texto: 'Guardar', clase: 'boton-primario', fn: async (c) => {
      const datos = { marca: $('#veh-marca', c.el).value, modelo: $('#veh-modelo', c.el).value, color: $('#veh-color', c.el).value, tipoCombustible: $('#veh-combustible', c.el).value };
      let op;
      try {
        op = placa ? operacionActualizarVehiculo(placa, Object.assign(datos, { estado: $('#veh-activo', c.el).checked ? ESTADOS.ACTIVO : ESTADOS.INACTIVO }))
          : operacionCrearVehiculo(Object.assign(datos, { placa: $('#veh-placa', c.el).value }));
      } catch (e) { mostrarDialogo({ titulo: 'No se puede guardar', mensaje: e.message }); return; }
      const r = await ejecutarOperacion(op, { boton: $('.acciones .boton-primario', c.el) });
      if (r) { c.cerrar(); if (!placa) combUI.placa = r.placa; avisar('Vehículo guardado.'); pintarCombustible(); }
    } }]
  });
  return control;
}
