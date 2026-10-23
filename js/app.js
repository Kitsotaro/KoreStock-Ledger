// © 2026 KoreStock Ledger — un proyecto de Kitsótaro · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// APP.JS — arranque: landing → sesión → base de datos → pantallas.
//
// Encontrar la base (heredado de buscarOCrearBaseDatos, ahora con carpeta):
//   1. La guardada en este navegador (si hay copia local v3, se abre al
//      instante sin consultar nada más).
//   2. La base principal de la carpeta KoreStock (appProperties).
//   3. Una base v2 «StockCentral_DB» → asistente de migración.
//   4. Si no hay ninguna: elegir una con el selector de Google, o empezar de
//      cero (en demostración: cargar la base de prueba).
// Al terminar: primer uso (modo y avisos) y la app abre en Venta (§25.1).
//
// Expone: App.
// Depende de: todo el núcleo, shell.js, componentes.js, cargador.js,
//   selector-archivo.js, pantallas de migración y primer uso, modo-demo.js.
// ============================================================

const UMBRALES_INICIALES = [
  { clave: 'TODOS', min: 4, max: 6 }, { clave: 'ROI', min: 10, max: 20 }, { clave: 'AGOTAMIENTO', min: 7, max: 20 }
];

const App = {
  gracia: false,

  async iniciar() {
    pintarIconos(document);
    Shell.iniciar();
    this.registrarPantallasPendientes();
    delegar($('#landing'), 'click', { entrar: () => this.entrar() });
    Sesion.alEstado = (t) => { const e = $('#estado-entrada'); if (e) e.textContent = t; };
    Sesion.alAutorizar = (info) => this.alAutorizar(info);
    Sesion.alRechazo = (info) => this.alRechazo(info);

    // Copia del dispositivo con más de 3 días sin actualizarse: se borra (seguridad).
    if (!esModoDemo()) {
      try { if (await CacheLocal.purgarVencidas()) avisar('Tus datos guardados en este dispositivo tenían más de 3 días sin actualizarse y se borraron por seguridad. Entra con internet para volver a verlos.', { duracion: 8000 }); } catch (e) { /* sin copia */ }
    }
    if (esModoDemo()) {
      DriveDemo.cargar();
      Hoja.usar(MotorDemo);
      Sesion.modoDemo = true;
      $('#boton-entrar').textContent = 'Entrar a la demostración';
      Sesion.estado('Modo demostración: sin Google; los datos viven solo en este navegador.');
      return;
    }
    Hoja.usar(MotorGoogle);
    if (navigator.onLine === false && await this.abrirSinRed()) return;
    try {
      await cargarGoogle();
      Sesion.estado('');
      await Sesion.reanudar();
    } catch (e) {
      if (await this.abrirSinRed()) return;
      Sesion.estado('No se pudo conectar con Google. Revisa tu internet y vuelve a intentarlo.');
    }
  },

  // Sin internet (D27): abre la copia guardada en este dispositivo, solo
  // para consultar. Al volver la red hay que entrar de nuevo para guardar.
  abiertaSinRed: false,
  async abrirSinRed() {
    const id = leerLocal(CLAVES_LOCALES.BASE);
    const copia = id ? await CacheLocal.leer(id) : null;
    if (!Sesion.autorizadoAntes() || !copia || copia.version !== VERSION_ESQUEMA) return false;
    Sesion.correo = (Sesion.leerRegistro() || {}).correo || '';
    // Sin pasar por Drive: aunque la red vuelva a medias, no se escribe sin verificar el acceso.
    this.abiertaSinRed = true;
    PeriodosLargos.reiniciar();
    Almacen.cargar(copia.hojas, id);
    Almacen.actualizadoEn = copia.guardado || '';
    this.mostrar('app');
    Shell.marcarSinConexion(true);
    Shell.ir('dashboard');
    Shell.actualizarPanel();
    return true;
  },

  async entrar() {
    const boton = $('#boton-entrar');
    boton.classList.add('cargando');
    try {
      if (Sesion.modoDemo) await Sesion.reanudar();
      else { await cargarGoogle(); await Sesion.iniciar(); }
    } catch (e) {
      Sesion.estado('No se pudo iniciar sesión. Inténtalo de nuevo.');
    } finally { boton.classList.remove('cargando'); }
  },

  alRechazo({ tipo }) {
    const mensajes = {
      'no-autorizado': ['Sin autorización', `Esta cuenta todavía no tiene acceso. Escríbenos a ${CORREO_CONTACTO} para activarla.`],
      'error-servidor': ['El servidor de Google no responde', `El servidor de Google no está respondiendo como debería. Inténtalo en unos minutos; si sigue, contacta a Kitsotaro (${CORREO_CONTACTO}).`],
      'sin-red': ['Sin conexión', 'No pudimos confirmar tu acceso porque no hay internet. Revisa tu conexión e inténtalo de nuevo.']
    };
    if (tipo === 'sin-red') { this.abrirSinRed().then(ok => { if (!ok) mostrarDialogo({ titulo: mensajes['sin-red'][0], mensaje: mensajes['sin-red'][1] }); }); Sesion.estado(''); return; }
    const [titulo, mensaje] = mensajes[tipo] || mensajes['error-servidor'];
    Sesion.estado('');
    mostrarDialogo({ titulo, mensaje });
  },

  mostrar(seccion) {
    $('#landing').hidden = seccion !== 'landing';
    $('#carga').hidden = seccion !== 'carga';
    $('#app').hidden = seccion !== 'app';
  },
  textoCarga(t) { const e = $('#carga-texto'); if (e) e.textContent = t; },

  async alAutorizar({ gracia }) {
    this.gracia = !!gracia;
    this.mostrar('carga');
    this.textoCarga('Buscando tus datos…');
    try {
      const id = await this.resolverBase();
      if (id) await this.abrir(id);
    } catch (e) {
      this.errorCarga(e);
    }
  },

  errorCarga(e) {
    this.mostrar('carga');
    $('#carga').innerHTML = html`<div class="vacio">${seguro(icono('sin-nube', 'icono-xl'))}<strong>No pudimos abrir tus datos</strong>
      <p>${e && e.message ? e.message : 'Ocurrió algo inesperado. Inténtalo de nuevo; si sigue pasando, escríbenos.'}</p>
      <button type="button" class="boton boton-primario" id="reintentar-carga">Reintentar</button></div>`.texto;
    $('#reintentar-carga').addEventListener('click', () => location.reload());
  },

  async resolverBase() {
    const guardado = leerLocal(CLAVES_LOCALES.BASE);
    if (guardado) {
      const copia = await CacheLocal.leer(guardado);
      // Con copia local se abre al instante; las hojas nuevas de una versión
      // reciente se agregan al Excel en segundo plano cuando hay internet.
      if (copia && copia.version === VERSION_ESQUEMA) { asegurarHojasUnaVez(guardado).catch(() => {}); return guardado; }
      if (await Hoja.existe(guardado)) {
        const v = await detectarVersionEsquema(guardado);
        if (v.version === 3) { await asegurarHojasV3(guardado); return guardado; }
        if (v.version === 2) {
          const yaMigrada = (await Hoja.listarArchivos({ propiedades: { korestock: 'base', tipo: 'principal' } }))
            .find(f => f.propiedades.origen === guardado);
          if (yaMigrada) { guardarLocal(CLAVES_LOCALES.BASE, yaMigrada.id); return yaMigrada.id; }
          this.migrar(guardado);
          return null;
        }
      }
    }
    const principales = await Hoja.listarArchivos({ propiedades: { korestock: 'base', tipo: 'principal' } });
    if (principales.length) { guardarLocal(CLAVES_LOCALES.BASE, principales[0].id); return principales[0].id; }
    const v2 = await Hoja.buscarPorNombre(NOMBRE_BASE_V2);
    if (v2.length) { guardarLocal(CLAVES_LOCALES.BASE, v2[0].id); this.migrar(v2[0].id); return null; }
    return this.preguntarOrigen();
  },

  migrar(idViejo) {
    this.mostrar('app');
    iniciarMigracion(idViejo, async (idNuevo) => { await this.abrir(idNuevo); });
  },

  preguntarOrigen() {
    return new Promise((resolver) => {
      const demo = Sesion.modoDemo;
      mostrarDialogo({
        titulo: demo ? 'Demostración' : 'No encontramos tus datos',
        mensaje: demo
          ? 'Puedes cargar la base de prueba (una tienda simulada con 6 meses de movimientos) o empezar con una base vacía.'
          : '¿Ya tenías una base de KoreStock en tu Google Drive, o es la primera vez que la usas con esta cuenta?',
        textoConfirmar: demo ? 'Cargar base de prueba' : 'Ya tengo una, elegirla',
        textoCancelar: 'Empezar de cero',
        onConfirmar: async () => {
          try {
            if (demo) {
              this.textoCarga('Cargando la base de prueba…');
              const id = await cargarBasePruebaDemo();
              guardarLocal(CLAVES_LOCALES.BASE, id);
              this.migrar(id);
              resolver(null);
              return;
            }
            resolver(await this.elegirConGoogle());
          } catch (e) {
            mostrarDialogo({ titulo: 'No se pudo', mensaje: e.message, onConfirmar: () => this.preguntarOrigen().then(resolver) });
          }
        },
        onCancelar: async () => {
          this.textoCarga('Preparando tu espacio en la carpeta KoreStock…');
          const id = await crearBaseV3({ hojas: { UMBRALES: UMBRALES_INICIALES } });
          guardarLocal(CLAVES_LOCALES.BASE, id);
          resolver(id);
        }
      });
    });
  },

  async elegirConGoogle() {
    for (;;) {
      let id;
      try { id = await elegirArchivoConGoogle(); }
      catch (e) { if (e.message === 'CANCELADO') return this.preguntarOrigen(); throw e; }
      const v = await detectarVersionEsquema(id).catch(() => ({ version: 0 }));
      if (v.version === 3) { guardarLocal(CLAVES_LOCALES.BASE, id); await asegurarHojasV3(id); return id; }
      if (v.version === 2) { guardarLocal(CLAVES_LOCALES.BASE, id); this.migrar(id); return null; }
      await new Promise(r => mostrarDialogo({ titulo: 'Archivo incorrecto', mensaje: 'Ese archivo no parece una base de KoreStock (le faltan hojas como LOG_TRANS o CATALOGO). Elige el archivo correcto.', onConfirmar: r }));
    }
  },

  async abrir(id) {
    this.mostrar('carga');
    this.textoCarga('Abriendo tus datos…');
    PeriodosLargos.reiniciar();
    let mostrada = false;
    const mostrarUnaVez = async () => {
      if (mostrada) return;
      mostrada = true;
      this.mostrar('app');
      Shell.actualizarEstado();
      if (necesitaPrimerUso()) await ejecutarPrimerUso();
      Shell.ir('venta');
    };
    const r = await abrirBase(id, async (origen) => {
      if (!mostrada) await mostrarUnaVez();
      else if (origen === 'drive') Shell.refrescarActual();
    });
    if (r && r.sinConexion) Shell.marcarSinConexion(true);
    Shell.actualizarEstado();
    Shell.actualizarPanel();
    avisoRotacionSiToca();
    // Respaldo del día en segundo plano: si falla, se intenta al abrir la próxima vez.
    if (!Almacen.sinConexion) respaldoDiarioSiHaceFalta(id).then(r => { if (r) Shell.actualizarPanel(); }).catch(() => { /* sin respaldo hoy */ });
    if (this.gracia) avisar('No pudimos confirmar tu licencia porque el verificador no responde; entraste con tu acceso anterior.', { duracion: 7000 });
  },

  // Pantallas aún no construidas: muestran un aviso en vez de fallar.
  registrarPantallasPendientes() {
    $$('.pantalla').forEach(s => {
      const n = s.dataset.pantalla;
      if (Pantallas[n]) return;
      registrarPantalla(n, {
        titulo: n.charAt(0).toUpperCase() + n.slice(1),
        montar(el) { el.innerHTML = html`<div class="vacio">${seguro(icono('reloj', 'icono-xl'))}<strong>Pronto</strong><p>Esta pantalla está en construcción.</p></div>`.texto; }
      });
    });
  }
};

document.addEventListener('DOMContentLoaded', () => { App.iniciar(); });
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => { /* sin SW: la app funciona igual */ }); });
}
