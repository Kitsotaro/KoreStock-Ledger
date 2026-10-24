// © 2026 KoreStock Ledger — un proyecto de Kitsótaro · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// GRAFICO-STOCK.JS — el único gráfico de Stock (D28, §20.1): pastel que
// sirve de navegador y se convierte en barras. Heredado de graficos.js v2.
//   - Niveles: marca → producto → presentación/contenido → sabor.
//   - El sabor sale del historial; «Sin asignar» puede ser negativo y no se
//     grafica: se muestra como nota de texto («según registros»).
//   - Barras: % del total del nivel, con el mismo recorte de la v2
//     (Todo · 10 = 5 mayores + 5 menores · Top 5 = 3 + 2).
//   - Unidades o valor en $ (el stock mezcla unidades distintas: huevos,
//     latas…; el valor permite comparar parejo).
//   - Leyenda propia, accesible y tocable. Colores: modo automático
//     (Sobrio, Pastel, Vívido, Monocromo) o uno elegido tocando el cuadrito;
//     todo en la hoja COLORES, con fecha (queda registrado).
//
// Expone: GraficoStock.
// Depende de: cargador.js (cargarChart), almacen.js, dinero.js, componentes.js, shell.js,
//   selector-color.js, operaciones-catalogo.js (operacionGuardarColor).
// ============================================================

const NIVELES_GRAFICO = [
  { campo: 'marca', nombre: 'Marcas' },
  { campo: 'linea', nombre: 'Productos' },
  { campo: 'presentacionContenido', nombre: 'Presentaciones' },
  { campo: 'sabor', nombre: 'Sabores' }
];

const GraficoStock = {
  camino: [], tipo: 'PASTEL', medida: 'UNIDADES', recorte: 'TODO', instancia: null, contenedor: null,

  montar(contenedor) {
    this.contenedor = contenedor;
    contenedor.innerHTML = html`
      <div class="tarjeta">
        <div class="tarjeta-titulo"><h2>${seguro(icono('pastel', 'icono-sm'))} Distribución del stock</h2></div>
        <div class="fila-separada fila-estilo">
          <span class="t-pequeno t-secundario">Estilo</span>
          <span class="segmentado segmentado-compra segmentado-mini" role="radiogroup" aria-label="Estilo del gráfico">
            <button type="button" role="radio" data-grafico="tipo" data-valor="PASTEL">Circular</button>
            <button type="button" role="radio" data-grafico="tipo" data-valor="BARRAS">Barras</button>
          </span></div>
        <div class="fila-separada fila-estilo" data-grafico-recorte>
          <span class="t-pequeno t-secundario">Mostrar</span>
          <span class="segmentado segmentado-compra segmentado-mini" role="radiogroup" aria-label="Cuántas barras">
            <button type="button" role="radio" data-grafico="recorte" data-valor="TODO">Todas</button>
            <button type="button" role="radio" data-grafico="recorte" data-valor="10" title="5 mayores y 5 menores">5 + 5</button>
            <button type="button" role="radio" data-grafico="recorte" data-valor="TOP5" title="3 mayores y 2 menores">3 + 2</button>
          </span></div>
        <div class="fila-separada fila-migas"><nav class="migas" aria-label="Nivel del gráfico"></nav>
          <button type="button" class="boton boton-icono boton-paleta" data-grafico="modo-color" aria-label="Colores automáticos" title="Colores automáticos">${seguro(icono('paleta', 'icono-sm'))}</button></div>
        <div class="contenedor-grafico"><canvas aria-label="Gráfico de distribución del stock" role="img"></canvas></div>
        <p class="nota-grafico t-pequeno t-secundario"></p>
        <div class="leyenda"></div>
      </div>`.texto;
    contenedor.addEventListener('click', (e) => {
      const b = e.target.closest('[data-grafico]');
      if (b && b.dataset.grafico === 'tipo') { this.tipo = b.dataset.valor || (this.tipo === 'PASTEL' ? 'BARRAS' : 'PASTEL'); this.pintar(); }
      if (b && b.dataset.grafico === 'recorte') { this.recorte = b.dataset.valor; this.pintar(); }
      if (b && b.dataset.grafico === 'medida') { this.medida = b.dataset.valor; this.pintar(); }
      if (b && b.dataset.grafico === 'modo-color') {
        abrirSelectorModoColor(b, { actual: leerModoColor('STOCK'), alElegir: (m) => this.guardarColor('_MODO', 'STOCK', textoModoColor(m)) });
      }
      const muestra = e.target.closest('[data-color]');
      if (muestra) this.elegirColor(muestra);
      const miga = e.target.closest('[data-nivel]');
      if (miga) { this.camino = this.camino.slice(0, Number(miga.dataset.nivel)); this.pintar(); }
      const item = e.target.closest('[data-bajar]');
      if (item) this.bajar(item.dataset.bajar);
    });

    Shell.alCambiarTema(() => { if (Shell.actual === 'stock') this.pintar(); });
  },

  // Agrupa el stock ACTIVO del nivel actual: { etiqueta: valor }.
  datosNivel() {
    const nivel = NIVELES_GRAFICO[this.camino.length];
    // El gráfico va en unidades; el valor en $ (a último costo) acompaña en la leyenda.
    const valorDe = (p, unidades) => unidades;
    const dineroDe = (p, unidades) => redondearCentavo(multiplicarDinero(p.costo, Math.max(0, unidades)));
    const valores = {};
    const productos = Almacen.productosActivos().filter(p => this.camino.every(paso => this.claveProducto(p, paso.campo) === paso.valor));
    const grupos = {};
    let sinAsignar = 0;
    if (nivel.campo === 'sabor') {
      productos.forEach(p => {
        const e = Almacen.estado(p.idProducto);
        Object.entries(e.porVariante).forEach(([sabor, u]) => {
          if (!sabor) { sinAsignar += u; return; }
          if (u > 0) { grupos[sabor] = (grupos[sabor] || 0) + valorDe(p, u); valores[sabor] = sumarDinero(valores[sabor] || 0, dineroDe(p, u)); }
        });
      });
    } else {
      productos.forEach(p => {
        const u = Almacen.stock(p.idProducto);
        if (u <= 0) return;
        const k = this.claveProducto(p, nivel.campo) || 'Sin dato';
        grupos[k] = (grupos[k] || 0) + valorDe(p, u);
        valores[k] = sumarDinero(valores[k] || 0, dineroDe(p, u));
      });
    }
    return { nivel, grupos, valores, sinAsignar };
  },

  // Selector propio: sugerencias del modo, variaciones, usados antes y «Automático».
  elegirColor(muestra) {
    const nombre = muestra.dataset.color, nivel = this.nivelColor();
    const propio = Almacen.colorGrafico(nivel, nombre);
    const recientes = [...new Set((Almacen.hojas.COLORES || []).filter(f => /^#/.test(f.color)).map(f => aHex(f.color)).reverse())];
    abrirSelectorColor(muestra, {
      titulo: `Color de ${nombre.split(' › ').pop()}`, actual: muestra.dataset.actual, personalizado: !!propio,
      delModo: paletaAutomatica(leerModoColor('STOCK'), 8), recientes,
      alElegir: (color) => this.guardarColor(nivel, nombre, color)
    });
  },
  async guardarColor(nivel, nombre, valor) {
    const r = await ejecutarOperacion(operacionGuardarColor(nivel, nombre, valor));
    if (r !== null) this.pintar();
  },

  // Clave del color: el nivel y el camino («Pepsi › Lata 355 ml»), para que el
  // mismo nombre en dos marcas pueda tener colores distintos.
  nivelColor() { return NIVELES_GRAFICO[this.camino.length].campo; },
  nombreColor(etiqueta) { return this.camino.map(p => p.valor).concat(etiqueta).join(' › '); },

  claveProducto(p, campo) {
    if (campo === 'presentacionContenido') return [p.presentacion, p.volumen].filter(Boolean).join(' ') || 'Sin dato';
    return p[campo] || '';
  },

  bajar(valor) {
    const nivel = NIVELES_GRAFICO[this.camino.length];
    if (!nivel || this.camino.length >= NIVELES_GRAFICO.length - 1) return;
    this.camino.push({ campo: nivel.campo, valor });
    // Si el siguiente nivel no tiene nada que mostrar (sin sabores), se queda.
    const { grupos } = this.datosNivel();
    if (!Object.keys(grupos).length) { this.camino.pop(); avisar('No hay más detalle para este grupo.'); return; }
    this.pintar();
  },

  async pintar() {
    if (!this.contenedor) return;
    const c = this.contenedor;
    const { nivel, grupos, valores, sinAsignar } = this.datosNivel();
    $$('[data-grafico="tipo"]', c).forEach(b => b.setAttribute('aria-checked', String(b.dataset.valor === this.tipo)));
    $$('[data-grafico="recorte"]', c).forEach(b => b.setAttribute('aria-checked', String(b.dataset.valor === this.recorte)));
    $('[data-grafico-recorte]', c).hidden = this.tipo !== 'BARRAS';
    $('.migas', c).innerHTML = [html`<button type="button" data-nivel="0">Todo</button>`]
      .concat(this.camino.map((paso, i) => html`<span aria-hidden="true">›</span>${i === this.camino.length - 1 ? html`<span aria-current="page">${paso.valor}</span>` : html`<button type="button" data-nivel="${i + 1}">${paso.valor}</button>`}`))
      .map(x => x.texto).join(' ');
    let items = Object.entries(grupos).map(([etiqueta, valor]) => ({ etiqueta, valor, dinero: valores[etiqueta] || 0 })).sort((a, b) => b.valor - a.valor);
    const total = items.reduce((s, i) => s + i.valor, 0);
    if (this.tipo === 'BARRAS') {
      const n = items.length;
      if (this.recorte === '10' && n > 10) items = items.slice(0, 5).concat(items.slice(-5));
      if (this.recorte === 'TOP5' && n > 5) items = items.slice(0, 3).concat(items.slice(-2));
    }
    const estilo = getComputedStyle(document.documentElement);
    const paleta = paletaAutomatica(leerModoColor('STOCK'), items.length);
    const colores = items.map((it, i) => Almacen.colorGrafico(this.nivelColor(), this.nombreColor(it.etiqueta)) || paleta[i]);
    const fmt = (v) => formatearNumero(v);
    const nota = $('.nota-grafico', c);
    nota.textContent = nivel.campo === 'sabor'
      ? `Según registros.${sinAsignar ? ` Sin asignar: ${formatearNumero(sinAsignar)}.` : ''}`
      : '';
    const puedeBajar = this.camino.length < NIVELES_GRAFICO.length - 1;
    const cabecera = items.length ? html`<div class="leyenda-cabecera"><span class="crece"></span><span class="valor columnas-leyenda">
        <button type="button" class="col-n" data-info-titulo="Volumen" data-info="Cuántas unidades hay en bodega de este grupo, cada producto en su propia unidad (botellas, latas, bolsas…).">${seguro(icono('caja', 'icono-sm'))}Volumen</button><span class="sep"></span>
        <button type="button" class="col-d" data-info-titulo="Valor" data-info="Lo que vale ese stock a último costo, con lo que llegó gratis (como el valor neto de bodega).">${seguro(icono('billete', 'icono-sm'))}Valor</button><span class="sep"></span>
        <button type="button" class="col-p" data-info-titulo="Participación" data-info="Qué parte del volumen total de este nivel es este grupo (suma 100 %).">${seguro(icono('pastel', 'icono-sm'))}Part.</button></span></div>`.texto : '';
    $('.leyenda', c).innerHTML = cabecera + (items.length ? items.map((it, i) => html`<div class="leyenda-fila">
        <button type="button" class="muestra-color" style="background:${colores[i]}" data-color="${this.nombreColor(it.etiqueta)}" data-actual="${aHex(colores[i])}" aria-label="Cambiar el color de ${it.etiqueta}" title="Cambiar color"></button>
        <button type="button" class="leyenda-item" ${puedeBajar ? html`data-bajar="${it.etiqueta}"` : ''}><span class="recortar">${it.etiqueta}</span>
        <span class="valor columnas-leyenda"><span class="col-n">${fmt(it.valor)}</span><span class="sep">·</span><span class="col-d">${formatearDinero(it.dinero)}</span><span class="sep">·</span><span class="col-p">${total ? (it.valor / total * 100).toFixed(1) : '0'}%</span></span></button></div>`.texto).join('')
      : html`<p class="t-tenue t-pequeno">No hay stock para mostrar.</p>`.texto);

    try { await cargarChart(); } catch (e) { return; }
    const lienzo = $('canvas', c);
    if (this.instancia) this.instancia.destroy();
    if (!items.length) { this.instancia = null; return; }
    const colorTexto = estilo.getPropertyValue('--texto-2').trim();
    const colorBorde = estilo.getPropertyValue('--superficie').trim();
    const comun = {
      responsive: true, maintainAspectRatio: false, animation: { duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 300 },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ` ${fmt(items[ctx.dataIndex].valor)}` } } },
      onClick: (evt, el) => { if (el.length && puedeBajar) this.bajar(items[el[0].index].etiqueta); }
    };
    this.instancia = new Chart(lienzo, this.tipo === 'PASTEL'
      ? { type: 'doughnut', data: { labels: items.map(i => i.etiqueta), datasets: [{ data: items.map(i => i.valor), backgroundColor: colores, borderColor: colorBorde, borderWidth: 2 }] },
          options: Object.assign({ cutout: '55%' }, comun) }
      : { type: 'bar', data: { labels: items.map(i => i.etiqueta), datasets: [{ data: items.map(i => total ? i.valor / total * 100 : 0), backgroundColor: colores, borderRadius: 6 }] },
          options: Object.assign({}, comun, { indexAxis: 'y', scales: { x: { min: 0, max: 100, ticks: { color: colorTexto, callback: (v) => v + '%' }, grid: { color: estilo.getPropertyValue('--borde').trim() } }, y: { ticks: { color: colorTexto } , grid: { display: false } } },
            plugins: Object.assign({}, comun.plugins, { tooltip: { callbacks: { label: (ctx) => ` ${ctx.raw.toFixed(1)}% · ${fmt(items[ctx.dataIndex].valor)}` } } }) }) });
  }
};
