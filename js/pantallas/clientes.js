// © 2026 Kitsótaro · KoreStock Ledger · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// PANTALLA CLIENTES (T17) — §23.3, §10.3: lista con buscador, alta rápida,
// editar, desactivar y «último pedido hace X días» (para rutas). Lista con
// «Cargar más». El cliente es opcional al vender.
//
// Expone: (registra la pantalla 'clientes').
// Depende de: shell.js, componentes.js, operaciones-clientes.js, almacen.js.
// ============================================================

const clientesUI = { el: null, texto: '', verInactivos: false };

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
        <div class="buscador"><div class="control">${seguro(icono('buscar', 'icono-sm'))}<input id="cliente-buscar" type="search" placeholder="Buscar cliente" autocomplete="off"></div></div>
        <label class="casilla t-pequeno"><input type="checkbox" id="cliente-inactivos"> Mostrar inactivos</label>
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
    delegar(el, 'click', { 'editar-cliente': (b) => editarCliente(Number(b.dataset.id)) });
    Almacen.suscribir((m) => { if (Shell.actual === 'clientes' && m !== 'carga') pintarClientes(); });
  },
  mostrar() { pintarClientes(); }
});

function pintarClientes() {
  const ultimo = {}, total = {};
  Almacen.movimientos.forEach(m => {
    if (!m.idCliente || !esMovValido(m) || m.tipo !== TIPOS_MOV.VENTA) return;
    if (!ultimo[m.idCliente] || m.fecha > ultimo[m.idCliente]) ultimo[m.idCliente] = m.fecha;
    total[m.idCliente] = sumarDinero(total[m.idCliente] || 0, m.totalVenta || 0);
  });
  const hoy = obtenerFechaLocal();
  const lista = Almacen.hojas.CLIENTES.filter(c => (clientesUI.verInactivos || c.estado !== ESTADOS.INACTIVO) && (!clientesUI.texto || coincidenPalabras(c.nombre, clientesUI.texto)))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  pintarPaginado({
    contenedor: $('#clientes-lista', clientesUI.el), items: lista, tope: 30,
    vacio: html`<div class="vacio">${seguro(icono('clientes', 'icono-xl'))}<strong>${Almacen.hojas.CLIENTES.length ? 'Ningún cliente coincide' : 'Aún no tienes clientes'}</strong><p>Agrégalos aquí o al vender, en «Cliente (opcional)».</p></div>`,
    pintarItem: (c) => {
      const u = ultimo[c.idCliente];
      const dias = u ? diasEntre(u, hoy) : null;
      return html`<div class="fila-lista"><div class="crece"><div class="titulo">${c.nombre}${c.estado === ESTADOS.INACTIVO ? html` <span class="insignia">Inactivo</span>` : ''}</div>
        <div class="sub">${u ? `Último pedido ${dias === 0 ? 'hoy' : `hace ${dias} ${pluralizar(dias, 'día')}`} · compras ${formatearDinero(total[c.idCliente])}` : 'Sin pedidos todavía'}</div></div>
        <button type="button" class="boton boton-icono" data-accion="editar-cliente" data-id="${c.idCliente}" aria-label="Editar ${c.nombre}">${seguro(icono('editar', 'icono-sm'))}</button></div>`;
    }
  });
  pintarIconos($('#clientes-lista', clientesUI.el));
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
