// © 2026 Kitsótaro · KoreStock Ledger · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// PANTALLA PANORAMA (T16, modo Pro) — V3 §24.3, D40:
//   - UN solo período y UN filtro de producto para todas las tarjetas,
//     abajo como en el Dashboard («Excluir» funciona igual).
//   - Tarjetas con un número grande y el detalle desplegable:
//     ROI global y rotación · Punto de equilibrio · Proyección de
//     agotamiento · Costo promedio (CPP) por producto · Combustible.
//   - Semáforos con texto; umbrales de ROI y agotamiento conservados
//     (hoja UMBRALES, claves ROI y AGOTAMIENTO); listas con «Cargar más».
//   - Las fórmulas se explican con su término exacto (D52, excepción).
//   - Equilibrio: el combustible NO suma a gastos fijos (§31 punto 7).
//
// Expone: (registra la pantalla 'panorama'), estadoPanorama.
// Depende de: shell.js, componentes.js, filtros.js, almacen.js, calculos.js,
//   operaciones-catalogo.js (operacionGuardarUmbral).
// ============================================================

const estadoPanorama = Object.assign(crearEstadoFiltros('MES'), { ventana: 30, abiertas: new Set(), buscarRoi: '', buscarCpp: '' });
const panUI = { el: null, filtros: null };

const FORMULAS = {
  roi: 'ROI = utilidad de las ventas ÷ inversión en entradas del período × 100.\nRotación = unidades vendidas en el período ÷ stock actual.\nLa apertura de una base rotada no cuenta como compra.',
  equilibrio: 'Margen de contribución = utilidad ÷ ventas × 100.\nPunto de equilibrio = gastos fijos del período ÷ margen.\nEs cuánto necesitas vender para cubrir tus gastos, sin ganar ni perder. No incluye combustible.',
  proyeccion: 'Ritmo diario = unidades vendidas en los últimos N días ÷ N.\nDías restantes = stock actual ÷ ritmo diario.',
  cpp: 'Costo promedio ponderado: cada compra se mezcla con lo que ya tenías: (valor anterior + total pagado) ÷ unidades. Las unidades gratis bajan el costo promedio; vender no lo cambia.',
  combustible: 'Kilómetros = última lectura del período − la lectura anterior al período.\nRendimiento = kilómetros ÷ galones.'
};

registrarPantalla('panorama', {
  titulo: 'Panorama',
  montar(el) {
    panUI.el = el;
    el.innerHTML = html`<div class="columna" id="pan-cuerpo"></div><div id="pan-filtros"></div>`.texto;
    panUI.filtros = crearFiltrosAbajo({ contenedor: $('#pan-filtros', el), estado: estadoPanorama, usar: ['periodo', 'producto', 'marca', 'categoria'], alCambiar: () => pintarPanorama() });
    delegar(el, 'click', accionesPanorama);
    el.addEventListener('toggle', (e) => {
      const d = e.target.closest('details[data-tarjeta]');
      if (d) { if (d.open) estadoPanorama.abiertas.add(d.dataset.tarjeta); else estadoPanorama.abiertas.delete(d.dataset.tarjeta); }
    }, true);
    Almacen.suscribir(() => { if (Shell.actual === 'panorama') pintarPanorama(); });
  },
  mostrar() { panUI.filtros.pintar(); pintarPanorama(); }
});

function umbralRoi() { return Almacen.umbral('ROI') || { min: 10, max: 20 }; }
function umbralAgotamiento() { return Almacen.umbral('AGOTAMIENTO') || { min: 7, max: 20 }; }

function tarjetaPanorama(clave, titulo, iconoNombre, valor, sub, cuerpo) {
  return html`<details class="tarjeta" data-tarjeta="${clave}" ${estadoPanorama.abiertas.has(clave) ? 'open' : ''}>
    <summary><span class="fila crece">${seguro(icono(iconoNombre, 'icono-sm'))}<span class="crece"><span class="t-pequeno t-secundario">${titulo}</span>
      <span class="cifra-grande">${valor}</span><span class="t-pequeno t-secundario">${sub}</span></span></span>
      <button type="button" class="boton boton-icono" data-accion="formula" data-clave="${clave}" aria-label="Cómo se calcula">${seguro(icono('info', 'icono-sm'))}</button>
      ${seguro(icono('chevron-abajo', 'icono-sm icono-giro'))}</summary>
    <div class="columna">${cuerpo}</div></details>`;
}

function pintarPanorama() {
  const est = estadoPanorama;
  const filtro = predicadoFiltros(est);
  const movs = Almacen.movimientosEfectivos();
  const productos = Almacen.productosActivos().filter(p => !filtro || filtro({ idProducto: p.idProducto }));
  const ur = umbralRoi(), ua = umbralAgotamiento();

  // ROI y rotación
  const roi = calcularROI(movs, est.inicio, est.fin, filtro);
  const claseRoi = (v) => v <= ur.min ? ['critico', 'advertencia', 'Crítico'] : v <= ur.max ? ['bajo', 'info', 'Bajo la meta'] : ['bien', 'check-circulo', 'En la meta'];
  const roiFilas = productos.map(p => {
    const d = roi.porProducto[p.idProducto] || { inversion: 0, ganancia: 0, unidadesVendidas: 0, unidadesCompradas: 0, roi: 0 };
    const stock = Almacen.stock(p.idProducto);
    return { p, d, rotacion: stock > 0 ? d.unidadesVendidas / stock : null };
  }).filter(x => (x.d.inversion || x.d.ganancia) && (!est.buscarRoi || coincidenPalabras(textoBuscableProducto(x.p), est.buscarRoi)))
    .sort((a, b) => b.d.roi - a.d.roi);
  const [cGlobal, iGlobal, tGlobal] = claseRoi(roi.roiGlobal);

  // Equilibrio
  const eq = calcularPuntoEquilibrio(movs, Almacen.hojas.COSTOS_OPERATIVOS, est.inicio, est.fin, filtro);
  const progreso = eq.puntoEquilibrio ? Math.min(999, (eq.ventaTotal / eq.puntoEquilibrio) * 100) : 0;
  const falta = eq.puntoEquilibrio ? Math.max(0, restarDinero(eq.puntoEquilibrio, eq.ventaTotal)) : 0;

  // Proyección
  const estados = {}; productos.forEach(p => { estados[p.idProducto] = Almacen.estado(p.idProducto); });
  const proy = calcularProyeccion(movs, estados, est.ventana, obtenerFechaLocal(), filtro);
  const proyFilas = productos.map(p => ({ p, d: proy[p.idProducto] })).filter(x => x.d && x.d.diasRestantes !== null)
    .sort((a, b) => a.d.diasRestantes - b.d.diasRestantes);
  const claseProy = (dias) => dias <= ua.min ? ['critico', 'advertencia', 'Urgente'] : dias <= ua.max ? ['bajo', 'info', 'Pronto'] : ['bien', 'check-circulo', 'Cómodo'];
  const primero = proyFilas[0];

  // CPP
  const cppFilas = productos.filter(p => !est.buscarCpp || coincidenPalabras(textoBuscableProducto(p), est.buscarCpp))
    .map(p => ({ p, e: Almacen.estado(p.idProducto) })).sort((a, b) => nombreProducto(a.p).localeCompare(nombreProducto(b.p), 'es'));
  const valorCpp = sumarDinero(productos.map(p => Almacen.estado(p.idProducto).fondo));

  // Combustible
  const cargas = Almacen.hojas.COSTOS_COMBUSTIBLE;
  const comb = calcularResumenCombustible(cargas, est.inicio, est.fin);
  const vehiculos = Almacen.vehiculosActivos();
  const gastoComb = sumarDinero(Object.values(comb).map(x => x.gastado));
  const galones = Object.values(comb).reduce((s, x) => s + x.galones, 0);

  $('#pan-cuerpo', panUI.el).innerHTML = html`
    <p class="t-pequeno t-secundario">${formatearFechaCorta(est.inicio, true)} – ${formatearFechaCorta(est.fin, true)}${filtro ? ' · con filtros' : ''}</p>
    ${tarjetaPanorama('roi', 'Retorno sobre la inversión (ROI)', 'tendencia', `${roi.roiGlobal.toFixed(1)}%`,
      html`<span class="semaforo ${cGlobal}">${seguro(icono(iGlobal))}${tGlobal}</span> · invertiste ${formatearDinero(roi.inversionGlobal)} y ganaste ${formatearDinero(roi.gananciaGlobal)}`,
      html`<div class="fila envolver t-pequeno">Meta: crítico ≤ <input class="umbral" data-umbral="ROI-min" value="${ur.min}" aria-label="ROI crítico">% · bajo ≤ <input class="umbral" data-umbral="ROI-max" value="${ur.max}" aria-label="ROI bajo">%</div>
        <div class="control">${seguro(icono('buscar', 'icono-sm'))}<input type="search" data-buscar="roi" placeholder="Buscar producto" value="${est.buscarRoi}"></div>
        <div data-lista="roi"></div>`)}
    ${tarjetaPanorama('equilibrio', 'Punto de equilibrio', 'panorama', eq.puntoEquilibrio === null ? 'Sin margen' : formatearDinero(eq.puntoEquilibrio),
      eq.puntoEquilibrio === null ? 'No hubo ventas con ganancia en el período.' : (falta > 0 ? `Te faltan ${formatearDinero(falta)} en ventas para cubrir tus gastos` : 'Ya cubriste tus gastos del período'),
      html`<div class="par-dato"><span>Gastos fijos del período</span><strong>${formatearDinero(eq.gastosFijos)}</strong></div>
        <div class="par-dato"><span>Margen de contribución</span><strong>${eq.margenContribucion.toFixed(1)}%</strong></div>
        <div class="par-dato"><span>Vendido</span><strong>${formatearDinero(eq.ventaTotal)} (${progreso.toFixed(0)}%)</strong></div>
        <div class="mini-barra" style="width:100%;height:10px"><span class="${progreso >= 100 ? 'fondo-bien' : progreso >= 50 ? 'fondo-bajo' : 'fondo-critico'}" style="width:${Math.min(100, progreso).toFixed(0)}%"></span></div>
        <p class="t-mini t-tenue">No incluye combustible: sus cargas se ven en su propia tarjeta.</p>`)}
    ${tarjetaPanorama('proyeccion', 'Proyección de agotamiento', 'reloj', primero ? `${Math.floor(primero.d.diasRestantes)} ${pluralizar(Math.floor(primero.d.diasRestantes), 'día')}` : 'Sin ventas',
      primero ? html`Lo primero en acabarse: ${nombreProducto(primero.p, { conVariante: false })}` : `Sin ventas en los últimos ${est.ventana} días`,
      html`<div class="fila envolver t-pequeno">Ritmo de los últimos <input class="umbral" data-ventana value="${est.ventana}" aria-label="Días de la ventana"> días · urgente ≤ <input class="umbral" data-umbral="AGOTAMIENTO-min" value="${ua.min}" aria-label="Días urgente"> · pronto ≤ <input class="umbral" data-umbral="AGOTAMIENTO-max" value="${ua.max}" aria-label="Días pronto"></div>
        <div data-lista="proyeccion"></div>`)}
    ${tarjetaPanorama('cpp', 'Costo promedio (CPP)', 'billete', formatearDinero(valorCpp), 'Valor del inventario a costo promedio',
      html`<div class="control">${seguro(icono('buscar', 'icono-sm'))}<input type="search" data-buscar="cpp" placeholder="Buscar producto" value="${est.buscarCpp}"></div><div data-lista="cpp"></div>`)}
    ${vehiculos.length ? tarjetaPanorama('combustible', 'Combustible', 'combustible', formatearDinero(gastoComb), `${galones.toFixed(2)} galones en el período`,
      html`<div class="lista">${vehiculos.map(v => {
        const d = comb[v.placa] || { galones: 0, gastado: 0, km: null, rendimiento: null, cargas: 0 };
        const sin = diasSinCarga(cargas, v.placa);
        return html`<div class="fila-lista"><div class="crece"><div class="titulo">${v.marca} ${v.modelo} (${v.placa})</div>
          <div class="sub">${d.km === null ? 'Sin datos de kilómetros' : `${formatearNumero(d.km)} km`}${d.rendimiento ? ` · ${d.rendimiento.toFixed(1)} km/galón` : ''}${d.galones ? ` · ${formatearDinero(dividirDinero(d.gastado, d.galones))}/galón` : ''}</div>
          ${sin !== null && sin >= 15 ? html`<span class="semaforo bajo">${seguro(icono('advertencia'))}Sin cargar hace ${sin} días</span>` : ''}</div>
          <div class="lado"><div class="monto">${formatearDinero(d.gastado)}</div><div class="sub">${d.galones.toFixed(2)} gal</div></div></div>`;
      })}</div>`) : ''}
  `.texto;

  const cuerpo = $('#pan-cuerpo', panUI.el);
  pintarPaginado({ contenedor: $('[data-lista="roi"]', cuerpo), items: roiFilas, tope: 20,
    vacio: html`<p class="t-tenue t-pequeno">Sin compras ni ventas en el período.</p>`,
    pintarItem: (x) => { const [c, i, t] = claseRoi(x.d.roi); return html`<div class="fila-lista"><div class="crece"><div class="titulo recortar">${nombreProducto(x.p, { conVariante: false })}</div>
      <div class="sub">Invertido ${formatearDinero(x.d.inversion)} · ganó ${formatearDinero(x.d.ganancia)} · compró ${formatearNumero(x.d.unidadesCompradas)}</div>
      <div class="sub">${x.rotacion === null ? 'Sin stock para comparar' : `Rotación ${x.rotacion.toFixed(1)}× (vendió ${formatearNumero(x.d.unidadesVendidas)} de ${formatearNumero(Almacen.stock(x.p.idProducto))} en bodega)`}</div>
      <span class="semaforo ${c}">${seguro(icono(i))}${t}</span></div><div class="lado"><div class="monto">${x.d.roi.toFixed(1)}%</div></div></div>`; } });
  pintarPaginado({ contenedor: $('[data-lista="proyeccion"]', cuerpo), items: proyFilas, tope: 20,
    vacio: html`<p class="t-tenue t-pequeno">Sin ventas en la ventana elegida.</p>`,
    pintarItem: (x) => { const [c, i, t] = claseProy(x.d.diasRestantes); return html`<div class="fila-lista"><div class="crece"><div class="titulo recortar">${nombreProducto(x.p, { conVariante: false })}</div>
      <div class="sub">${describirCantidad(x.p.idProducto, Almacen.stock(x.p.idProducto))} · vende ${x.d.ritmoDiario.toFixed(1)} al día</div><span class="semaforo ${c}">${seguro(icono(i))}${t}</span></div>
      <div class="lado"><div class="monto">${Math.floor(x.d.diasRestantes)} d</div></div></div>`; } });
  pintarPaginado({ contenedor: $('[data-lista="cpp"]', cuerpo), items: cppFilas, tope: 20,
    vacio: html`<p class="t-tenue t-pequeno">Sin productos.</p>`,
    pintarItem: (x) => html`<div class="fila-lista"><div class="crece"><div class="titulo recortar">${nombreProducto(x.p, { conVariante: false })}</div>
      <div class="sub">${describirCantidad(x.p.idProducto, x.e.stock)} · en bodega ${formatearDinero(redondearCentavo(x.e.fondo))}</div></div>
      <div class="lado"><div class="monto">${formatearDinero(x.e.cpp, { decimales: 4 })}</div><div class="sub">por ${x.p.unidadBase}</div></div></div>` });
  $$('[data-buscar]', cuerpo).forEach(i => i.addEventListener('change', () => {
    if (i.dataset.buscar === 'roi') est.buscarRoi = i.value; else est.buscarCpp = i.value;
    pintarPanorama();
  }));
  $$('input.umbral', cuerpo).forEach(i => { prepararCampoNumerico(i, { decimales: 1 }); i.addEventListener('change', () => cambiarUmbralPanorama(i)); });
  pintarIconos(cuerpo);
}

async function cambiarUmbralPanorama(input) {
  if (input.dataset.ventana !== undefined) {
    const v = Math.max(1, Math.round(parsearNumero(input.value)) || 30);
    estadoPanorama.ventana = v; pintarPanorama(); return;
  }
  const [clave, lado] = input.dataset.umbral.split('-');
  const actual = clave === 'ROI' ? umbralRoi() : umbralAgotamiento();
  const nuevo = Object.assign({}, actual, { [lado]: parsearNumero(input.value) });
  if (nuevo.max < nuevo.min) { avisar('El segundo valor debe ser mayor o igual que el primero.'); pintarPanorama(); return; }
  const r = await ejecutarOperacion(operacionGuardarUmbral(clave, nuevo.min, nuevo.max));
  if (r !== null) avisar('Umbral guardado.');
}

const accionesPanorama = {
  'formula': (b, e) => { e.preventDefault(); e.stopPropagation(); mostrarDialogo({ titulo: 'Cómo se calcula', mensaje: FORMULAS[b.dataset.clave] }); }
};
