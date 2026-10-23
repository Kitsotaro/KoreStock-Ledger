// © 2026 Wilber Adonay Escobar Solórzano (Kitsótaro) · KoreStock Ledger · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// REASIGNAR.JS — «Repartir sabores» (T24, §16.2): reparte lo «sin
// asignar» entre los sabores cuando el tendero quiera. Si se vendió sin
// decir el sabor, aquí se indica de qué sabor fueron; si entró sin sabor,
// de qué sabor es. No cambia el total ni el valor del producto.
//
// Expone: abrirReasignarSabores.
// Depende de: componentes.js, campos.js, operaciones-movimientos.js, almacen.js.
// ============================================================

function abrirReasignarSabores(idProducto) {
  const p = Almacen.producto(idProducto);
  const e = Almacen.estado(p.idProducto);
  const sinAsignar = e.porVariante[''] || 0;
  const sabores = Almacen.variantesDe(p.idProducto);
  const unidad = (n) => pluralUnidad(p.unidadBase, n);
  if (!sinAsignar) { mostrarDialogo({ titulo: 'Nada por repartir', mensaje: 'Todas las unidades de este producto ya tienen sabor.' }); return; }
  const explicacion = sinAsignar < 0
    ? `Vendiste ${formatearNumero(-sinAsignar)} ${unidad(-sinAsignar)} sin decir el sabor. Indica de qué sabor fueron.`
    : `Hay ${formatearNumero(sinAsignar)} ${unidad(sinAsignar)} sin sabor. Indica de qué sabor son.`;
  const control = abrirHoja({
    titulo: 'Repartir sabores',
    contenido: html`<p class="t-fuerte">${nombreProducto(p, { conVariante: false })}</p>
      <p class="t-pequeno t-secundario">${explicacion} El total del producto no cambia.</p>
      <div class="lista">${sabores.map((s, i) => html`<div class="fila-lista"><div class="crece"><div class="titulo">${s}</div><div class="sub">Según registros: ${formatearNumero(e.porVariante[s] || 0)}</div></div>
        <div class="control" style="width:6rem"><input data-sabor="${s}" id="ra-${i}" placeholder="0" aria-label="Unidades para ${s}"></div></div>`)}
        <div class="fila-lista"><div class="control crece"><input id="ra-nuevo-nombre" placeholder="Otro sabor" autocomplete="off"></div>
          <div class="control" style="width:6rem"><input id="ra-nuevo" placeholder="0" aria-label="Unidades para el sabor nuevo"></div></div>
      </div>
      <p class="t-pequeno" id="ra-resto"></p>`,
    acciones: [{ texto: 'Cancelar', fn: (c) => c.cerrar() }, { texto: 'Repartir', clase: 'boton-primario', fn: async (c) => {
      const asignaciones = $$('[data-sabor]', c.el).map(i => ({ variante: i.dataset.sabor, unidades: leerCantidad(i) }));
      const nuevo = $('#ra-nuevo-nombre', c.el).value.trim();
      if (nuevo) asignaciones.push({ variante: nuevo, unidades: leerCantidad($('#ra-nuevo', c.el)) });
      let prep;
      try { prep = prepararReasignacion(p.idProducto, asignaciones); } catch (err) { avisar(err.message); return; }
      const r = await ejecutarOperacion(operacionGuardarTicket(prep), { boton: $('.acciones .boton-primario', c.el) });
      if (r) { c.cerrar(); avisar('Sabores repartidos.'); }
    } }],
    alMontar: (hoja) => {
      const actualizar = () => {
        const usado = $$('[data-sabor], #ra-nuevo', hoja).reduce((s, i) => s + leerCantidad(i), 0);
        const queda = Math.abs(sinAsignar) - usado;
        const el = $('#ra-resto', hoja);
        el.textContent = queda >= 0 ? `Quedan ${formatearNumero(queda)} sin asignar.` : `Te pasaste por ${formatearNumero(-queda)}.`;
        el.className = 't-pequeno ' + (queda < 0 ? 't-peligro' : 't-secundario');
      };
      $$('[data-sabor], #ra-nuevo', hoja).forEach(i => { prepararCampoNumerico(i, { decimales: p.decimales ? 3 : 0 }); i.addEventListener('input', actualizar); });
      actualizar();
    }
  });
  return control;
}
