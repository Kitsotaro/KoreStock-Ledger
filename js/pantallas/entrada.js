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
  editor: false, costoCambio: false, porUnidad: false, masDatos: false,
  empaqueLibre: false, verMayoreo: false,
  carrito: [], fecha: ''
};

registrarPantalla('entrada', {
  titulo: 'Entrada',
  montar(el) {
    entrada.el = el;
    el.innerHTML = html`
      <div class="registro registro-entrada">
        <div class="fila-folio">
          <label class="fila" for="entrada-fecha">${seguro(icono('calendario', 'icono-sm'))}<span class="solo-lector">Fecha</span>
            <span class="control"><input type="date" id="entrada-fecha"></span></label>
          <span class="fila t-pequeno t-secundario">${seguro(icono('reloj', 'icono-sm'))}<span class="cifra" data-reloj></span></span>
          <span id="entrada-folio" class="cifra"></span>
          <button type="button" class="boton boton-icono" data-accion="menu-entrada" aria-label="Más opciones" title="Registra lo que compraste como lo compraste.">${seguro(icono('mas-opciones'))}</button>
        </div>
        <div id="entrada-selector"></div>
        <div id="entrada-producto"></div>
        <div id="entrada-carrito"></div>
        <div id="entrada-pie" class="pie-registro"></div>
      </div>`.texto;
    entrada.selector = crearSelectorProducto({
      contenedor: $('#entrada-selector', el), conCinta: true, tipoSugeridos: 'ENTRADA', permitirNuevo: true, placeholder: 'Buscar producto o agregar uno nuevo',
      alElegir: (p) => elegirProductoEntrada(p),
      alNuevo: (texto) => empezarProductoNuevo(texto)
    });
    const fecha = $('#entrada-fecha', el);
    fecha.value = obtenerFechaLocal();
    fecha.max = obtenerFechaLocal();
    fecha.addEventListener('change', () => { entrada.fecha = fecha.value || obtenerFechaLocal(); });
    delegar(el, 'click', accionesEntrada);
    anclarBotonPrincipal(el, '[data-accion="guardar-entrada"]', 'boton-entrada');
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


function refrescarEntrada() {
  if (!entrada.el) return;
  if (entrada.producto) entrada.producto = Almacen.producto(entrada.producto.idProducto);
  pintarProductoEntrada();
  pintarCarritoEntrada();
  $('#entrada-folio', entrada.el).textContent = `Folio ${Almacen.verFolioSiguiente('IN-')}`;
}

function reiniciarCantidades(unidadBase) {
  entrada.cantEmp = 0; entrada.empaque = unidadBase || ''; entrada.unidades = 1; entrada.conNivel = false;
  entrada.subEmpaque = ''; entrada.porSub = 1; entrada.costoEmp = 0; entrada.costoEditado = false; entrada.total = 0; entrada.totalEditado = false;
  entrada.bonif = 0; entrada.precioNuevo = null; entrada.variante = ''; entrada.editor = false; entrada.costoCambio = false;
  // Modos (Kitso 2026-10-23): Tienda asume compra por unidad; Bodega y Pro, por empaque. Siempre se puede cambiar.
  entrada.porUnidad = Shell.modo === 'tienda';
  // «Libre»: los campos del empaque se escriben (producto sin empaque registrado). Tienda solo ve unidades hasta pedir el mayoreo.
  entrada.empaqueLibre = false; entrada.verMayoreo = false;
}

function elegirProductoEntrada(p) {
  entrada.producto = p; entrada.nuevo = null;
  reiniciarCantidades(p.unidadBase);
  // Sugerencia: el empaque registrado usado más recientemente con este producto.
  const ops = empaquesRegistrados(p);
  if (ops.length > 1) aplicarEmpaque(ops[1]);
  else if (Shell.modo === 'bodega') { entrada.empaque = ''; entrada.unidades = 0; entrada.empaqueLibre = true; }
  pintarProductoEntrada();
  setTimeout(() => { const c = $('#entrada-cant', entrada.el); if (c) c.focus(); }, 50);
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
  if (normalizarTexto(entrada.empaque) === normalizarTexto(unidadBaseEntrada()) || !entrada.empaque.trim()) return 1;
  return entrada.conNivel ? redondearCantidad(entrada.unidades * entrada.porSub) : entrada.unidades;
}
// Unidad de compra: el empaque (caja de 12) o la unidad suelta (lata). El
// empaque se registra siempre aunque se compren unidades sueltas, para
// llevar el control de mayoreo sin datos extra.
function compraPorUnidad() { return entrada.porUnidad || factorEntrada() === 1; }
function factorCompra() { return compraPorUnidad() ? 1 : factorEntrada(); }
function nombreCompra() { return compraPorUnidad() ? unidadBaseEntrada() : (entrada.empaque.trim() || unidadBaseEntrada()); }
function unidadesTotalesEntrada() { return redondearCantidad(entrada.cantEmp * factorCompra()); }
// Costo de UNA unidad de compra: lo escrito, o el último costo por unidad × su tamaño.
function costoEmpaqueEntrada() {
  if (entrada.costoEditado || !entrada.producto) return entrada.costoEmp;
  return multiplicarDinero(entrada.producto.costo, factorCompra());
}
// El total pagado es el dato: lo escrito, o costo del empaque × cuántos.
function totalPagadoEntrada() {
  if (entrada.totalEditado) return redondearCentavo(entrada.total);
  return redondearCentavo(multiplicarDinero(costoEmpaqueEntrada(), entrada.cantEmp));
}
// Cambio importante (botón «Guardar» en naranja): producto nuevo, costo distinto o empaque nuevo.
function cambioImportanteEntrada() {
  const actual = !!entrada.nuevo || entrada.costoCambio || (!!entrada.producto && !empaqueRegistradoEntrada()) || (entrada.precioNuevo !== null && entrada.producto && entrada.precioNuevo !== entrada.producto.precio);
  return actual || entrada.carrito.some(l => l._importante);
}
// Verde si gana, rojo si pierde (solo la cifra, no el texto).
const claseSigno = (v) => (v > 0 ? 't-exito' : v < 0 ? 't-peligro' : '');
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
  // Solo es «la unidad» si el empaque se llama como la unidad: «sixpack» de 1 (o sin
  // número todavía) es otro empaque y cuenta como cambio importante (Kitso 2026-10-23).
  if (!entrada.empaque.trim() || normalizarTexto(entrada.empaque) === normalizarTexto(unidadBaseEntrada())) return 'u';
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
  const unidad = unidadBaseEntrada();
  const factor = factorEntrada();
  const nombre = entrada.empaque.trim();
  if (!nombre) return entrada.conNivel ? `Escribe el empaque mayor (el que trae ${pluralUnidad((entrada.subEmpaque || 'empaque').toLowerCase(), 2)} adentro) o vuelve a un solo empaque.` : `Elige el tipo de compra: por ${unidad} o por mayoreo (caja, fardo…).`;
  const esUnidad = normalizarTexto(nombre) === normalizarTexto(unidad);
  if (esUnidad && Shell.modo === 'bodega') return `En Bodega se compra por mayoreo: elige el empaque (caja, fardo…) y cuántas ${pluralUnidad(unidad, 2)} trae.`;
  if (esUnidad) return entrada.conNivel ? 'Escribe el nombre del empaque mayor.' : '';
  if (entrada.conNivel) {
    if (!entrada.subEmpaque.trim()) return 'Escribe qué empaque viene adentro.';
    if (normalizarTexto(entrada.subEmpaque) === normalizarTexto(nombre)) return 'El empaque mayor y el de adentro deben tener nombres distintos.';
    if (normalizarTexto(entrada.subEmpaque) === normalizarTexto(unidad)) return `El empaque de adentro no puede llamarse igual que la unidad (${unidad}).`;
    if (!(entrada.unidades >= 1) || !(entrada.porSub > 1)) return 'Indica cuántos empaques trae el mayor y cuántas unidades trae cada uno.';
  } else if (!(factor > 1)) return entrada.unidades > 1 || !entrada.unidades
    ? `Escribe cuántas ${pluralUnidad(unidad, 2)} trae cada ${nombre.toLowerCase()}. Si compraste por ${unidad}, elige «${unidad}» (por unidad).`
    : `Un empaque debe traer más de una unidad. Si compraste por ${unidad}, elige «${unidad}» (por unidad).`;
  // Un nombre ya registrado no cambia de tamaño (rompería las equivalencias).
  if (entrada.producto) {
    const choque = (nom, unidades, inferior) => Almacen.equivalenciasDe(entrada.producto.idProducto)
      .find(e => (e.idProducto === entrada.producto.idProducto || !e.idProducto) && normalizarTexto(e.nombre) === normalizarTexto(nom) && normalizarTexto(e.nivelInferior) === normalizarTexto(inferior) && e.unidades !== unidades);
    const c = entrada.conNivel ? (choque(nombre, entrada.unidades, entrada.subEmpaque) || choque(entrada.subEmpaque, entrada.porSub, unidad)) : choque(nombre, factor, unidad);
    if (c) return `Este producto ya tiene «${c.nombre}» de ${formatearNumero(c.unidades)} ${pluralUnidad(c.nivelInferior, c.unidades)}. Para otro tamaño usa otro nombre (por ejemplo «${c.nombre} ${formatearNumero(entrada.conNivel ? entrada.unidades : factor)}»).`;
    // Un empaque nuevo se registra con su precio exacto.
    if (!empaqueRegistradoEntrada() && !(entrada.costoEditado && entrada.costoEmp > 0)) return `Es un empaque nuevo para este producto: escribe cuánto te costó cada ${nombreCompra()}.`;
  }
  return '';
}
function precioVentaEntrada() {
  if (entrada.precioNuevo !== null) return entrada.precioNuevo;
  if (entrada.producto) return entrada.producto.precio;
  return (entrada.nuevo && entrada.nuevo.precio) || 0;
}

// Cifras de la tarjeta del producto según el modo (Kitso 2026-10-24): Bodega pone el
// mayoreo grande y la unidad chica; Tienda solo unidades; Pro, ambas en una línea.
// Solo presentación: no calculan nada nuevo.
function stockPorModoHTML(p, unidades, emp) {
  const eq = Almacen.empaqueMayor(p.idProducto);
  // El empaque en uso (el elegido o el habitual); si no hay, el mayor del producto.
  const f = emp ? (emp.conNivel ? emp.unidades * emp.porSub : emp.unidades) : (eq ? eq.unidades : 0);
  const nombre = emp ? emp.empaque : (eq ? eq.nombre : '');
  const base = `${formatearNumero(unidades)} ${pluralUnidad(p.unidadBase, unidades)}`;
  if (Shell.modo === 'tienda') {
    // Unidades en grande y, debajo, cuántos empaques son (solo informativo).
    if (f > 1 && unidades >= f) { const n = Math.floor(unidades / f); return html`<span class="mayor"><strong>${base}</strong><small>≈ ${formatearNumero(n)} ${pluralUnidad(nombre.toLowerCase(), n)}</small></span>`.texto; }
    return html`<strong class="cifra">${base}</strong>`.texto;
  }
  if (Shell.modo === 'bodega' && f > 1 && unidades >= f) {
    const n = Math.floor(unidades / f);
    return html`<span class="mayor"><strong>${formatearNumero(n)} ${pluralUnidad(nombre.toLowerCase(), n)}</strong><small>${base}</small></span>`.texto;
  }
  return html`<strong>${describirCantidad(p.idProducto, unidades)}</strong>`.texto;
}
function dineroPorModoHTML(valorUnidad, p, emp, detalle) {
  const u = `${formatearDinero(valorUnidad, { detalle })}/${p.unidadBase}`;
  const f = emp ? (emp.conNivel ? emp.unidades * emp.porSub : emp.unidades) : 1;
  if (f <= 1) return html`<strong class="cifra">${u}</strong>`.texto;
  const caja = `${formatearDinero(multiplicarDinero(valorUnidad, f))}/${emp.empaque.toLowerCase()}`;
  if (Shell.modo === 'tienda') return html`<span class="mayor"><strong class="cifra">${u}</strong><small>${caja}</small></span>`.texto;
  if (Shell.modo === 'bodega') return html`<span class="mayor"><strong class="cifra">${caja}</strong><small>${u}</small></span>`.texto;
  return html`<strong class="cifra">${u} · ${caja}</strong>`.texto;
}
// «4 cajas × 6 cartones × 30 huevos = 720 huevos»: cómo se cuenta la compra, en una línea.
function textoTotalEntrada() {
  const unidad = unidadBaseEntrada(), unidades = unidadesTotalesEntrada();
  const total = `${formatearNumero(unidades)} ${pluralUnidad(unidad, unidades)}`;
  const fc = factorCompra();
  if (!(fc > 1)) return `= ${total}`;
  const cant = formatearNumero(entrada.cantEmp), nombre = pluralUnidad((entrada.empaque || unidad).toLowerCase(), entrada.cantEmp);
  if (entrada.conNivel && !entrada.porUnidad) {
    const sub = (entrada.subEmpaque || 'empaque').toLowerCase();
    return `${cant} ${nombre} × ${formatearNumero(entrada.unidades)} ${pluralUnidad(sub, entrada.unidades)} × ${formatearNumero(entrada.porSub)} ${pluralUnidad(unidad, entrada.porSub)} = ${total}`;
  }
  return `${cant} ${nombre} × ${formatearNumero(fc)} ${pluralUnidad(unidad, fc)} = ${total}`;
}

// Lista del campo «Empaque» con dos grupos: la unidad (compra individual) y los
// empaques (compra por mayor, que pide cuántas unidades trae).
function datalistEmpaques(unidad, valores) {
  const mayor = valores.filter(v => normalizarTexto(v) !== normalizarTexto(unidad));
  // En Bodega (mayoreo) no se ofrece la unidad suelta.
  return html`<datalist id="lista-empaques-entrada">${Shell.modo === 'bodega' ? '' : html`<option value="${unidad}" data-grupo="Por unidad"></option>`}${mayor.map(v => html`<option value="${v.toLowerCase()}" data-grupo="Por mayoreo"></option>`)}</datalist>`;
}
function datalist(id, valores) {
  return html`<datalist id="${id}">${valores.map(v => html`<option value="${v}"></option>`)}</datalist>`;
}
const valoresUnicos = (campo, filtro) => {
  const m = new Map();
  Almacen.productosVisibles().filter(filtro || (() => true)).forEach(p => { if (p[campo]) m.set(normalizarIdentidad(p[campo]), p[campo]); });
  return [...m.values()].sort((a, b) => a.localeCompare(b, 'es'));
};
// Contenidos: orden alfabético natural («30 g» antes que «355 ml»); los que son
// solo un número (sin magnitud) van al final para premiar escribir la unidad.
const ordenarContenidos = (lista) => lista.slice().sort((a, b) => {
  const na = /^\s*[\d.,]+\s*$/.test(a), nb = /^\s*[\d.,]+\s*$/.test(b);
  if (na !== nb) return na ? 1 : -1;
  return a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' });
});
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
        ${campo('nuevo-volumen', 'Contenido', n.volumen, { lista: 'lista-volumenes', placeholder: '500 ml, 30 g, grande', ayuda: 'El tamaño de una unidad, no cuántas trae la caja.', campoCat: 'volumen' })}
      </div>
      ${campo('nuevo-empaque', 'Tipo de empaque', n.tipoEmpaque, { lista: 'lista-empaques', obligatorio: true, placeholder: 'Caja, fardo, bolsa', campoCat: 'tipoEmpaque', ayuda: 'Cómo te llega o lo guardas en bodega.' })}
      ${campo('nuevo-unidad', '¿Cómo lo cuentas al vender?', n.unidadBase, { lista: 'lista-unidades', obligatorio: true, placeholder: 'huevo, lata, botella, libra', ayuda: 'Es la unidad más pequeña que vendes. El stock se lleva en esta unidad.' })}
      <details class="desplegable" ${entrada.masDatos ? 'open' : ''}>
        <summary class="fila t-pequeno">${seguro(icono('ajustes', 'icono-sm'))}<span class="crece">Más datos <span class="t-tenue">(opcional)</span></span>${seguro(icono('chevron-abajo', 'icono-sm chevron'))}</summary>
        <div class="columna" style="padding-top:var(--e-3)">
          <div class="rejilla-campos">
            ${campo('nuevo-categoria', 'Categoría', n.categoria, { lista: 'lista-categorias', placeholder: 'Bebidas, farmacia…', campoCat: 'categoria' })}
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
      ${datalist('lista-volumenes', ordenarContenidos(valoresUnicos('volumen')))}
    </div>`;
}

// Redibuja después de que el foco ya pasó al siguiente campo (Tab) y lo devuelve ahí.
function repintarEntradaDespues() { setTimeout(() => pintarProductoEntrada(), 0); }

function pintarProductoEntrada() {
  const enfocado = document.activeElement && entrada.el.contains(document.activeElement) ? document.activeElement.id : '';
  pintarProductoEntradaSinFoco();
  if (enfocado) { const f = document.getElementById(enfocado); if (f && f !== document.activeElement) { f.focus({ preventScroll: true }); try { f.setSelectionRange(f.value.length, f.value.length); } catch (e) { /* no es de texto */ } } }
}

function pintarProductoEntradaSinFoco() {
  const cont = $('#entrada-producto', entrada.el);
  const p = entrada.producto, n = entrada.nuevo;
  if (!p && !n) {
    cont.innerHTML = entrada.carrito.length ? '' : html`<div class="vacio">${seguro(icono('entrada', 'icono-xl'))}<strong>¿Qué compraste?</strong><p>Busca el producto. Si es la primera vez, elige «Producto nuevo» al final de la lista.</p><button type="button" class="boton boton-entrada" data-accion="producto-nuevo">${seguro(icono('etiqueta-nueva', 'icono-sm'))}Producto nuevo</button></div>`.texto;
    pintarPieEntrada();
    return;
  }
  const unidad = unidadBaseEntrada();
  const factor = factorEntrada();               // unidades que trae el empaque
  const fc = factorCompra();                     // unidades por unidad de compra
  const compra = nombreCompra();
  const unidades = unidadesTotalesEntrada();
  const total = totalPagadoEntrada();
  const costoUnidad = unidades > 0 ? precioUnitario(total, unidades) : (entrada.producto && !entrada.costoEditado ? entrada.producto.costo : dividirDinero(entrada.costoEmp, fc));
  const precio = precioVentaEntrada();           // siempre por unidad base
  const ganUnidad = restarDinero(precio, costoUnidad);
  const margen = margenSobreCosto(ganUnidad, costoUnidad);
  const editor = entrada.editor || !!n;
  const empaqueEsUnidad = factor === 1 && normalizarTexto(entrada.empaque) === normalizarTexto(unidad);
  const nombreEmp = entrada.empaque.trim() || unidad;
  const cambiaPrecio = p && entrada.precioNuevo !== null && entrada.precioNuevo !== p.precio;
  const variantes = p ? Almacen.variantesDe(p.idProducto) : [];
  const opciones = p ? empaquesRegistrados(p) : [];
  const claveActual = claveEmpaqueEntrada();
  const listaEmpaques = [unidad].concat(Almacen.hojas.EQUIVALENCIAS.map(e => e.nombre), Almacen.productosVisibles().map(x => x.tipoEmpaque)).filter((v, i, a) => v && a.findIndex(x => normalizarTexto(x) === normalizarTexto(v)) === i);
  const error = validarEmpaqueEntrada();
  const empaqueNuevo = !!p && !empaqueRegistradoEntrada();
  const bodega = Shell.modo === 'bodega';
  // Precio por unidad · por empaque (como en la tarjeta de Venta).
  const empReg = p ? opciones.filter(o => o.clave !== 'u')[0] : null;
  const empSel = p ? (opciones.find(o => o.clave !== 'u' && o.clave === claveActual) || empReg) : null;
  // Modo editor de un producto existente: costo y precio se editan en su propia tarjeta (arriba).
  const editorArriba = !!p && entrada.editor;
  const campoPrecio = (opcional) => html`<div class="campo"><label for="entrada-precio">Precio de venta al consumidor por ${compra}${opcional ? html` <span class="t-tenue">(opcional)</span>` : ''}</label>
          <div class="control ${cambiaPrecio ? 'precio-cambiado' : ''}"><span class="prefijo">$</span><input id="entrada-precio" value="${valorCampoDinero(multiplicarDinero(precio, fc))}"></div>
          ${cambiaPrecio ? html`<span class="franja aviso-color">${seguro(icono('advertencia', 'icono-sm'))}Cambiará el precio de venta de ${formatearDinero(p.precio)} a ${formatearDinero(entrada.precioNuevo)} por ${unidad}. Aplica a ventas nuevas.</span>` : ''}</div>`;
  const nota = (texto) => html`<span class="nota-campo">${texto}</span>`;

  // 1. El empaque: cómo viene el producto. En un producto existente solo se MUESTRA (y se
  // elige entre los registrados); se escribe en Modo editor, producto nuevo o producto sin empaque
  // registrado. Tienda ve solo unidades hasta que pide el mayoreo (Kitso 2026-10-24).
  const tienda = Shell.modo === 'tienda';
  const libre = editor || entrada.empaqueLibre;
  const regs = opciones.filter(o => o.clave !== 'u');
  const soloUnidad = tienda && entrada.porUnidad && !libre && !entrada.verMayoreo;
  const campoEmp = (id, etiqueta, valor, { lista = '', placeholder = '', sufijo = '' } = {}) => html`<div class="campo"><label for="${id}">${etiqueta}</label>
        <div class="control"><input id="${id}" value="${valor}" placeholder="${placeholder}" ${lista ? html`list="${lista}"` : ''} autocomplete="off">${sufijo ? html`<span class="sufijo">${sufijo}</span>` : ''}</div></div>`;
  const emp = (entrada.empaque.trim() || 'empaque').toLowerCase();
  const sub = (entrada.subEmpaque.trim() || 'empaque de adentro').toLowerCase();
  const filaEmpaque = soloUnidad ? '' : libre ? html`
      <div class="rejilla-compra" aria-label="Empaque">
        ${campoEmp('entrada-empaque', entrada.conNivel ? 'Empaque grande' : 'Empaque (caja, fardo…)', entrada.empaque, { lista: 'lista-empaques-entrada', placeholder: bodega ? 'caja, fardo…' : `${unidad}, caja, fardo…` })}
        ${empaqueEsUnidad && !entrada.conNivel ? '' : entrada.conNivel
          ? html`${campoEmp('entrada-sub', 'Empaque de adentro', entrada.subEmpaque, { lista: 'lista-empaques-entrada', placeholder: 'cartón, bolsa…' })}
            ${campoEmp('entrada-por-sub', `Cada ${emp} trae`, entrada.unidades, { sufijo: pluralUnidad(sub, entrada.unidades) })}
            ${campoEmp('entrada-por-unidad', `Cada ${sub} trae`, entrada.porSub, { sufijo: pluralUnidad(unidad, entrada.porSub) })}`
          : campoEmp('entrada-por', `Cada ${emp} trae`, entrada.unidades || '', { placeholder: '¿cuántas?', sufijo: pluralUnidad(unidad, entrada.unidades || 2) })}
        ${datalistEmpaques(unidad, listaEmpaques)}
      </div>
      ${entrada.conNivel || (!empaqueEsUnidad && entrada.empaque.trim()) ? html`<button type="button" class="boton boton-texto boton-sm" data-accion="alternar-nivel" style="justify-self:start">${seguro(icono(entrada.conNivel ? 'menos' : 'mas', 'icono-sm'))}${entrada.conNivel ? `Volver a un solo empaque (${(entrada.subEmpaque || 'el de adentro').toLowerCase()})` : `Los ${pluralUnidad(nombreEmp.toLowerCase(), 2)} vienen en un empaque mayor (caja, fardo…)`}</button>` : ''}`
    : regs.length > 1 ? html`<div class="campo"><label>Empaque de compra</label>
        <div class="fila-chips chips-empaque" role="group" aria-label="Empaque de compra">${regs.map(o => html`<button type="button" class="chip" data-accion="elegir-empaque" data-clave="${o.clave}" aria-pressed="${String(o.clave === claveActual)}">${o.etiqueta}</button>`)}</div></div>`
    : html`<div class="dato"><span>Empaque</span><strong>${regs.length ? regs[0].etiqueta : nombreEmp}</strong></div>`;

  // 2. Cuánto compraste y en qué unidad (empaque o unidad suelta).
  const etiquetaCompra = pluralUnidad(compraPorUnidad() ? unidad : nombreEmp.toLowerCase(), entrada.cantEmp);
  const conSwitch = factor > 1 && !bodega && !soloUnidad;
  const filaCompra = html`
      <div class="campo"><label for="entrada-cant">Cantidad comprada</label>
        <div class="fila-cantidad">
          <span class="control"><input id="entrada-cant" value="${formatearNumero(entrada.cantEmp).replace(/,/g, '')}" aria-label="Cuántos"></span>
          ${conSwitch ? html`<span class="segmentado segmentado-compra" role="radiogroup" aria-label="Unidad de compra">
              <button type="button" role="radio" data-accion="compra-por" data-por="empaque" aria-checked="${String(!entrada.porUnidad)}">${pluralUnidad(nombreEmp.toLowerCase(), 2)}</button>
              <button type="button" role="radio" data-accion="compra-por" data-por="unidad" aria-checked="${String(entrada.porUnidad)}">${pluralUnidad(unidad, 2)}</button>
            </span>` : html`<span class="t-fuerte">${etiquetaCompra}</span>`}
        </div>
      </div>
      <p class="t-pequeno t-secundario entrada-total-unidades">${textoTotalEntrada()}</p>
      ${soloUnidad ? html`<button type="button" class="boton boton-texto boton-sm" data-accion="ver-mayoreo" style="justify-self:start">${seguro(icono('caja', 'icono-sm'))}Comprar por caja o mayoreo…</button>` : ''}`;

  // 3. Costo: un solo campo, por la unidad de compra (el total se calcula).
  const costoEditable = editor || entrada.costoCambio || empaqueNuevo;
  const bloqueCosto = editorArriba ? '' : costoEditable ? html`
      <div class="campo"><label for="entrada-costo">Costo por ${compra}</label>
        <div class="control"><span class="prefijo">$</span><input id="entrada-costo" value="${entrada.costoEditado || !p ? valorCampoDinero(costoEmpaqueEntrada(), 5) : ''}" placeholder="${valorCampoDinero(costoEmpaqueEntrada(), 2)}"></div></div>` : html`
      <div class="dato"><span>Costo por ${compra} (último)</span><strong>${formatearDinero(costoEmpaqueEntrada(), { detalle: true })}</strong></div>`;

  cont.innerHTML = html`
    ${p ? html`<div class="tarjeta tarjeta-producto">
      <div class="fila-separada"><span class="nombre">${nombreProducto(p, { conVariante: false })}</span>
        <button type="button" class="boton boton-icono" data-accion="quitar-producto-entrada" aria-label="Quitar producto">${seguro(icono('cerrar', 'icono-sm'))}</button></div>
      <div class="dato"><span class="etiqueta-dato">${seguro(icono('caja', 'icono-sm'))}En bodega</span>${seguro(stockPorModoHTML(p, Almacen.stock(p.idProducto), empSel))}</div>
      <div class="dato"><span class="etiqueta-dato" title="Lo que te cobra el distribuidor">${seguro(icono('precio', 'icono-sm'))}Costo</span>${seguro(dineroPorModoHTML(p.costo, p, empSel, true))}</div>
      <div class="dato"><span class="etiqueta-dato" title="Lo que cobras al consumidor">${seguro(icono('etiqueta', 'icono-sm'))}Venta</span>${seguro(dineroPorModoHTML(p.precio, p, empSel, false))}</div>
      ${seguro(detalleProProductoHTML(p).texto)}
      <label class="casilla t-pequeno casilla-compacta"><input type="checkbox" data-accion="modo-editor" ${entrada.editor ? 'checked' : ''}> Modo editor: empaque, costo o precio de venta</label>
      ${editorArriba ? html`<div class="columna editor-producto">
        <div class="campo"><label for="entrada-costo">Costo por ${compra}</label>
          <div class="control"><span class="prefijo">$</span><input id="entrada-costo" value="${entrada.costoEditado ? valorCampoDinero(costoEmpaqueEntrada(), 5) : ''}" placeholder="${valorCampoDinero(costoEmpaqueEntrada(), 2)}"></div></div>
        ${campoPrecio(false)}</div>` : ''}
    </div>` : seguro(formularioNuevo().texto)}

    <div class="tarjeta columna tarjeta-ingreso">
      <h2 class="titulo-ingreso">${seguro(icono('caja', 'icono-sm'))}Cómo compraste</h2>
      ${filaEmpaque}
      ${filaCompra}
      ${empaqueNuevo && !error ? html`<span class="franja aviso-color">${seguro(icono('advertencia', 'icono-sm'))}Se creará una nueva forma de compra para este producto: ${nombreEmp.toLowerCase()} de ${formatearNumero(factor)} ${pluralUnidad(unidad, factor)}. Queda registrada al guardar.</span>` : ''}
      ${error ? html`<span class="franja aviso-color" id="entrada-error">${seguro(icono('advertencia', 'icono-sm'))}${error}</span>` : ''}
    </div>
    <div class="tarjeta columna tarjeta-ingreso">
      <h2 class="titulo-ingreso">${seguro(icono('precio', 'icono-sm'))}Costo y detalles</h2>
      ${bloqueCosto}
      ${!editorArriba && (editor || entrada.costoCambio) ? campoPrecio(!editor) : ''}
      <details class="desplegable" ${entrada.bonif ? 'open' : ''}>
        <summary class="fila t-pequeno">${seguro(icono('caja', 'icono-sm'))}<span class="crece">Bonificadas (gratis)</span>${seguro(icono('chevron-abajo', 'icono-sm chevron'))}</summary>
        <div class="campo" style="padding-top:var(--e-2)"><label for="entrada-bonif">Unidades gratis</label>
          <div class="control"><input id="entrada-bonif" value="${entrada.bonif || ''}" placeholder="0"><span class="sufijo">${pluralUnidad(unidad, 2)}</span></div>
          <span class="ayuda-campo">Suman al stock pero no al costo: bajan el costo promedio.</span></div>
      </details>
      ${p ? html`<details class="desplegable" ${entrada.variante ? 'open' : ''}>
        <summary class="fila t-pequeno">${seguro(icono('sabor', 'icono-sm'))}<span class="crece">Sabor o variante <span class="t-tenue">(opcional)</span></span>${seguro(icono('chevron-abajo', 'icono-sm chevron'))}</summary>
        <div class="columna" style="padding-top:var(--e-2)">
          ${variantes.length ? html`<div class="fila-chips">${variantes.map(v => html`<button type="button" class="chip" data-accion="sabor-entrada" data-sabor="${v}" aria-pressed="${String(normalizarIdentidad(v) === normalizarIdentidad(entrada.variante))}">${v}</button>`)}</div>` : ''}
          <div class="control"><input id="entrada-sabor" value="${entrada.variante}" placeholder="Escribe el sabor o variante, o déjalo vacío" autocomplete="off"></div>
        </div></details>` : ''}
      ${p && !editor && !empaqueNuevo ? html`<label class="casilla t-pequeno casilla-compacta"><input type="checkbox" data-accion="costo-cambio" ${entrada.costoCambio ? 'checked' : ''}> El costo cambió en esta compra</label>` : ''}
    </div>
    <div id="entrada-resumen">${seguro(resumenEntradaHTML())}</div>`.texto;
  pintarIconos(cont);
  pintarPieEntrada();
  conectarCamposEntrada(cont);
}

function conectarCamposEntrada(cont) {
  const num = (id, dec, fn) => { const i = $(id, cont); if (!i) return; prepararCampoNumerico(i, { decimales: dec }); i.addEventListener('input', () => { fn(i); actualizarCalculoEntrada(); }); i.addEventListener('change', () => repintarEntradaDespues()); };
  const decCant = (entrada.producto ? entrada.producto.decimales : (entrada.nuevo && entrada.nuevo.decimales)) ? 3 : 0;
  num('#entrada-cant', decCant, (i) => { entrada.cantEmp = leerCantidad(i); });
  num('#entrada-por', 0, (i) => { entrada.unidades = leerCantidad(i) || 1; });
  num('#entrada-por-sub', 0, (i) => { entrada.unidades = leerCantidad(i) || 1; });
  num('#entrada-por-unidad', 0, (i) => { entrada.porSub = leerCantidad(i) || 1; });
  num('#entrada-costo', 5, (i) => { const v = i.value.trim(); entrada.costoEditado = v !== ''; entrada.costoEmp = v ? leerDineroCampo(i) : 0; entrada.totalEditado = false; });
  // El precio se escribe por la unidad de compra (caja o lata) y se guarda por unidad base.
  num('#entrada-precio', 2, (i) => { entrada.precioNuevo = dividirDinero(leerDineroCampo(i), factorCompra()); if (entrada.nuevo) entrada.nuevo.precio = entrada.precioNuevo; });
  num('#entrada-bonif', decCant, (i) => { entrada.bonif = leerCantidad(i); });
  const texto = (id, fn, repintar) => { const i = $(id, cont); if (!i) return; i.addEventListener('input', () => fn(i.value)); i.addEventListener('change', () => { fn(i.value); if (repintar) repintarEntradaDespues(); }); };
  texto('#entrada-empaque', (v) => {
    entrada.empaque = v.trim();
    const o = entrada.producto && empaquesRegistrados(entrada.producto).find(x => x.clave !== 'u' && normalizarTexto(x.empaque) === normalizarTexto(v)
      && (!entrada.conNivel || (x.conNivel && normalizarTexto(x.subEmpaque) === normalizarTexto(entrada.subEmpaque))));
    // Con «otros empaques adentro» escribir el nombre mayor no sale de ese modo: solo
    // se aplica un registrado de dos niveles que coincida con el de adentro.
    if (o && entrada.empaque) aplicarEmpaque(o);
    // Empaque que este producto no tiene: su tamaño se escribe (no hereda el del anterior).
    else if (entrada.conNivel) { if (entrada.empaque) entrada.costoEditado = false; }
    else if (entrada.empaque && normalizarTexto(entrada.empaque) !== normalizarTexto(unidadBaseEntrada())) { entrada.unidades = 0; entrada.conNivel = false; entrada.costoEditado = false; }
  }, true);
  texto('#entrada-sub', (v) => { entrada.subEmpaque = v.trim(); });
  texto('#entrada-sabor', (v) => { entrada.variante = v.trim(); });
  if (entrada.nuevo) {
    const n = entrada.nuevo;
    texto('#nuevo-marca', (v) => { n.marca = v.trim(); }, true);
    texto('#nuevo-linea', (v) => { n.linea = v.trim(); }, true);
    texto('#nuevo-presentacion', (v) => { n.presentacion = v.trim(); }, true);
    texto('#nuevo-volumen', (v) => { n.volumen = v.trim(); }, true);
    texto('#nuevo-unidad', (v) => { n.unidadBase = v.trim().toLowerCase(); if (Shell.modo !== 'bodega' && (!entrada.empaque || normalizarTexto(entrada.empaque) === normalizarTexto(n.unidadBase))) entrada.empaque = n.unidadBase; }, true);
    texto('#nuevo-categoria', (v) => { n.categoria = v.trim(); });
    texto('#nuevo-empaque', (v) => { n.tipoEmpaque = v.trim(); });
    num('#nuevo-umbral-min', 0, (i) => { n.umbralMin = leerCantidad(i); });
    num('#nuevo-umbral-max', 0, (i) => { n.umbralMax = leerCantidad(i); });
    const dec = $('#nuevo-decimales', cont); if (dec) dec.addEventListener('change', () => { n.decimales = dec.checked; pintarProductoEntrada(); });
    const masDatos = $('#formulario-nuevo details', cont); if (masDatos) masDatos.addEventListener('toggle', () => { entrada.masDatos = masDatos.open; });
    // 20. Presentación, contenido y tipo de empaque: un valor que no existe se confirma (evita errores por ir rápido).
    [['#nuevo-presentacion', 'presentacion', ['una presentación nueva', 'presentación'], (v) => { n.presentacion = v; }], ['#nuevo-volumen', 'volumen', ['un contenido nuevo', 'contenido'], (v) => { n.volumen = v; }], ['#nuevo-empaque', 'tipoEmpaque', ['un tipo de empaque nuevo', 'tipo de empaque'], (v) => { n.tipoEmpaque = v; }]]
      .forEach(([id, campo, nombre, poner]) => { const i = $(id, cont); if (i) i.addEventListener('change', () => confirmarValorNuevo(i, campo, nombre, poner)); });
    ['#nuevo-marca', '#nuevo-linea', '#nuevo-presentacion', '#nuevo-volumen'].forEach(id => { const i = $(id, cont); if (i) i.addEventListener('change', () => revisarDuplicadoNuevo()); });
  }
}

// Resumen de solo lectura (fase UI): unidades, total, costos, precios,
// ganancias por unidad, por empaque y de toda la compra, y margen.
function resumenEntradaHTML() {
  if (!entrada.producto && !entrada.nuevo) return '';
  const unidad = unidadBaseEntrada(), factor = factorEntrada(), fc = factorCompra();
  const nombreEmp = entrada.empaque.trim() || unidad;
  const unidades = unidadesTotalesEntrada();
  if (!(unidades > 0) && !(entrada.bonif > 0)) return '';
  const total = totalPagadoEntrada();
  // El costo del catálogo es un dato fijo: solo cambia si el total pagado ya no coincide con él.
  const p = entrada.producto;
  const costoCambio = !!p && costoCambiaEnCompra(p.costo, unidades, total);
  const costoUnidad = p && unidades > 0 && !costoCambio ? p.costo : unidades > 0 ? precioUnitario(total, unidades) : dividirDinero(costoEmpaqueEntrada(), fc);
  const precio = precioVentaEntrada();
  const ganUnidad = restarDinero(precio, costoUnidad);
  const margen = margenSobreCosto(ganUnidad, costoUnidad);
  const fila = (ic, etiqueta, valor, clase) => html`<div class="fila-resumen">${seguro(icono(ic, 'icono-sm'))}<span class="crece">${etiqueta}</span><strong class="${clase || ''}">${valor}</strong></div>`;
  // En naranja lo que cambia respecto al catálogo (costo o precio de venta).
  const cCosto = costoCambio ? 't-aviso' : '';
  const cPrecio = p && entrada.precioNuevo !== null && entrada.precioNuevo !== p.precio ? 't-aviso' : '';
  // Resumen corto (Kitso 2026-10-24): Bodega en cajas, Tienda en unidades; Pro conserva el completo.
  const corto = (cuanto, nombre, factorCorto) => html`<div class="tarjeta resumen-compra" aria-label="Resumen de la compra">
      <div class="tarjeta-titulo"><h2>${seguro(icono('factura', 'icono-sm'))} Resumen de la compra</h2></div>
      ${fila('caja', 'Entran a bodega', `${cuanto}${entrada.bonif ? ` + ${formatearNumero(entrada.bonif)} ${pluralUnidad(unidad, entrada.bonif)} gratis` : ''}`)}
      ${fila('precio', `Precio de compra por ${nombre}`, formatearDinero(multiplicarDinero(costoUnidad, factorCorto), { detalle: factorCorto === 1 }), cCosto)}
      ${precio > 0 ? html`
        ${fila('etiqueta', `Precio de venta por ${nombre}`, formatearDinero(multiplicarDinero(precio, factorCorto), { detalle: factorCorto === 1 }), cPrecio)}
        ${fila('tendencia', `Ganancia por ${nombre}`, formatearDinero(multiplicarDinero(ganUnidad, factorCorto), { detalle: factorCorto === 1 }), claseSigno(ganUnidad))}
        ${fila('panorama', 'Margen sobre costo', `${margen.toFixed(1)} %`, claseSigno(ganUnidad))}` : html`<p class="t-pequeno t-tenue">Pon un precio de venta para ver la ganancia.</p>`}
    </div>`.texto;
  if (Shell.modo === 'bodega' && factor > 1 && !entrada.porUnidad) {
    const empaques = redondearCantidad(unidades / factor);
    return corto(`${formatearNumero(empaques)} ${pluralUnidad(nombreEmp.toLowerCase(), empaques)}`, nombreEmp.toLowerCase(), factor);
  }
  if (Shell.modo === 'tienda' && (entrada.porUnidad || !(factor > 1))) return corto(`${formatearNumero(unidades)} ${pluralUnidad(unidad, unidades)}`, unidad, 1);
  return html`<div class="tarjeta resumen-compra" aria-label="Resumen de la compra">
      <div class="tarjeta-titulo"><h2>${seguro(icono('factura', 'icono-sm'))} Resumen de la compra</h2></div>
      ${fila('caja', 'Entran a bodega', `${formatearNumero(unidades)} ${pluralUnidad(unidad, unidades)}${entrada.bonif ? ` + ${formatearNumero(entrada.bonif)} gratis` : ''}`)}
      ${fila('billete', 'Total a pagar', formatearDinero(total))}
      ${fila('precio', `Costo por ${unidad}`, formatearDinero(costoUnidad, { detalle: true }), cCosto)}
      ${factor > 1 ? fila('precio', `Costo por ${nombreEmp.toLowerCase()}`, formatearDinero(multiplicarDinero(costoUnidad, factor)), cCosto) : ''}
      ${precio > 0 ? html`
        ${fila('etiqueta', `Precio de venta por ${unidad}`, formatearDinero(precio), cPrecio)}
        ${factor > 1 ? fila('etiqueta', `Precio de venta por ${nombreEmp.toLowerCase()}`, formatearDinero(multiplicarDinero(precio, factor)), cPrecio) : ''}
        ${fila('tendencia', `Ganancia por ${unidad}`, formatearDinero(ganUnidad, { detalle: true }), claseSigno(ganUnidad))}
        ${factor > 1 ? fila('tendencia', `Ganancia por ${nombreEmp}`, formatearDinero(multiplicarDinero(ganUnidad, factor)), claseSigno(ganUnidad)) : ''}
        ${fila('tendencia', 'Ganancia de toda la compra', formatearDinero(multiplicarDinero(ganUnidad, unidades)), claseSigno(ganUnidad))}
        ${fila('panorama', 'Margen sobre costo', `${margen.toFixed(1)} %`, claseSigno(ganUnidad))}` : html`<p class="t-pequeno t-tenue">Pon un precio de venta para ver la ganancia.</p>`}
    </div>`.texto;
}

// Actualiza los cálculos sin redibujar el formulario (para no perder el foco).
function actualizarCalculoEntrada() {
  const cont = $('#entrada-producto', entrada.el);
  const unidad = unidadBaseEntrada();
  const unidades = unidadesTotalesEntrada();
  const fc = factorCompra();
  const t = $('.entrada-total-unidades', cont); if (t) t.textContent = textoTotalEntrada();
  const r = $('#entrada-resumen', cont); if (r) r.innerHTML = resumenEntradaHTML();
  pintarIconos(r || cont);
  const b = $('[data-accion="guardar-entrada"]', entrada.el);
  if (b) { b.lastChild.textContent = `Guardar entrada · ${formatearDinero(totalGuardarEntrada())}`; b.classList.toggle('boton-aviso', cambioImportanteEntrada()); }
}

// Valor nuevo en un campo delicado: se pide confirmar; si no, se borra para corregirlo.
const valoresNuevosAceptados = new Set();
async function confirmarValorNuevo(input, campo, [conArticulo, nombre], poner) {
  const v = input.value.trim();
  const clave = `${campo}|${normalizarIdentidad(v)}`;
  if (!v || !esValorNuevo(campo, v) || valoresNuevosAceptados.has(clave)) return;
  const ok = await confirmar({ titulo: `¿Crear ${conArticulo}?`, mensaje: `«${v}» no existe todavía como ${nombre} en tu catálogo. Si es correcto, acéptalo; si quisiste elegir uno que ya tienes, corrígelo para no duplicar datos.`, textoConfirmar: 'Aceptar', textoCancelar: 'Corregir' });
  if (ok) { valoresNuevosAceptados.add(clave); return; }
  input.value = ''; poner('');
  pintarProductoEntrada();
  setTimeout(() => { const i = document.getElementById(input.id); if (i) i.focus(); }, 50);
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
  const fc = factorCompra();
  const linea = {
    cantEmpaques: entrada.cantEmp, nombreEmpaque: fc > 1 ? entrada.empaque : unidad, unidPorEmpaque: fc, niveles,
    totalPagado: totalPagadoEntrada(), bonif: entrada.bonif, variante: entrada.variante,
    nuevoPrecio: entrada.precioNuevo !== null ? entrada.precioNuevo : undefined
  };
  if (entrada.producto) linea.producto = entrada.producto.idProducto;
  else {
    const n = entrada.nuevo;
    linea.nuevo = { marca: n.marca, linea: n.linea, presentacion: n.presentacion, volumen: n.volumen, unidadBase: unidad, tipoEmpaque: n.tipoEmpaque,
      categoria: n.categoria, umbralMin: n.umbralMin, umbralMax: n.umbralMax, decimales: n.decimales, precio: n.precio || 0 };
  }
  linea._importante = cambioImportanteEntrada();
  if (entrada.producto && !empaqueRegistradoEntrada()) linea._empaqueNuevo = `${entrada.empaque.toLowerCase()} de ${formatearNumero(factorEntrada())} ${pluralUnidad(unidad, factorEntrada())}`;
  linea._descripcion = `${formatearNumero(entrada.cantEmp)} ${pluralUnidad(nombreCompra(), entrada.cantEmp)}${fc > 1 ? ` de ${formatearNumero(fc)}` : ''} = ${formatearNumero(unidades)} ${pluralUnidad(unidad, unidades)}`;
  linea._nombre = entrada.producto ? nombreProducto(entrada.producto, { conVariante: false }) : [entrada.nuevo.marca, entrada.nuevo.linea, entrada.nuevo.presentacion, entrada.nuevo.volumen].filter(Boolean).join(' ');
  return linea;
}

function validarNuevo() {
  if (entrada.producto || entrada.nuevo) { const e = validarEmpaqueEntrada(); if (e) return e; }
  const n = entrada.nuevo;
  if (!n) return '';
  if (!n.marca || !n.linea) return 'Escribe la marca y el producto.';
  if (!n.unidadBase) return 'Indica cómo cuentas el producto al venderlo (huevo, lata, botella…).';
  if (!n.tipoEmpaque) return 'Indica el tipo de empaque (caja, fardo, bolsa…).';
  if (buscarProductoMismaIdentidad(n, Almacen.productos)) return 'Ese producto ya existe: elígelo de la lista.';
  return '';
}

function pintarCarritoEntrada() {
  const cont = $('#entrada-carrito', entrada.el);
  if (!entrada.carrito.length) { cont.innerHTML = ''; pintarPieEntrada(); return; }
  cont.innerHTML = html`
    <div class="tarjeta">
      <div class="tarjeta-titulo"><h2>${seguro(icono('factura', 'icono-sm'))} Factura · ${entrada.carrito.length} ${pluralizar(entrada.carrito.length, 'producto')}</h2>
        <button type="button" class="boton boton-texto boton-sm peligro" data-accion="vaciar-entrada">Vaciar</button></div>
      <ul class="lista">${entrada.carrito.map((l, i) => html`
        <li class="fila-lista"><div class="crece"><div class="titulo recortar">${l._nombre}${l.nuevo ? html` <span class="insignia nuevo">Nuevo</span>` : ''}</div><div class="sub">${l._descripcion}</div></div>
          <span class="monto">${formatearDinero(l.totalPagado)}</span>
          <button type="button" class="boton boton-icono" data-accion="quitar-linea-entrada" data-i="${i}" aria-label="Quitar">${seguro(icono('cerrar', 'icono-sm'))}</button></li>`)}</ul>
    </div>`.texto;
  pintarPieEntrada();
}

// Total del botón Guardar: lo ya agregado a la factura más el producto en pantalla.
function totalGuardarEntrada() {
  const actual = lineaActualEntrada();
  return sumarDinero(entrada.carrito.map(l => l.totalPagado).concat(actual ? [actual.totalPagado] : []));
}

// Pie de la pantalla: «Agregar otro producto» siempre al final, justo antes de Guardar (Kitso 2026-10-24).
function pintarPieEntrada() {
  const pie = $('#entrada-pie', entrada.el); if (!pie) return;
  const hay = !!(entrada.producto || entrada.nuevo);
  if (!hay && !entrada.carrito.length) { pie.innerHTML = ''; return; }
  pie.innerHTML = html`${hay ? html`<button type="button" class="boton boton-secundario boton-bloque" data-accion="agregar-entrada">${seguro(icono('mas', 'icono-sm'))}Agregar otro producto</button>` : ''}
    <button type="button" class="boton boton-entrada boton-grande boton-bloque ${cambioImportanteEntrada() ? 'boton-aviso' : ''}" data-accion="guardar-entrada">${seguro(icono('entrada'))}<span>Guardar entrada · ${formatearDinero(totalGuardarEntrada())}</span></button>`.texto;
  pintarIconos(pie);
}

const accionesEntrada = {
  'menu-entrada': () => abrirMenuEntrada(),
  'producto-nuevo': () => empezarProductoNuevo(''),
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
  },
  'compra-por': (b) => { entrada.porUnidad = b.dataset.por === 'unidad'; entrada.costoEditado = false; pintarProductoEntrada(); },
  'elegir-empaque': (b) => {
    const o = empaquesRegistrados(entrada.producto).find(x => x.clave === b.dataset.clave);
    if (o) { aplicarEmpaque(o); entrada.porUnidad = false; pintarProductoEntrada(); }
  },
  // Tienda: pasa de unidades al mayoreo (caja, fardo…); sin empaque registrado, habilita registrar uno.
  'ver-mayoreo': () => {
    entrada.verMayoreo = true; entrada.porUnidad = false; entrada.costoEditado = false; entrada.totalEditado = false;
    const regs = empaquesRegistrados(entrada.producto || { idProducto: 0, unidadBase: unidadBaseEntrada() }).filter(o => o.clave !== 'u');
    if (regs.length) aplicarEmpaque(regs[0]); else { entrada.empaqueLibre = true; entrada.empaque = ''; entrada.unidades = 0; }
    pintarProductoEntrada();
  },
  'modo-editor': (b) => { entrada.editor = b.checked; if (!b.checked) { const ops = empaquesRegistrados(entrada.producto); if (!ops.some(o => o.clave === claveEmpaqueEntrada())) aplicarEmpaque(ops[1] && Shell.modo !== 'tienda' ? ops[1] : ops[0]); entrada.precioNuevo = null; } pintarProductoEntrada(); },
  'costo-cambio': (b) => { entrada.costoCambio = b.checked; if (!b.checked) { entrada.totalEditado = false; entrada.costoEditado = false; } pintarProductoEntrada(); if (b.checked) setTimeout(() => { const t = $('#entrada-costo', entrada.el); if (t) t.focus(); }, 50); },
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
  // Dos casos que merecen confirmación: solo bonificadas (sin compra) o compra con costo $0.
  const soloBonif = lineas.filter(l => !(l.cantEmpaques * l.unidPorEmpaque > 0) && l.bonif > 0);
  const enCero = lineas.filter(l => l.cantEmpaques * l.unidPorEmpaque > 0 && !(l.totalPagado > 0));
  const importante = lineas.some(l => l._importante);
  if (lineas.length > 1 || enCero.length || soloBonif.length || importante) {
    const totalTodo = sumarDinero(lineas.map(l => l.totalPagado));
    let nota = '';
    if (soloBonif.length) nota += `\n\nSolo estás ingresando unidades bonificadas (gratis) de ${soloBonif.map(l => l._nombre).join(', ')}, sin compra. Si es correcto, guarda; si también compraste, escribe la cantidad comprada antes de guardar.`;
    if (enCero.length) nota += `\n\nOjo: ${enCero.length === 1 ? 'un producto va' : `${enCero.length} productos van`} con costo $0.00. Si fue regalo, usa «Bonificadas»; si no, revisa el total pagado.`;
    lineas.filter(l => l._empaqueNuevo).forEach(l => { nota += `\n\nSe creará una nueva forma de compra para ${l._nombre}: ${l._empaqueNuevo}.`; });
    const ok = await confirmar({
      titulo: lineas.length > 1 ? `¿Guardar la entrada de ${lineas.length} productos?` : '¿Guardar esta entrada?',
      mensaje: `${lineas.map(l => `${l._nombre}: ${l._descripcion}${l.bonif ? ` + ${formatearNumero(l.bonif)} gratis` : ''} · ${formatearDinero(l.totalPagado)}`).join('\n')}\n\nTotal: ${formatearDinero(totalTodo)}${nota}`,
      textoConfirmar: 'Guardar', peligro: enCero.length > 0, aviso: !enCero.length && (soloBonif.length > 0 || importante)
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
