// © 2026 Kitsótaro · KoreStock Ledger · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// PANTALLA ENTRADA (T13) — estructura aprobada en V3 §13, §3.3, §12.4:
//   1. Mismo buscador que Venta; al final «+ Producto nuevo».
//   2. Producto existente: tarjeta de lectura (stock, último costo, precio).
//   3. Cantidad en frase: «Compré [12] [cartón] de [30] [huevos]»; «+ nivel»
//      para cajas de cartones. Debajo: «= 360 huevos». Las equivalencias
//      usadas se sugieren (§10.2). En modo Bodega: «Compré [12] [cajas]».
//   4. Costo en la unidad comprada ↔ total pagado (el total es el dato):
//      «Total $60.00 · ≈ $0.1667 por huevo».
//   5. Costo-beneficio: ganancia por unidad y por empaque, margen.
//   6. Precios de venta colapsados, con el aviso naranja si cambian.
//   7. Bonificadas (gratis) colapsado.  8. Fecha y folio pequeños.
//   Producto nuevo: identidad con «Nuevo valor» y UNIDAD BASE obligatoria;
//   si ya existe, aviso «¿usar el existente?». Factura con varios productos
//   (mismo ID_TICKET). Importar Excel en el menú «⋯».
//
// Expone: (registra la pantalla 'entrada'), abrirEntradaCon.
// Depende de: shell.js, componentes.js, campos.js, selector-producto.js,
//   operaciones-movimientos.js, operaciones-catalogo.js, pantallas/venta.js
//   (editarPresentaciones), pantallas/importar-excel.js.
// ============================================================

const entrada = {
  el: null, selector: null,
  producto: null, nuevo: null,
  cantEmp: 1, empaque: '', unidades: 1, conNivel: false, subEmpaque: '', porSub: 1,
  costoEmp: 0, total: 0, totalEditado: false, bonif: 0, precioNuevo: null, variante: '',
  carrito: [], fecha: ''
};

registrarPantalla('entrada', {
  titulo: 'Entrada',
  montar(el) {
    entrada.el = el;
    el.innerHTML = html`
      <div class="registro registro-entrada">
        <div class="fila-separada">
          <p class="t-pequeno t-secundario">Registra lo que compraste como lo compraste.</p>
          <button type="button" class="boton boton-icono" data-accion="menu-entrada" aria-label="Más opciones">${seguro(icono('mas-opciones'))}</button>
        </div>
        <div id="entrada-selector"></div>
        <div id="entrada-producto"></div>
        <div id="entrada-carrito"></div>
        <div class="fila-folio">
          <label class="fila" for="entrada-fecha">${seguro(icono('calendario', 'icono-sm'))}<span class="solo-lector">Fecha</span>
            <span class="control"><input type="date" id="entrada-fecha"></span></label>
          <span id="entrada-folio" class="cifra"></span>
        </div>
      </div>`.texto;
    entrada.selector = crearSelectorProducto({
      contenedor: $('#entrada-selector', el), permitirNuevo: true, placeholder: 'Buscar producto o agregar uno nuevo',
      alElegir: (p) => elegirProductoEntrada(p),
      alNuevo: (texto) => empezarProductoNuevo(texto)
    });
    const fecha = $('#entrada-fecha', el);
    fecha.value = obtenerFechaLocal();
    fecha.max = obtenerFechaLocal();
    fecha.addEventListener('change', () => { entrada.fecha = fecha.value || obtenerFechaLocal(); });
    delegar(el, 'click', accionesEntrada);
    Almacen.suscribir((motivo) => { if (Shell.actual === 'entrada' && motivo !== 'carga') refrescarEntrada(); });
  },
  mostrar(el, opciones) {
    if (!entrada.fecha) entrada.fecha = obtenerFechaLocal();
    if (opciones && opciones.idProducto) { const p = Almacen.producto(opciones.idProducto); if (p) elegirProductoEntrada(p); }
    refrescarEntrada();
  }
});

// Desde Stock («Agregar», «+ Entrada»): abre Entrada con el producto elegido (§12.1).
function abrirEntradaCon(idProducto) { Shell.ir('entrada', { idProducto }); }

const enModoBodega = () => Shell.modo === 'bodega';

function refrescarEntrada() {
  if (!entrada.el) return;
  if (entrada.producto) entrada.producto = Almacen.producto(entrada.producto.idProducto);
  pintarProductoEntrada();
  pintarCarritoEntrada();
  $('#entrada-folio', entrada.el).textContent = `Folio ${Almacen.verFolioSiguiente('IN-')}`;
}

function reiniciarCantidades(unidadBase) {
  entrada.cantEmp = 1; entrada.empaque = unidadBase || ''; entrada.unidades = 1; entrada.conNivel = false;
  entrada.subEmpaque = ''; entrada.porSub = 1; entrada.costoEmp = 0; entrada.total = 0; entrada.totalEditado = false;
  entrada.bonif = 0; entrada.precioNuevo = null; entrada.variante = '';
}

function elegirProductoEntrada(p) {
  entrada.producto = p; entrada.nuevo = null;
  reiniciarCantidades(p.unidadBase);
  // Sugerencia: la equivalencia usada más recientemente con este producto.
  const eq = enModoBodega() ? null : Almacen.equivalenciasDe(p.idProducto).find(e => normalizarTexto(e.nivelInferior) === normalizarTexto(p.unidadBase));
  if (eq) { entrada.empaque = eq.nombre; entrada.unidades = eq.unidades; }
  entrada.costoEmp = redondearCentavo(multiplicarDinero(p.costo, entrada.unidades));
  entrada.total = entrada.costoEmp;
  pintarProductoEntrada();
  setTimeout(() => { const c = $('#entrada-cant', entrada.el); if (c) { c.focus(); c.select(); } }, 50);
}

function empezarProductoNuevo(texto) {
  entrada.producto = null;
  const u = Almacen.umbral('TODOS') || { min: 4, max: 6 };
  entrada.nuevo = { marca: '', linea: texto || '', presentacion: '', volumen: '', unidadBase: '', tipoEmpaque: '', categoria: '', umbralMin: u.min, umbralMax: u.max, decimales: false, precio: 0 };
  reiniciarCantidades('');
  pintarProductoEntrada();
  setTimeout(() => { const c = $('#nuevo-marca', entrada.el); if (c) c.focus(); }, 50);
}

// Unidad base vigente (del producto o la escrita en «producto nuevo»).
function unidadBaseEntrada() {
  if (entrada.producto) return entrada.producto.unidadBase;
  return (entrada.nuevo && entrada.nuevo.unidadBase.trim().toLowerCase()) || 'unidad';
}
function factorEntrada() {
  if (enModoBodega()) return 1;
  if (normalizarTexto(entrada.empaque) === normalizarTexto(unidadBaseEntrada()) || !entrada.empaque.trim()) return 1;
  return entrada.conNivel ? redondearCantidad(entrada.unidades * entrada.porSub) : entrada.unidades;
}
function unidadesTotalesEntrada() { return redondearCantidad(entrada.cantEmp * factorEntrada()); }
function totalPagadoEntrada() { return entrada.totalEditado ? redondearCentavo(entrada.total) : redondearCentavo(multiplicarDinero(entrada.costoEmp, entrada.cantEmp)); }
function precioVentaEntrada() {
  if (entrada.precioNuevo !== null) return entrada.precioNuevo;
  if (entrada.producto) return entrada.producto.precio;
  return (entrada.nuevo && entrada.nuevo.precio) || 0;
}

function datalist(id, valores) {
  return html`<datalist id="${id}">${valores.map(v => html`<option value="${v}"></option>`)}</datalist>`;
}
const valoresUnicos = (campo, filtro) => {
  const m = new Map();
  Almacen.productosVisibles().filter(filtro || (() => true)).forEach(p => { if (p[campo]) m.set(normalizarIdentidad(p[campo]), p[campo]); });
  return [...m.values()].sort((a, b) => a.localeCompare(b, 'es'));
};
const esValorNuevo = (campo, valor) => valor && !valoresUnicos(campo).some(v => normalizarIdentidad(v) === normalizarIdentidad(valor));

function formularioNuevo() {
  const n = entrada.nuevo;
  const campo = (id, etiqueta, valor, opciones) => {
    const { lista = null, ayuda = '', obligatorio = false, placeholder = '', campoCat = null } = opciones || {};
    return html`<div class="campo"><label for="${id}">${etiqueta}${obligatorio ? html` <span class="t-peligro">*</span>` : ''}</label>
      <div class="control"><input id="${id}" value="${valor}" placeholder="${placeholder}" ${lista ? html`list="${lista}"` : ''} autocomplete="off" ${obligatorio ? 'required' : ''}></div>
      ${campoCat && esValorNuevo(campoCat, valor) ? html`<span class="nuevo-valor">Nuevo valor</span>` : ''}
      ${ayuda ? html`<span class="ayuda-campo">${ayuda}</span>` : ''}</div>`;
  };
  return html`
    <div class="tarjeta columna" id="formulario-nuevo">
      <div class="fila-separada"><h2 class="fila">${seguro(icono('etiqueta-nueva', 'icono-sm'))} Producto nuevo</h2>
        <button type="button" class="boton boton-icono" data-accion="cancelar-nuevo" aria-label="Cancelar">${seguro(icono('cerrar', 'icono-sm'))}</button></div>
      <div class="rejilla-campos">
        ${campo('nuevo-marca', 'Marca', n.marca, { lista: 'lista-marcas', obligatorio: true, placeholder: 'Catalana', campoCat: 'marca' })}
        ${campo('nuevo-linea', 'Producto', n.linea, { lista: 'lista-lineas', obligatorio: true, placeholder: 'Huevo grande', campoCat: 'linea' })}
        ${campo('nuevo-presentacion', 'Presentación', n.presentacion, { lista: 'lista-presentaciones', placeholder: 'Botella, lata, bolsa', campoCat: 'presentacion' })}
        ${campo('nuevo-volumen', 'Contenido', n.volumen, { placeholder: '500 ml, 30 g, grande', ayuda: 'El tamaño de una unidad, no cuántas trae la caja.' })}
      </div>
      ${campo('nuevo-unidad', '¿Cómo lo cuentas al vender?', n.unidadBase, { lista: 'lista-unidades', obligatorio: true, placeholder: 'huevo, lata, botella, libra', ayuda: 'Es la unidad más pequeña que vendes. El stock se lleva en esta unidad.' })}
      <details class="desplegable">
        <summary class="fila t-pequeno">${seguro(icono('ajustes', 'icono-sm'))}<span class="crece">Más datos <span class="t-tenue">(opcional)</span></span>${seguro(icono('chevron-abajo', 'icono-sm chevron'))}</summary>
        <div class="columna" style="padding-top:var(--e-3)">
          <div class="rejilla-campos">
            ${campo('nuevo-categoria', 'Categoría', n.categoria, { lista: 'lista-categorias', placeholder: 'Bebidas, farmacia…', campoCat: 'categoria' })}
            ${campo('nuevo-empaque', 'Tipo de empaque', n.tipoEmpaque, { lista: 'lista-empaques', placeholder: 'Caja, fardo' })}
          </div>
          <div class="rejilla-campos">
            <div class="campo"><label for="nuevo-umbral-min">Avisar «muy poco» con</label><div class="control"><input id="nuevo-umbral-min" value="${n.umbralMin}"><span class="sufijo">${pluralUnidad(unidadBaseEntrada(), 2)}</span></div></div>
            <div class="campo"><label for="nuevo-umbral-max">Avisar «poco» con</label><div class="control"><input id="nuevo-umbral-max" value="${n.umbralMax}"><span class="sufijo">${pluralUnidad(unidadBaseEntrada(), 2)}</span></div></div>
          </div>
          <label class="casilla" data-solo-modo="tienda pro"><input type="checkbox" id="nuevo-decimales" ${n.decimales ? 'checked' : ''}> Se vende por peso o medida (permite decimales)</label>
        </div>
      </details>
      ${datalist('lista-marcas', valoresUnicos('marca'))}
      ${datalist('lista-lineas', valoresUnicos('linea', p => !n.marca || normalizarIdentidad(p.marca) === normalizarIdentidad(n.marca)))}
      ${datalist('lista-presentaciones', valoresUnicos('presentacion'))}
      ${datalist('lista-unidades', valoresUnicos('unidadBase'))}
      ${datalist('lista-categorias', Almacen.categorias())}
      ${datalist('lista-empaques', valoresUnicos('tipoEmpaque'))}
    </div>`;
}

function pintarProductoEntrada() {
  const cont = $('#entrada-producto', entrada.el);
  const p = entrada.producto, n = entrada.nuevo;
  if (!p && !n) {
    cont.innerHTML = entrada.carrito.length ? '' : html`<div class="vacio">${seguro(icono('entrada', 'icono-xl'))}<strong>¿Qué compraste?</strong><p>Busca el producto. Si es la primera vez, elige «Producto nuevo» al final de la lista.</p></div>`.texto;
    return;
  }
  const unidad = unidadBaseEntrada();
  const factor = factorEntrada();
  const unidades = unidadesTotalesEntrada();
  const total = totalPagadoEntrada();
  const costoUnidad = unidades > 0 ? precioUnitario(total, unidades) : 0;
  const precio = precioVentaEntrada();
  const ganUnidad = restarDinero(precio, costoUnidad);
  const margen = precio > 0 ? porcentajeDe(ganUnidad, precio) : 0;
  const equivalencias = p ? Almacen.equivalenciasDe(p.idProducto).filter(e => e.unidades > 1).slice(0, 4) : [];
  const empaqueEsUnidad = factor === 1 && (normalizarTexto(entrada.empaque) === normalizarTexto(unidad) || !entrada.empaque.trim());
  const nombreEmp = entrada.empaque.trim() || unidad;
  const cambiaPrecio = p && entrada.precioNuevo !== null && entrada.precioNuevo !== p.precio;
  const variantes = p ? Almacen.variantesDe(p.idProducto) : [];
  const listaEmpaques = [unidad].concat(Almacen.hojas.EQUIVALENCIAS.map(e => e.nombre)).filter((v, i, a) => v && a.findIndex(x => normalizarTexto(x) === normalizarTexto(v)) === i);

  cont.innerHTML = html`
    ${p ? html`<div class="tarjeta tarjeta-producto">
      <div class="fila-separada"><span class="nombre">${nombreProducto(p, { conVariante: false })}</span>
        <button type="button" class="boton boton-icono" data-accion="quitar-producto-entrada" aria-label="Quitar producto">${seguro(icono('cerrar', 'icono-sm'))}</button></div>
      <div class="dato"><span>En bodega</span><strong>${describirCantidad(p.idProducto, Almacen.stock(p.idProducto))}</strong></div>
      <div class="dato"><span>Último costo</span><strong class="cifra">${formatearDinero(p.costo, { decimales: p.costo % 1000 ? 4 : 2 })} por ${p.unidadBase}</strong></div>
      <div class="dato"><span>Precio de venta</span><strong class="cifra">${formatearDinero(p.precio)} por ${p.unidadBase}</strong></div>
    </div>` : seguro(formularioNuevo().texto)}

    <div class="tarjeta columna">
      <div class="frase" aria-label="Cantidad comprada">
        <span>Compré</span>
        <span class="control"><input id="entrada-cant" value="${formatearNumero(entrada.cantEmp).replace(/,/g, '')}" aria-label="Cuántos"></span>
        ${enModoBodega()
          ? html`<span class="t-fuerte">${pluralUnidad(unidad, entrada.cantEmp)}</span>`
          : html`<span class="control ancho"><input id="entrada-empaque" value="${nombreEmp}" list="lista-empaques-entrada" aria-label="Empaque" autocomplete="off"></span>
            ${empaqueEsUnidad ? '' : html`<span>de</span>
              ${entrada.conNivel
                ? html`<span class="control"><input id="entrada-por-sub" value="${entrada.unidades}" aria-label="Cuántos trae cada empaque"></span>
                  <span class="control ancho"><input id="entrada-sub" value="${entrada.subEmpaque}" placeholder="cartón" aria-label="Empaque interior" list="lista-empaques-entrada"></span>
                  <span>de</span><span class="control"><input id="entrada-por-unidad" value="${entrada.porSub}" aria-label="Unidades por empaque interior"></span>`
                : html`<span class="control"><input id="entrada-por" value="${entrada.unidades}" aria-label="Unidades por empaque"></span>`}
              <span class="t-fuerte">${pluralUnidad(unidad, 2)}</span>`}`}
        ${datalist('lista-empaques-entrada', listaEmpaques)}
      </div>
      ${!enModoBodega() && !empaqueEsUnidad ? html`<button type="button" class="boton boton-texto boton-sm" data-accion="alternar-nivel" style="justify-self:start">${seguro(icono(entrada.conNivel ? 'menos' : 'mas', 'icono-sm'))}${entrada.conNivel ? 'Quitar nivel' : 'Agregar nivel (cajas de cartones)'}</button>` : ''}
      ${equivalencias.length && !enModoBodega() ? html`<div class="fila-chips" aria-label="Empaques usados antes">${equivalencias.map(e => html`<button type="button" class="chip" data-accion="usar-equivalencia" data-nombre="${e.nombre}" data-unidades="${e.unidades}" data-inferior="${e.nivelInferior}">${e.nombre} de ${formatearNumero(e.unidades)} ${pluralUnidad(e.nivelInferior, e.unidades)}</button>`)}</div>` : ''}
      <p class="t-grande t-fuerte entrada-total-unidades">= ${formatearNumero(unidades)} ${pluralUnidad(unidad, unidades)}</p>

      <div class="rejilla-campos">
        <div class="campo"><label for="entrada-costo">Costo por ${nombreEmp}</label>
          <div class="control"><span class="prefijo">$</span><input id="entrada-costo" value="${valorCampoDinero(entrada.costoEmp, entrada.costoEmp % 1000 ? 4 : 2)}"></div></div>
        <div class="campo"><label for="entrada-total">Total pagado</label>
          <div class="control total-pagado"><span class="prefijo">$</span><input id="entrada-total" value="${valorCampoDinero(total)}"></div></div>
      </div>
      <div class="calculo" id="entrada-calculo">
        <span>≈ <strong>${formatearDinero(costoUnidad, { decimales: 4 })}</strong> por ${unidad}</span>
        ${precio > 0 ? html`<span class="${ganUnidad < 0 ? 't-peligro' : ''}">Ganancia por ${unidad}: <strong>${formatearDinero(ganUnidad, { decimales: 4 })}</strong>${factor > 1 ? html` · por ${nombreEmp}: <strong>${formatearDinero(multiplicarDinero(ganUnidad, factor))}</strong>` : ''} · Margen <strong>${margen.toFixed(1)}%</strong></span>` : html`<span class="t-tenue">Pon un precio de venta para ver la ganancia.</span>`}
      </div>

      <details class="desplegable" ${n || cambiaPrecio ? 'open' : ''}>
        <summary class="fila t-pequeno">${seguro(icono('precio', 'icono-sm'))}<span class="crece">Precio de venta${p ? html` <span class="t-tenue">(${formatearDinero(precio)} por ${unidad})</span>` : ''}</span>${seguro(icono('chevron-abajo', 'icono-sm chevron'))}</summary>
        <div class="columna" style="padding-top:var(--e-2)">
          <div class="campo"><label for="entrada-precio">Precio por ${unidad}</label>
            <div class="control ${cambiaPrecio ? 'precio-cambiado' : ''}"><span class="prefijo">$</span><input id="entrada-precio" value="${valorCampoDinero(precio)}"></div>
            ${cambiaPrecio ? html`<span class="franja aviso-color">${seguro(icono('advertencia', 'icono-sm'))}Cambiará el precio de venta de ${formatearDinero(p.precio)} a ${formatearDinero(entrada.precioNuevo)}. Aplica a ventas nuevas.</span>` : ''}</div>
          ${p ? html`<button type="button" class="boton boton-texto boton-sm" data-accion="presentaciones-entrada" data-solo-modo="tienda pro" style="justify-self:start">${seguro(icono('precio', 'icono-sm'))}Precios por presentación</button>` : ''}
        </div>
      </details>
      <details class="desplegable" ${entrada.bonif ? 'open' : ''}>
        <summary class="fila t-pequeno">${seguro(icono('estrella', 'icono-sm'))}<span class="crece">Bonificadas (gratis)</span>${seguro(icono('chevron-abajo', 'icono-sm chevron'))}</summary>
        <div class="campo" style="padding-top:var(--e-2)"><label for="entrada-bonif">Unidades gratis</label>
          <div class="control"><input id="entrada-bonif" value="${entrada.bonif || ''}" placeholder="0"><span class="sufijo">${pluralUnidad(unidad, 2)}</span></div>
          <span class="ayuda-campo">Suman al stock pero no al costo: bajan el costo promedio.</span></div>
      </details>
      ${p ? html`<details class="desplegable" ${variantes.length && entrada.variante ? 'open' : ''}>
        <summary class="fila t-pequeno">${seguro(icono('sabor', 'icono-sm'))}<span class="crece">Sabor <span class="t-tenue">(opcional)</span></span>${seguro(icono('chevron-abajo', 'icono-sm chevron'))}</summary>
        <div class="columna" style="padding-top:var(--e-2)">
          ${variantes.length ? html`<div class="fila-chips">${variantes.map(v => html`<button type="button" class="chip" data-accion="sabor-entrada" data-sabor="${v}" aria-pressed="${String(normalizarIdentidad(v) === normalizarIdentidad(entrada.variante))}">${v}</button>`)}</div>` : ''}
          <div class="control"><input id="entrada-sabor" value="${entrada.variante}" placeholder="Escribe el sabor o déjalo vacío" autocomplete="off"></div>
        </div></details>` : ''}
      <button type="button" class="boton boton-secundario" data-accion="agregar-entrada">${seguro(icono('mas', 'icono-sm'))}Agregar otro producto</button>
    </div>
    ${entrada.carrito.length ? '' : html`<button type="button" class="boton boton-entrada boton-grande boton-bloque" data-accion="guardar-entrada">${seguro(icono('entrada'))}Guardar entrada · ${formatearDinero(total)}</button>`}`.texto;
  pintarIconos(cont);
  conectarCamposEntrada(cont);
}

function conectarCamposEntrada(cont) {
  const num = (id, dec, fn) => { const i = $(id, cont); if (!i) return; prepararCampoNumerico(i, { decimales: dec }); i.addEventListener('input', () => { fn(i); actualizarCalculoEntrada(); }); i.addEventListener('change', () => pintarProductoEntrada()); i.addEventListener('focus', () => i.select()); };
  const decCant = (entrada.producto ? entrada.producto.decimales : (entrada.nuevo && entrada.nuevo.decimales)) ? 3 : 0;
  num('#entrada-cant', decCant, (i) => { entrada.cantEmp = leerCantidad(i); });
  num('#entrada-por', 0, (i) => { entrada.unidades = leerCantidad(i) || 1; if (!entrada.totalEditado) entrada.costoEmp = entrada.costoEmp; });
  num('#entrada-por-sub', 0, (i) => { entrada.unidades = leerCantidad(i) || 1; });
  num('#entrada-por-unidad', 0, (i) => { entrada.porSub = leerCantidad(i) || 1; });
  num('#entrada-costo', 5, (i) => { entrada.costoEmp = leerDineroCampo(i); entrada.totalEditado = false; });
  num('#entrada-total', 2, (i) => { entrada.total = leerDineroCampo(i); entrada.totalEditado = true; if (entrada.cantEmp > 0) entrada.costoEmp = dividirDinero(entrada.total, entrada.cantEmp); });
  num('#entrada-precio', 2, (i) => { entrada.precioNuevo = leerDineroCampo(i); if (entrada.nuevo) entrada.nuevo.precio = entrada.precioNuevo; });
  num('#entrada-bonif', decCant, (i) => { entrada.bonif = leerCantidad(i); });
  const texto = (id, fn, repintar) => { const i = $(id, cont); if (!i) return; i.addEventListener('input', () => fn(i.value)); i.addEventListener('change', () => { fn(i.value); if (repintar) pintarProductoEntrada(); }); };
  texto('#entrada-empaque', (v) => { entrada.empaque = v.trim(); }, true);
  texto('#entrada-sub', (v) => { entrada.subEmpaque = v.trim(); });
  texto('#entrada-sabor', (v) => { entrada.variante = v.trim(); });
  if (entrada.nuevo) {
    const n = entrada.nuevo;
    texto('#nuevo-marca', (v) => { n.marca = v.trim(); }, true);
    texto('#nuevo-linea', (v) => { n.linea = v.trim(); }, true);
    texto('#nuevo-presentacion', (v) => { n.presentacion = v.trim(); }, true);
    texto('#nuevo-volumen', (v) => { n.volumen = v.trim(); }, true);
    texto('#nuevo-unidad', (v) => { n.unidadBase = v.trim().toLowerCase(); if (!entrada.empaque || normalizarTexto(entrada.empaque) === normalizarTexto(n.unidadBase)) entrada.empaque = n.unidadBase; }, true);
    texto('#nuevo-categoria', (v) => { n.categoria = v.trim(); });
    texto('#nuevo-empaque', (v) => { n.tipoEmpaque = v.trim(); });
    num('#nuevo-umbral-min', 0, (i) => { n.umbralMin = leerCantidad(i); });
    num('#nuevo-umbral-max', 0, (i) => { n.umbralMax = leerCantidad(i); });
    const dec = $('#nuevo-decimales', cont); if (dec) dec.addEventListener('change', () => { n.decimales = dec.checked; pintarProductoEntrada(); });
    ['#nuevo-marca', '#nuevo-linea', '#nuevo-presentacion', '#nuevo-volumen'].forEach(id => { const i = $(id, cont); if (i) i.addEventListener('change', () => revisarDuplicadoNuevo()); });
  }
}

// Actualiza los cálculos sin redibujar (para no perder el foco).
function actualizarCalculoEntrada() {
  const cont = $('#entrada-producto', entrada.el);
  const unidad = unidadBaseEntrada();
  const unidades = unidadesTotalesEntrada();
  const total = totalPagadoEntrada();
  const costoUnidad = unidades > 0 ? precioUnitario(total, unidades) : 0;
  const precio = precioVentaEntrada();
  const ganUnidad = restarDinero(precio, costoUnidad);
  const factor = factorEntrada();
  const t = $('.entrada-total-unidades', cont); if (t) t.textContent = `= ${formatearNumero(unidades)} ${pluralUnidad(unidad, unidades)}`;
  const inTotal = $('#entrada-total', cont); if (inTotal && document.activeElement !== inTotal) inTotal.value = valorCampoDinero(total);
  const inCosto = $('#entrada-costo', cont); if (inCosto && document.activeElement !== inCosto && entrada.totalEditado) inCosto.value = valorCampoDinero(entrada.costoEmp, 4);
  const calc = $('#entrada-calculo', cont);
  if (calc) calc.innerHTML = html`<span>≈ <strong>${formatearDinero(costoUnidad, { decimales: 4 })}</strong> por ${unidad}</span>
    ${precio > 0 ? html`<span class="${ganUnidad < 0 ? 't-peligro' : ''}">Ganancia por ${unidad}: <strong>${formatearDinero(ganUnidad, { decimales: 4 })}</strong>${factor > 1 ? html` · por empaque: <strong>${formatearDinero(multiplicarDinero(ganUnidad, factor))}</strong>` : ''} · Margen <strong>${(precio > 0 ? porcentajeDe(ganUnidad, precio) : 0).toFixed(1)}%</strong></span>` : ''}`.texto;
  const b = $('[data-accion="guardar-entrada"]', cont); if (b) b.lastChild.textContent = `Guardar entrada · ${formatearDinero(total)}`;
}

async function revisarDuplicadoNuevo() {
  const n = entrada.nuevo;
  if (!n || !n.marca || !n.linea) return;
  const existente = buscarProductoMismaIdentidad(n, Almacen.productos);
  if (!existente) return;
  const usar = await confirmar({
    titulo: 'Este producto ya existe',
    mensaje: `«${nombreProducto(existente, { conVariante: false })}» (${existente.sku}) ya está en tu catálogo. ¿Usar el existente?`,
    textoConfirmar: 'Usar el existente', textoCancelar: 'Seguir editando'
  });
  if (usar) { const c = { cantEmp: entrada.cantEmp, total: entrada.total, totalEditado: entrada.totalEditado }; elegirProductoEntrada(existente); Object.assign(entrada, c); pintarProductoEntrada(); }
}

function lineaActualEntrada() {
  if (!entrada.producto && !entrada.nuevo) return null;
  const unidades = unidadesTotalesEntrada();
  if (!(unidades > 0) && !(entrada.bonif > 0)) return null;
  const unidad = unidadBaseEntrada();
  const factor = factorEntrada();
  const niveles = [];
  if (factor > 1) {
    if (entrada.conNivel) {
      niveles.push({ nombre: entrada.empaque, unidades: entrada.unidades, nivelInferior: entrada.subEmpaque || 'empaque' });
      niveles.push({ nombre: entrada.subEmpaque || 'empaque', unidades: entrada.porSub, nivelInferior: unidad });
    } else niveles.push({ nombre: entrada.empaque, unidades: factor, nivelInferior: unidad });
  }
  const linea = {
    cantEmpaques: entrada.cantEmp, nombreEmpaque: factor > 1 ? entrada.empaque : unidad, unidPorEmpaque: factor, niveles,
    totalPagado: totalPagadoEntrada(), bonif: entrada.bonif, variante: entrada.variante,
    nuevoPrecio: entrada.precioNuevo !== null ? entrada.precioNuevo : undefined
  };
  if (entrada.producto) linea.producto = entrada.producto.idProducto;
  else {
    const n = entrada.nuevo;
    linea.nuevo = { marca: n.marca, linea: n.linea, presentacion: n.presentacion, volumen: n.volumen, unidadBase: unidad, tipoEmpaque: n.tipoEmpaque,
      categoria: n.categoria, umbralMin: n.umbralMin, umbralMax: n.umbralMax, decimales: n.decimales, precio: n.precio || 0 };
  }
  linea._descripcion = `${formatearNumero(entrada.cantEmp)} ${pluralUnidad(factor > 1 ? entrada.empaque : unidad, entrada.cantEmp)}${factor > 1 ? ` de ${formatearNumero(factor)}` : ''} = ${formatearNumero(unidades)} ${pluralUnidad(unidad, unidades)}`;
  linea._nombre = entrada.producto ? nombreProducto(entrada.producto, { conVariante: false }) : [entrada.nuevo.marca, entrada.nuevo.linea, entrada.nuevo.presentacion, entrada.nuevo.volumen].filter(Boolean).join(' ');
  return linea;
}

function validarNuevo() {
  const n = entrada.nuevo;
  if (!n) return '';
  if (!n.marca || !n.linea) return 'Escribe la marca y el producto.';
  if (!n.unidadBase) return 'Indica cómo cuentas el producto al venderlo (huevo, lata, botella…).';
  if (buscarProductoMismaIdentidad(n, Almacen.productos)) return 'Ese producto ya existe: elígelo de la lista.';
  return '';
}

function pintarCarritoEntrada() {
  const cont = $('#entrada-carrito', entrada.el);
  if (!entrada.carrito.length) { cont.innerHTML = ''; return; }
  const actual = lineaActualEntrada();
  const total = sumarDinero(entrada.carrito.map(l => l.totalPagado).concat(actual ? [actual.totalPagado] : []));
  cont.innerHTML = html`
    <div class="tarjeta">
      <div class="tarjeta-titulo"><h2>${seguro(icono('factura', 'icono-sm'))} Factura · ${entrada.carrito.length} ${pluralizar(entrada.carrito.length, 'producto')}</h2>
        <button type="button" class="boton boton-texto boton-sm peligro" data-accion="vaciar-entrada">Vaciar</button></div>
      <ul class="lista">${entrada.carrito.map((l, i) => html`
        <li class="fila-lista"><div class="crece"><div class="titulo recortar">${l._nombre}${l.nuevo ? html` <span class="insignia nuevo">Nuevo</span>` : ''}</div><div class="sub">${l._descripcion}</div></div>
          <span class="monto">${formatearDinero(l.totalPagado)}</span>
          <button type="button" class="boton boton-icono" data-accion="quitar-linea-entrada" data-i="${i}" aria-label="Quitar">${seguro(icono('cerrar', 'icono-sm'))}</button></li>`)}</ul>
    </div>
    <button type="button" class="boton boton-entrada boton-grande boton-bloque" data-accion="guardar-entrada">${seguro(icono('entrada'))}<span>Guardar entrada · ${formatearDinero(total)}</span></button>`.texto;
}

const accionesEntrada = {
  'menu-entrada': () => abrirMenuEntrada(),
  'quitar-producto-entrada': () => { entrada.producto = null; pintarProductoEntrada(); },
  'cancelar-nuevo': () => { entrada.nuevo = null; pintarProductoEntrada(); },
  'alternar-nivel': () => {
    entrada.conNivel = !entrada.conNivel;
    if (entrada.conNivel) { entrada.porSub = entrada.unidades; entrada.subEmpaque = entrada.empaque; entrada.empaque = 'caja'; entrada.unidades = 1; }
    else { entrada.unidades = factorEntrada(); }
    pintarProductoEntrada();
  },
  'usar-equivalencia': (b) => {
    const unidad = unidadBaseEntrada();
    entrada.conNivel = false;
    if (normalizarTexto(b.dataset.inferior) === normalizarTexto(unidad)) { entrada.empaque = b.dataset.nombre; entrada.unidades = Number(b.dataset.unidades); }
    else {
      // Equivalencia de dos niveles (caja = 6 cartones; cartón = 30 huevos).
      const inferior = Almacen.equivalenciasDe(entrada.producto.idProducto).find(e => normalizarTexto(e.nombre) === normalizarTexto(b.dataset.inferior) && normalizarTexto(e.nivelInferior) === normalizarTexto(unidad));
      entrada.empaque = b.dataset.nombre; entrada.unidades = Number(b.dataset.unidades);
      if (inferior) { entrada.conNivel = true; entrada.subEmpaque = inferior.nombre; entrada.porSub = inferior.unidades; }
    }
    if (entrada.producto && !entrada.totalEditado) entrada.costoEmp = redondearCentavo(multiplicarDinero(entrada.producto.costo, factorEntrada()));
    pintarProductoEntrada();
  },
  'sabor-entrada': (b) => { entrada.variante = normalizarIdentidad(entrada.variante) === normalizarIdentidad(b.dataset.sabor) ? '' : b.dataset.sabor; pintarProductoEntrada(); },
  'presentaciones-entrada': () => editarPresentaciones(entrada.producto, () => pintarProductoEntrada()),
  'agregar-entrada': () => {
    const error = validarNuevo(); if (error) { mostrarDialogo({ titulo: 'Falta un dato', mensaje: error }); return; }
    const l = lineaActualEntrada(); if (!l) { avisar('Indica cuánto compraste.'); return; }
    entrada.carrito.push(l);
    entrada.producto = null; entrada.nuevo = null;
    pintarProductoEntrada(); pintarCarritoEntrada();
    avisar('Agregado a la factura. Elige el siguiente producto.');
    entrada.selector.enfocar();
  },
  'quitar-linea-entrada': (b) => { entrada.carrito.splice(Number(b.dataset.i), 1); pintarCarritoEntrada(); pintarProductoEntrada(); },
  'vaciar-entrada': async () => { if (await confirmar({ titulo: '¿Vaciar la factura?', mensaje: 'Se quitan los productos que no has guardado.', textoConfirmar: 'Vaciar' })) { entrada.carrito = []; pintarCarritoEntrada(); pintarProductoEntrada(); } },
  'guardar-entrada': (b) => guardarEntradaUI(b)
};

async function guardarEntradaUI(boton) {
  const error = (entrada.producto || entrada.nuevo) ? validarNuevo() : '';
  if (error) { mostrarDialogo({ titulo: 'Falta un dato', mensaje: error }); return; }
  const actual = lineaActualEntrada();
  const lineas = entrada.carrito.concat(actual ? [actual] : []);
  if (!lineas.length) { avisar('Indica cuánto compraste.'); return; }
  let prep;
  try { prep = prepararEntrada({ lineas, fecha: entrada.fecha || obtenerFechaLocal() }); }
  catch (e) { mostrarDialogo({ titulo: 'Revisa la entrada', mensaje: e.message }); return; }
  const r = await ejecutarOperacion(operacionGuardarTicket(prep), { boton });
  if (!r) return;
  const folios = prep.filas.map(f => f.folio);
  entrada.carrito = []; entrada.producto = null; entrada.nuevo = null;
  refrescarEntrada();
  entrada.selector.refrescar();
  await mostrarResumen({
    titulo: 'Entrada guardada',
    total: formatearDinero(prep.resumen.total),
    detalle: `${formatearNumero(prep.resumen.unidades)} unidades en total${prep.resumen.nuevos ? ` · ${prep.resumen.nuevos} ${pluralizar(prep.resumen.nuevos, 'producto nuevo creado', 'productos nuevos creados')}` : ''} · ${prep.idTicket}`,
    lineas: prep.filas.map(f => {
      const p = Almacen.producto(f.idProducto);
      return { izquierda: `${f.productoNuevo ? '★ ' : ''}${nombreProducto(p, { conVariante: false })}: ${formatearNumero(f.cantidad)} ${pluralUnidad(p.unidadBase, f.cantidad)}${f.bonif ? ` + ${formatearNumero(f.bonif)} gratis` : ''}`, derecha: formatearDinero(f.inversion) };
    }),
    alDeshacer: async () => {
      const ok = await ejecutarOperacion(operacionAnular(folios));
      if (ok) avisar('Entrada deshecha: se anuló la factura.');
    }
  });
}

function abrirMenuEntrada() {
  const control = abrirHoja({
    titulo: 'Más opciones',
    contenido: html`<div class="lista">
      <button type="button" class="fila-lista" data-op="importar">${seguro(icono('subir'))}<div><div class="titulo">Importar desde Excel</div><div class="sub">Para cargar muchas compras o ventas de una vez</div></div></button>
      <button type="button" class="fila-lista" data-op="plantilla">${seguro(icono('descargar'))}<div><div class="titulo">Descargar plantilla de Excel</div><div class="sub">El formato que acepta la importación</div></div></button>
      <button type="button" class="fila-lista" data-op="limpiar">${seguro(icono('papelera'))}<div><div class="titulo">Limpiar formulario</div><div class="sub">Quita el producto y la factura sin guardar</div></div></button>
    </div>`,
    alMontar: (hoja) => {
      $('[data-op="importar"]', hoja).addEventListener('click', () => { control.cerrar(); elegirArchivoImportacion(); });
      $('[data-op="plantilla"]', hoja).addEventListener('click', () => { control.cerrar(); descargarPlantillaImportacion(); });
      $('[data-op="limpiar"]', hoja).addEventListener('click', () => { control.cerrar(); entrada.carrito = []; entrada.producto = null; entrada.nuevo = null; refrescarEntrada(); });
    }
  });
}
