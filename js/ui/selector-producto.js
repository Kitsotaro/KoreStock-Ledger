// © 2026 KoreStock Ledger — un proyecto de Kitsótaro · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// SELECTOR-PRODUCTO.JS — el mismo buscador para Venta y Entrada (§13
// punto 1): busca por nombre, marca o código; en Venta muestra debajo una
// cinta deslizable con los más vendidos (§12.2); en Entrada ofrece al final
// «+ Producto nuevo».
//
// Expone: crearSelectorProducto, ejecutarOperacion, filaProductoHTML,
//   textoEmpaquesProducto, detalleProProductoHTML.
// Depende de: componentes.js, almacen.js, operaciones-movimientos.js.
// ============================================================

// Fila de resultado. Muestra hasta 2 sabores del producto y «…» si hay más,
// primero el que coincide con lo buscado: así se entiende por qué aparece
// «Tortillitas 30 g» al escribir «jalapeño» (el sabor es dato del movimiento, D24).
// Empaques registrados: «caja de 6 botellas · sixpack de …».
function textoEmpaquesProducto(p) {
  if (typeof empaquesRegistrados !== 'function') return '';
  return empaquesRegistrados(p).filter(o => o.clave !== 'u').map(o => o.etiqueta).join(' · ');
}

// Todo lo que se sabe del producto (tarjeta de Venta y Entrada en modo Pro).
function detalleProProductoHTML(p, opciones) {
  const { conAviso = true } = opciones || {};
  const e = Almacen.estado(p.idProducto);
  const empaques = textoEmpaquesProducto(p);
  const sabores = Object.entries(e.porVariante || {}).filter(([s, u]) => s && u);
  const dato = (etiqueta, valor) => html`<div class="dato"><span>${etiqueta}</span><strong>${valor}</strong></div>`;
  return html`<div class="detalle-pro" data-solo-modo="pro">
    ${dato('Código', `${p.sku}${p.categoria ? ` · ${p.categoria}` : ''}`)}
    ${dato(`Costo del proveedor por ${p.unidadBase}`, formatearDinero(p.costo, { detalle: true }))}
    ${dato('Costo promedio', formatearDinero(e.cpp || 0, { detalle: true }))}
    ${dato(`Precio de venta por ${p.unidadBase}`, formatearDinero(p.precio))}
    ${dato('Empaques', empaques || `solo por ${p.unidadBase}`)}
    ${sabores.length ? dato('Sabores en stock', sabores.map(([s, u]) => `${s} ${formatearNumero(u)}`).join(' · ')) : ''}
    ${e.bonif ? dato('Bonificadas recibidas', `${formatearNumero(e.bonif)} ${pluralUnidad(p.unidadBase, e.bonif)}`) : ''}
    ${conAviso ? dato('Avisar con', `${formatearNumero(p.umbralMin || 0)} o menos (ideal ${formatearNumero(p.umbralMax || 0)})`) : ''}
    ${e.ultimaEntrada || e.ultimaVenta ? dato('Última compra · venta', `${e.ultimaEntrada ? formatearFechaCorta(e.ultimaEntrada) : '—'} · ${e.ultimaVenta ? formatearFechaCorta(e.ultimaVenta) : '—'}`) : ''}
  </div>`;
}

function filaProductoHTML(p, q) {
  const e = Almacen.estado(p.idProducto);
  const sabores = Almacen.variantesDe(p.idProducto);
  const busca = q ? normalizarIdentidad(q) : '';
  const orden = busca ? sabores.slice().sort((a, b) => (normalizarIdentidad(b).includes(busca) ? 1 : 0) - (normalizarIdentidad(a).includes(busca) ? 1 : 0)) : sabores;
  const textoSabores = orden.length ? `${orden.slice(0, 2).join(', ')}${orden.length > 2 ? '…' : ''}` : '';
  const empaques = textoEmpaquesProducto(p);
  return html`<div class="crece"><div class="recortar t-fuerte">${nombreProducto(p, { conVariante: false })}</div>
    <div class="sub">${p.sku} · ${describirCantidad(p.idProducto, e.stock)}</div>
    ${empaques ? html`<div class="sub en-linea">${seguro(icono('caja', 'icono-sm'))}<span class="recortar">${empaques}</span></div>` : ''}
    ${textoSabores ? html`<div class="sub en-linea">${seguro(icono('sabor', 'icono-sm'))}<span class="recortar">${textoSabores}</span></div>` : ''}</div>
    <span class="cifra t-pequeno">${formatearDinero(p.precio)}</span>`;
}

// opciones: { contenedor, conCinta, tipoSugeridos ('VENTA'|'ENTRADA'), permitirNuevo, alElegir(p), alNuevo(texto), placeholder }
function crearSelectorProducto({ contenedor, conCinta = false, tipoSugeridos = 'VENTA', permitirNuevo = false, alElegir, alNuevo, placeholder }) {
  const id = 'buscar-' + Math.random().toString(36).slice(2, 7);
  contenedor.innerHTML = html`
    <div class="buscador">
      <label class="solo-lector" for="${id}">Buscar producto</label>
      <div class="control">${seguro(icono('buscar', 'icono-sm'))}<input id="${id}" type="search" placeholder="${placeholder || 'Buscar producto o código'}" autocomplete="off" enterkeyhint="search"></div>
    </div>
    ${conCinta ? html`<div class="cinta" aria-label="${tipoSugeridos === 'ENTRADA' ? 'Más comprados y recientes' : 'Más vendidos y recientes'}"></div>` : ''}`.texto;
  const input = $('input', contenedor);
  const cinta = $('.cinta', contenedor);
  let elegidoId = null;

  crearBuscador({
    input,
    obtener: (q) => Almacen.buscarProductos(q, { limite: 7 }).map(p => ({ valor: p, html: filaProductoHTML(p, q) })),
    alElegir: (p) => { input.value = ''; marcar(p.idProducto); alElegir(p); },
    nuevo: permitirNuevo ? { html: (q) => html`${seguro(icono('mas', 'icono-sm'))}<span>Producto nuevo${q ? html`: «${q}»` : ''}</span>`, fn: (q) => { input.value = ''; marcar(null); alNuevo(q); } } : null
  });

  function marcar(idProducto) {
    elegidoId = idProducto;
    if (cinta) $$('.cinta-item', cinta).forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.id) === idProducto)));
  }

  function pintarCinta() {
    if (!cinta) return;
    const lista = Almacen.sugeridos(tipoSugeridos, 12);
    cinta.hidden = lista.length === 0;
    cinta.innerHTML = lista.map(p => html`<button type="button" class="cinta-item" data-id="${p.idProducto}" aria-pressed="${String(p.idProducto === elegidoId)}">
        <span class="nombre">${nombreProducto(p, { conVariante: false })}</span>
        <span class="precio">${formatearDinero(tipoSugeridos === 'ENTRADA' ? p.costo : p.precio)} · ${describirCantidad(p.idProducto, Almacen.stock(p.idProducto))}</span>
      </button>`.texto).join('');
  }
  if (cinta) {
    cinta.addEventListener('click', (e) => {
      const b = e.target.closest('.cinta-item'); if (!b) return;
      const p = Almacen.producto(b.dataset.id); if (!p) return;
      marcar(p.idProducto); alElegir(p);
    });
    pintarCinta();
  }
  return { input, refrescar: pintarCinta, marcar, enfocar: () => input.focus() };
}

// Ejecuta una operación de la cola con el botón en «cargando» y, si falla,
// ofrece reintentar sin perder nada (D35). Devuelve el resultado o null.
async function ejecutarOperacion(op, opciones) {
  const { boton = null, titulo = 'No se pudo guardar' } = opciones || {};
  if (boton) { boton.classList.add('cargando'); boton.disabled = true; }
  try {
    for (;;) {
      try {
        const r = await ColaEscritura.ejecutar(op);
        return r !== undefined ? r : (op.contexto.resultado !== undefined ? op.contexto.resultado : true);
      } catch (e) {
        if (e.sinConexion) { mostrarDialogo({ titulo: 'Sin conexión', mensaje: e.message }); return null; }
        const otraVez = await confirmar({ titulo, mensaje: `${e.message}\n\nNo se perdió nada: puedes intentarlo de nuevo.`, textoConfirmar: 'Reintentar', textoCancelar: 'Ahora no' });
        if (!otraVez) return null;
      }
    }
  } finally {
    if (boton) { boton.classList.remove('cargando'); boton.disabled = false; }
  }
}
