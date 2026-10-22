// © 2026 Kitsótaro · KoreStock Ledger · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// OPERACIONES-GASTOS.JS — gastos fijos (GO-), vehículos y cargas de
// combustible (CB-). Heredado de costos.js y combustible.js de la v2:
//   - Validaciones propias de cada campo (INVARIANTE 13): odómetro entero
//     de hasta 7 dígitos, galones con hasta 3 enteros y 5 decimales, monto
//     con 2 decimales. El odómetro no puede bajar respecto a la última carga.
//   - Anular = marcar ANULADO (append-only).
//   - Vehículos: la placa es la clave y es única (INV. 30); ahora se pueden
//     editar y desactivar (§23.2).
//
// Expone: CATEGORIAS_GASTO_BASE, sugerirCategoriasGasto, operacionGuardarGasto,
//   operacionAnularGasto, ultimoOdometro, validarCarga, operacionGuardarCarga,
//   operacionAnularCarga, operacionCrearVehiculo, operacionActualizarVehiculo.
// Depende de: almacen.js, esquema.js, cola-escritura.js, hoja.js, dinero.js,
//   operaciones-catalogo.js (rangoFila).
// ============================================================

const CATEGORIAS_GASTO_BASE = ['Alquiler del local', 'Energía eléctrica', 'Agua', 'Internet', 'Sueldos', 'Mantenimiento vehicular', 'Seguro del vehículo', 'Viáticos'];

function sugerirCategoriasGasto() {
  const m = new Map();
  CATEGORIAS_GASTO_BASE.concat(Almacen.hojas.COSTOS_OPERATIVOS.map(g => g.categoria)).forEach(c => { if (c) m.set(normalizarIdentidad(c), c); });
  return [...m.values()];
}

function pasoAgregar(hoja, objetos, alTerminar) {
  return {
    nombre: hoja,
    fn: async (ctx) => {
      const r = await Hoja.agregar(Almacen.baseId, hoja, objetos.map(o => objetoAFila(hoja, o, true)));
      objetos.forEach((o, i) => { o._fila = r.primeraFila + i; });
      Almacen.agregarFilas(hoja, objetos);
      ctx.resultado = objetos.length === 1 ? objetos[0] : objetos;
      if (alTerminar) alTerminar();
      Almacen.notificar(hoja); guardarCacheBase();
    }
  };
}

function pasoMarcarEstado(hoja, obj, estado) {
  return {
    nombre: 'anular',
    fn: async (ctx) => {
      const nuevo = Object.assign({}, obj, { estado });
      const col = columnaLetra(indiceColumna(hoja, 'estado'));
      await Hoja.actualizar(Almacen.baseId, [{ rango: `${hoja}!${col}${obj._fila}`, valores: [[estado]] }]);
      Almacen.reemplazarFila(hoja, nuevo);
      ctx.resultado = nuevo;
      Almacen.notificar(hoja); guardarCacheBase();
    }
  };
}

// ---------- Gastos fijos ----------
function operacionGuardarGasto({ categoria, monto, descripcion, fecha }) {
  const cat = String(categoria || '').trim();
  if (!cat) throw new Error('Elige o escribe una categoría.');
  if (!(monto > 0)) throw new Error('El monto debe ser mayor que cero.');
  const existente = sugerirCategoriasGasto().find(c => normalizarIdentidad(c) === normalizarIdentidad(cat));
  const gasto = { folio: Almacen.tomarFolio('GO-'), timestamp: obtenerTimestampLocal(), fecha: fecha || obtenerFechaLocal(),
    categoria: existente || cat, monto: redondearCentavo(monto), descripcion: String(descripcion || '').trim(), estado: '' };
  return crearOperacion('Guardar gasto', [pasoAgregar('COSTOS_OPERATIVOS', [gasto])]);
}
function operacionAnularGasto(folio) {
  const g = Almacen.hojas.COSTOS_OPERATIVOS.find(x => x.folio === folio);
  if (!g) throw new Error('Gasto no encontrado');
  return crearOperacion('Anular gasto', [pasoMarcarEstado('COSTOS_OPERATIVOS', g, ESTADOS.GASTO_ANULADO)]);
}

// ---------- Vehículos ----------
function operacionCrearVehiculo({ placa, marca, modelo, color, tipoCombustible }) {
  const p = String(placa || '').trim().toUpperCase();
  if (!p) throw new Error('La placa es obligatoria.');
  if (Almacen.hojas.VEHICULOS.some(v => normalizarTexto(v.placa) === normalizarTexto(p))) throw new Error(`Ya existe un vehículo con la placa ${p}.`);
  const v = { placa: p, marca: String(marca || '').trim(), modelo: String(modelo || '').trim(), color: String(color || '').trim(), tipoCombustible: tipoCombustible || 'Gasolina', estado: ESTADOS.ACTIVO };
  return crearOperacion('Agregar vehículo', [pasoAgregar('VEHICULOS', [v])]);
}
function operacionActualizarVehiculo(placa, cambios) {
  const actual = Almacen.hojas.VEHICULOS.find(v => v.placa === placa);
  if (!actual) throw new Error('Vehículo no encontrado');
  const nuevo = Object.assign({}, actual, cambios, { placa: actual.placa }); // la placa es la clave y no cambia
  return crearOperacion('Guardar vehículo', [{
    nombre: 'vehículo',
    fn: async (ctx) => {
      await Hoja.actualizar(Almacen.baseId, [{ rango: rangoFila('VEHICULOS', nuevo._fila), valores: [objetoAFila('VEHICULOS', nuevo, false)] }]);
      Almacen.reemplazarFila('VEHICULOS', nuevo); ctx.resultado = nuevo;
      Almacen.notificar('VEHICULOS'); guardarCacheBase();
    }
  }]);
}

// ---------- Combustible ----------
function ultimoOdometro(placa) {
  return Almacen.hojas.COSTOS_COMBUSTIBLE.filter(c => c.placa === placa && esGastoValido(c))
    .reduce((max, c) => Math.max(max, c.odometro), 0);
}

// Devuelve un texto de error o '' (validaciones heredadas, una por campo).
function validarCarga({ placa, odometro, galones, monto }) {
  if (!placa) return 'Elige el vehículo.';
  if (!Number.isInteger(odometro) || odometro < 0 || String(odometro).length > 7) return 'El odómetro debe ser un número entero de hasta 7 dígitos.';
  const ultimo = ultimoOdometro(placa);
  if (odometro < ultimo) return `El odómetro (${formatearNumero(odometro)}) es menor que la última lectura (${formatearNumero(ultimo)}).`;
  if (!(galones > 0) || galones >= 1000) return 'Los galones deben ser mayores que cero (hasta 999).';
  if (!(monto > 0)) return 'El monto debe ser mayor que cero.';
  return '';
}

function operacionGuardarCarga({ placa, odometro, galones, monto, fecha }) {
  const error = validarCarga({ placa, odometro, galones, monto });
  if (error) throw new Error(error);
  const carga = { folio: Almacen.tomarFolio('CB-'), timestamp: obtenerTimestampLocal(), fecha: fecha || obtenerFechaLocal(), placa,
    odometro, galones: Math.round(galones * 100000) / 100000, monto: redondearCentavo(monto), estado: '' };
  return crearOperacion('Guardar carga', [pasoAgregar('COSTOS_COMBUSTIBLE', [carga])]);
}
function operacionAnularCarga(folio) {
  const c = Almacen.hojas.COSTOS_COMBUSTIBLE.find(x => x.folio === folio);
  if (!c) throw new Error('Carga no encontrada');
  return crearOperacion('Anular carga', [pasoMarcarEstado('COSTOS_COMBUSTIBLE', c, ESTADOS.GASTO_ANULADO)]);
}
