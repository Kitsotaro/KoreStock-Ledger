// © 2026 Kitsótaro · KoreStock Ledger · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// SHELL.JS — el marco de la app: barra superior, barra inferior con el
// interruptor Entrada ⇄ Venta, panel lateral, modos, tema, tamaño de texto,
// estado de conexión y aviso de sesión.
//
// Reglas (D11, §12.1, §23.1, D22):
//   - Barra inferior: Stock · [Entrada ⇄ Venta] · Dashboard (+ Panorama en Pro).
//   - Al llegar al registro desde otra pantalla, se abre SIEMPRE en Venta.
//   - Lo ocasional va en el panel lateral (sándwich).
//   - El modo lo elige el usuario y solo muestra u oculta pantallas y campos;
//     nunca toca los datos. Se recuerda en este navegador (D23).
//   - El botón «atrás» del teléfono vuelve a la pantalla anterior.
//
// Expone: Shell, registrarPantalla, Pantallas, MODOS.
// Depende de: componentes.js, cargador.js, config.js, almacen.js, sesion.js,
//   sincronizacion.js, cache-local.js.
// ============================================================

const MODOS = {
  bodega: { nombre: 'Bodega', icono: 'bodega', frase: 'Grandes volúmenes por caja: entradas, despachos, stock, gastos y combustible.' },
  tienda: { nombre: 'Tienda', icono: 'tienda', frase: 'Venta por unidad, precios por presentación y clientes. Lo de Bodega incluido.' },
  pro: { nombre: 'Pro', icono: 'panorama', frase: 'Todo lo de Tienda más Panorama: costo promedio, ROI, proyección y equilibrio.' }
};

const Pantallas = {};
function registrarPantalla(nombre, definicion) { Pantallas[nombre] = Object.assign({ montada: false }, definicion); }

const leerLocal = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const guardarLocal = (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* nada */ } };

const Shell = {
  actual: null,
  _oyentesTema: new Set(),

  get modo() { return document.body.dataset.modo || 'tienda'; },

  iniciar() {
    fijarTodosLosDecimales(this.todosLosDecimales());
    pintarIconos(document);
    const app = $('#app');
    delegar(app, 'click', {
      'abrir-panel': () => this.abrirPanel(),
      'cinta-periodo': () => { const f = filtrosDePantalla.get(this.actual); if (f && f.usaPeriodo) f.abrirPeriodo(); },
      'elegir-modo': () => { this.cerrarPanel(); this.elegirModo(); },
      'cambiar-tema': () => { this.cerrarPanel(); this.elegirTema(); },
      'tamano-texto': () => { this.cerrarPanel(); this.elegirTamanoTexto(); },
      'todos-decimales': () => this.cambiarTodosLosDecimales(!this.todosLosDecimales()),
      'salir': () => { this.cerrarPanel(); this.salir(); }
    });
    app.addEventListener('click', (e) => {
      const destino = e.target.closest('[data-ir]');
      if (destino) { this.cerrarPanel(); this.ir(destino.dataset.ir); }
    });
    $$('.interruptor-registro button').forEach(b => b.addEventListener('click', () => {
      const enRegistro = this.actual === 'venta' || this.actual === 'entrada';
      this.ir(enRegistro ? (b.dataset.tipo === 'ENTRADA' ? 'entrada' : 'venta') : 'venta');
    }));
    $('#velo-panel').addEventListener('click', () => this.cerrarPanel());
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.cerrarPanel(); });
    window.addEventListener('popstate', (e) => {
      if ($('#panel-lateral').classList.contains('abierto')) { this.cerrarPanel(); return; }
      const destino = e.state && e.state.pantalla;
      if (destino && Pantallas[destino]) this.ir(destino, { sinHistorial: true });
    });
    window.addEventListener('offline', () => this.marcarSinConexion(true));
    window.addEventListener('online', () => this.alVolverConexion());
    Almacen.suscribir((motivo) => { if (motivo === 'sin-conexion') this.marcarSinConexion(true); this.actualizarEstado(); });
    setInterval(() => this.revisarSesion(), 30000);
    this.actualizarPanel();
  },

  // ---------- Navegación ----------
  ir(nombre, opciones) {
    const { sinHistorial = false } = opciones || {};
    const def = Pantallas[nombre];
    if (!def) return;
    if (nombre === 'panorama' && this.modo !== 'pro') nombre = 'dashboard';
    const anterior = this.actual;
    if (anterior && Pantallas[anterior] && Pantallas[anterior].ocultar) Pantallas[anterior].ocultar();
    $$('.pantalla').forEach(s => { s.hidden = s.dataset.pantalla !== nombre; });
    const el = $(`.pantalla[data-pantalla="${nombre}"]`);
    if (!def.montada) { def.montar(el); def.montada = true; pintarIconos(el); }
    this.actual = nombre;
    const titulo = $('#titulo-pantalla');
    titulo.textContent = typeof def.titulo === 'function' ? def.titulo() : def.titulo;
    titulo.className = 'titulo-pantalla' + (nombre === 'venta' ? ' venta' : nombre === 'entrada' ? ' entrada' : '');
    $$('.barra-inferior .pestana').forEach(b => b.setAttribute('aria-current', b.dataset.ir === nombre ? 'page' : 'false'));
    const enRegistro = nombre === 'venta' || nombre === 'entrada';
    const interruptor = $('.interruptor-registro');
    interruptor.classList.toggle('activo', enRegistro);
    $$('button', interruptor).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tipo === (nombre === 'entrada' ? 'ENTRADA' : 'VENTA'))));
    $$('.panel-lateral [data-ir]').forEach(b => b.setAttribute('aria-current', b.dataset.ir === nombre ? 'page' : 'false'));
    document.body.dataset.pantalla = nombre;
    if (def.mostrar) def.mostrar(el, opciones || {});
    actualizarCintaPeriodo();
    pintarIconos(el);
    if (anterior !== nombre) window.scrollTo({ top: 0 });
    if (!sinHistorial && anterior !== nombre) history.pushState({ pantalla: nombre }, '');
  },

  refrescarActual() {
    const def = Pantallas[this.actual];
    if (def && def.mostrar) { const el = $(`.pantalla[data-pantalla="${this.actual}"]`); def.mostrar(el, { refresco: true }); pintarIconos(el); }
  },

  // ---------- Panel lateral ----------
  abrirPanel() {
    this.actualizarPanel();
    $('#panel-lateral').classList.add('abierto');
    $('#panel-lateral').setAttribute('aria-hidden', 'false');
    $('#velo-panel').classList.add('visible');
    $('[data-accion="abrir-panel"]').setAttribute('aria-expanded', 'true');
    history.pushState({ pantalla: this.actual, panel: true }, '');
    setTimeout(() => { const b = $('#panel-lateral .opcion-panel'); if (b) b.focus(); }, 50);
  },
  cerrarPanel() {
    const panel = $('#panel-lateral');
    if (!panel || !panel.classList.contains('abierto')) return;
    panel.classList.remove('abierto');
    panel.setAttribute('aria-hidden', 'true');
    $('#velo-panel').classList.remove('visible');
    $('[data-accion="abrir-panel"]').setAttribute('aria-expanded', 'false');
  },
  actualizarPanel() {
    const modo = MODOS[this.modo];
    const m = $('#panel-modo'); if (m) m.textContent = modo ? modo.nombre : '';
    const t = $('#panel-tema'); if (t) t.textContent = { claro: 'Claro', oscuro: 'Oscuro' }[leerLocal(CLAVES_LOCALES.TEMA)] || 'Como el sistema';
    const dc = $('#panel-decimales'); if (dc) dc.textContent = this.todosLosDecimales() ? 'Todos (5)' : '2';
    const tx = $('#panel-texto'); if (tx) tx.textContent = { grande: 'Grande', 'muy-grande': 'Muy grande' }[leerLocal(CLAVES_LOCALES.TAMANO_TEXTO)] || 'Normal';
    const c = $('#panel-cuenta'); if (c) c.textContent = Sesion.modoDemo ? 'Demostración' : (Sesion.correo || '');
    const r = $('#panel-respaldo'); if (r) r.textContent = this.textoRespaldo();
    const pie = $('#panel-pie');
    if (pie) pie.textContent = `Versión ${VERSION_APP}${Almacen.actualizadoEn ? ' · datos al ' + Almacen.actualizadoEn.slice(0, 16) : ''}`;
  },
  textoRespaldo() {
    const ultimo = leerLocal(CLAVES_LOCALES.ULTIMO_RESPALDO);
    if (!ultimo) return '';
    const dias = diasEntre(ultimo.slice(0, 10), obtenerFechaLocal());
    return dias <= 0 ? 'respaldo: hoy' : `respaldo: hace ${dias} ${pluralizar(dias, 'día')}`;
  },

  // ---------- Modos (D10, D22) ----------
  cambiarModo(modo) {
    if (!MODOS[modo]) return;
    const aplicar = () => {
      document.body.dataset.modo = modo;
      guardarLocal(CLAVES_LOCALES.MODO, modo);
      this.actualizarPanel();
      if (this.actual === 'panorama' && modo !== 'pro') this.ir('dashboard');
      else this.refrescarActual();
    };
    if (document.body.dataset.modo === modo || !$('#app') || $('#app').hidden) { aplicar(); return; }
    // Transición (auditoría 2026-10-22): aunque la interfaz sea parecida, se
    // nota que el modo cambió. Solo opacidad y transform; sin movimiento si
    // el sistema pide reducirlo (lo resuelve el CSS).
    const m = MODOS[modo];
    const capa = document.createElement('div');
    capa.className = 'transicion-modo';
    capa.setAttribute('aria-hidden', 'true');
    capa.innerHTML = html`<div class="contenido-transicion">${seguro(icono(m.icono, 'icono-xl'))}<strong>Modo ${m.nombre}</strong><span>${m.frase}</span></div>`.texto;
    document.body.appendChild(capa);
    document.body.classList.add('cambiando-modo');
    requestAnimationFrame(() => capa.classList.add('visible'));
    setTimeout(aplicar, 220);
    setTimeout(() => { capa.classList.remove('visible'); document.body.classList.remove('cambiando-modo'); }, 700);
    setTimeout(() => capa.remove(), 1100);
    avisar(`Modo ${m.nombre}`);
  },
  elegirModo(alElegir) {
    const actual = this.modo;
    const control = abrirHoja({
      titulo: 'Modo de trabajo',
      contenido: html`<p class="t-secundario">Solo cambia qué pantallas y campos ves. Tus datos no cambian.</p>
        <div class="opciones-modo">${Object.entries(MODOS).map(([clave, m]) => html`
          <button type="button" class="tarjeta opcion-modo" data-modo="${clave}" aria-pressed="${String(clave === actual)}">
            ${seguro(icono(m.icono, 'icono-lg'))}<span><strong>${m.nombre}</strong><span class="t-pequeno t-secundario">${m.frase}</span></span>
          </button>`)}</div>`,
      alMontar: (hoja) => $$('[data-modo]', hoja).forEach(b => b.addEventListener('click', () => {
        this.cambiarModo(b.dataset.modo); control.cerrar(); if (alElegir) alElegir(b.dataset.modo);
      }))
    });
  },

  // ---------- Tema y texto ----------
  aplicarTema(valor) {
    guardarLocal(CLAVES_LOCALES.TEMA, valor === 'claro' || valor === 'oscuro' ? valor : null);
    const efectivo = (valor === 'claro' || valor === 'oscuro') ? valor
      : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro');
    document.documentElement.dataset.tema = efectivo;
    this.actualizarPanel();
    this._oyentesTema.forEach(fn => { try { fn(efectivo); } catch (e) { /* nada */ } });
  },
  alCambiarTema(fn) { this._oyentesTema.add(fn); return () => this._oyentesTema.delete(fn); },
  elegirTema() {
    const actual = leerLocal(CLAVES_LOCALES.TEMA) || 'sistema';
    const opciones = [['claro', 'Claro', 'sol'], ['oscuro', 'Oscuro', 'luna'], ['sistema', 'Como el sistema', 'telefono']];
    const control = abrirHoja({
      titulo: 'Tema',
      contenido: html`<div class="lista">${opciones.map(([v, t, i]) => html`<button type="button" class="fila-lista" data-tema="${v}" aria-pressed="${String(v === actual)}">${seguro(icono(i))}<span class="titulo">${t}</span>${v === actual ? seguro(icono('check', 'lado')) : ''}</button>`)}</div>`,
      alMontar: (hoja) => $$('[data-tema]', hoja).forEach(b => b.addEventListener('click', () => { this.aplicarTema(b.dataset.tema); control.cerrar(); }))
    });
  },
  // «Mostrar todos los decimales» (v2: casilla del CPP): por defecto 2.
  todosLosDecimales() { return leerLocal(CLAVES_LOCALES.TODOS_DECIMALES) === '1'; },
  cambiarTodosLosDecimales(si) {
    guardarLocal(CLAVES_LOCALES.TODOS_DECIMALES, si ? '1' : null);
    fijarTodosLosDecimales(si);
    this.actualizarPanel();
    this.refrescarActual();
    avisar(si ? 'Se muestran todos los decimales en costos por unidad y CPP.' : 'Cifras redondeadas a 2 decimales.');
  },

  elegirTamanoTexto() {
    const actual = leerLocal(CLAVES_LOCALES.TAMANO_TEXTO) || 'normal';
    const opciones = [['normal', 'Normal'], ['grande', 'Grande'], ['muy-grande', 'Muy grande']];
    const control = abrirHoja({
      titulo: 'Tamaño de texto',
      contenido: html`<div class="lista">${opciones.map(([v, t]) => html`<button type="button" class="fila-lista" data-tamano="${v}"><span class="titulo" style="font-size:${v === 'normal' ? '1rem' : v === 'grande' ? '1.125rem' : '1.25rem'}">${t}</span>${v === actual ? seguro(icono('check', 'lado')) : ''}</button>`)}</div>`,
      alMontar: (hoja) => $$('[data-tamano]', hoja).forEach(b => b.addEventListener('click', () => {
        const v = b.dataset.tamano;
        guardarLocal(CLAVES_LOCALES.TAMANO_TEXTO, v === 'normal' ? null : v);
        if (v === 'normal') document.documentElement.removeAttribute('data-tamano-texto'); else document.documentElement.dataset.tamanoTexto = v;
        this.actualizarPanel(); control.cerrar();
      }))
    });
  },

  // ---------- Conexión, sincronización y sesión ----------
  actualizarEstado() {
    const el = $('#estado-sync');
    if (!el) return;
    if (Almacen.sinConexion) {
      el.className = 'estado-sync sin-conexion';
      el.innerHTML = icono('sin-nube', 'icono-sm') + '<span>Sin conexión</span>';
    } else {
      el.className = 'estado-sync';
      el.innerHTML = Sesion.modoDemo ? '<span class="insignia aviso">Demo</span>' : icono('nube-check', 'icono-sm');
      el.title = Almacen.actualizadoEn ? `Datos al ${Almacen.actualizadoEn}` : '';
    }
  },
  mostrarFranja(id, contenido, clase, accion) {
    let f = $(`#franja-${id}`);
    if (!f) { f = document.createElement('div'); f.id = `franja-${id}`; $('#franjas').appendChild(f); }
    f.className = `franja ${clase || 'info-color'}`;
    f.innerHTML = html`${seguro(contenido.texto !== undefined ? contenido.texto : contenido)}${accion ? html`<button type="button" class="boton boton-sm boton-secundario">${accion.texto}</button>` : ''}`.texto;
    if (accion) $('button', f).addEventListener('click', accion.fn);
  },
  quitarFranja(id) { const f = $(`#franja-${id}`); if (f) f.remove(); },
  marcarSinConexion(sin) {
    Almacen.sinConexion = sin;
    document.body.classList.toggle('sin-conexion', !!sin);
    if (sin) {
      const cuando = Almacen.actualizadoEn ? Almacen.actualizadoEn.slice(0, 16) : '';
      const vence = vencimientoCopia(Almacen.actualizadoEn);
      const hasta = vence ? new Date(vence) : null;
      const textoHasta = hasta ? ` Sin internet podrás verlos hasta el ${formatearFechaCorta(fechaATexto(hasta))} a las ${String(hasta.getHours()).padStart(2, '0')}:${String(hasta.getMinutes()).padStart(2, '0')}.` : '';
      this.mostrarFranja('conexion', html`${seguro(icono('sin-nube', 'icono-sm'))}<span>Sin conexión${cuando ? ` · datos al ${cuando}` : ''}. Puedes consultar; para guardar necesitas internet.${textoHasta}</span>`, 'aviso-color');
    } else this.quitarFranja('conexion');
    this.actualizarEstado();
    this.refrescarActual();
  },
  async alVolverConexion() {
    if (!Almacen.baseId) return;
    if (App.abiertaSinRed) {
      // Se abrió sin internet: hay que entrar (y verificar el acceso) para guardar.
      this.mostrarFranja('conexion', html`${seguro(icono('nube', 'icono-sm'))}<span>Volvió internet. Entra de nuevo para actualizar tus datos y poder guardar.</span>`, 'info-color',
        { texto: 'Entrar', fn: () => location.reload() });
      return;
    }
    try {
      await abrirBase(Almacen.baseId);
      this.marcarSinConexion(false);
      avisar('Conexión recuperada: datos actualizados.');
    } catch (e) { /* sigue sin conexión */ }
  },
  revisarSesion() {
    if (Sesion.modoDemo || !Almacen.baseId) return;
    if (Sesion.porVencer()) {
      const min = Math.max(0, Math.floor(Sesion.minutosRestantes()));
      this.mostrarFranja('sesion', html`${seguro(icono('reloj', 'icono-sm'))}<span>${min > 0 ? `Tu sesión con Google vence en ${min} min.` : 'Tu sesión con Google venció.'}</span>`, 'info-color',
        { texto: 'Renovar', fn: async () => { try { await Sesion.renovarToken(); this.quitarFranja('sesion'); avisar('Sesión renovada.'); } catch (e) { /* canceló */ } } });
    } else this.quitarFranja('sesion');
  },

  async salir() {
    const ok = await confirmar({
      titulo: '¿Cerrar sesión?',
      mensaje: 'Se borran los datos guardados en este dispositivo. Tu información en Google Drive no cambia.',
      textoConfirmar: 'Cerrar sesión'
    });
    if (ok) await Sesion.cerrar();
  }
};
