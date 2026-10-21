// © 2026 Kitsótaro · KoreStock Ledger · Código disponible, todos los derechos reservados (ver LICENSE).
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
//
// Expone: CacheLocal.
// Depende de: nada.
// ============================================================

const NOMBRE_BD_LOCAL = 'korestock';
const VERSION_BD_LOCAL = 1;

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

  async borrarTodo() {
    this._memoria.clear();
    if (!this.disponible()) return true;
    await this._operar('bases', 'readwrite', s => s.clear());
    await this._operar('historicos', 'readwrite', s => s.clear());
    return true;
  }
};
