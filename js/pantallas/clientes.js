// © 2026 KoreStock Ledger — un proyecto de Kitsótaro · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// PANTALLA CLIENTES (T17) — §23.3, §10.3: lista con buscador, alta rápida,
// editar, desactivar y «último pedido hace X días» (para rutas). Cifras
// (activos, sin pedido en 15+ días), orden A–Z o por último pedido, filas
// desplegables con sus números y últimos pedidos. Lista con «Cargar más».
// El cliente es opcional al vender.
//
// Expone: (registra la pantalla 'clientes').
// Depende de: shell.js, componentes.js, operaciones-clientes.js, almacen.js.
// ============================================================

const clientesUI = { el: null, texto: '', verInactivos: false, orden: 'NOMBRE' };
const DIAS_SIN_PEDIDO = 15; // a partir de aquí el «último pedido» se marca en naranja

registrarPantalla('clientes', {
  titulo: 'Clientes',
  montar(el) {
    clientesUI.el = el;
    el.innerHTML = html`
      <div class="columna">
        <form class="tarjeta fila" id="form-cliente">
          <div class="control crece">${seguro(icono('persona-mas', 'icono-sm'))}<label for="cliente-nuevo" class="solo-lector">Nombre del cliente nuevo</label><input id="cliente-nuevo" placeholder="Nombre del cliente nuevo" autocomplete="off"></div>
          <button type="submit" class="boton boton-primario">Agregar</button>
        </form>
        <div class="cifras" id="clientes-cifras"></div>
        <div class="buscador"><div class="control">${seguro(icono('buscar', 'icono-sm'))}<input id="cliente-buscar" type="search" placeholder="Buscar cliente" autocomplete="off"></div></div>
        <div class="fila-separada envolver">
          <span class="segmentado" role="radiogroup" aria-label="Ordenar" style="flex:none">
            <button type="button" role="radio" data-accion="orden-clientes" data-orden="NOMBRE">A–Z</button>
            <button type="button" role="radio" data-accion="orden-clientes" data-orden="PEDIDO">Último pedido</button>
          </span>
          <label class="casilla t-pequeno"><input type="checkbox" id="cliente-inactivos"> Mostrar inactivos</label>
        </div>
        <div id="clientes-lista"></div>
      </div>`.texto;
    $('#form-cliente', el).addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = $('#cliente-nuevo', el);
      let op;
      try { op = operacionCrearCliente(input.value); } catch (err) { mostrarDialogo({ titulo: 'No se pudo agregar', mensaje: err.message }); return; }
      const c = await ejecutarOperacion(op, { boton: $('#form-cliente button', el) });
      if (c) { input.value = ''; avisar(`Cliente «${c.nombre}» agregado.`); }
    });
    $('#cliente-buscar', el).addEventListener('input', (e) => { clientesUI.texto = e.target.value; pintarClientes(); });
    $('#cliente-inactivos', el).addEventListener('change', (e) => { clientesUI.verInactivos = e.target.checked; pintarClientes(); });
    delegar(el, 'click', {
      'editar-cliente': (b, e) => { e.preventDefault(); editarCliente(Number(b.dataset.id)); },
      'orden-clientes': (b) => { clientesUI.orden = b.dataset.orden; pintarClientes(); }
    });
    Almacen.suscribir((m) => { if (Shell.actual === 'clientes' && m !== 'carga') pintarClientes(); });
  },
  mostrar() { pintarClientes(); }
});

function pintarClientes() {
  // Por cliente: último pedido, total comprado y sus pedidos (un ticket = un pedido).
  const datos = {};
  Almacen.movimientos.forEach(m => {
    if (!m.idCliente || !esMovValido(m) || m.tipo !== TIPOS_MOV.VENTA) return;
    const d = datos[m.idCliente] || (datos[m.idCliente] = { ultimo: '', total: 0, pedidos: new Map() });
    if (m.fecha > d.ultimo) d.ultimo = m.fecha;
    d.total = sumarDinero(d.total, m.totalVenta || 0);
    const clave = m.idTicket || m.folio;
    const p = d.pedidos.get(clave) || { fecha: m.fecha, clave, total: 0, lineas: 0 };
    p.total = sumarDinero(p.total, m.totalVenta || 0); p.lineas++;
    d.pedidos.set(clave, p);
  });
  const hoy = obtenerFechaLocal();
  const diasDe = (c) => datos[c.idCliente] ? diasEntre(datos[c.idCliente].ultimo, hoy) : null;
  const activos = Almacen.hojas.CLIENTES.filter(c => c.estado !== ESTADOS.INACTIVO);
  const sinPedido = activos.filter(c => { const d = diasDe(c); return d === null || d >= DIAS_SIN_PEDIDO; }).length;
  $('#clientes-cifras', clientesUI.el).innerHTML = Almacen.hojas.CLIENTES.length ? html`
    <div class="cifra-tarjeta"><div class="etiqueta">Clientes activos</div><div class="valor">${activos.length}</div><div class="comparacion igual">${Almacen.hojas.CLIENTES.length - activos.length} inactivos</div></div>
    <div class="cifra-tarjeta"><div class="etiqueta">Sin pedido en ${DIAS_SIN_PEDIDO}+ días</div><div class="valor ${sinPedido ? 't-aviso' : ''}">${sinPedido}</div><div class="comparacion igual">para visitar en ruta</div></div>`.texto : '';
  $$('[data-accion="orden-clientes"]', clientesUI.el).forEach(b => b.setAttribute('aria-checked', String(b.dataset.orden === clientesUI.orden)));

  const lista = Almacen.hojas.CLIENTES.filter(c => (clientesUI.verInactivos || c.estado !== ESTADOS.INACTIVO) && (!clientesUI.texto || coincidenPalabras(c.nombre, clientesUI.texto)))
    .sort(clientesUI.orden === 'PEDIDO'
      // Último pedido: primero los que llevan más tiempo sin pedir (y los que nunca pidieron).
      ? (a, b) => { const da = diasDe(a), db = diasDe(b); return (db === null ? 1e9 : db) - (da === null ? 1e9 : da) || a.nombre.localeCompare(b.nombre, 'es'); }
      : (a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  pintarPaginado({
    contenedor: $('#clientes-lista', clientesUI.el), items: lista, tope: 30,
    vacio: html`<div class="vacio">${seguro(icono('clientes', 'icono-xl'))}<strong>${Almacen.hojas.CLIENTES.length ? 'Ningún cliente coincide' : 'Aún no tienes clientes'}</strong><p>Agrégalos aquí o al vender, en «Cliente (opcional)».</p></div>`,
    pintarItem: (c) => filaClienteHTML(c, datos[c.idCliente], diasDe(c))
  });
  pintarIconos($('#clientes-lista', clientesUI.el));
}

function filaClienteHTML(c, d, dias) {
  const iniciales = c.nombre.trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();
  const pedidos = d ? [...d.pedidos.values()].sort((a, b) => b.fecha > a.fecha ? 1 : -1) : [];
  const textoDias = dias === null ? 'Sin pedidos todavía' : `Último pedido ${dias === 0 ? 'hoy' : dias === 1 ? 'ayer' : `hace ${dias} días`}`;
  return html`<details class="desplegable">
    <summary class="fila-lista">
      <span class="avatar-cliente" aria-hidden="true">${iniciales}</span>
      <div class="crece"><div class="titulo recortar">${c.nombre}${c.estado === ESTADOS.INACTIVO ? html` <span class="insignia">Inactivo</span>` : ''}</div>
        <div class="sub ${dias !== null && dias >= DIAS_SIN_PEDIDO ? 't-aviso' : ''}">${textoDias}</div></div>
      ${d ? html`<span class="monto">${formatearDinero(d.total)}</span>` : ''}
      ${seguro(icono('chevron-abajo', 'icono-sm chevron'))}
    </summary>
    <div class="desplegable-cuerpo">
      ${d ? html`<div class="t-mini t-secundario">${pedidos.length} ${pluralizar(pedidos.length, 'pedido')} · promedio ${formatearDinero(dividirDinero(d.total, pedidos.length))} por pedido</div>
        ${pedidos.slice(0, 3).map(p => html`<div class="fila-separada t-pequeno"><span>${formatearFechaCorta(p.fecha, true)} · ${p.lineas} ${pluralizar(p.lineas, 'producto')}</span><span class="cifra">${formatearDinero(p.total)}</span></div>`)}`
        : html`<div class="t-mini t-secundario">Aún no tiene ventas a su nombre.</div>`}
      <button type="button" class="boton boton-secundario boton-sm" data-accion="editar-cliente" data-id="${c.idCliente}" style="justify-self:start">${seguro(icono('editar', 'icono-sm'))}Editar cliente</button>
    </div></details>`;
}

function editarCliente(id) {
  const c = Almacen.cliente(id);
  abrirHoja({
    titulo: 'Editar cliente',
    contenido: html`<div class="campo"><label for="cli-nombre">Nombre</label><div class="control"><input id="cli-nombre" value="${c.nombre}" autocomplete="off"></div>
      <span class="ayuda-campo">Cambiar el nombre no afecta su historial.</span></div>
      <label class="casilla"><input type="checkbox" id="cli-activo" ${c.estado !== ESTADOS.INACTIVO ? 'checked' : ''}> Activo (los inactivos no aparecen al vender)</label>`,
    acciones: [{ texto: 'Cancelar', fn: (x) => x.cerrar() }, { texto: 'Guardar', clase: 'boton-primario', fn: async (x) => {
      let op;
      try { op = operacionActualizarCliente(id, { nombre: $('#cli-nombre', x.el).value, estado: $('#cli-activo', x.el).checked ? ESTADOS.ACTIVO : ESTADOS.INACTIVO }); }
      catch (e) { mostrarDialogo({ titulo: 'No se puede guardar', mensaje: e.message }); return; }
      const r = await ejecutarOperacion(op, { boton: $('.acciones .boton-primario', x.el) });
      if (r) { x.cerrar(); avisar('Cliente guardado.'); }
    } }]
  });
}
