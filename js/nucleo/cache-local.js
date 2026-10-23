// © 2026 Wilber Adonay Escobar Solórzano (Kitsótaro) · KoreStock Ledger · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// CACHE-LOCAL.JS — copia de tus datos en este dispositivo (IndexedDB).
//
// Para qué (V3 §15.4): abrir y filtrar al instante sin releer todo de
// Drive, y gastar menos cuota de Google. El Sheet SIGUE siendo la fuente
// de verdad: esto es solo una copia de lectura que se actualiza después
// de cada guardado exitoso y al abrir la app.
//
// - Se pide al navegador que no la borre (navigator.storage.persist).
// - «Cerrar sesión» la borra (V3 §31 punto 19).
// - Sin IndexedDB (Node, modo privado estricto) funciona en memoria.
// - D30/D66: no se cifra; la seguridad del dispositivo es del usuario.
// - Vigencia máxima de 3 DÍAS (Kitso, 2026-10-22): si la copia no se
//   actualizó con internet en ese plazo, se BORRA al abrir la app (evita
//   fugas por descuido, robo del teléfono o un acceso viejo) y hay que
//   volver a entrar con internet. Mide desde `guardado` (última vez que la
//   copia se sincronizó con Drive).
//
// Expone: CacheLocal, VIGENCIA_COPIA_MS, vencimientoCopia.
// Depende de: utilidades.js (textoAFecha) en tiempo de ejecución.
// ============================================================

const NOMBRE_BD_LOCAL = 'korestock';
const VERSION_BD_LOCAL = 1;
const VIGENCIA_COPIA_MS = 3 * 24 * 60 * 60 * 1000;

// Momento (ms) en que vence una copia guardada el 'YYYY-MM-DD HH:MM:SS' local.
function vencimientoCopia(guardado) {
  if (!guardado) return 0;
  const f = textoAFecha(guardado);
  const [h, m, s] = String(guardado).slice(11, 19).split(':').map(Number);
  f.setHours(h || 0, m || 0, s || 0, 0);
  return f.getTime() + VIGENCIA_COPIA_MS;
}

const CacheLocal = {
  _bd: null,
  _memoria: new Map(),
  _abriendo: null,

  disponible() {
    return typeof indexedDB !== 'undefined';
  },

  async _abrir() {
    if (!this.disponible()) return null;
    if (this._bd) return this._bd;
    if (this._abriendo) return this._abriendo;
    this._abriendo = new Promise((resolver) => {
      let peticion;
      try { peticion = indexedDB.open(NOMBRE_BD_LOCAL, VERSION_BD_LOCAL); } catch (e) { resolver(null); return; }
      peticion.onupgradeneeded = () => {
        const bd = peticion.result;
        if (!bd.objectStoreNames.contains('bases')) bd.createObjectStore('bases', { keyPath: 'id' });
        if (!bd.objectStoreNames.contains('historicos')) bd.createObjectStore('historicos', { keyPath: 'id' });
      };
      peticion.onsuccess = () => { this._bd = peticion.result; resolver(this._bd); };
      peticion.onerror = () => resolver(null);
      peticion.onblocked = () => resolver(null);
    });
    const bd = await this._abriendo;
    this._abriendo = null;
    if (bd && typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {});
    }
    return bd;
  },

  async _operar(almacen, modo, fn) {
    const bd = await this._abrir();
    if (!bd) return null;
    return new Promise((resolver) => {
      try {
        const tx = bd.transaction(almacen, modo);
        const peticion = fn(tx.objectStore(almacen));
        tx.oncomplete = () => resolver(peticion ? peticion.result : true);
        tx.onerror = () => resolver(null);
        tx.onabort = () => resolver(null);
      } catch (e) { resolver(null); }
    });
  },

  async leer(id, almacen) {
    const a = almacen || 'bases';
    if (!this.disponible()) return this._memoria.get(`${a}:${id}`) || null;
    return this._operar(a, 'readonly', s => s.get(id));
  },

  async guardar(registro, almacen) {
    const a = almacen || 'bases';
    if (!this.disponible()) { this._memoria.set(`${a}:${registro.id}`, registro); return true; }
    return this._operar(a, 'readwrite', s => s.put(registro));
  },

  async borrar(id, almacen) {
    const a = almacen || 'bases';
    if (!this.disponible()) { this._memoria.delete(`${a}:${id}`); return true; }
    return this._operar(a, 'readwrite', s => s.delete(id));
  },

  // Borra todo si alguna copia de base venció. Devuelve true si borró.
  async purgarVencidas(ahora) {
    const momento = ahora || Date.now();
    let registros = [];
    if (!this.disponible()) registros = [...this._memoria.entries()].filter(([k]) => k.startsWith('bases:')).map(([, v]) => v);
    else registros = (await this._operar('bases', 'readonly', s => s.getAll())) || [];
    if (!registros.some(r => vencimientoCopia(r.guardado) <= momento)) return false;
    await this.borrarTodo();
    return true;
  },

  async borrarTodo() {
    this._memoria.clear();
    if (!this.disponible()) return true;
    await this._operar('bases', 'readwrite', s => s.clear());
    await this._operar('historicos', 'readwrite', s => s.clear());
    return true;
  }
};
