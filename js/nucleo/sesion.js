// © 2026 KoreStock Ledger — un proyecto de Kitsótaro · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// SESION.JS — inicio de sesión con Google, verificación de licencia y
// renovación del token. Heredado del bloque de auth de la v2 (core.js),
// con los refuerzos de D63, D64 y D68.
//
// - El token de Google dura ≈1 h (no se puede alargar desde el navegador).
//   Se guarda en localStorage con la MISMA clave de la v2.
// - D64: margen de 60 s al validar el token guardado; aviso antes de que
//   venza; antes de cada guardado se comprueba y, si venció, se pide
//   renovar con un toque y el guardado continúa sin perder nada.
// - D63: la verificación de licencia tiene tiempo máximo (25 s); si el
//   servidor de Google falla, el mensaje lo dice y NO se borra la sesión.
//   Quien ya fue autorizado en este dispositivo en las últimas 24 h puede
//   entrar mientras el verificador esté caído (nunca si responde «no»).
// - D68: se envía también el token para que el verificador obtenga el
//   correo de Google en vez de creer el que manda el navegador. El
//   verificador viejo lo ignora y sigue funcionando.
// - Modo demostración: no hay Google; el actor es la cuenta demo.
//
// Expone: Sesion, actorActual.
// Depende de: config.js, utilidades.js; en tiempo de ejecución gapi y
//   google.accounts (scripts de Google), mostrarDialogo (ui).
// ============================================================

const AUTORIZACION_CACHE_MS = 5 * 60 * 1000;          // 5 min sin volver a preguntar (heredado)
const GRACIA_VERIFICADOR_MS = 24 * 60 * 60 * 1000;     // 24 h si el verificador está caído (D63)
const MARGEN_TOKEN_MS = 60 * 1000;                     // D64 (a)
const AVISO_VENCIMIENTO_MS = 5 * 60 * 1000;            // D64 (b)
const TIEMPO_MAXIMO_VERIFICACION_MS = 25 * 1000;       // D63

const Sesion = {
  modoDemo: false,
  tokenClient: null,
  gapiListo: false,
  gisListo: false,
  pickerListo: false,
  correo: '',
  _renovando: null,
  _alListo: [],

  // Callbacks que asigna la interfaz.
  alEstado: null,          // (texto) => void
  alAutorizar: null,       // ({ gracia }) => void
  alRechazo: null,         // ({ tipo, mensaje }) => void

  estado(texto) { if (this.alEstado) this.alEstado(texto); },

  // ---------- Librerías de Google ----------
  cargarLibrerias() {
    if (this.modoDemo) return Promise.resolve();
    return new Promise((resolver) => {
      const intentar = () => {
        if (typeof gapi !== 'undefined' && !this.gapiListo && !this._gapiIniciando) {
          this._gapiIniciando = true;
          gapi.load('client', async () => {
            await gapi.client.init({
              discoveryDocs: [
                'https://sheets.googleapis.com/$discovery/rest?version=v4',
                'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'
              ]
            });
            this.gapiListo = true;
            listo();
          });
          gapi.load('picker', () => { this.pickerListo = true; });
        }
        if (typeof google !== 'undefined' && google.accounts && !this.gisListo) {
          this.tokenClient = google.accounts.oauth2.initTokenClient({ client_id: CLIENT_ID, scope: SCOPES, callback: () => {} });
          this.gisListo = true;
          listo();
        }
        // Si ya estaban listas (segunda llamada, p. ej. al pulsar «Entrar»), se resuelve
        // aquí: antes la promesa quedaba pendiente para siempre y no abría el login.
        if (!this.gapiListo || !this.gisListo) setTimeout(intentar, 150); else listo();
      };
      const listo = () => { if (this.gapiListo && this.gisListo) resolver(); };
      intentar();
    });
  },

  // ---------- Token guardado ----------
  leerToken() {
    try {
      const g = JSON.parse(localStorage.getItem(CLAVES_LOCALES.TOKEN));
      if (g && g.expira - MARGEN_TOKEN_MS > Date.now()) return g;
    } catch (e) { /* vacío o corrupto */ }
    return null;
  },
  leerRegistro() {
    try { return JSON.parse(localStorage.getItem(CLAVES_LOCALES.TOKEN)) || null; } catch (e) { return null; }
  },
  guardarToken(resp) {
    const anterior = this.leerRegistro() || {};
    const registro = Object.assign({}, anterior, { access_token: resp.access_token, expira: Date.now() + resp.expires_in * 1000 });
    try { localStorage.setItem(CLAVES_LOCALES.TOKEN, JSON.stringify(registro)); } catch (e) { /* sin almacenamiento */ }
    if (typeof gapi !== 'undefined' && gapi.client) gapi.client.setToken({ access_token: resp.access_token });
  },
  marcarAutorizado(correo) {
    const r = this.leerRegistro();
    if (!r) return;
    r.autorizadoHasta = Date.now() + AUTORIZACION_CACHE_MS;
    r.ultimaAutorizacion = Date.now();
    r.correo = correo || r.correo;
    try { localStorage.setItem(CLAVES_LOCALES.TOKEN, JSON.stringify(r)); } catch (e) { /* nada */ }
  },
  // D27/D66: sin internet solo abre la copia del dispositivo (en solo
  // lectura) quien ya fue autorizado antes en este dispositivo.
  // Y como máximo 3 días después de su última verificación (igual que la copia).
  autorizadoAntes() { const r = this.leerRegistro(); return !!(r && r.ultimaAutorizacion && Date.now() - r.ultimaAutorizacion < VIGENCIA_COPIA_MS); },
  borrarToken() { try { localStorage.removeItem(CLAVES_LOCALES.TOKEN); } catch (e) { /* nada */ } },

  minutosRestantes() {
    if (this.modoDemo) return Infinity;
    const r = this.leerRegistro();
    return r && r.expira ? (r.expira - Date.now()) / 60000 : 0;
  },
  porVencer() { return !this.modoDemo && this.minutosRestantes() * 60000 < AVISO_VENCIMIENTO_MS; },

  // ---------- Flujo de entrada ----------
  // Al abrir la app: si hay token vigente, entra sin pedir nada.
  async reanudar() {
    if (this.modoDemo) { this.correo = 'demo@korestock.local'; if (this.alAutorizar) this.alAutorizar({}); return true; }
    await this.cargarLibrerias();
    const t = this.leerToken();
    if (!t) return false;
    gapi.client.setToken({ access_token: t.access_token });
    if (t.autorizadoHasta && t.autorizadoHasta > Date.now()) {
      this.correo = t.correo || '';
      if (this.alAutorizar) this.alAutorizar({});
      return true;
    }
    await this.verificarYEntrar();
    return true;
  },

  // Botón «Iniciar sesión con Google».
  async iniciar() {
    if (this.modoDemo) return this.reanudar();
    await this.cargarLibrerias();
    return new Promise((resolver) => {
      this.tokenClient.callback = async (resp) => {
        if (resp.error) { resolver(false); return; }
        this.guardarToken(resp);
        await this.verificarYEntrar();
        resolver(true);
      };
      this.tokenClient.error_callback = () => resolver(false);
      this.tokenClient.requestAccessToken({ prompt: 'select_account' });
    });
  },

  async verificarYEntrar() {
    this.estado('Verificando tu acceso… (puede tardar unos segundos)');
    let correo = '';
    try { correo = await Hoja.correoUsuario(); } catch (e) { correo = ''; }
    this.correo = correo;
    const token = (this.leerRegistro() || {}).access_token || '';
    const resultado = await this.verificarAcceso(correo, token);
    if (resultado === 'autorizado') {
      this.marcarAutorizado(correo);
      if (this.alAutorizar) this.alAutorizar({});
      return;
    }
    if (resultado === 'no-autorizado') {
      if (typeof gapi !== 'undefined') gapi.client.setToken(null);
      this.borrarToken();
      if (this.alRechazo) this.alRechazo({ tipo: 'no-autorizado' });
      return;
    }
    // Falla del verificador o de la red: periodo de gracia si ya entró antes.
    const r = this.leerRegistro() || {};
    const enGracia = r.ultimaAutorizacion && (Date.now() - r.ultimaAutorizacion) < GRACIA_VERIFICADOR_MS && (!r.correo || r.correo === correo);
    if (enGracia) {
      if (this.alAutorizar) this.alAutorizar({ gracia: true });
      return;
    }
    if (this.alRechazo) this.alRechazo({ tipo: resultado });
  },

  // Devuelve 'autorizado' | 'no-autorizado' | 'error-servidor' | 'sin-red'.
  async verificarAcceso(correo, token) {
    if (!correo && !token) return 'no-autorizado';
    const consultar = async () => {
      const control = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const temporizador = control ? setTimeout(() => control.abort(), TIEMPO_MAXIMO_VERIFICACION_MS) : null;
      try {
        const url = `${URL_VERIFICACION_ACCESO}?email=${encodeURIComponent(correo || '')}&token=${encodeURIComponent(token || '')}`;
        const resp = await fetch(url, { signal: control ? control.signal : undefined, cache: 'no-store' });
        const texto = await resp.text();
        let datos;
        try { datos = JSON.parse(texto); } catch (e) { return 'error-servidor'; }
        if (typeof datos.autorizado !== 'boolean') return 'error-servidor';
        return datos.autorizado ? 'autorizado' : 'no-autorizado';
      } catch (e) {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'sin-red';
        return e && e.name === 'AbortError' ? 'error-servidor' : 'sin-red';
      } finally {
        if (temporizador) clearTimeout(temporizador);
      }
    };
    const primero = await consultar();
    if (primero === 'autorizado' || primero === 'no-autorizado') return primero;
    await esperar(800);
    return consultar();
  },

  // ---------- Renovación (D64) ----------
  // Muestra un aviso con botón (el navegador solo abre la ventana de Google
  // si la persona toca algo). Resuelve cuando hay token nuevo.
  renovarToken(mensaje) {
    if (this.modoDemo) return Promise.resolve();
    if (this._renovando) return this._renovando;
    this._renovando = new Promise((resolver, rechazar) => {
      const pedir = () => {
        this.tokenClient.callback = (resp) => {
          if (resp.error) { this._renovando = null; rechazar(new Error('No se renovó la sesión')); return; }
          this.guardarToken(resp);
          this.marcarAutorizado(this.correo);
          this._renovando = null;
          resolver();
        };
        this.tokenClient.error_callback = () => { this._renovando = null; rechazar(new Error('No se renovó la sesión')); };
        this.tokenClient.requestAccessToken({ prompt: '' });
      };
      mostrarDialogo({
        titulo: 'Renueva tu sesión',
        mensaje: mensaje || 'Por seguridad, Google pide confirmar tu sesión cada hora. Lo que estabas haciendo no se pierde.',
        textoConfirmar: 'Renovar sesión',
        textoCancelar: 'Ahora no',
        onConfirmar: pedir,
        onCancelar: () => { this._renovando = null; rechazar(new Error('Sesión vencida')); }
      });
    });
    return this._renovando;
  },

  // Antes de guardar: si al token le queda menos de un minuto, renueva primero.
  async asegurarVigente() {
    if (this.modoDemo) return;
    if (this.minutosRestantes() * 60000 < MARGEN_TOKEN_MS) await this.renovarToken();
  },

  async cerrar() {
    this.borrarToken();
    if (typeof CacheLocal !== 'undefined') await CacheLocal.borrarTodo();
    if (typeof location !== 'undefined') location.reload();
  }
};

// Quién hizo algo, para los registros (D48): la cuenta de Google.
function actorActual() {
  return Sesion.correo || (Sesion.leerRegistro && (Sesion.leerRegistro() || {}).correo) || '';
}
