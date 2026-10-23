// © 2026 Kitsótaro · KoreStock Ledger · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// PANTALLA VENTA (T12) — diseño acordado en V3 §12.2, §12.3, §9.4:
//   1. Buscador normal + cinta de más vendidos (últimos 30 días).
//   2. Tarjeta del producto: nombre, stock con equivalente, «Precio · Cambiar».
//   3. Cantidad = unidades vendidas (teclado numérico, sin ➕/➖).
//   4. Total cobrado grande y EDITABLE, ganancia en pequeño; el total se
//      sugiere con las presentaciones de venta (de la más grande a la más chica).
//   5. Sabor y cliente opcionales, colapsados.
//   6. Fecha y folio en un renglón pequeño.
//   7. Ticket con varios productos (carrito); «Cobrar y guardar» guarda todo
//      en una operación (D35) y muestra el resumen con Aceptar / Deshacer.
//   Aviso si se vende bajo el costo (§9.4 punto 5).
//
// Expone: (registra la pantalla 'venta').
// Depende de: shell.js, componentes.js, campos.js, selector-producto.js,
//   operaciones-movimientos.js, operaciones-catalogo.js, operaciones-clientes.js.
// ============================================================

const venta = {
  el: null, selector: null,
  producto: null, cantidad: 0, total: 0, totalEditado: false, variante: '', etiqueta: '',
  carrito: [], idCliente: null, fecha: '',
};

registrarPantalla('venta', {
  titulo: 'Venta',
  montar(el) {
    venta.el = el;
    el.innerHTML = html`
      <div class="registro registro-venta">
        <div class="fila-folio">
          <label class="fila" for="venta-fecha">${seguro(icono('calendario', 'icono-sm'))}<span class="solo-lector">Fecha</span>
            <span class="control"><input type="date" id="venta-fecha"></span></label>
          <span class="fila t-pequeno t-secundario">${seguro(icono('reloj', 'icono-sm'))}<span class="cifra" data-reloj></span></span>
          <span id="venta-folio" class="cifra"></span>
        </div>
        <div id="venta-selector"></div>
        <div id="venta-producto"></div>
        <div id="venta-carrito"></div>
        <details class="tarjeta desplegable-simple" id="venta-cliente">
          <summary>${seguro(icono('persona', 'icono-sm'))}<span class="crece">Cliente <span class="t-tenue t-pequeno">(opcional)</span></span><span class="t-pequeno t-secundario" id="venta-cliente-nombre"></span>${seguro(icono('chevron-abajo', 'icono-sm icono-giro'))}</summary>
          <div class="buscador"><div class="control">${seguro(icono('buscar', 'icono-sm'))}<input id="venta-cliente-buscar" type="search" placeholder="Buscar o agregar cliente" autocomplete="off"></div></div>
        </details>
      </div>`.texto;
    venta.selector = crearSelectorProducto({
      contenedor: $('#venta-selector', el), conCinta: true,
      alElegir: (p) => elegirProductoVenta(p)
    });
    const fecha = $('#venta-fecha', el);
    fecha.value = obtenerFechaLocal();
    fecha.max = obtenerFechaLocal();
    fecha.addEventListener('change', () => { venta.fecha = fecha.value || obtenerFechaLocal(); });

    crearBuscador({
      input: $('#venta-cliente-buscar', el),
      obtener: (q) => Almacen.clientesActivos().filter(c => coincidenPalabras(c.nombre, q)).map(c => ({ valor: c, html: html`${seguro(icono('persona', 'icono-sm'))}<span>${c.nombre}</span>` })),
      alEnfocarVacio: () => Almacen.clientesActivos().map(c => ({ valor: c, html: html`${seguro(icono('persona', 'icono-sm'))}<span>${c.nombre}</span>` })),
      alElegir: (c) => { venta.idCliente = c.idCliente; $('#venta-cliente-buscar', el).value = ''; pintarClienteVenta(); },
      nuevo: { html: (q) => html`${seguro(icono('persona-mas', 'icono-sm'))}<span>Agregar cliente «${q}»</span>`, fn: (q) => crearClienteDesdeVenta(q) }
    });
    delegar(el, 'click', accionesVenta);
    Almacen.suscribir((motivo) => { if (Shell.actual === 'venta' && motivo !== 'carga') refrescarVenta(); });
  },
  mostrar(el, opciones) {
    if (!venta.fecha) venta.fecha = obtenerFechaLocal();
    refrescarVenta();
    if (!opciones.refresco && !venta.producto && window.matchMedia('(min-width: 720px)').matches) venta.selector.enfocar();
  }
});

function refrescarVenta() {
  if (!venta.el) return;
  if (venta.producto) venta.producto = Almacen.producto(venta.producto.idProducto);
  venta.selector.refrescar();
  pintarProductoVenta();
  pintarCarritoVenta();
  pintarClienteVenta();
  const folio = $('#venta-folio', venta.el);
  folio.textContent = `Folio ${Almacen.verFolioSiguiente('FAC-')}`;
}

function elegirProductoVenta(p) {
  venta.producto = p;
  venta.cantidad = 1;
  venta.variante = '';
  venta.etiqueta = '';
  venta.totalEditado = false;
  recalcularTotalVenta();
  pintarProductoVenta();
  setTimeout(() => { const c = $('#venta-cantidad', venta.el); if (c) { c.focus(); c.select(); } }, 50);
}

function recalcularTotalVenta() {
  if (!venta.producto || venta.totalEditado) return;
  venta.total = sugerirPrecioTotal(venta.producto.idProducto, venta.cantidad).total;
}

function gananciaVenta() {
  if (!venta.producto) return 0;
  return restarDinero(redondearCentavo(venta.total), totalLinea(venta.cantidad, venta.producto.costo));
}

// Cantidad ya puesta en el carrito de este producto (para el control de stock).
function enCarrito(idProducto) {
  return venta.carrito.filter(l => l.idProducto === idProducto).reduce((s, l) => s + l.cantidad, 0);
}

function pintarProductoVenta() {
  const cont = $('#venta-producto', venta.el);
  const p = venta.producto;
  if (!p) {
    cont.innerHTML = venta.carrito.length ? '' : html`<div class="vacio">${seguro(icono('carrito', 'icono-xl'))}<strong>¿Qué vendiste?</strong><p>Busca el producto o toca uno de los más vendidos.</p></div>`.texto;
    return;
  }
  const e = Almacen.estado(p.idProducto);
  const disponible = redondearCantidad(e.stock - enCarrito(p.idProducto));
  const presentaciones = Almacen.presentacionesDe(p.idProducto);
  const variantes = Almacen.variantesDe(p.idProducto);
  const ganancia = gananciaVenta();
  const sugerido = sugerirPrecioTotal(p.idProducto, venta.cantidad);
  const excede = venta.cantidad > disponible;
  cont.innerHTML = html`
    <div class="tarjeta tarjeta-producto">
      <div class="fila-separada"><span class="nombre">${nombreProducto(p, { conVariante: false })}</span>
        <button type="button" class="boton boton-icono" data-accion="quitar-producto" aria-label="Quitar producto">${seguro(icono('cerrar', 'icono-sm'))}</button></div>
      <div class="dato"><span>En bodega</span><strong>${describirCantidad(p.idProducto, disponible)}</strong></div>
      <div class="dato"><span>Precio por ${p.unidadBase}</span><span><strong class="cifra">${formatearDinero(p.precio)}</strong>
        <button type="button" class="boton boton-texto boton-sm" data-accion="cambiar-precio">Cambiar</button></span></div>
      ${presentaciones.length ? html`<div class="fila-chips" data-solo-modo="tienda pro" aria-label="Presentaciones">
        ${presentaciones.map(x => html`<button type="button" class="chip" data-accion="usar-presentacion" data-cantidad="${x.cantidad}" data-precio="${x.precio}" data-etiqueta="${x.etiqueta}">${x.etiqueta} · ${formatearDinero(x.precio)}</button>`)}
      </div>` : ''}
      <button type="button" class="boton boton-texto boton-sm" data-accion="editar-presentaciones" data-solo-modo="tienda pro" style="justify-self:start">${seguro(icono('precio', 'icono-sm'))}Precios por presentación</button>
    </div>
    <div class="tarjeta columna">
      <div class="campo">
        <label for="venta-cantidad">Cantidad</label>
        <div class="control grande${excede ? ' error' : ''}"><input id="venta-cantidad" value="${formatearNumero(venta.cantidad).replace(/,/g, '')}"><span class="sufijo">${pluralUnidad(p.unidadBase, venta.cantidad)}</span></div>
        ${excede ? html`<span class="error-campo">Solo hay ${formatearNumero(disponible)} ${pluralUnidad(p.unidadBase, disponible)}.</span>` : ''}
      </div>
      <div class="campo">
        <label for="venta-total">Total cobrado</label>
        <div class="control grande total-cobrado"><span class="prefijo">$</span><input id="venta-total" value="${valorCampoDinero(venta.total)}"></div>
        <div class="fila-separada t-pequeno">
          <span class="${ganancia < 0 ? 't-peligro t-fuerte' : 't-secundario'}">${ganancia < 0 ? 'Pierdes' : 'Ganancia'} ${formatearDinero(Math.abs(ganancia))}</span>
          ${venta.totalEditado
            ? html`<button type="button" class="boton boton-texto boton-sm" data-accion="usar-sugerido">Usar sugerido ${formatearDinero(sugerido.total)}</button>`
            : html`<span class="t-tenue">${sugerido.desglose.length > 1 ? sugerido.desglose.map(d => `${formatearNumero(d.veces)} × ${d.etiqueta}`).join(' + ') : 'Sugerido'}</span>`}
        </div>
      </div>
      <details class="desplegable" ${variantes.length ? 'open' : ''}>
        <summary class="fila t-pequeno">${seguro(icono('sabor', 'icono-sm'))}<span class="crece">Sabor <span class="t-tenue">(opcional)</span></span>${seguro(icono('chevron-abajo', 'icono-sm chevron'))}</summary>
        <div class="columna" style="padding-top:var(--e-2)">
          ${variantes.length ? html`<div class="fila-chips">${variantes.map(v => html`<button type="button" class="chip" data-accion="elegir-sabor" data-sabor="${v}" aria-pressed="${String(normalizarIdentidad(v) === normalizarIdentidad(venta.variante))}">${v}</button>`)}</div>` : ''}
          <div class="control"><input id="venta-sabor" placeholder="Escribe el sabor o déjalo vacío" value="${venta.variante}" autocomplete="off"></div>
        </div>
      </details>
      <div class="grupo-botones">
        <button type="button" class="boton boton-secundario" data-accion="agregar-carrito" ${excede || !venta.cantidad ? 'disabled' : ''}>${seguro(icono('mas', 'icono-sm'))}Agregar otro producto</button>
      </div>
    </div>
    ${venta.carrito.length ? '' : html`<button type="button" class="boton boton-venta boton-grande boton-bloque" data-accion="cobrar" ${excede || !venta.cantidad ? 'disabled' : ''}>${seguro(icono('billete'))}Cobrar ${formatearDinero(venta.total)}</button>`}`.texto;
  pintarIconos(cont);

  const inCantidad = $('#venta-cantidad', cont);
  prepararCampoNumerico(inCantidad, { decimales: p.decimales ? 3 : 0 });
  inCantidad.addEventListener('input', () => {
    venta.cantidad = leerCantidad(inCantidad);
    venta.etiqueta = '';
    recalcularTotalVenta();
    actualizarCifrasVenta();
  });
  inCantidad.addEventListener('change', () => pintarProductoVenta());
  const inTotal = $('#venta-total', cont);
  prepararCampoNumerico(inTotal, { decimales: 2 });
  inTotal.addEventListener('input', () => { venta.total = leerDineroCampo(inTotal); venta.totalEditado = true; actualizarCifrasVenta(); });
  inTotal.addEventListener('change', () => pintarProductoVenta());
  inTotal.addEventListener('focus', () => inTotal.select());
  const inSabor = $('#venta-sabor', cont);
  inSabor.addEventListener('input', () => { venta.variante = inSabor.value.trim(); });
}

// Actualiza ganancia y botón sin redibujar (para no perder el foco al escribir).
function actualizarCifrasVenta() {
  const cont = $('#venta-producto', venta.el);
  const p = venta.producto; if (!p) return;
  const inTotal = $('#venta-total', cont);
  if (!venta.totalEditado && document.activeElement !== inTotal) inTotal.value = valorCampoDinero(venta.total);
  const ganancia = gananciaVenta();
  const linea = $('.total-cobrado', cont).parentElement.querySelector('.fila-separada span');
  if (linea) { linea.className = ganancia < 0 ? 't-peligro t-fuerte' : 't-secundario'; linea.textContent = `${ganancia < 0 ? 'Pierdes' : 'Ganancia'} ${formatearDinero(Math.abs(ganancia))}`; }
  const sufijo = $('.sufijo', cont); if (sufijo) sufijo.textContent = pluralUnidad(p.unidadBase, venta.cantidad);
  const disponible = redondearCantidad(Almacen.stock(p.idProducto) - enCarrito(p.idProducto));
  const valido = venta.cantidad > 0 && venta.cantidad <= disponible;
  $$('[data-accion="cobrar"], [data-accion="agregar-carrito"]', cont).forEach(b => { b.disabled = !valido; });
  const cobrar = $('[data-accion="cobrar"]', cont);
  if (cobrar) cobrar.lastChild.textContent = `Cobrar ${formatearDinero(venta.total)}`;
  const barra = $('#venta-cobrar-carrito', venta.el);
  if (barra) barra.lastChild.textContent = `Cobrar ${formatearDinero(totalTicketVenta())}`;
}

function lineaActualVenta() {
  const p = venta.producto;
  if (!p || !(venta.cantidad > 0)) return null;
  return { idProducto: p.idProducto, cantidad: venta.cantidad, totalCobrado: redondearCentavo(venta.total), variante: venta.variante, etiqueta: venta.etiqueta };
}

function totalTicketVenta() {
  const actual = lineaActualVenta();
  return sumarDinero(venta.carrito.map(l => l.totalCobrado).concat(actual ? [actual.totalCobrado] : []));
}

function pintarCarritoVenta() {
  const cont = $('#venta-carrito', venta.el);
  if (!venta.carrito.length) { cont.innerHTML = ''; return; }
  const total = totalTicketVenta();
  cont.innerHTML = html`
    <div class="tarjeta">
      <div class="tarjeta-titulo"><h2>${seguro(icono('recibo', 'icono-sm'))} Ticket · ${venta.carrito.length} ${pluralizar(venta.carrito.length, 'producto')}</h2>
        <button type="button" class="boton boton-texto boton-sm peligro" data-accion="vaciar-carrito">Vaciar</button></div>
      <ul class="lista">
        ${venta.carrito.map((l, i) => { const p = Almacen.producto(l.idProducto); return html`
          <li class="fila-lista"><div class="crece"><div class="titulo recortar">${nombreProducto(p, { conVariante: false })}${l.variante ? html` · ${l.variante}` : ''}</div>
            <div class="sub">${formatearNumero(l.cantidad)} ${pluralUnidad(p.unidadBase, l.cantidad)}${l.etiqueta ? html` (${l.etiqueta})` : ''}</div></div>
            <span class="monto">${formatearDinero(l.totalCobrado)}</span>
            <button type="button" class="boton boton-icono" data-accion="quitar-linea" data-i="${i}" aria-label="Quitar">${seguro(icono('cerrar', 'icono-sm'))}</button></li>`; })}
      </ul>
    </div>
    <button type="button" class="boton boton-venta boton-grande boton-bloque" id="venta-cobrar-carrito" data-accion="cobrar">${seguro(icono('billete'))}<span>Cobrar ${formatearDinero(total)}</span></button>`.texto;
}

function pintarClienteVenta() {
  const c = venta.idCliente ? Almacen.cliente(venta.idCliente) : null;
  const n = $('#venta-cliente-nombre', venta.el);
  if (n) n.innerHTML = c ? html`${c.nombre} <button type="button" class="boton boton-texto boton-sm" data-accion="quitar-cliente">Quitar</button>`.texto : '';
}

async function crearClienteDesdeVenta(nombre) {
  try {
    const op = operacionCrearCliente(nombre);
    const c = await ejecutarOperacion(op);
    if (c) { venta.idCliente = c.idCliente; $('#venta-cliente-buscar', venta.el).value = ''; pintarClienteVenta(); avisar(`Cliente «${c.nombre}» agregado.`); }
  } catch (e) { mostrarDialogo({ titulo: 'No se pudo agregar', mensaje: e.message }); }
}

const accionesVenta = {
  'quitar-producto': () => { venta.producto = null; venta.selector.marcar(null); pintarProductoVenta(); },
  'usar-presentacion': (b) => {
    venta.cantidad = Number(b.dataset.cantidad);
    venta.totalEditado = false;
    recalcularTotalVenta(); // con esa cantidad, el sugerido es el precio de la presentación
    venta.etiqueta = b.dataset.etiqueta;
    pintarProductoVenta();
  },
  'usar-sugerido': () => { venta.totalEditado = false; recalcularTotalVenta(); pintarProductoVenta(); },
  'elegir-sabor': (b) => { venta.variante = normalizarIdentidad(venta.variante) === normalizarIdentidad(b.dataset.sabor) ? '' : b.dataset.sabor; pintarProductoVenta(); },
  'cambiar-precio': () => editarPrecioProducto(venta.producto, () => { recalcularTotalVenta(); pintarProductoVenta(); }),
  'editar-presentaciones': () => editarPresentaciones(venta.producto, () => { recalcularTotalVenta(); pintarProductoVenta(); }),
  'agregar-carrito': () => {
    const l = lineaActualVenta(); if (!l) return;
    venta.carrito.push(l);
    venta.producto = null; venta.selector.marcar(null);
    pintarProductoVenta(); pintarCarritoVenta();
    avisar('Agregado al ticket. Elige el siguiente producto.');
    venta.selector.enfocar();
  },
  'quitar-linea': (b) => { venta.carrito.splice(Number(b.dataset.i), 1); pintarCarritoVenta(); pintarProductoVenta(); },
  'vaciar-carrito': async () => { if (await confirmar({ titulo: '¿Vaciar el ticket?', mensaje: 'Se quitan todos los productos que no has cobrado.', textoConfirmar: 'Vaciar' })) { venta.carrito = []; pintarCarritoVenta(); pintarProductoVenta(); } },
  'quitar-cliente': () => { venta.idCliente = null; pintarClienteVenta(); },
  'cobrar': (b) => cobrarVenta(b)
};

async function cobrarVenta(boton) {
  const actual = lineaActualVenta();
  const lineas = venta.carrito.concat(actual ? [actual] : []);
  if (!lineas.length) return;
  let prep;
  try { prep = prepararVenta({ lineas, fecha: venta.fecha || obtenerFechaLocal(), idCliente: venta.idCliente }); }
  catch (e) { mostrarDialogo({ titulo: 'Revisa la venta', mensaje: e.message }); return; }
  if (prep.resumen.bajoCosto.length) {
    const seguir = await confirmar({
      titulo: 'Vendes por debajo del costo',
      mensaje: `${prep.resumen.bajoCosto.join(', ')}: el total cobrado no cubre lo que te costó. ¿Cobrar así?`,
      textoConfirmar: 'Cobrar así', textoCancelar: 'Revisar'
    });
    if (!seguir) return;
  }
  const op = operacionGuardarTicket(prep);
  const r = await ejecutarOperacion(op, { boton });
  if (!r) return;
  const folios = prep.filas.map(f => f.folio);
  venta.carrito = []; venta.producto = null; venta.idCliente = null; venta.selector.marcar(null);
  refrescarVenta();
  const unidad = (f) => pluralUnidad(Almacen.producto(f.idProducto).unidadBase, Math.abs(f.cantidad));
  await mostrarResumen({
    titulo: 'Venta guardada',
    total: formatearDinero(prep.resumen.total),
    detalle: `${prep.resumen.ganancia < 0 ? 'Pérdida' : 'Ganancia'} ${formatearDinero(Math.abs(prep.resumen.ganancia))} · ${prep.idTicket}`,
    lineas: prep.filas.map(f => ({
      izquierda: `${formatearNumero(Math.abs(f.cantidad))} ${unidad(f)} · ${nombreProducto(Almacen.producto(f.idProducto), { conVariante: false })}${f.variante ? ' · ' + f.variante : ''}`,
      derecha: `${formatearDinero(f.precioUnit, { decimales: f.precioUnit % 1000 ? 4 : 2 })} c/u = ${formatearDinero(f.totalVenta)}`
    })),
    alDeshacer: async () => {
      const ok = await ejecutarOperacion(operacionAnular(folios));
      if (ok) avisar('Venta deshecha: se anuló el ticket.');
    }
  });
}

// Cambio de precio vigente en 2 toques (D18, §9.4 puntos 3 y 6).
function editarPrecioProducto(p, alGuardar) {
  const control = abrirHoja({
    titulo: 'Cambiar precio',
    contenido: html`<p class="t-pequeno">${nombreProducto(p, { conVariante: false })}</p>
      <div class="campo"><label for="precio-nuevo">Precio por ${p.unidadBase}</label>
        <div class="control grande"><span class="prefijo">$</span><input id="precio-nuevo" value="${valorCampoDinero(p.precio)}"></div>
        <span class="ayuda-campo">Aplica a las ventas nuevas; no cambia las que ya registraste. Queda en el historial de precios.</span></div>
      <p class="t-pequeno t-secundario">Costo actual: ${formatearDinero(p.costo, { decimales: p.costo % 1000 ? 4 : 2 })} por ${p.unidadBase}</p>`,
    acciones: [{ texto: 'Cancelar', fn: (c) => c.cerrar() }, {
      texto: 'Guardar precio', clase: 'boton-primario', fn: async (c) => {
        const nuevo = leerDineroCampo($('#precio-nuevo', c.el));
        if (!(nuevo > 0)) { avisar('Escribe un precio mayor que cero.'); return; }
        if (nuevo === p.precio) { c.cerrar(); return; }
        const r = await ejecutarOperacion(operacionCambiarPrecio(p.idProducto, nuevo), { boton: $('.acciones .boton-primario', c.el) });
        if (r) { c.cerrar(); avisar(`Precio actualizado a ${formatearDinero(nuevo)}.`); if (alGuardar) alGuardar(); }
      }
    }],
    alMontar: (hoja) => { const i = $('#precio-nuevo', hoja); prepararCampoNumerico(i, { decimales: 2 }); i.addEventListener('focus', () => i.select()); }
  });
  return control;
}

// Presentaciones de venta (hasta 3 al inicio, §9.6): «Cartón 30 = $5.25», «2 por $0.75».
function editarPresentaciones(p, alGuardar) {
  const actuales = Almacen.presentacionesDe(p.idProducto).map(x => ({ etiqueta: x.etiqueta, cantidad: x.cantidad, precio: x.precio }));
  while (actuales.length < 3) actuales.push({ etiqueta: '', cantidad: '', precio: '' });
  // Ejemplos con el producto actual (su empaque más usado o «2 unidades»), nunca fijos.
  const eq = Almacen.equivalenciasDe(p.idProducto).find(e => e.idProducto === p.idProducto && normalizarTexto(e.nivelInferior) === normalizarTexto(p.unidadBase));
  const ejCant = eq ? eq.unidades : 2;
  const ejNombre = eq ? `${eq.nombre} ${eq.unidades}` : `${ejCant} ${pluralUnidad(p.unidadBase, ejCant)}`;
  const ejPrecio = valorCampoDinero(redondearCentavo(multiplicarDinero(p.precio || 0, ejCant))) || '0.00';
  const control = abrirHoja({
    titulo: 'Precios por presentación',
    contenido: html`<p class="t-pequeno t-secundario">Para vender ${pluralUnidad(p.unidadBase, 2)} juntos a un precio propio (${eq ? eq.nombre.toLowerCase() : 'paquete'}, mayoreo). Deja vacío lo que no uses.</p>
      ${actuales.map((x, i) => html`<div class="rejilla-campos fila-presentacion" data-i="${i}">
        <div class="campo"><label for="pres-et-${i}">Nombre</label><div class="control"><input id="pres-et-${i}" value="${x.etiqueta}" placeholder="${ejNombre}"></div></div>
        <div class="campo"><label for="pres-c-${i}">${pluralUnidad(p.unidadBase, 2)}</label><div class="control"><input id="pres-c-${i}" value="${x.cantidad}" placeholder="${ejCant}"></div></div>
        <div class="campo"><label for="pres-p-${i}">Precio</label><div class="control"><span class="prefijo">$</span><input id="pres-p-${i}" value="${x.precio === '' ? '' : valorCampoDinero(x.precio)}" placeholder="${ejPrecio}"></div></div>
      </div>`)}`,
    acciones: [{ texto: 'Cancelar', fn: (c) => c.cerrar() }, {
      texto: 'Guardar', clase: 'boton-primario', fn: async (c) => {
        const lista = [];
        for (let i = 0; i < 3; i++) {
          const et = $(`#pres-et-${i}`, c.el).value.trim();
          const cant = parsearNumero($(`#pres-c-${i}`, c.el).value);
          const precio = dinero($(`#pres-p-${i}`, c.el).value);
          if (!et && !cant && !precio) continue;
          if (!et || !(cant > 0) || !(precio > 0)) { avisar('Cada presentación necesita nombre, cantidad y precio.'); return; }
          lista.push({ etiqueta: et, cantidad: cant, precio });
        }
        const r = await ejecutarOperacion(operacionGuardarPresentaciones(p.idProducto, lista), { boton: $('.acciones .boton-primario', c.el) });
        if (r) { c.cerrar(); avisar('Presentaciones guardadas.'); if (alGuardar) alGuardar(); }
      }
    }],
    alMontar: (hoja) => { $$('input[id^="pres-c-"]', hoja).forEach(i => prepararCampoNumerico(i, { decimales: p.decimales ? 3 : 0 })); $$('input[id^="pres-p-"]', hoja).forEach(i => prepararCampoNumerico(i, { decimales: 2 })); }
  });
  return control;
}
