// © 2026 Kitsótaro · KoreStock Ledger · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// COLA-ESCRITURA.JS — todas las escrituras van en fila, una tras otra.
//
// Por qué (V3 §22.3, D35):
//   - Un ticket se guarda en UNA operación con pocos pasos (no una escritura
//     por producto) para cuidar la cuota de Google.
//   - Nunca dos escrituras a la vez: evita choques y dobles envíos
//     (reemplaza los candados sueltos de la v2, INVARIANTE 20).
//   - Cada operación recuerda qué pasos ya terminaron. Si falla a medias
//     (sin red, cuota), al reintentar continúa desde el paso que faltó y
//     NO repite lo ya escrito (por ejemplo, el historial no se duplica).
//   - Sin conexión no se escribe nada (D27: offline solo lectura).
//   - Antes de escribir se confirma que la sesión siga vigente (D64).
//
// Uso:
//   const op = crearOperacion('Cobrar ticket', [
//     { nombre: 'historial', fn: async (ctx) => {...} }, ... ]);
//   await ColaEscritura.ejecutar(op);   // si falla, se puede volver a llamar con la misma op
//
// Expone: ColaEscritura, crearOperacion.
// Depende de: almacen.js (sinConexion), sesion.js (asegurarVigente).
// ============================================================

const ESPERA_MINIMA_ENTRE_ESCRITURAS_MS = 250;

function crearOperacion(nombre, pasos) {
  return { nombre, pasos: pasos.map(p => Object.assign({ hecho: false }, p)), contexto: {}, terminada: false, intentos: 0 };
}

const ColaEscritura = {
  _cola: Promise.resolve(),
  _ultima: 0,
  ocupada: false,
  _oyentes: new Set(),

  suscribir(fn) { this._oyentes.add(fn); return () => this._oyentes.delete(fn); },
  _avisar() { this._oyentes.forEach(fn => { try { fn(this.ocupada); } catch (e) { /* nada */ } }); },

  ejecutar(operacion) {
    const tarea = this._cola.then(() => this._correr(operacion));
    this._cola = tarea.catch(() => {});
    return tarea;
  },

  async _correr(op) {
    if (op.terminada) return op.contexto.resultado;
    if (typeof Almacen !== 'undefined' && Almacen.sinConexion) {
      const e = new Error('Sin conexión: puedes consultar, pero no guardar hasta que vuelva internet.');
      e.sinConexion = true;
      throw e;
    }
    this.ocupada = true; this._avisar();
    op.intentos++;
    try {
      if (typeof Sesion !== 'undefined') await Sesion.asegurarVigente();
      for (const paso of op.pasos) {
        if (paso.hecho) continue;
        const espera = ESPERA_MINIMA_ENTRE_ESCRITURAS_MS - (Date.now() - this._ultima);
        if (espera > 0) await new Promise(r => setTimeout(r, espera));
        await paso.fn(op.contexto);
        this._ultima = Date.now();
        paso.hecho = true;
      }
      op.terminada = true;
      return op.contexto.resultado;
    } finally {
      this.ocupada = false; this._avisar();
    }
  }
};
