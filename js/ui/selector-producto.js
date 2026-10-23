// © 2026 KoreStock Ledger — un proyecto de Kitsótaro · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// SELECTOR-PRODUCTO.JS — el mismo buscador para Venta y Entrada (§13
// punto 1): busca por nombre, marca o código; en Venta muestra debajo una
// cinta deslizable con los más vendidos (§12.2); en Entrada ofrece al final
// «+ Producto nuevo».
//
// Expone: crearSelectorProducto, ejecutarOperacion, filaProductoHTML.
// Depende de: componentes.js, almacen.js, operaciones-movimientos.js.
// ============================================================

// Fila de resultado. Muestra hasta 2 sabores del producto y «…» si hay más,
// primero el que coincide con lo buscado: así se entiende por qué aparece
// «Tortillitas 30 g» al escribir «jalapeño» (el sabor es dato del movimiento, D24).
function filaProductoHTML(p, q) {
  const e = Almacen.estado(p.idProducto);
  const sabores = Almacen.variantesDe(p.idProducto);
  const busca = q ? normalizarIdentidad(q) : '';
  const orden = busca ? sabores.slice().sort((a, b) => (normalizarIdentidad(b).includes(busca) ? 1 : 0) - (normalizarIdentidad(a).includes(busca) ? 1 : 0)) : sabores;
  const textoSabores = orden.length ? `${orden.slice(0, 2).join(', ')}${orden.length > 2 ? '…' : ''}` : '';
  return html`<div class="crece"><div class="recortar t-fuerte">${nombreProducto(p, { conVariante: false })}</div>
    <div class="sub">${p.sku} · ${describirCantidad(p.idProducto, e.stock)}</div>
    ${textoSabores ? html`<div class="sub">${seguro(icono('sabor', 'icono-sm'))} ${textoSabores}</div>` : ''}</div>
    <span class="cifra t-pequeno">${formatearDinero(p.precio)}</span>`;
}

// opciones: { contenedor, conCinta, permitirNuevo, alElegir(p), alNuevo(texto), placeholder }
function crearSelectorProducto({ contenedor, conCinta = false, permitirNuevo = false, alElegir, alNuevo, placeholder }) {
  const id = 'buscar-' + Math.random().toString(36).slice(2, 7);
  contenedor.innerHTML = html`
    <div class="buscador">
      <label class="solo-lector" for="${id}">Buscar producto</label>
      <div class="control">${seguro(icono('buscar', 'icono-sm'))}<input id="${id}" type="search" placeholder="${placeholder || 'Buscar producto o código'}" autocomplete="off" enterkeyhint="search"></div>
    </div>
    ${conCinta ? html`<div class="cinta" aria-label="Más vendidos"></div>` : ''}`.texto;
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
    const lista = Almacen.masVendidos(30, 12);
    cinta.hidden = lista.length === 0;
    cinta.innerHTML = lista.map(p => html`<button type="button" class="cinta-item" data-id="${p.idProducto}" aria-pressed="${String(p.idProducto === elegidoId)}">
        <span class="nombre">${nombreProducto(p, { conVariante: false })}</span>
        <span class="precio">${formatearDinero(p.precio)} · ${formatearNumero(Almacen.stock(p.idProducto))} ${pluralUnidad(p.unidadBase, Almacen.stock(p.idProducto))}</span>
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
