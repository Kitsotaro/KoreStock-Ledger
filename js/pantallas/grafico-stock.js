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
//   - Leyenda propia, accesible y tocable; colores del tema o el elegido
//     tocando el cuadrito (hoja COLORES, con fecha: queda registrado).
//
// Expone: GraficoStock.
// Depende de: cargador.js (cargarChart), almacen.js, dinero.js, componentes.js, shell.js.
// ============================================================

// <input type="color"> solo acepta #RRGGBB.
function aHex(color) {
  const c = String(color || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(c)) return c;
  if (/^#[0-9a-f]{3}$/i.test(c)) return '#' + c.slice(1).split('').map(x => x + x).join('');
  const m = c.match(/\d+/g);
  return m && m.length >= 3 ? '#' + m.slice(0, 3).map(n => Number(n).toString(16).padStart(2, '0')).join('') : '#888888';
}

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
        <div class="tarjeta-titulo"><h2>${seguro(icono('pastel', 'icono-sm'))} Distribución del stock</h2>
          <button type="button" class="boton boton-texto boton-sm" data-grafico="tipo"></button></div>
        <div class="fila envolver" style="margin-bottom:var(--e-2)">
          <div class="segmentado" role="group" aria-label="Medida">
            <button type="button" data-grafico="medida" data-valor="UNIDADES">Unidades</button>
            <button type="button" data-grafico="medida" data-valor="VALOR">Valor $</button>
          </div>
          <label class="control" style="min-height:var(--alto-control-sm)" data-grafico-recorte><span class="solo-lector">Cuántas barras</span>
            <select data-grafico="recorte"><option value="TODO">Todas</option><option value="10">5 mayores y 5 menores</option><option value="TOP5">3 mayores y 2 menores</option></select></label>
        </div>
        <nav class="migas" aria-label="Nivel del gráfico"></nav>
        <div class="contenedor-grafico"><canvas aria-label="Gráfico de distribución del stock" role="img"></canvas></div>
        <p class="nota-grafico t-pequeno t-secundario"></p>
        <div class="leyenda"></div>
      </div>`.texto;
    contenedor.addEventListener('click', (e) => {
      const b = e.target.closest('[data-grafico]');
      if (b && b.dataset.grafico === 'tipo') { this.tipo = this.tipo === 'PASTEL' ? 'BARRAS' : 'PASTEL'; this.pintar(); }
      if (b && b.dataset.grafico === 'medida') { this.medida = b.dataset.valor; this.pintar(); }
      const miga = e.target.closest('[data-nivel]');
      if (miga) { this.camino = this.camino.slice(0, Number(miga.dataset.nivel)); this.pintar(); }
      const item = e.target.closest('[data-bajar]');
      if (item) this.bajar(item.dataset.bajar);
    });
    $('select', contenedor).addEventListener('change', (e) => { this.recorte = e.target.value; this.pintar(); });
    // El selector de color avisa al cerrarse («change»): se guarda una sola vez.
    contenedor.addEventListener('change', async (e) => {
      const i = e.target.closest('input[data-color]');
      if (!i) return;
      const r = await ejecutarOperacion(operacionGuardarColor(this.nivelColor(), i.dataset.color, i.value));
      if (r !== null) { avisar('Color guardado.', { accion: 'Automático', alAccion: () => ejecutarOperacion(operacionGuardarColor(this.nivelColor(), i.dataset.color, '')).then(() => this.pintar()) }); this.pintar(); }
    });
    Shell.alCambiarTema(() => { if (Shell.actual === 'stock') this.pintar(); });
  },

  // Agrupa el stock ACTIVO del nivel actual: { etiqueta: valor }.
  datosNivel() {
    const nivel = NIVELES_GRAFICO[this.camino.length];
    const valorDe = (p, unidades) => this.medida === 'VALOR' ? dineroANumero(redondearCentavo(multiplicarDinero(p.costo, Math.max(0, unidades)))) : unidades;
    const productos = Almacen.productosActivos().filter(p => this.camino.every(paso => this.claveProducto(p, paso.campo) === paso.valor));
    const grupos = {};
    let sinAsignar = 0;
    if (nivel.campo === 'sabor') {
      productos.forEach(p => {
        const e = Almacen.estado(p.idProducto);
        Object.entries(e.porVariante).forEach(([sabor, u]) => {
          if (!sabor) { sinAsignar += u; return; }
          if (u > 0) grupos[sabor] = (grupos[sabor] || 0) + valorDe(p, u);
        });
      });
    } else {
      productos.forEach(p => {
        const u = Almacen.stock(p.idProducto);
        if (u <= 0) return;
        const k = this.claveProducto(p, nivel.campo) || 'Sin dato';
        grupos[k] = (grupos[k] || 0) + valorDe(p, u);
      });
    }
    return { nivel, grupos, sinAsignar };
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
    const { nivel, grupos, sinAsignar } = this.datosNivel();
    $('[data-grafico="tipo"]', c).textContent = this.tipo === 'PASTEL' ? 'Ver en barras' : 'Ver en pastel';
    $$('[data-grafico="medida"]', c).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.valor === this.medida)));
    $('[data-grafico-recorte]', c).hidden = this.tipo !== 'BARRAS';
    $('.migas', c).innerHTML = [html`<button type="button" data-nivel="0">Todo</button>`]
      .concat(this.camino.map((paso, i) => html`<span aria-hidden="true">›</span>${i === this.camino.length - 1 ? html`<span aria-current="page">${paso.valor}</span>` : html`<button type="button" data-nivel="${i + 1}">${paso.valor}</button>`}`))
      .map(x => x.texto).join(' ');
    let items = Object.entries(grupos).map(([etiqueta, valor]) => ({ etiqueta, valor })).sort((a, b) => b.valor - a.valor);
    const total = items.reduce((s, i) => s + i.valor, 0);
    if (this.tipo === 'BARRAS') {
      const n = items.length;
      if (this.recorte === '10' && n > 10) items = items.slice(0, 5).concat(items.slice(-5));
      if (this.recorte === 'TOP5' && n > 5) items = items.slice(0, 3).concat(items.slice(-2));
    }
    const estilo = getComputedStyle(document.documentElement);
    const paleta = Array.from({ length: 8 }, (_, i) => estilo.getPropertyValue(`--grafico-${i + 1}`).trim());
    const colores = items.map((it, i) => Almacen.colorGrafico(this.nivelColor(), this.nombreColor(it.etiqueta)) || paleta[i % 8]);
    const fmt = (v) => this.medida === 'VALOR' ? formatearDinero(dinero(v)) : formatearNumero(v);
    const nota = $('.nota-grafico', c);
    nota.textContent = nivel.campo === 'sabor'
      ? `Según registros.${sinAsignar ? ` Sin asignar: ${formatearNumero(sinAsignar)}.` : ''}`
      : (this.medida === 'UNIDADES' ? 'Unidades en bodega (cada producto en su propia unidad).' : 'Valor en bodega a último costo.');
    const puedeBajar = this.camino.length < NIVELES_GRAFICO.length - 1;
    $('.leyenda', c).innerHTML = items.length ? items.map((it, i) => html`<div class="leyenda-fila">
        <label class="muestra-color" style="background:${colores[i]}" title="Cambiar color"><input type="color" data-color="${this.nombreColor(it.etiqueta)}" value="${aHex(colores[i])}" aria-label="Color de ${it.etiqueta}"></label>
        <button type="button" class="leyenda-item" ${puedeBajar ? html`data-bajar="${it.etiqueta}"` : ''}><span class="recortar">${it.etiqueta}</span>
        <span class="valor">${fmt(it.valor)} · ${total ? (it.valor / total * 100).toFixed(1) : '0'}%</span></button></div>`.texto).join('')
      : html`<p class="t-tenue t-pequeno">No hay stock para mostrar.</p>`.texto;

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
