// © 2026 KoreStock Ledger — un proyecto de Kitsótaro · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// PANTALLA STOCK (T14) — solo control (V3 §15.1, §15.2, §20.1, §24.1, D39):
//   - Valor de bodega Bruto / Neto y unidades (heredado de la v2).
//   - El gráfico va ARRIBA de la lista, justo después de las cifras.
//   - Buscador y chips: Todos · Bajo · Agotado · Obsoletos (+ categoría y
//     empaque, como el filtro «tipo de producto» de la v2). Con un empaque
//     elegido se puede fijar el aviso de stock para todos esos productos.
//   - Casilla para ocultar sabores (no restrictiva, también en Bodega).
//   - Lista compacta con TODO el catálogo; la fila cerrada muestra nombre,
//     SKU, stock con equivalente, mini barra del semáforo y valor; al tocar
//     se despliega todo (precios, presentaciones, empaque habitual,
//     bonificado, umbrales, sabores, estado, última modificación) y las
//     acciones: Editar, + Entrada, Obsoleto. «Expandir todo».
//   - Semáforo con el umbral PROPIO de cada producto, con forma + color + texto.
//   - Seleccionar varios: asignar categoría o unir productos (§15.3).
//   - El único gráfico: pastel navegable (grafico-stock.js).
//   Las filas usan content-visibility: con miles de productos el navegador
//   solo dibuja las visibles (§23.4).
//
// Expone: (registra la pantalla 'stock'), SEMAFOROS, infoSemaforo, editarProducto.
// Depende de: shell.js, componentes.js, campos.js, almacen.js, calculos.js,
//   operaciones-catalogo.js, pantallas/entrada.js (abrirEntradaCon),
//   pantallas/venta.js (editarPresentaciones), grafico-stock.js.
// ============================================================

const SEMAFOROS = {
  agotado: { texto: 'Agotado', icono: 'prohibido', clase: 'agotado', fondo: 'fondo-agotado', orden: 0 },
  bajo: { texto: 'Muy poco', icono: 'advertencia', clase: 'critico', fondo: 'fondo-critico', orden: 1 },
  medio: { texto: 'Poco', icono: 'info', clase: 'bajo', fondo: 'fondo-bajo', orden: 2 },
  optimo: { texto: 'Bien', icono: 'check-circulo', clase: 'bien', fondo: 'fondo-bien', orden: 3 }
};
function infoSemaforo(p, stock) { return SEMAFOROS[semaforoStock(stock, p)]; }

const stockUI = { el: null, turno: 0, filtro: 'TODOS', categoria: '', empaque: '', texto: '', valor: 'NETO', seleccion: new Set(), seleccionando: false, expandirTodo: false, ocultarSabores: false };

// Empaques de un producto: su tipo de empaque y los que tiene registrados (caja, fardo…).
function empaquesDeProducto(p) {
  const nombres = new Map();
  if (p.tipoEmpaque) nombres.set(normalizarIdentidad(p.tipoEmpaque), p.tipoEmpaque);
  Almacen.hojas.EQUIVALENCIAS.forEach(e => { if (e.idProducto === p.idProducto && e.unidades > 1) nombres.set(normalizarIdentidad(e.nombre), e.nombre); });
  return nombres;
}

registrarPantalla('stock', {
  titulo: 'Stock',
  montar(el) {
    stockUI.el = el;
    el.innerHTML = html`
      <div class="columna">
        <div class="cifras" id="stock-cifras"></div>
        <div id="stock-grafico"></div>
        <div class="buscador"><div class="control">${seguro(icono('buscar', 'icono-sm'))}<input id="stock-buscar" type="search" placeholder="Buscar en el catálogo" autocomplete="off"></div></div>
        <div class="fila-chips" id="stock-chips" role="group" aria-label="Filtros"></div>
        <div class="fila-separada">
          <span class="t-pequeno t-secundario" id="stock-conteo"></span>
          <span class="fila">
            <button type="button" class="boton boton-texto boton-sm" data-accion="expandir">Expandir todo</button>
            <button type="button" class="boton boton-texto boton-sm" data-accion="seleccionar">Seleccionar</button>
          </span>
        </div>
        <div id="stock-barra-seleccion"></div>
        <div id="stock-lista"></div>
        <button type="button" class="boton boton-entrada boton-bloque" data-accion="agregar">${seguro(icono('entrada'))}Agregar stock</button>
      </div>`.texto;
    $('#stock-buscar', el).addEventListener('input', (e) => { stockUI.texto = e.target.value; pintarListaStock(); });
    delegar(el, 'click', accionesStock);
    GraficoStock.montar($('#stock-grafico', el));
    Almacen.suscribir((motivo) => { if (Shell.actual === 'stock') pintarStock(); });
  },
  mostrar() { pintarStock(); }
});

function pintarStock() {
  pintarCifrasStock();
  pintarChipsStock();
  pintarListaStock();
  setTimeout(() => GraficoStock.pintar(), 0);
}

function pintarCifrasStock() {
  const activos = Almacen.productosActivos();
  const v = valorBodega(activos, Almacen.estados);
  const conteo = { agotado: 0, bajo: 0, medio: 0, optimo: 0 };
  activos.forEach(p => { conteo[semaforoStock(Almacen.stock(p.idProducto), p)]++; });
  const total = totalesPorEmpaque(activos);
  $('#stock-cifras', stockUI.el).innerHTML = html`
    <div class="cifra-tarjeta"><div class="etiqueta">Valor en bodega ${botonInfo('Valor en bodega', '**Valor neto** (cifra grande): cuánto vale en capital TODO lo que tienes en bodega, a último costo, incluyendo lo que llegó gratis. Úsalo para cuadrar contra tu conteo físico.\n\n**Real** (verde): lo que pagaste por las unidades pagadas que siguen en bodega (a su costo promedio).\n\n**Bonificación**: lo que vale, a último costo, lo gratis que todavía no se vende. Lo gratis siempre sale primero al vender.')}</div>
      <div class="valor">${formatearDinero(v.bruto)}</div>
      <div class="valor-desglose"><span class="t-exito">${seguro(icono('billete', 'icono-sm'))}Real ${formatearDinero(v.real)}</span><span class="t-secundario">${seguro(icono('estrella', 'icono-sm'))}Bonificación ${formatearDinero(v.bonificacion)}</span></div></div>
    <div class="cifra-tarjeta"><div class="etiqueta">Productos</div><div class="valor">${formatearNumero(activos.length)}</div>
      <div class="comparacion ${conteo.agotado + conteo.bajo ? 'baja' : 'igual'}">${conteo.agotado} agotados · ${conteo.bajo + conteo.medio} con poco</div></div>
    ${total.empaques ? html`<div class="cifra-tarjeta total-bodega" data-solo-modo="pro"><div class="etiqueta">Total en bodega ${botonInfo('Total en bodega', 'Cuántos empaques tienes en total, sin importar la marca: cada producto se cuenta en su empaque más grande (caja, fardo, sixpack…). «Mayoreo»: empaques completos. «Unidades»: todo el stock contado en su unidad (botellas, latas, bolsas…), sumado sin importar la marca.')}</div>
      <div class="valor">${formatearNumero(total.empaques)} <span class="t-pequeno t-secundario">empaques</span></div>
      ${total.grupos.length ? html`<div class="fila-total"><span class="t-mini t-secundario">${seguro(icono('caja', 'icono-sm'))}Mayoreo</span><span class="chips-total">${total.grupos.map(([n, c]) => html`<span class="chip-dato"><strong>${formatearNumero(c)}</strong> ${pluralUnidad(n, c)}</span>`)}</span></div>` : ''}
      ${total.sueltas.length ? html`<div class="fila-total"><span class="t-mini t-secundario">${seguro(icono('identificador', 'icono-sm'))}Unidades</span><span class="chips-total">${total.sueltas.map(([n, c]) => html`<span class="chip-dato"><strong>${formatearNumero(c)}</strong> ${pluralUnidad(n, c)}</span>`)}</span></div>` : ''}</div>` : ''}`.texto;
}

// Umbral en unidades y, si tiene empaque, también en empaques: «96 (4 sixpacks)».
function textoUmbral(p, n) {
  const eq = empaqueMayor(p);
  return eq ? `${formatearNumero(n)} (${formatearNumero(redondearCantidad(n / eq.unidades))} ${pluralUnidad(String(eq.nombre).toLowerCase(), n / eq.unidades)})` : formatearNumero(n);
}
// Empaque más grande registrado sobre la unidad del producto (o null).
function empaqueMayor(p) {
  return Almacen.equivalenciasDe(p.idProducto).filter(e => e.unidades > 1 && normalizarTexto(e.nivelInferior) === normalizarTexto(p.unidadBase))
    .sort((a, b) => b.unidades - a.unidades)[0] || null;
}

// Total en bodega (modo Pro, como el «Total en Bodega» de la v2): cada producto en
// su empaque más grande; se suman por nombre de empaque sin importar la marca.
function totalesPorEmpaque(productos) {
  const grupos = new Map(), sueltas = new Map();
  let empaques = 0;
  productos.forEach(p => {
    const stock = Almacen.stock(p.idProducto);
    if (stock <= 0) return;
    const eq = Almacen.equivalenciasDe(p.idProducto).filter(e => e.unidades > 1 && normalizarTexto(e.nivelInferior) === normalizarTexto(p.unidadBase))
      .sort((a, b) => b.unidades - a.unidades)[0];
    // «Unidades»: TODO el stock en su unidad (botellas, latas, tetras…), sumado por nombre.
    sueltas.set(p.unidadBase, redondearCantidad((sueltas.get(p.unidadBase) || 0) + stock));
    if (!eq) return;
    const n = Math.floor(stock / eq.unidades);
    const nombre = String(eq.nombre).toLowerCase();
    if (n) { grupos.set(nombre, (grupos.get(nombre) || 0) + n); empaques += n; }
  });
  const orden = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]);
  return { empaques, grupos: orden(grupos), sueltas: orden(sueltas) };
}

function pintarChipsStock() {
  const chips = [['TODOS', 'Todos'], ['BAJO', 'Bajo'], ['AGOTADO', 'Agotado'], ['OBSOLETOS', 'Obsoletos']];
  const categorias = Almacen.categorias();
  $('#stock-chips', stockUI.el).innerHTML = chips.map(([v, t]) => html`<button type="button" class="chip" data-accion="filtro" data-valor="${v}" aria-pressed="${String(stockUI.filtro === v)}">${t}</button>`.texto).join('')
    + (categorias.length ? html`<button type="button" class="chip" data-accion="filtro-categoria" aria-pressed="${String(!!stockUI.categoria)}">${seguro(icono('etiqueta', 'icono-sm'))}${stockUI.categoria || 'Categoría'}</button>`.texto : '')
    + html`<button type="button" class="chip" data-accion="filtro-empaque" aria-pressed="${String(!!stockUI.empaque)}">${seguro(icono('caja', 'icono-sm'))}${stockUI.empaque || 'Empaque'}</button>`.texto;
}

function productosFiltradosStock() {
  const base = stockUI.filtro === 'OBSOLETOS' ? Almacen.productosVisibles().filter(p => p.estado === ESTADOS.OBSOLETO) : Almacen.productosActivos();
  return base.filter(p => {
    const s = Almacen.stock(p.idProducto);
    const sem = semaforoStock(s, p);
    if (stockUI.filtro === 'BAJO' && !(sem === 'bajo' || sem === 'medio')) return false;
    if (stockUI.filtro === 'AGOTADO' && sem !== 'agotado') return false;
    if (stockUI.categoria && normalizarIdentidad(p.categoria) !== normalizarIdentidad(stockUI.categoria)) return false;
    if (stockUI.empaque && !empaquesDeProducto(p).has(normalizarIdentidad(stockUI.empaque))) return false;
    if (stockUI.texto && !coincidenPalabras(textoBuscableProducto(p), stockUI.texto)) return false;
    return true;
  }).sort((a, b) => {
    const sa = infoSemaforo(a, Almacen.stock(a.idProducto)).orden, sb = infoSemaforo(b, Almacen.stock(b.idProducto)).orden;
    return sa - sb || nombreProducto(a).localeCompare(nombreProducto(b), 'es');
  });
}

function filaStockHTML(p) {
  const e = Almacen.estado(p.idProducto);
  const sem = infoSemaforo(p, e.stock);
  const max = Math.max(p.umbralMax || 6, 1);
  const pct = Math.max(4, Math.min(100, (e.stock / (max * 2)) * 100));
  const valor = redondearCentavo(multiplicarDinero(p.costo, Math.max(0, e.stock)));
  const presentaciones = Almacen.presentacionesDe(p.idProducto);
  const eq = Almacen.equivalenciasDe(p.idProducto).find(x => x.unidades > 1);
  const sabores = Object.entries(e.porVariante).filter(([k, v]) => k || v);
  const tieneSabores = sabores.some(([k]) => k) && !stockUI.ocultarSabores;
  const par = (ic, etiqueta, valor, clase) => html`<div class="par-dato con-icono">${seguro(icono(ic, 'icono-sm'))}<span class="crece">${etiqueta}</span><strong class="${clase || ''}">${valor}</strong></div>`;
  const seleccionado = stockUI.seleccion.has(p.idProducto);
  const unidad = (n) => pluralUnidad(p.unidadBase, n);
  return html`<details class="desplegable fila-stock" data-id="${p.idProducto}" ${stockUI.expandirTodo ? 'open' : ''}>
    <summary class="fila-lista">
      ${stockUI.seleccionando ? html`<input type="checkbox" class="casilla-fila" data-accion="marcar" data-id="${p.idProducto}" ${seleccionado ? 'checked' : ''} aria-label="Seleccionar ${nombreProducto(p)}">` : ''}
      <div class="crece">
        <div class="titulo recortar">${nombreProducto(p)}${p.estado === ESTADOS.OBSOLETO ? html` <span class="insignia">Obsoleto</span>` : ''}</div>
        <div class="sub">${p.sku} · ${describirCantidad(p.idProducto, e.stock)}</div>
        <div class="fila" style="gap:var(--e-2);margin-top:2px">
          <span class="mini-barra" aria-hidden="true"><span class="${sem.fondo}" style="width:${pct.toFixed(0)}%"></span></span>
          <span class="semaforo ${sem.clase}">${seguro(icono(sem.icono))}${sem.texto}</span>
        </div>
      </div>
      <div class="lado"><div class="monto">${formatearDinero(valor)}</div><div class="sub">${formatearDinero(p.precio)}/${p.unidadBase}</div></div>
      ${seguro(icono('chevron-abajo', 'icono-sm chevron'))}
    </summary>
    <div class="desplegable-cuerpo">
      ${par('caja', 'Stock', describirCantidad(p.idProducto, e.stock))}
      ${e.bonif ? par('estrella', 'Bonificación en bodega', e.bonifEnBodega > 0 ? `${describirCantidad(p.idProducto, e.bonifEnBodega)} (sale primero)` : `ya se vendió (recibidas ${describirCantidad(p.idProducto, e.bonif)})`) : ''}
      ${par('precio', 'Último costo', `${formatearDinero(p.costo, { detalle: true })} / ${p.unidadBase}`, 'cifra')}
      ${par('tendencia', 'Costo promedio (pagadas)', `${formatearDinero(e.cpp, { detalle: true })} / ${p.unidadBase}`, 'cifra')}
      ${par('etiqueta', 'Precio de venta', `${formatearDinero(p.precio)} / ${p.unidadBase}`, 'cifra')}
      ${presentaciones.map(x => par('precio', x.etiqueta, formatearDinero(x.precio), 'cifra'))}
      ${eq ? par('lote', 'Empaque habitual', `${eq.nombre} de ${formatearNumero(eq.unidades)}`) : ''}
      ${p.variante ? par('sabor', 'Sabor del producto', p.variante) : ''}
      ${tieneSabores ? par('sabor', 'Sabores vendidos y comprados', sabores.map(([k, v]) => `${k || 'Sin asignar'} ${formatearNumero(v)}`).join(' · ')) : ''}
      ${par('advertencia', 'Avisar', `muy poco ≤ ${textoUmbral(p, p.umbralMin ?? 4)} · poco ≤ ${textoUmbral(p, p.umbralMax ?? 6)}`)}
      ${p.categoria ? par('etiqueta-nueva', 'Categoría', p.categoria) : ''}
      ${par('identificador', 'Unidad', `${p.unidadBase}${p.decimales ? ' (permite decimales)' : ''}`)}
      ${par('reloj', 'Última modificación', String(p.ultimaModif || '').slice(0, 16))}
      <div class="grupo-botones" style="margin-top:var(--e-2)">
        <button type="button" class="boton boton-secundario boton-sm" data-accion="editar" data-id="${p.idProducto}">${seguro(icono('editar', 'icono-sm'))}Editar</button>
        <button type="button" class="boton boton-entrada boton-sm" data-accion="mas-entrada" data-id="${p.idProducto}">${seguro(icono('entrada', 'icono-sm'))}Entrada</button>
        ${tieneSabores ? html`<button type="button" class="boton boton-secundario boton-sm" data-accion="reasignar" data-id="${p.idProducto}">${seguro(icono('sabor', 'icono-sm'))}Repartir sabores</button>` : ''}
        <button type="button" class="boton boton-secundario boton-sm" data-accion="obsoleto" data-id="${p.idProducto}">${p.estado === ESTADOS.OBSOLETO ? 'Reactivar' : 'Marcar obsoleto'}</button>
      </div>
    </div>
  </details>`;
}

function pintarListaStock() {
  const lista = productosFiltradosStock();
  $('#stock-conteo', stockUI.el).textContent = `${formatearNumero(lista.length)} ${pluralizar(lista.length, 'producto')}`;
  const cont = $('#stock-lista', stockUI.el);
  const turno = ++stockUI.turno;
  if (!lista.length) {
    cont.innerHTML = html`<div class="vacio">${seguro(icono('buscar-sin-resultados', 'icono-xl'))}<strong>Sin productos</strong><p>${Almacen.productosVisibles().length ? 'Nada coincide con el filtro.' : 'Agrega tu primer producto desde Entrada.'}</p></div>`.texto;
    pintarBarraSeleccion();
    return;
  }
  // Se muestra TODO el catálogo (D39), pero se dibuja por partes: primero
  // lo que cabe en pantalla y el resto en segundo plano, para que un
  // teléfono modesto abra al instante aunque haya miles de productos.
  cont.innerHTML = '<div class="lista lista-stock"></div>';
  const destino = $('.lista-stock', cont);
  const PRIMERO = 40, BLOQUE = 200;
  destino.insertAdjacentHTML('beforeend', lista.slice(0, PRIMERO).map(p => filaStockHTML(p).texto).join(''));
  let i = PRIMERO;
  const siguiente = () => {
    if (turno !== stockUI.turno || i >= lista.length) return;
    destino.insertAdjacentHTML('beforeend', lista.slice(i, i + BLOQUE).map(p => filaStockHTML(p).texto).join(''));
    i += BLOQUE;
    (window.requestIdleCallback || ((f) => setTimeout(f, 16)))(siguiente);
  };
  (window.requestIdleCallback || ((f) => setTimeout(f, 16)))(siguiente);
  pintarBarraSeleccion();
}

function pintarBarraSeleccion() {
  const cont = $('#stock-barra-seleccion', stockUI.el);
  if (!stockUI.seleccionando) { cont.innerHTML = ''; return; }
  const n = stockUI.seleccion.size;
  cont.innerHTML = html`<div class="franja info-color"><span>${n} ${pluralizar(n, 'seleccionado')}</span>
    <button type="button" class="boton boton-sm boton-secundario" data-accion="asignar-categoria" ${n ? '' : 'disabled'}>Asignar categoría</button>
    <button type="button" class="boton boton-sm boton-secundario" data-accion="unir" ${n >= 2 ? '' : 'disabled'}>Unir</button>
    <button type="button" class="boton boton-sm boton-texto" data-accion="seleccionar">Listo</button></div>`.texto;
}

// Filtro por empaque (v2: «tipo de producto») y aviso de stock para todos los del filtro.
function abrirFiltroEmpaque() {
  const todos = new Map();
  Almacen.productosVisibles().forEach(p => empaquesDeProducto(p).forEach((v, k) => todos.set(k, v)));
  const lista = [...todos.values()].sort((a, b) => a.localeCompare(b, 'es'));
  const ids = () => productosFiltradosStock().map(p => p.idProducto);
  const control = abrirHoja({
    titulo: 'Empaque',
    contenido: html`<p class="t-pequeno t-secundario">Muestra solo los productos que se guardan en ese empaque (cajas, fardos…).</p>
      <div class="lista">${[''].concat(lista).map(c => html`<button type="button" class="fila-lista" data-emp="${c}"><span class="titulo">${c || 'Todos'}</span>${normalizarIdentidad(c) === normalizarIdentidad(stockUI.empaque) ? seguro(icono('check', 'lado')) : ''}</button>`)}</div>
      ${stockUI.empaque ? html`<div class="tarjeta columna">
        <strong class="t-pequeno">Aviso de stock para los ${formatearNumero(ids().length)} productos de «${stockUI.empaque}»</strong>
        <div class="rejilla-campos">
          <div class="campo"><label for="lote-umbral-min">Muy poco con</label><div class="control"><input id="lote-umbral-min" placeholder="4"></div></div>
          <div class="campo"><label for="lote-umbral-max">Poco con</label><div class="control"><input id="lote-umbral-max" placeholder="6"></div></div>
        </div>
        <button type="button" class="boton boton-secundario" data-umbral-lote>Aplicar a todos</button>
      </div>` : ''}`,
    alMontar: (hoja) => {
      $$('[data-emp]', hoja).forEach(b => b.addEventListener('click', () => { stockUI.empaque = b.dataset.emp; control.cerrar(); pintarChipsStock(); pintarListaStock(); }));
      ['#lote-umbral-min', '#lote-umbral-max'].forEach(id => { const i = $(id, hoja); if (i) prepararCampoNumerico(i, { decimales: 0 }); });
      const b = $('[data-umbral-lote]', hoja);
      if (b) b.addEventListener('click', async () => {
        let op;
        try { op = operacionAsignarUmbralLote(ids(), leerCantidad($('#lote-umbral-min', hoja)), leerCantidad($('#lote-umbral-max', hoja))); }
        catch (e) { mostrarDialogo({ titulo: 'Revisa el aviso', mensaje: e.message }); return; }
        const r = await ejecutarOperacion(op, { boton: b });
        if (r) { control.cerrar(); avisar(`Aviso de stock actualizado en ${r.cambiados} ${pluralizar(r.cambiados, 'producto')}.`); }
      });
    }
  });
}

const accionesStock = {
  'filtro-empaque': () => abrirFiltroEmpaque(),
  'ocultar-sabores': (b) => { stockUI.ocultarSabores = b.checked; pintarListaStock(); },
  'filtro': (b) => { stockUI.filtro = b.dataset.valor; pintarChipsStock(); pintarListaStock(); },
  'filtro-categoria': () => {
    const cats = Almacen.categorias();
    const control = abrirHoja({
      titulo: 'Categoría',
      contenido: html`<div class="lista">${[''].concat(cats).map(c => html`<button type="button" class="fila-lista" data-cat="${c}"><span class="titulo">${c || 'Todas'}</span>${normalizarIdentidad(c) === normalizarIdentidad(stockUI.categoria) ? seguro(icono('check', 'lado')) : ''}</button>`)}</div>`,
      alMontar: (hoja) => $$('[data-cat]', hoja).forEach(b => b.addEventListener('click', () => { stockUI.categoria = b.dataset.cat; control.cerrar(); pintarChipsStock(); pintarListaStock(); }))
    });
  },
  'alternar-valor': (b) => { stockUI.valor = b.dataset.valor || (stockUI.valor === 'NETO' ? 'REAL' : 'NETO'); pintarCifrasStock(); },
  'expandir': (b) => { stockUI.expandirTodo = !stockUI.expandirTodo; b.textContent = stockUI.expandirTodo ? 'Contraer todo' : 'Expandir todo'; pintarListaStock(); },
  'seleccionar': () => { stockUI.seleccionando = !stockUI.seleccionando; stockUI.seleccion.clear(); pintarListaStock(); },
  'marcar': (b, e) => {
    // La casilla vive dentro del resumen del desplegable: se evita que lo abra.
    e.preventDefault();
    const id = Number(b.dataset.id);
    if (stockUI.seleccion.has(id)) stockUI.seleccion.delete(id); else stockUI.seleccion.add(id);
    setTimeout(() => { b.checked = stockUI.seleccion.has(id); }, 0);
    pintarBarraSeleccion();
  },
  'agregar': () => Shell.ir('entrada'),
  'mas-entrada': (b) => abrirEntradaCon(Number(b.dataset.id)),
  'editar': (b) => editarProducto(Number(b.dataset.id)),
  'reasignar': (b) => { if (typeof abrirReasignarSabores === 'function') abrirReasignarSabores(Number(b.dataset.id)); },
  'obsoleto': async (b) => {
    const p = Almacen.producto(b.dataset.id);
    const aObsoleto = p.estado !== ESTADOS.OBSOLETO;
    if (aObsoleto && !(await confirmar({ titulo: '¿Marcar como obsoleto?', mensaje: `«${nombreProducto(p)}» deja de aparecer en Venta, Entrada y en los totales de Stock. Su historial se conserva y puedes reactivarlo cuando quieras.`, textoConfirmar: 'Marcar obsoleto' }))) return;
    const r = await ejecutarOperacion(operacionActualizarProducto(p.idProducto, { estado: aObsoleto ? ESTADOS.OBSOLETO : ESTADOS.ACTIVO }));
    if (r) avisar(aObsoleto ? 'Producto marcado como obsoleto.' : 'Producto reactivado.');
  },
  'asignar-categoria': () => {
    const ids = [...stockUI.seleccion];
    const control = abrirHoja({
      titulo: `Categoría para ${ids.length} ${pluralizar(ids.length, 'producto')}`,
      contenido: html`<div class="campo"><label for="cat-lote">Categoría</label><div class="control"><input id="cat-lote" list="cat-lote-lista" placeholder="Bebidas, farmacia, pan dulce…" autocomplete="off"></div>
        <span class="ayuda-campo">Déjalo vacío para quitar la categoría.</span></div>
        <datalist id="cat-lote-lista">${Almacen.categorias().map(c => html`<option value="${c}"></option>`)}</datalist>`,
      acciones: [{ texto: 'Cancelar', fn: (c) => c.cerrar() }, { texto: 'Asignar', clase: 'boton-primario', fn: async (c) => {
        const r = await ejecutarOperacion(operacionAsignarCategoria(ids, $('#cat-lote', c.el).value), { boton: $('.acciones .boton-primario', c.el) });
        if (r) { c.cerrar(); stockUI.seleccionando = false; stockUI.seleccion.clear(); avisar(`Categoría asignada a ${r.cambiados} ${pluralizar(r.cambiados, 'producto')}.`); }
      } }]
    });
  },
  'unir': async () => {
    const productos = [...stockUI.seleccion].map(id => Almacen.producto(id));
    const control = abrirHoja({
      titulo: 'Unir productos',
      contenido: html`<p class="t-pequeno t-secundario">Úsalo cuando dos productos son en realidad el mismo. Elige cuál queda: los demás se suman a él y su historial se conserva. Solo se unen productos que se cuentan igual.</p>
        <div class="lista">${productos.map((p, i) => html`<label class="fila-lista"><input type="radio" name="destino-union" value="${p.idProducto}" ${i === 0 ? 'checked' : ''}>
          <div class="crece"><div class="titulo">${nombreProducto(p)}</div><div class="sub">${p.sku} · ${describirCantidad(p.idProducto, Almacen.stock(p.idProducto))}</div></div></label>`)}</div>`,
      acciones: [{ texto: 'Cancelar', fn: (c) => c.cerrar() }, { texto: 'Unir', clase: 'boton-primario', fn: async (c) => {
        const destino = Number($('input[name="destino-union"]:checked', c.el).value);
        const origenes = productos.map(p => p.idProducto).filter(id => id !== destino);
        let op;
        try { op = operacionFusionarProductos(destino, origenes); } catch (e) { mostrarDialogo({ titulo: 'No se puede unir', mensaje: e.message }); return; }
        c.cerrar();
        const ok = await confirmarFuerte({ titulo: 'Unir productos', mensaje: `${origenes.length} ${pluralizar(origenes.length, 'producto se suma', 'productos se suman')} a «${nombreProducto(Almacen.producto(destino))}». Esto no se puede deshacer desde la app.`, textoConfirmar: 'Unir' });
        if (!ok) return;
        const r = await ejecutarOperacion(op);
        if (r) { stockUI.seleccionando = false; stockUI.seleccion.clear(); avisar('Productos unidos.'); }
      } }]
    });
  }
};

// Editar producto: identidad (regenera el SKU con aviso), precios con
// histórico, umbrales, categoría, empaque y decimales (§15.1).
function editarProducto(idProducto) {
  const p = Almacen.producto(idProducto);
  const tieneHistorial = Almacen.movimientos.some(m => m.idProducto === p.idProducto);
  const campo = (id, etiqueta, valor, extra) => html`<div class="campo"><label for="${id}">${etiqueta}</label><div class="control">${extra && extra.prefijo ? html`<span class="prefijo">${extra.prefijo}</span>` : ''}<input id="${id}" value="${valor}" ${extra && extra.lista ? html`list="${extra.lista}"` : ''} autocomplete="off" ${extra && extra.deshabilitado ? 'disabled' : ''}>${extra && extra.sufijo ? html`<span class="sufijo">${extra.sufijo}</span>` : ''}</div>${extra && extra.ayuda ? html`<span class="ayuda-campo">${extra.ayuda}</span>` : ''}</div>`;
  const eqMayor = empaqueMayor(p);
  const nombreEmp = eqMayor ? String(eqMayor.nombre).toLowerCase() : '';
  let umbralPorEmpaque = false;
  const lista = (id, valores) => html`<datalist id="${id}">${valores.map(x => html`<option value="${x}"></option>`)}</datalist>`;
  const unicos = (campo) => [...new Set(Almacen.productosVisibles().map(x => String(x[campo] || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
  const control = abrirHoja({
    titulo: 'Editar producto',
    contenido: html`<p class="t-pequeno t-tenue">Código ${p.sku}</p>
      <div class="rejilla-campos">
        ${campo('ed-marca', 'Marca', p.marca, { lista: 'ed-marcas' })}${campo('ed-linea', 'Producto', p.linea, { lista: 'ed-lineas' })}
        ${campo('ed-presentacion', 'Presentación', p.presentacion, { lista: 'ed-presentaciones-lista' })}${campo('ed-volumen', 'Contenido', p.volumen, { lista: 'ed-volumenes' })}
      </div>
      ${lista('ed-marcas', unicos('marca'))}${lista('ed-lineas', unicos('linea'))}${lista('ed-presentaciones-lista', unicos('presentacion'))}${lista('ed-volumenes', unicos('volumen'))}${lista('ed-empaques', unicos('tipoEmpaque'))}
      ${campo('ed-unidad', 'Se cuenta en', p.unidadBase, { deshabilitado: tieneHistorial, ayuda: tieneHistorial ? 'Con historial, cambiar la unidad necesita un asistente de reconversión (pendiente de decidir).' : '' })}
      <div class="rejilla-campos">
        ${campo('ed-costo', `Costo por ${p.unidadBase}`, valorCampoDinero(p.costo, 5).replace(/0+$/, '').replace(/\.$/, '.00'), { prefijo: '$' })}
        ${campo('ed-precio', `Precio por ${p.unidadBase}`, valorCampoDinero(p.precio), { prefijo: '$', ayuda: 'El cambio de precio aplica a ventas nuevas.' })}
      </div>
      ${eqMayor ? html`<div class="fila-separada"><span class="t-pequeno t-secundario">Avisar con</span>
        <span class="segmentado segmentado-compra segmentado-mini" role="radiogroup" aria-label="Contar el aviso en">
          <button type="button" role="radio" data-umbral-por="unidad" aria-checked="true">${pluralUnidad(p.unidadBase, 2)}</button>
          <button type="button" role="radio" data-umbral-por="empaque" aria-checked="false">${pluralUnidad(nombreEmp, 2)} de ${formatearNumero(eqMayor.unidades)}</button>
        </span></div>` : ''}
      <div class="rejilla-campos">
        ${campo('ed-umin', 'Avisar «muy poco» con', p.umbralMin ?? 4, { sufijo: pluralUnidad(p.unidadBase, 2) })}
        ${campo('ed-umax', 'Avisar «poco» con', p.umbralMax ?? 6, { sufijo: pluralUnidad(p.unidadBase, 2) })}
      </div>
      <div class="rejilla-campos">${campo('ed-categoria', 'Categoría', p.categoria, { lista: 'ed-cats' })}${campo('ed-empaque', 'Tipo de empaque', p.tipoEmpaque, { lista: 'ed-empaques' })}</div>
      <datalist id="ed-cats">${Almacen.categorias().map(c => html`<option value="${c}"></option>`)}</datalist>
      <label class="casilla" data-solo-modo="tienda pro"><input type="checkbox" id="ed-decimales" ${p.decimales ? 'checked' : ''}> Se vende por peso o medida (permite decimales)</label>
      <button type="button" class="boton boton-texto boton-sm" id="ed-presentaciones" data-solo-modo="tienda pro" style="justify-self:start">${seguro(icono('precio', 'icono-sm'))}Precios por presentación</button>`,
    acciones: [{ texto: 'Cancelar', fn: (c) => c.cerrar() }, { texto: 'Guardar', clase: 'boton-primario', fn: async (c) => {
      const v = (id) => $(id, c.el).value.trim();
      const cambios = {
        marca: v('#ed-marca'), linea: v('#ed-linea'), presentacion: v('#ed-presentacion'), volumen: v('#ed-volumen'),
        costo: dinero(v('#ed-costo')), precio: dinero(v('#ed-precio')),
        // El aviso siempre se guarda en unidades; si se escribió en empaques se multiplica.
        umbralMin: redondearCantidad(parsearNumero(v('#ed-umin')) * (umbralPorEmpaque ? eqMayor.unidades : 1)),
        umbralMax: redondearCantidad(parsearNumero(v('#ed-umax')) * (umbralPorEmpaque ? eqMayor.unidades : 1)),
        categoria: v('#ed-categoria'), tipoEmpaque: v('#ed-empaque'), decimales: $('#ed-decimales', c.el).checked ? 'SI' : ''
      };
      if (!tieneHistorial) cambios.unidadBase = v('#ed-unidad').toLowerCase() || p.unidadBase;
      if (!cambios.marca || !cambios.linea) { avisar('La marca y el producto no pueden quedar vacíos.'); return; }
      if (cambios.umbralMax < cambios.umbralMin) { avisar('«Poco» debe ser mayor o igual que «muy poco».'); return; }
      const cat = Almacen.categorias().find(x => normalizarIdentidad(x) === normalizarIdentidad(cambios.categoria));
      if (cat) cambios.categoria = cat;
      const identidad = claveIdentidadProducto(Object.assign({}, p, cambios)) !== claveIdentidadProducto(p);
      if (identidad && !(await confirmar({ titulo: 'Dato sensible', mensaje: 'Cambiar marca, producto, presentación o contenido cambia el código (SKU) del producto. Su historial se conserva por su identificador interno. ¿Continuar?', textoConfirmar: 'Sí, cambiar' }))) return;
      let op;
      try { op = operacionActualizarProducto(p.idProducto, cambios); } catch (e) { mostrarDialogo({ titulo: 'No se puede guardar', mensaje: e.message }); return; }
      const r = await ejecutarOperacion(op, { boton: $('.acciones .boton-primario', c.el) });
      if (r) { c.cerrar(); avisar(r.skuCambio ? `Guardado. Código nuevo: ${r.producto.sku}` : 'Producto guardado.'); }
    } }],
    alMontar: (hoja) => {
      prepararCampoNumerico($('#ed-costo', hoja), { decimales: 5 });
      prepararCampoNumerico($('#ed-precio', hoja), { decimales: 2 });
      prepararCampoNumerico($('#ed-umin', hoja), { decimales: p.decimales ? 3 : 0 });
      prepararCampoNumerico($('#ed-umax', hoja), { decimales: p.decimales ? 3 : 0 });
      $('#ed-presentaciones', hoja).addEventListener('click', () => { control.cerrar(); setTimeout(() => editarPresentaciones(p), 340); });
      const originales = new Map($$('.cuerpo input', hoja).map(i => [i, i.type === 'checkbox' ? i.checked : i.value]));
      // Aviso por unidades o por empaques: convierte lo escrito al cambiar.
      $$('[data-umbral-por]', hoja).forEach(b => b.addEventListener('click', () => {
        const aEmpaque = b.dataset.umbralPor === 'empaque';
        if (aEmpaque === umbralPorEmpaque) return;
        const f = aEmpaque ? 1 / eqMayor.unidades : eqMayor.unidades;
        const convertir = (x) => formatearNumero(redondearCantidad(parsearNumero(x) * f)).replace(/,/g, '');
        ['#ed-umin', '#ed-umax'].forEach(id => {
          const i = $(id, hoja); i.value = convertir(i.value);
          if (originales.has(i)) originales.set(i, convertir(originales.get(i))); // cambiar de unidad no es un cambio
          i.parentElement.querySelector('.sufijo').textContent = aEmpaque ? pluralUnidad(nombreEmp, 2) : pluralUnidad(p.unidadBase, 2);
        });
        hoja.dispatchEvent(new Event('input'));
        umbralPorEmpaque = aEmpaque;
        $$('[data-umbral-por]', hoja).forEach(x => x.setAttribute('aria-checked', String(x === b)));
      }));
      // Cualquier cambio pone «Guardar» en naranja (cambio importante).
      const guardar = $('.acciones .boton-primario', hoja);
      hoja.addEventListener('input', () => guardar.classList.toggle('boton-aviso', [...originales].some(([i, val]) => (i.type === 'checkbox' ? i.checked : i.value) !== val)));
      hoja.addEventListener('change', () => hoja.dispatchEvent(new Event('input')));
      pintarIconos(hoja);
    }
  });
}
