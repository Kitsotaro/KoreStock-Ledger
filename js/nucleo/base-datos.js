// © 2026 KoreStock Ledger — un proyecto de Kitsótaro · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// BASE-DATOS.JS — la carpeta KoreStock y los archivos de base de datos.
//
// La app CREA su carpeta y sus archivos, así el permiso drive.file los ve
// sin pedir nada más (V3 §18.1, §22.2). Cada archivo se identifica con
// propiedades propias de Drive (appProperties), sin hoja de ajustes (D23):
//   carpeta:  { korestock: 'carpeta' }
//   base:     { korestock: 'base', tipo: 'principal'|'respaldo'|'historico', esquema: '3', ... }
//
// Expone: NOMBRE_CARPETA, NOMBRE_BASE, PROPS_CARPETA, asegurarCarpeta,
//   crearBaseV3, leerHojas, asegurarHojasV3, escribirHojasCompletas.
// Depende de: hoja.js, esquema.js.
// ============================================================

const NOMBRE_CARPETA = 'KoreStock';
const NOMBRE_BASE = 'KoreStock_DB';
const NOMBRE_BASE_V2 = 'StockCentral_DB'; // nombre de la base v2 (para encontrarla y migrarla)
const PROPS_CARPETA = { korestock: 'carpeta' };
const FILAS_POR_LOTE_ESCRITURA = 5000;

async function asegurarCarpeta() {
  const existente = await Hoja.buscarCarpeta(NOMBRE_CARPETA, PROPS_CARPETA);
  if (existente) return existente;
  return Hoja.crearCarpeta(NOMBRE_CARPETA, PROPS_CARPETA);
}

// Escribe encabezados y filas de varias hojas, en lotes para no exceder el
// tamaño máximo de una petición. `hojas` = { NOMBRE: [objetos] }.
async function escribirHojasCompletas(id, hojas) {
  const datos = [];
  for (const [nombre, filas] of Object.entries(hojas)) {
    datos.push({ rango: rangoEncabezados(nombre), valores: [encabezadosDe(nombre)] });
    for (let i = 0; i < filas.length; i += FILAS_POR_LOTE_ESCRITURA) {
      const bloque = filas.slice(i, i + FILAS_POR_LOTE_ESCRITURA).map(o => objetoAFila(nombre, o, false));
      datos.push({ rango: `${nombre}!A${i + 2}:${ultimaLetra(nombre)}${i + 1 + bloque.length}`, valores: bloque });
    }
  }
  // Agrupa en peticiones de tamaño razonable.
  let lote = [], filasLote = 0;
  for (const d of datos) {
    if (filasLote + d.valores.length > FILAS_POR_LOTE_ESCRITURA && lote.length) {
      await Hoja.actualizar(id, lote); lote = []; filasLote = 0;
    }
    lote.push(d); filasLote += d.valores.length;
  }
  if (lote.length) await Hoja.actualizar(id, lote);
}

// Crea una base v3 (vacía o con datos) dentro de la carpeta KoreStock.
async function crearBaseV3({ hojas, titulo, propiedades, carpetaId }) {
  const carpeta = carpetaId || await asegurarCarpeta();
  const id = await Hoja.crearHojaCalculo({
    titulo: titulo || NOMBRE_BASE,
    carpetaId: carpeta,
    propiedades: Object.assign({ korestock: 'base', tipo: 'principal', esquema: String(VERSION_ESQUEMA) }, propiedades || {}),
    hojas: NOMBRES_HOJAS
  });
  const contenido = {};
  NOMBRES_HOJAS.forEach(n => { contenido[n] = (hojas && hojas[n]) || []; });
  await escribirHojasCompletas(id, contenido);
  return id;
}

// Lee hojas completas y las devuelve como objetos (con _fila = fila del Sheet).
async function leerHojas(id, nombres) {
  const resultados = await Hoja.leerVarios(id, nombres.map(n => rangoDatos(n, 2)));
  const salida = {};
  nombres.forEach((n, i) => {
    salida[n] = [];
    resultados[i].forEach((fila, j) => {
      if (!fila || fila.length === 0 || fila.every(v => v === '' || v === null)) return;
      salida[n].push(filaAObjeto(n, fila, j + 2));
    });
  });
  return salida;
}

// Repara una base v3 incompleta: agrega pestañas que falten y escribe los
// encabezados (por ejemplo, si una versión futura suma una hoja nueva).
async function asegurarHojasV3(id) {
  const titulos = await Hoja.titulosHojas(id);
  const faltan = NOMBRES_HOJAS.filter(n => !titulos.includes(n));
  if (faltan.length) await Hoja.agregarHojas(id, faltan);
  const encabezados = await Hoja.leerVarios(id, NOMBRES_HOJAS.map(rangoEncabezados));
  const reparar = [];
  NOMBRES_HOJAS.forEach((n, i) => {
    const actual = (encabezados[i][0] || []).map(String);
    const esperado = encabezadosDe(n);
    if (esperado.some((e, j) => actual[j] !== e)) reparar.push({ rango: rangoEncabezados(n), valores: [esperado] });
  });
  if (reparar.length) await Hoja.actualizar(id, reparar);
  return { hojasAgregadas: faltan, encabezadosReparados: reparar.length };
}
