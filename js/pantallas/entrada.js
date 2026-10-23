// © 2026 KoreStock Ledger — un proyecto de Kitsótaro · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// PANTALLA ENTRADA (T13) — estructura aprobada en V3 §13, §3.3, §12.4:
//   1. Mismo buscador que Venta; al final «+ Producto nuevo».
//   2. Producto existente: tarjeta de lectura (stock, último costo, precio).
//   3. Cantidad en frase: «Compré [12] [cartón] de [30] [huevos]»; «+ nivel»
//      para cajas de cartones. Debajo: «= 360 huevos». Las equivalencias
//      usadas se sugieren (§10.2). En modo Bodega: «Compré [12] [cajas]».
//   4. Modo RÁPIDO (por defecto, auditoría 2026-10-22): solo se elige entre
//      los empaques ya registrados del producto y el costo se muestra como
//      texto (último costo). Casilla «El costo cambió» para escribir el
//      total pagado. MODO EDITOR (casilla): frase libre con empaque nuevo
//      (exige su total exacto), costo, precio de venta y presentaciones.
//      Un nombre de empaque ya registrado no puede cambiar de tamaño.
//   5. Costo-beneficio: ganancia por unidad y por empaque; margen sobre el
//      costo («cuánto % gano sobre lo invertido», como la v2).
//   6. Bonificadas (gratis) y sabor colapsados.  7. Fecha, hora y folio arriba.
//   8. Guardar con varios productos pide confirmación; un costo $0 avisa.
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
  costoEmp: 0, costoEditado: false, total: 0, totalEditado: false, bonif: 0, precioNuevo: null, variante: '',
  editor: false, costoCambio: false,
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
        <div class="fila-folio">
          <label class="fila" for="entrada-fecha">${seguro(icono('calendario', 'icono-sm'))}<span class="solo-lector">Fecha</span>
            <span class="control"><input type="date" id="entrada-fecha"></span></label>
          <span class="fila t-pequeno t-secundario">${seguro(icono('reloj', 'icono-sm'))}<span class="cifra" data-reloj></span></span>
          <span id="entrada-folio" class="cifra"></span>
        </div>
        <div id="entrada-selector"></div>
        <div id="entrada-producto"></div>
        <div id="entrada-carrito"></div>
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
  entrada.subEmpaque = ''; entrada.porSub = 1; entrada.costoEmp = 0; entrada.costoEditado = false; entrada.total = 0; entrada.totalEditado = false;
  entrada.bonif = 0; entrada.precioNuevo = null; entrada.variante = ''; entrada.editor = false; entrada.costoCambio = false;
}

function elegirProductoEntrada(p) {
  entrada.producto = p; entrada.nuevo = null;
  reiniciarCantidades(p.unidadBase);
  // Sugerencia: el empaque registrado usado más recientemente con este producto.
  const ops = enModoBodega() ? [] : empaquesRegistrados(p);
  if (ops.length > 1) aplicarEmpaque(ops[1]);
  pintarProductoEntrada();
  setTimeout(() => { const c = $('#entrada-cant', entrada.el); if (c) { c.focus(); c.select(); } }, 50);
}

function empezarProductoNuevo(texto) {
  entrada.producto = null;
  const u = Almacen.umbral('TODOS') || { min: 4, max: 6 };
  entrada.nuevo = { marca: '', linea: texto || '', presentacion: '', volumen: '', unidadBase: '', tipoEmpaque: '', categoria: '', umbralMin: u.min, umbralMax: u.max, decimales: false, precio: 0 };
  reiniciarCantidades('');
  entrada.editor = true; // producto nuevo: todo se escribe
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
// Costo de UN empaque: lo escrito, o el último costo por unidad × unidades del empaque.
function costoEmpaqueEntrada() {
  if (entrada.costoEditado || !entrada.producto) return entrada.costoEmp;
  return multiplicarDinero(entrada.producto.costo, factorEntrada());
}
// El total pagado es el dato: lo escrito, o costo del empaque × cuántos.
function totalPagadoEntrada() {
  if (entrada.totalEditado) return redondearCentavo(entrada.total);
  return redondearCentavo(multiplicarDinero(costoEmpaqueEntrada(), entrada.cantEmp));
}
// Margen sobre el costo: cuánto % se gana sobre lo invertido (como la v2).
function margenSobreCosto(ganUnidad, costoUnidad) { return costoUnidad > 0 ? porcentajeDe(ganUnidad, costoUnidad) : 0; }

// Empaques registrados del producto (propios o generales): «caja de 12
// latas», «caja de 6 cartones de 30 huevos». En modo rápido solo se elige
// entre estos (auditoría: no inventar tamaños al registrar).
function empaquesRegistrados(p) {
  const unidad = normalizarTexto(p.unidadBase);
  const eqs = Almacen.equivalenciasDe(p.idProducto).filter(e => (e.idProducto === p.idProducto || !e.idProducto) && e.unidades > 0);
  const directos = eqs.filter(e => normalizarTexto(e.nivelInferior) === unidad && e.unidades > 1);
  const opciones = [{ clave: 'u', etiqueta: p.unidadBase, empaque: p.unidadBase, unidades: 1, conNivel: false }];
  directos.forEach(e => opciones.push({ clave: `d|${normalizarTexto(e.nombre)}|${e.unidades}`, etiqueta: `${e.nombre} de ${formatearNumero(e.unidades)} ${pluralUnidad(p.unidadBase, e.unidades)}`, empaque: e.nombre, unidades: e.unidades, conNivel: false }));
  eqs.filter(e => normalizarTexto(e.nivelInferior) !== unidad).forEach(e => {
    const inf = directos.find(d => normalizarTexto(d.nombre) === normalizarTexto(e.nivelInferior));
    if (inf) opciones.push({ clave: `n|${normalizarTexto(e.nombre)}|${e.unidades}|${normalizarTexto(inf.nombre)}|${inf.unidades}`,
      etiqueta: `${e.nombre} de ${formatearNumero(e.unidades)} ${pluralUnidad(inf.nombre, e.unidades)} de ${formatearNumero(inf.unidades)} ${pluralUnidad(p.unidadBase, inf.unidades)}`,
      empaque: e.nombre, unidades: e.unidades, conNivel: true, subEmpaque: inf.nombre, porSub: inf.unidades });
  });
  return opciones.filter((o, i, a) => a.findIndex(x => x.clave === o.clave) === i);
}
function claveEmpaqueEntrada() {
  if (factorEntrada() === 1) return 'u';
  return entrada.conNivel ? `n|${normalizarTexto(entrada.empaque)}|${entrada.unidades}|${normalizarTexto(entrada.subEmpaque)}|${entrada.porSub}` : `d|${normalizarTexto(entrada.empaque)}|${entrada.unidades}`;
}
function aplicarEmpaque(o) {
  entrada.empaque = o.empaque; entrada.unidades = o.unidades; entrada.conNivel = !!o.conNivel;
  entrada.subEmpaque = o.subEmpaque || ''; entrada.porSub = o.porSub || 1;
  entrada.costoEditado = false; entrada.totalEditado = false;
}
// ¿El empaque de la frase ya está registrado para este producto?
function empaqueRegistradoEntrada() {
  if (!entrada.producto) return true;
  return empaquesRegistrados(entrada.producto).some(o => o.clave === claveEmpaqueEntrada());
}

// Reglas del empaque escrito (modo editor y producto nuevo). Devuelve un texto de error o ''.
function validarEmpaqueEntrada() {
  if (enModoBodega()) return '';
  const unidad = unidadBaseEntrada();
  const factor = factorEntrada();
  const nombre = entrada.empaque.trim();
  const esUnidad = !nombre || normalizarTexto(nombre) === normalizarTexto(unidad);
  if (esUnidad) return entrada.conNivel ? 'Escribe el nombre del empaque mayor.' : '';
  if (entrada.conNivel) {
    if (!entrada.subEmpaque.trim()) return 'Escribe qué empaque viene adentro.';
    if (normalizarTexto(entrada.subEmpaque) === normalizarTexto(nombre)) return 'El empaque mayor y el de adentro deben tener nombres distintos.';
    if (normalizarTexto(entrada.subEmpaque) === normalizarTexto(unidad)) return `El empaque de adentro no puede llamarse igual que la unidad (${unidad}).`;
    if (!(entrada.unidades >= 1) || !(entrada.porSub > 1)) return 'Indica cuántos empaques trae el mayor y cuántas unidades trae cada uno.';
  } else if (!(factor > 1)) return `Un empaque debe traer más de una unidad. Si compraste por ${unidad}, elige «${unidad}».`;
  // Un nombre ya registrado no cambia de tamaño (rompería las equivalencias).
  if (entrada.producto) {
    const choque = (nom, unidades, inferior) => Almacen.equivalenciasDe(entrada.producto.idProducto)
      .find(e => (e.idProducto === entrada.producto.idProducto || !e.idProducto) && normalizarTexto(e.nombre) === normalizarTexto(nom) && normalizarTexto(e.nivelInferior) === normalizarTexto(inferior) && e.unidades !== unidades);
    const c = entrada.conNivel ? (choque(nombre, entrada.unidades, entrada.subEmpaque) || choque(entrada.subEmpaque, entrada.porSub, unidad)) : choque(nombre, factor, unidad);
    if (c) return `Este producto ya tiene «${c.nombre}» de ${formatearNumero(c.unidades)} ${pluralUnidad(c.nivelInferior, c.unidades)}. Para otro tamaño usa otro nombre (por ejemplo «${c.nombre} ${formatearNumero(entrada.conNivel ? entrada.unidades : factor)}»).`;
    // Un empaque nuevo se registra con su precio exacto.
    if (!empaqueRegistradoEntrada() && !(entrada.totalEditado && entrada.total > 0)) return 'Es un empaque nuevo para este producto: escribe el total exacto que pagaste en «Total pagado».';
  }
  return '';
}
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
      <span class="franja info-color">${seguro(icono('info', 'icono-sm'))}Estás creando un producto que no existe en tu catálogo. Al guardar la entrada quedará registrado y marcado como «Nuevo».</span>
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
  const margen = margenSobreCosto(ganUnidad, costoUnidad);
  const editor = entrada.editor || !!n;
  const empaqueEsUnidad = factor === 1 && (normalizarTexto(entrada.empaque) === normalizarTexto(unidad) || !entrada.empaque.trim());
  const nombreEmp = entrada.empaque.trim() || unidad;
  const cambiaPrecio = p && entrada.precioNuevo !== null && entrada.precioNuevo !== p.precio;
  const variantes = p ? Almacen.variantesDe(p.idProducto) : [];
  const opciones = p && !enModoBodega() ? empaquesRegistrados(p) : [];
  const claveActual = claveEmpaqueEntrada();
  const listaEmpaques = [unidad].concat(Almacen.hojas.EQUIVALENCIAS.map(e => e.nombre)).filter((v, i, a) => v && a.findIndex(x => normalizarTexto(x) === normalizarTexto(v)) === i);
  const error = editor ? validarEmpaqueEntrada() : '';

  // Frase libre (modo editor o producto nuevo).
  const fraseLibre = html`
      <div class="frase" aria-label="Cantidad comprada">
        <span>Compré</span>
        <span class="control"><input id="entrada-cant" value="${formatearNumero(entrada.cantEmp).replace(/,/g, '')}" aria-label="Cuántos"></span>
        ${enModoBodega()
          ? html`<span class="t-fuerte">${pluralUnidad(unidad, entrada.cantEmp)}</span>`
          : html`<span class="control ancho"><input id="entrada-empaque" value="${nombreEmp}" list="lista-empaques-entrada" aria-label="Empaque" autocomplete="off"></span>
            ${empaqueEsUnidad && !entrada.conNivel ? '' : html`<span>de</span>
              ${entrada.conNivel
                ? html`<span class="control"><input id="entrada-por-sub" value="${entrada.unidades}" aria-label="Cuántos empaques trae"></span>
                  <span class="control ancho"><input id="entrada-sub" value="${entrada.subEmpaque}" placeholder="empaque de adentro" aria-label="Empaque de adentro" list="lista-empaques-entrada"></span>
                  <span>de</span><span class="control"><input id="entrada-por-unidad" value="${entrada.porSub}" aria-label="Unidades por empaque de adentro"></span>`
                : html`<span class="control"><input id="entrada-por" value="${entrada.unidades}" aria-label="Unidades por empaque"></span>`}
              <span class="t-fuerte">${pluralUnidad(unidad, 2)}</span>`}`}
        ${datalist('lista-empaques-entrada', listaEmpaques)}
      </div>
      ${!enModoBodega() && !empaqueEsUnidad ? html`<button type="button" class="boton boton-texto boton-sm" data-accion="alternar-nivel" style="justify-self:start">${seguro(icono(entrada.conNivel ? 'menos' : 'mas', 'icono-sm'))}${entrada.conNivel ? `Quitar el empaque de adentro` : `Cada ${nombreEmp.toLowerCase()} trae otros empaques adentro`}</button>` : ''}`;

  // Modo rápido: solo los empaques registrados.
  const fraseRapida = html`
      <div class="frase" aria-label="Cantidad comprada">
        <span>Compré</span>
        <span class="control"><input id="entrada-cant" value="${formatearNumero(entrada.cantEmp).replace(/,/g, '')}" aria-label="Cuántos"></span>
        <span class="t-fuerte">${opciones.length <= 1 || claveActual === 'u' ? pluralUnidad(unidad, entrada.cantEmp) : pluralUnidad(nombreEmp, entrada.cantEmp)}</span>
      </div>
      ${opciones.length > 1 ? html`<div class="fila-chips" role="group" aria-label="Empaque">${opciones.map(o => html`<button type="button" class="chip" data-accion="elegir-empaque" data-clave="${o.clave}" aria-pressed="${String(o.clave === claveActual)}">${o.etiqueta}</button>`)}</div>` : ''}
      ${opciones.length <= 1 && !enModoBodega() ? html`<p class="t-pequeno t-secundario">Este producto aún no tiene empaques registrados. Para comprar por caja, fardo u otro empaque, activa «Modo editor».</p>` : ''}`;

  // Costo: texto en modo rápido (último costo), campos en modo editor o si cambió.
  const costoEditable = editor || entrada.costoCambio;
  const bloqueCosto = costoEditable ? html`
      <div class="rejilla-campos">
        <div class="campo"><label for="entrada-costo">Costo por ${nombreEmp}</label>
          <div class="control"><span class="prefijo">$</span><input id="entrada-costo" value="${valorCampoDinero(costoEmpaqueEntrada(), 5)}"></div></div>
        <div class="campo"><label for="entrada-total">Total pagado</label>
          <div class="control total-pagado"><span class="prefijo">$</span><input id="entrada-total" value="${entrada.totalEditado || !p ? valorCampoDinero(total) : ''}" placeholder="${valorCampoDinero(total)}"></div></div>
      </div>` : html`
      <div class="dato"><span>Costo (último)</span><strong class="cifra">${formatearDinero(costoEmpaqueEntrada(), { detalle: true })} por ${nombreEmp} · total ${formatearDinero(total)}</strong></div>`;

  cont.innerHTML = html`
    ${p ? html`<div class="tarjeta tarjeta-producto">
      <div class="fila-separada"><span class="nombre">${nombreProducto(p, { conVariante: false })}</span>
        <button type="button" class="boton boton-icono" data-accion="quitar-producto-entrada" aria-label="Quitar producto">${seguro(icono('cerrar', 'icono-sm'))}</button></div>
      <div class="dato"><span>En bodega</span><strong>${describirCantidad(p.idProducto, Almacen.stock(p.idProducto))}</strong></div>
      <div class="dato"><span>Último costo</span><strong class="cifra">${formatearDinero(p.costo, { detalle: true })} por ${p.unidadBase}</strong></div>
      <div class="dato"><span>Precio de venta</span><strong class="cifra">${formatearDinero(p.precio)} por ${p.unidadBase}</strong></div>
      <label class="casilla t-pequeno"><input type="checkbox" data-accion="modo-editor" ${entrada.editor ? 'checked' : ''}> Modo editor: empaque nuevo, costo o precio de venta</label>
    </div>` : seguro(formularioNuevo().texto)}

    <div class="tarjeta columna">
      ${editor ? fraseLibre : fraseRapida}
      <p class="t-grande t-fuerte entrada-total-unidades">= ${formatearNumero(unidades)} ${pluralUnidad(unidad, unidades)}</p>
      ${p && editor && !enModoBodega() && !empaqueRegistradoEntrada() ? html`<span class="franja info-color">${seguro(icono('info', 'icono-sm'))}Empaque nuevo para este producto: al guardar queda registrado con este tamaño.</span>` : ''}
      ${error ? html`<span class="franja aviso-color" id="entrada-error">${seguro(icono('advertencia', 'icono-sm'))}${error}</span>` : ''}

      ${bloqueCosto}
      ${p && !editor ? html`<label class="casilla t-pequeno"><input type="checkbox" data-accion="costo-cambio" ${entrada.costoCambio ? 'checked' : ''}> El costo cambió en esta compra</label>` : ''}
      <div class="calculo" id="entrada-calculo">
        <span>≈ <strong>${formatearDinero(costoUnidad, { detalle: true })}</strong> por ${unidad}</span>
        ${precio > 0 ? html`<span class="${ganUnidad < 0 ? 't-peligro' : ''}">Ganancia por ${unidad}: <strong>${formatearDinero(ganUnidad, { detalle: true })}</strong>${factor > 1 ? html` · por ${nombreEmp}: <strong>${formatearDinero(multiplicarDinero(ganUnidad, factor))}</strong>` : ''} · Margen sobre costo <strong>${margen.toFixed(1)}%</strong></span>` : html`<span class="t-tenue">Pon un precio de venta para ver la ganancia.</span>`}
      </div>

      ${editor ? html`<div class="columna">
          <div class="campo"><label for="entrada-precio">Precio de venta por ${unidad}</label>
            <div class="control ${cambiaPrecio ? 'precio-cambiado' : ''}"><span class="prefijo">$</span><input id="entrada-precio" value="${valorCampoDinero(precio)}"></div>
            ${cambiaPrecio ? html`<span class="franja aviso-color">${seguro(icono('advertencia', 'icono-sm'))}Cambiará el precio de venta de ${formatearDinero(p.precio)} a ${formatearDinero(entrada.precioNuevo)}. Aplica a ventas nuevas.</span>` : ''}</div>
          ${p ? html`<button type="button" class="boton boton-texto boton-sm" data-accion="presentaciones-entrada" data-solo-modo="tienda pro" style="justify-self:start">${seguro(icono('precio', 'icono-sm'))}Precios por presentación (${pluralUnidad(unidad, 2)} juntos)</button>` : ''}
        </div>` : ''}
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
    ${entrada.carrito.length ? '' : html`<button type="button" class="boton boton-entrada boton-grande boton-bloque" data-accion="guardar-entrada">${seguro(icono('entrada'))}<span>Guardar entrada · ${formatearDinero(total)}</span></button>`}`.texto;
  pintarIconos(cont);
  conectarCamposEntrada(cont);
}

function conectarCamposEntrada(cont) {
  const num = (id, dec, fn) => { const i = $(id, cont); if (!i) return; prepararCampoNumerico(i, { decimales: dec }); i.addEventListener('input', () => { fn(i); actualizarCalculoEntrada(); }); i.addEventListener('change', () => pintarProductoEntrada()); i.addEventListener('focus', () => i.select()); };
  const decCant = (entrada.producto ? entrada.producto.decimales : (entrada.nuevo && entrada.nuevo.decimales)) ? 3 : 0;
  num('#entrada-cant', decCant, (i) => { entrada.cantEmp = leerCantidad(i); });
  num('#entrada-por', 0, (i) => { entrada.unidades = leerCantidad(i) || 1; });
  num('#entrada-por-sub', 0, (i) => { entrada.unidades = leerCantidad(i) || 1; });
  num('#entrada-por-unidad', 0, (i) => { entrada.porSub = leerCantidad(i) || 1; });
  num('#entrada-costo', 5, (i) => { entrada.costoEmp = leerDineroCampo(i); entrada.costoEditado = true; entrada.totalEditado = false; });
  num('#entrada-total', 2, (i) => {
    const v = i.value.trim();
    entrada.totalEditado = v !== '';
    entrada.total = entrada.totalEditado ? leerDineroCampo(i) : 0;
    if (entrada.totalEditado && entrada.cantEmp > 0) { entrada.costoEmp = dividirDinero(entrada.total, entrada.cantEmp); entrada.costoEditado = true; }
  });
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
  const inTotal = $('#entrada-total', cont); if (inTotal && document.activeElement !== inTotal) { if (entrada.totalEditado) inTotal.value = valorCampoDinero(total); else inTotal.placeholder = valorCampoDinero(total); }
  const inCosto = $('#entrada-costo', cont); if (inCosto && document.activeElement !== inCosto) inCosto.value = valorCampoDinero(costoEmpaqueEntrada(), 5);
  const calc = $('#entrada-calculo', cont);
  if (calc) calc.innerHTML = html`<span>≈ <strong>${formatearDinero(costoUnidad, { detalle: true })}</strong> por ${unidad}</span>
    ${precio > 0 ? html`<span class="${ganUnidad < 0 ? 't-peligro' : ''}">Ganancia por ${unidad}: <strong>${formatearDinero(ganUnidad, { detalle: true })}</strong>${factor > 1 ? html` · por empaque: <strong>${formatearDinero(multiplicarDinero(ganUnidad, factor))}</strong>` : ''} · Margen sobre costo <strong>${margenSobreCosto(ganUnidad, costoUnidad).toFixed(1)}%</strong></span>` : ''}`.texto;
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
  if (entrada.producto || entrada.nuevo) { const e = validarEmpaqueEntrada(); if (e && (entrada.editor || entrada.nuevo)) return e; }
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
    // «Cada caja trae otros empaques adentro»: el empaque actual pasa a ser
    // el de adentro y el mayor queda por escribir (sin nombres inventados).
    entrada.conNivel = !entrada.conNivel;
    if (entrada.conNivel) { entrada.porSub = entrada.unidades; entrada.subEmpaque = entrada.empaque; entrada.empaque = ''; entrada.unidades = 2; }
    else { entrada.empaque = entrada.subEmpaque; entrada.unidades = entrada.porSub; entrada.subEmpaque = ''; entrada.porSub = 1; }
    entrada.costoEditado = false;
    pintarProductoEntrada();
    setTimeout(() => { const c = $('#entrada-empaque', entrada.el); if (c && entrada.conNivel) c.focus(); }, 50);
  },
  'elegir-empaque': (b) => {
    const o = empaquesRegistrados(entrada.producto).find(x => x.clave === b.dataset.clave);
    if (o) { aplicarEmpaque(o); pintarProductoEntrada(); }
  },
  'modo-editor': (b) => { entrada.editor = b.checked; if (!b.checked) { const ops = empaquesRegistrados(entrada.producto); if (!ops.some(o => o.clave === claveEmpaqueEntrada())) aplicarEmpaque(ops[0]); entrada.precioNuevo = null; } pintarProductoEntrada(); },
  'costo-cambio': (b) => { entrada.costoCambio = b.checked; if (!b.checked) { entrada.totalEditado = false; entrada.costoEditado = false; } pintarProductoEntrada(); if (b.checked) setTimeout(() => { const t = $('#entrada-total', entrada.el); if (t) t.focus(); }, 50); },
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
  // Con varios productos (o algún costo $0) se confirma antes: el botón se puede tocar por error.
  const enCero = lineas.filter(l => !(l.totalPagado > 0));
  if (lineas.length > 1 || enCero.length) {
    const totalTodo = sumarDinero(lineas.map(l => l.totalPagado));
    const ok = await confirmar({
      titulo: lineas.length > 1 ? `¿Guardar la entrada de ${lineas.length} productos?` : '¿Guardar esta entrada?',
      mensaje: `${lineas.map(l => `${l._nombre}: ${l._descripcion} · ${formatearDinero(l.totalPagado)}`).join('\n')}\n\nTotal: ${formatearDinero(totalTodo)}${enCero.length ? `\n\nOjo: ${enCero.length === 1 ? 'un producto va' : `${enCero.length} productos van`} con costo $0.00. Si fue regalo, usa «Bonificadas»; si no, revisa el total pagado.` : ''}`,
      textoConfirmar: 'Guardar', peligro: enCero.length > 0
    });
    if (!ok) return;
  }
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
