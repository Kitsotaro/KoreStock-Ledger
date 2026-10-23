// © 2026 Wilber Adonay Escobar Solórzano (Kitsótaro) · KoreStock Ledger · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// HOJA-DEMO.JS — motor de datos de DEMOSTRACIÓN (sin Google).
//
// Imita lo que hacen Sheets y Drive con la app: hojas de cálculo con
// pestañas, carpetas, propiedades, copias, lecturas por rango y escritura
// RAW. Vive en memoria y, en el navegador, se guarda en localStorage para
// sobrevivir a recargas. Solo se activa en localhost con ?demo (ver
// demo/modo-demo.js). También lo usan las pruebas en Node.
//
// Comportamiento copiado de Sheets:
//   - Las filas leídas no traen las celdas vacías del final, y las filas
//     vacías del final del rango no se devuelven.
//   - Agregar escribe después de la última fila con datos.
//
// Expone: MotorDemo, DriveDemo.
// Depende de: hoja.js (rangoA1).
// ============================================================

const CLAVE_DRIVE_DEMO = 'korestock-demo-drive';

const DriveDemo = {
  archivos: {},
  persistir: true,
  _temporizador: null,

  cargar() {
    try {
      if (typeof localStorage === 'undefined') { this.persistir = false; return; }
      const guardado = localStorage.getItem(CLAVE_DRIVE_DEMO);
      if (guardado) this.archivos = JSON.parse(guardado);
    } catch (e) { this.archivos = {}; }
  },

  guardar() {
    if (!this.persistir || typeof localStorage === 'undefined') return;
    clearTimeout(this._temporizador);
    this._temporizador = setTimeout(() => {
      try { localStorage.setItem(CLAVE_DRIVE_DEMO, JSON.stringify(this.archivos)); }
      catch (e) { console.warn('Demo: los datos no caben en el navegador; seguirán solo en memoria.', e); this.persistir = false; }
    }, 200);
  },

  reiniciar() {
    this.archivos = {};
    try { if (typeof localStorage !== 'undefined') localStorage.removeItem(CLAVE_DRIVE_DEMO); } catch (e) { /* nada */ }
  },

  nuevoId(prefijo) {
    return `${prefijo}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  },

  archivo(id) {
    const a = this.archivos[id];
    if (!a || a.papelera) { const e = new Error('Archivo no encontrado (demo)'); e.codigo = 404; throw e; }
    return a;
  },

  hoja(id, titulo) {
    const a = this.archivo(id);
    if (!a.hojas[titulo]) { const e = new Error(`No existe la hoja ${titulo} (demo)`); e.codigo = 400; throw e; }
    return a.hojas[titulo];
  },

  // Crea una hoja de cálculo desde un objeto {titulo: filas[][]} (p. ej. un xlsx leído con SheetJS).
  crearDesdeDatos(nombre, hojas, opciones) {
    const id = this.nuevoId('demo');
    const copia = {};
    Object.entries(hojas).forEach(([t, filas]) => { copia[t] = filas.map(f => f.slice()); });
    this.archivos[id] = {
      id, nombre, tipo: 'hoja', padres: (opciones && opciones.carpetaId) ? [opciones.carpetaId] : [],
      propiedades: (opciones && opciones.propiedades) || {}, creado: new Date().toISOString(), modificado: new Date().toISOString(),
      orden: Object.keys(hojas), hojas: copia
    };
    this.guardar();
    return id;
  }
};

function recortarFilaDemo(fila) {
  const f = fila.slice();
  while (f.length && (f[f.length - 1] === '' || f[f.length - 1] === null || f[f.length - 1] === undefined)) f.pop();
  return f;
}

function ultimaFilaConDatos(grid) {
  for (let i = grid.length - 1; i >= 0; i--) {
    if (grid[i] && grid[i].some(v => v !== '' && v !== null && v !== undefined)) return i + 1;
  }
  return 0;
}

const MotorDemo = {
  nombre: 'demo',

  async leerVarios(id, rangos) {
    await new Promise(r => setTimeout(r, 0));
    return rangos.map(rango => {
      const r = rangoA1(rango);
      const grid = DriveDemo.hoja(id, r.hoja);
      const ultima = r.fila2 === null ? grid.length : Math.min(r.fila2, grid.length);
      const salida = [];
      for (let fila = r.fila1; fila <= ultima; fila++) {
        const original = grid[fila - 1] || [];
        salida.push(recortarFilaDemo(original.slice(r.col1, r.col2 + 1).map(v => v === undefined || v === null ? '' : v)));
      }
      while (salida.length && salida[salida.length - 1].length === 0) salida.pop();
      return salida;
    });
  },

  async agregar(id, hoja, filas) {
    if (!filas.length) return { primeraFila: null, ultimaFila: null };
    const grid = DriveDemo.hoja(id, hoja);
    const inicio = ultimaFilaConDatos(grid) + 1;
    filas.forEach((f, i) => { grid[inicio - 1 + i] = f.slice(); });
    DriveDemo.archivo(id).modificado = new Date().toISOString();
    DriveDemo.guardar();
    return { primeraFila: inicio, ultimaFila: inicio + filas.length - 1 };
  },

  async actualizar(id, datos) {
    datos.forEach(({ rango, valores }) => {
      const r = rangoA1(rango);
      const grid = DriveDemo.hoja(id, r.hoja);
      valores.forEach((fila, i) => {
        const n = r.fila1 - 1 + i;
        if (!grid[n]) grid[n] = [];
        fila.forEach((v, j) => {
          const c = r.col1 + j;
          while (grid[n].length < c) grid[n].push('');
          grid[n][c] = v;
        });
      });
    });
    DriveDemo.archivo(id).modificado = new Date().toISOString();
    DriveDemo.guardar();
  },

  async titulosHojas(id) { return DriveDemo.archivo(id).orden.slice(); },

  async agregarHojas(id, titulos) {
    const a = DriveDemo.archivo(id);
    titulos.forEach(t => { if (!a.hojas[t]) { a.hojas[t] = []; a.orden.push(t); } });
    DriveDemo.guardar();
  },

  async existe(id) { const a = DriveDemo.archivos[id]; return !!(a && !a.papelera && a.tipo === 'hoja'); },

  async crearHojaCalculo({ titulo, carpetaId, propiedades, hojas }) {
    const datos = {};
    hojas.forEach(t => { datos[t] = []; });
    return DriveDemo.crearDesdeDatos(titulo, datos, { carpetaId, propiedades });
  },

  async buscarCarpeta(nombre, propiedades) {
    const c = Object.values(DriveDemo.archivos).find(a => a.tipo === 'carpeta' && !a.papelera && a.nombre === nombre &&
      Object.entries(propiedades || {}).every(([k, v]) => a.propiedades[k] === String(v)));
    return c ? c.id : null;
  },

  async crearCarpeta(nombre, propiedades) {
    const id = DriveDemo.nuevoId('carpeta');
    const props = {};
    Object.entries(propiedades || {}).forEach(([k, v]) => { props[k] = String(v); });
    DriveDemo.archivos[id] = { id, nombre, tipo: 'carpeta', padres: [], propiedades: props, creado: new Date().toISOString() };
    DriveDemo.guardar();
    return id;
  },

  async listarArchivos({ carpetaId, propiedades } = {}) {
    return Object.values(DriveDemo.archivos)
      .filter(a => a.tipo === 'hoja' && !a.papelera && (!carpetaId || a.padres.includes(carpetaId)) &&
        Object.entries(propiedades || {}).every(([k, v]) => a.propiedades[k] === String(v)))
      .sort((x, y) => (y.creado > x.creado ? 1 : -1))
      .map(a => ({ id: a.id, nombre: a.nombre, propiedades: { ...a.propiedades }, modificado: a.modificado, creado: a.creado }));
  },

  async buscarPorNombre(nombre) {
    return Object.values(DriveDemo.archivos).filter(a => a.tipo === 'hoja' && !a.papelera && a.nombre === nombre)
      .map(a => ({ id: a.id, nombre: a.nombre, propiedades: { ...a.propiedades } }));
  },

  async copiarArchivo(id, { nombre, carpetaId, propiedades }) {
    const a = DriveDemo.archivo(id);
    const props = {};
    Object.entries(propiedades || {}).forEach(([k, v]) => { props[k] = String(v); });
    const nuevo = DriveDemo.crearDesdeDatos(nombre, a.hojas, { carpetaId, propiedades: props });
    DriveDemo.archivos[nuevo].orden = a.orden.slice();
    return nuevo;
  },

  async actualizarArchivo(id, { nombre, propiedades }) {
    const a = DriveDemo.archivo(id);
    if (nombre) a.nombre = nombre;
    if (propiedades) Object.entries(propiedades).forEach(([k, v]) => { a.propiedades[k] = String(v); });
    DriveDemo.guardar();
  },

  async papelera(id) { DriveDemo.archivo(id).papelera = true; DriveDemo.guardar(); },

  async correoUsuario() { return 'demo@korestock.local'; }
};
