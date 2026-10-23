// © 2026 Kitsótaro · KoreStock Ledger · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// FILTROS.JS — la fila de filtros de abajo, justo encima de la barra
// inferior (D25, D40, §17.1). Una fila de chips que se desliza; cada chip
// abre una hoja inferior. Los filtros se apilan y afectan a TODO lo de la
// pantalla (cifras, gráficos y listas). No tocan los datos.
//   Período (lista única, INV. 14) · Producto «Solo» o «Excluir» · Marca ·
//   Categoría · Cliente · Sabor.
// El período además se ve SIEMPRE arriba: una cinta en la barra superior
// (`#cinta-periodo`) con el período de la pantalla; al tocarla abre la
// misma hoja de período. Cada filtro activo tiene su «×» para quitar solo ese.
//
// Expone: crearEstadoFiltros, crearFiltrosAbajo, predicadoFiltros, filtrosDePantalla,
//   actualizarCintaPeriodo.
// Depende de: componentes.js, almacen.js, utilidades.js.
// ============================================================

function crearEstadoFiltros(preset) {
  const f = calcularFechasPreset(preset || 'MES');
  return { preset: preset || 'MES', inicio: f.inicio, fin: f.fin, modoProducto: 'SOLO', productos: new Set(), marcas: new Set(), categorias: new Set(), clientes: new Set(), sabor: '' };
}

// Devuelve una función m => boolean para los movimientos (ignora el período).
function predicadoFiltros(est) {
  const hayProd = est.productos.size > 0, hayMarca = est.marcas.size > 0, hayCat = est.categorias.size > 0, hayCli = est.clientes.size > 0;
  if (!hayProd && !hayMarca && !hayCat && !hayCli && !est.sabor) return null;
  const sabor = normalizarIdentidad(est.sabor);
  return (m) => {
    const id = Almacen.idEfectivo(m.idProducto);
    if (hayProd) { const esta = est.productos.has(id); if (est.modoProducto === 'SOLO' ? !esta : esta) return false; }
    if (hayMarca || hayCat) {
      const p = Almacen.producto(id);
      if (hayMarca && (!p || !est.marcas.has(normalizarIdentidad(p.marca)))) return false;
      if (hayCat && (!p || !est.categorias.has(normalizarIdentidad(p.categoria || '')))) return false;
    }
    if (hayCli && !est.clientes.has(m.idCliente)) return false;
    if (sabor && normalizarIdentidad(m.variante) !== sabor) return false;
    return true;
  };
}

// Filtros de cada pantalla (para la cinta de período de arriba).
const filtrosDePantalla = new Map();

function actualizarCintaPeriodo() {
  const cinta = $('#cinta-periodo');
  if (!cinta) return;
  const f = filtrosDePantalla.get(Shell.actual);
  cinta.hidden = !f || !f.usaPeriodo;
  if (!cinta.hidden) cinta.innerHTML = html`${seguro(icono('calendario', 'icono-sm'))}<span>${f.textoPeriodo()}</span>`.texto;
}

// opciones: { contenedor, estado, usar: ['periodo','producto','marca','categoria','cliente','sabor'], alCambiar }
function crearFiltrosAbajo({ contenedor, estado, usar, alCambiar }) {
  contenedor.className = 'filtros-abajo';
  const textoPeriodo = () => {
    const p = PRESETS_PERIODO.find(x => x.valor === estado.preset);
    return p && estado.preset !== 'PERSONALIZADO' ? p.etiqueta : `${formatearFechaCorta(estado.inicio)} – ${formatearFechaCorta(estado.fin)}`;
  };
  // Un chip activo (salvo el período) lleva su «×» para quitar solo ese filtro.
  const chip = (clave, texto, activo, iconoNombre) => html`<span class="chip-grupo"><button type="button" class="chip" data-filtro="${clave}" aria-pressed="${String(!!activo)}">${seguro(icono(iconoNombre, 'icono-sm'))}${texto}</button>${activo && clave !== 'periodo' ? html`<button type="button" class="chip-quitar" data-quitar="${clave}" aria-label="Quitar filtro">${seguro(icono('cerrar', 'icono-sm'))}</button>` : ''}</span>`;
  const pintar = () => {
    const partes = [];
    if (usar.includes('periodo')) partes.push(chip('periodo', textoPeriodo(), true, 'calendario'));
    if (usar.includes('producto')) partes.push(chip('producto', estado.productos.size ? `${estado.modoProducto === 'SOLO' ? 'Solo' : 'Sin'} ${estado.productos.size} ${pluralizar(estado.productos.size, 'producto')}` : 'Producto', estado.productos.size, 'caja'));
    if (usar.includes('marca') && Almacen.productosVisibles().length) partes.push(chip('marca', estado.marcas.size ? `${estado.marcas.size} ${pluralizar(estado.marcas.size, 'marca')}` : 'Marca', estado.marcas.size, 'etiqueta'));
    if (usar.includes('categoria') && Almacen.categorias().length) partes.push(chip('categoria', estado.categorias.size ? `${estado.categorias.size} ${pluralizar(estado.categorias.size, 'categoría')}` : 'Categoría', estado.categorias.size, 'organizacion'));
    if (usar.includes('cliente') && Almacen.hojas.CLIENTES.length) partes.push(chip('cliente', estado.clientes.size ? `${estado.clientes.size} ${pluralizar(estado.clientes.size, 'cliente')}` : 'Cliente', estado.clientes.size, 'persona'));
    if (usar.includes('sabor')) partes.push(chip('sabor', estado.sabor || 'Sabor', estado.sabor, 'sabor'));
    const hayAlgo = estado.productos.size || estado.marcas.size || estado.categorias.size || estado.clientes.size || estado.sabor;
    if (hayAlgo) partes.push(html`<button type="button" class="chip" data-filtro="limpiar">${seguro(icono('cerrar', 'icono-sm'))}Quitar filtros</button>`);
    contenedor.innerHTML = `<div class="fila-chips">${partes.map(p => p.texto).join('')}</div>`;
    if (Shell.actual === pantalla) actualizarCintaPeriodo();
  };
  const cambio = () => { pintar(); alCambiar(); };
  const quitar = { producto: () => estado.productos.clear(), marca: () => estado.marcas.clear(), categoria: () => estado.categorias.clear(), cliente: () => estado.clientes.clear(), sabor: () => { estado.sabor = ''; } };

  const hojaLista = ({ titulo, items, conjunto, buscador, extra }) => {
    const control = abrirHoja({
      titulo,
      contenido: html`${extra || ''}${buscador ? html`<div class="control">${seguro(icono('buscar', 'icono-sm'))}<input type="search" data-buscar placeholder="Buscar" autocomplete="off"></div>` : ''}
        <div class="lista" data-items>${items.map(it => html`<label class="fila-lista" data-texto="${it.texto}"><input type="checkbox" value="${it.valor}" ${conjunto.has(it.valor) ? 'checked' : ''}><span class="crece">${it.texto}</span>${it.sub ? html`<span class="sub">${it.sub}</span>` : ''}</label>`)}</div>`,
      acciones: [{ texto: 'Ninguno', fn: (c) => { $$('[data-items] input', c.el).forEach(i => { i.checked = false; }); } },
        { texto: 'Aplicar', clase: 'boton-primario', fn: (c) => {
          conjunto.clear();
          $$('[data-items] input', c.el).forEach(i => { if (i.checked) conjunto.add(items.length && typeof items[0].valor === 'number' ? Number(i.value) : i.value); });
          if (c.el.__modo) estado.modoProducto = c.el.__modo();
          c.cerrar(); cambio();
        } }],
      alMontar: (hoja) => {
        const b = $('[data-buscar]', hoja);
        if (b) b.addEventListener('input', () => $$('[data-texto]', hoja).forEach(f => { f.hidden = !coincidenPalabras(f.dataset.texto, b.value); }));
      }
    });
    return control;
  };

  const acciones = {
    periodo: () => {
      const control = abrirHoja({
        titulo: 'Período',
        contenido: html`<div class="fila-chips envolver" style="flex-wrap:wrap">${PRESETS_PERIODO.filter(p => p.valor !== 'PERSONALIZADO').map(p => html`<button type="button" class="chip" data-preset="${p.valor}" aria-pressed="${String(p.valor === estado.preset)}">${p.etiqueta}</button>`)}</div>
          <div class="rejilla-campos"><div class="campo"><label for="f-inicio">Desde</label><div class="control"><input type="date" id="f-inicio" value="${estado.inicio}"></div></div>
          <div class="campo"><label for="f-fin">Hasta</label><div class="control"><input type="date" id="f-fin" value="${estado.fin}"></div></div></div>`,
        acciones: [{ texto: 'Usar estas fechas', clase: 'boton-primario', fn: (c) => {
          const i = $('#f-inicio', c.el).value, f = $('#f-fin', c.el).value;
          if (!i || !f || i > f) { avisar('Revisa las fechas: «desde» debe ser antes que «hasta».'); return; }
          estado.preset = 'PERSONALIZADO'; estado.inicio = i; estado.fin = f; c.cerrar(); cambio();
        } }],
        alMontar: (hoja) => $$('[data-preset]', hoja).forEach(b => b.addEventListener('click', () => {
          const r = calcularFechasPreset(b.dataset.preset);
          estado.preset = b.dataset.preset; estado.inicio = r.inicio; estado.fin = r.fin; control.cerrar(); cambio();
        }))
      });
    },
    producto: () => {
      const items = Almacen.productosVisibles().sort((a, b) => nombreProducto(a).localeCompare(nombreProducto(b), 'es'))
        .map(p => ({ valor: p.idProducto, texto: nombreProducto(p, { conVariante: false }), sub: p.sku }));
      const c = hojaLista({ titulo: 'Productos', items, conjunto: estado.productos, buscador: true,
        extra: html`<div class="segmentado" role="group" aria-label="Cómo filtrar"><button type="button" data-modo="SOLO" aria-pressed="${String(estado.modoProducto === 'SOLO')}">Solo estos</button><button type="button" data-modo="EXCLUIR" aria-pressed="${String(estado.modoProducto === 'EXCLUIR')}">Excluir estos</button></div>
          <p class="t-pequeno t-secundario">«Excluir» quita productos de los totales para ver cuánto queda sin ellos. No cambia tus datos.</p>` });
      let modo = estado.modoProducto;
      $$('[data-modo]', c.el).forEach(b => b.addEventListener('click', () => { modo = b.dataset.modo; $$('[data-modo]', c.el).forEach(x => x.setAttribute('aria-pressed', String(x === b))); }));
      c.el.__modo = () => modo;
    },
    marca: () => hojaLista({ titulo: 'Marcas', conjunto: estado.marcas, items: [...new Map(Almacen.productosVisibles().map(p => [normalizarIdentidad(p.marca), p.marca])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'es')).map(([v, t]) => ({ valor: v, texto: t })) }),
    categoria: () => hojaLista({ titulo: 'Categorías', conjunto: estado.categorias, items: [{ valor: '', texto: 'Sin categoría' }].concat(Almacen.categorias().map(c => ({ valor: normalizarIdentidad(c), texto: c }))) }),
    cliente: () => hojaLista({ titulo: 'Clientes', conjunto: estado.clientes, buscador: true, items: Almacen.hojas.CLIENTES.map(c => ({ valor: c.idCliente, texto: c.nombre, sub: c.estado === ESTADOS.INACTIVO ? 'inactivo' : '' })) }),
    sabor: () => {
      const sabores = [...new Map(Almacen.movimientos.filter(m => m.variante).map(m => [normalizarIdentidad(m.variante), m.variante])).values()].sort((a, b) => a.localeCompare(b, 'es'));
      const control = abrirHoja({
        titulo: 'Sabor',
        contenido: html`<div class="lista">${[''].concat(sabores).map(s => html`<button type="button" class="fila-lista" data-sabor="${s}"><span class="titulo">${s || 'Todos'}</span>${normalizarIdentidad(s) === normalizarIdentidad(estado.sabor) ? seguro(icono('check', 'lado')) : ''}</button>`)}</div>`,
        alMontar: (hoja) => $$('[data-sabor]', hoja).forEach(b => b.addEventListener('click', () => { estado.sabor = b.dataset.sabor; control.cerrar(); cambio(); }))
      });
    },
    limpiar: () => { estado.productos.clear(); estado.marcas.clear(); estado.categorias.clear(); estado.clientes.clear(); estado.sabor = ''; cambio(); }
  };
  contenedor.addEventListener('click', (e) => {
    const q = e.target.closest('[data-quitar]');
    if (q) { if (quitar[q.dataset.quitar]) { quitar[q.dataset.quitar](); cambio(); } return; }
    const b = e.target.closest('[data-filtro]'); if (b && acciones[b.dataset.filtro]) acciones[b.dataset.filtro]();
  });
  const pantalla = (contenedor.closest('.pantalla') || {}).dataset ? contenedor.closest('.pantalla').dataset.pantalla : '';
  const control = { pintar, abrirPeriodo: acciones.periodo, textoPeriodo, usaPeriodo: usar.includes('periodo') };
  if (pantalla) filtrosDePantalla.set(pantalla, control);
  pintar();
  return control;
}
