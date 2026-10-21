// © 2026 Kitsótaro · KoreStock Ledger · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// IMPORTAR-EXCEL.JS — carga masiva de compras y ventas desde Excel
// (heredado de la v2, §13: «se queda para volúmenes grandes»).
//   - Cantidad positiva = Entrada; negativa = Venta de un producto existente.
//   - El sabor (columna Variante) es dato del movimiento, no identidad (D24).
//   - Producto que no existe y entra: se crea (marcado «Nuevo», D54).
//   - Stock negativo = advertencia, no error (historial incompleto).
//   - T36: las fechas se leen como número de serie o texto, sin pasar por
//     toISOString (que en UTC−6 podía mover la fecha un día antes).
//
// Expone: COLUMNAS_IMPORTACION, normalizarFechaImportada,
//   descargarPlantillaImportacion, elegirArchivoImportacion, analizarFilasImportadas.
// Depende de: cargador.js (cargarXLSX), operaciones-movimientos.js, componentes.js.
// ============================================================

const COLUMNAS_IMPORTACION = [
  'Fecha', 'Marca', 'Producto', 'Tipo de Empaque', 'Cantidad', 'Presentacion',
  'Variante', 'Contenido_Vol', 'Cantidad_Bonificada', 'Precio_Distribuidor', 'Precio_Consumidor',
  'Unidad_Base', 'Categoria'
];

// Fecha de una celda de Excel → 'YYYY-MM-DD' (o null si no se entiende).
function normalizarFechaImportada(valor) {
  if (valor === '' || valor === null || valor === undefined) return null;
  if (typeof valor === 'number' && isFinite(valor)) return normalizarFechaCelda(Math.floor(valor));
  if (valor instanceof Date && !isNaN(valor)) return fechaATexto(valor); // valores LOCALES, nunca UTC
  const t = String(valor).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(t); // día/mes/año (formato de El Salvador)
  if (m) {
    const anio = m[3].length === 2 ? '20' + m[3] : m[3];
    const mes = Number(m[2]), dia = Number(m[1]);
    if (mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31) return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  }
  return null;
}

async function descargarPlantillaImportacion() {
  await cargarXLSX();
  const ws = XLSX.utils.aoa_to_sheet([
    COLUMNAS_IMPORTACION,
    [obtenerFechaLocal(), 'Catalana', 'Huevo Grande', 'Cartón', 30, 'Cartón', '', '', 0, 0.16667, 0.19, 'huevo', 'Abarrotes'],
    [obtenerFechaLocal(), 'Pepsi', 'Pepsi', 'Caja', -2, 'Lata', '', '355 ml', 0, '', 0.75, 'lata', 'Bebidas']
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Plantilla');
  XLSX.writeFile(wb, 'Plantilla_KoreStock.xlsx');
}

function elegirArchivoImportacion() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xlsx,.xls,.csv';
  input.addEventListener('change', async () => {
    const archivo = input.files[0];
    if (!archivo) return;
    try {
      await cargarXLSX();
      const datos = new Uint8Array(await archivo.arrayBuffer());
      const libro = XLSX.read(datos, { type: 'array' });
      const filas = XLSX.utils.sheet_to_json(libro.Sheets[libro.SheetNames[0]], { defval: '', raw: true });
      confirmarImportacion(analizarFilasImportadas(filas));
    } catch (e) {
      mostrarDialogo({ titulo: 'No se pudo leer el archivo', mensaje: e.message });
    }
  });
  input.click();
}

// Valida y clasifica las filas (función pura sobre el almacén actual).
function analizarFilasImportadas(filas) {
  const entradas = [], ventas = [], errores = [], advertencias = [];
  const stockSimulado = {};
  const nuevosEnArchivo = new Map();
  const hoy = obtenerFechaLocal();
  filas.forEach((f, i) => {
    const n = i + 2;
    const marca = String(f['Marca'] || '').trim();
    const linea = String(f['Producto'] || '').trim();
    const presentacion = String(f['Presentacion'] || '').trim();
    const volumen = String(f['Contenido_Vol'] || '').trim();
    const variante = String(f['Variante'] || '').trim();
    const cantidad = parsearNumero(f['Cantidad']);
    const bonif = parsearNumero(f['Cantidad_Bonificada']);
    const pDist = f['Precio_Distribuidor'] === '' ? null : dinero(f['Precio_Distribuidor']);
    const pCons = f['Precio_Consumidor'] === '' ? null : dinero(f['Precio_Consumidor']);
    let fecha = hoy;
    if (f['Fecha'] !== '' && f['Fecha'] !== undefined) {
      fecha = normalizarFechaImportada(f['Fecha']);
      if (!fecha) { errores.push(`Fila ${n}: la fecha «${f['Fecha']}» no se entiende (usa AAAA-MM-DD o DD/MM/AAAA).`); return; }
    }
    if (!marca || !linea) { errores.push(`Fila ${n}: faltan Marca o Producto.`); return; }
    if (!cantidad) { errores.push(`Fila ${n}: la cantidad está vacía o en cero.`); return; }
    const identidad = { marca, linea, presentacion, volumen };
    const existente = buscarProductoMismaIdentidad(identidad, Almacen.productos);
    const claveNueva = claveIdentidadProducto(identidad);
    if (cantidad < 0) {
      const p = existente;
      if (!p) {
        if (nuevosEnArchivo.has(claveNueva)) errores.push(`Fila ${n}: venta de un producto que se crea en este mismo archivo; impórtala después de guardar la entrada.`);
        else errores.push(`Fila ${n}: venta de «${marca} ${linea}», que no existe en tu catálogo.`);
        return;
      }
      const q = Math.abs(cantidad);
      stockSimulado[p.idProducto] = (stockSimulado[p.idProducto] ?? Almacen.stock(p.idProducto)) - q;
      if (stockSimulado[p.idProducto] < 0) advertencias.push(`Fila ${n}: «${nombreProducto(p, { conVariante: false })}» quedaría con stock negativo (${formatearNumero(stockSimulado[p.idProducto])}).`);
      const precio = pCons !== null ? pCons : p.precio;
      ventas.push({ idProducto: p.idProducto, cantidad: q, totalCobrado: totalLinea(q, precio), variante, fecha });
      return;
    }
    if (pDist === null) { errores.push(`Fila ${n}: una entrada necesita Precio_Distribuidor (costo).`); return; }
    const lineaEntrada = { cantEmpaques: cantidad, unidPorEmpaque: 1, totalPagado: totalLinea(cantidad, pDist), bonif, variante, fecha,
      nuevoPrecio: pCons !== null ? pCons : undefined };
    if (existente) {
      lineaEntrada.producto = existente.idProducto;
      lineaEntrada.nombreEmpaque = existente.unidadBase;
      stockSimulado[existente.idProducto] = (stockSimulado[existente.idProducto] ?? Almacen.stock(existente.idProducto)) + cantidad + bonif;
    } else {
      const unidadBase = String(f['Unidad_Base'] || presentacion || f['Tipo de Empaque'] || 'unidad').trim().toLowerCase();
      lineaEntrada.nuevo = { marca, linea, presentacion, volumen, unidadBase, tipoEmpaque: String(f['Tipo de Empaque'] || '').trim(),
        categoria: String(f['Categoria'] || '').trim(), precio: pCons || 0 };
      lineaEntrada.nombreEmpaque = unidadBase;
      nuevosEnArchivo.set(claveNueva, true);
    }
    entradas.push(lineaEntrada);
  });
  return { entradas, ventas, errores, advertencias, nuevos: nuevosEnArchivo.size };
}

function confirmarImportacion(a) {
  const total = a.entradas.length + a.ventas.length;
  if (!total) {
    mostrarDialogo({ titulo: 'Nada para importar', mensaje: a.errores.length ? `Ninguna fila es válida.\n\n${a.errores.slice(0, 5).join('\n')}` : 'El archivo no tiene filas de datos.' });
    return;
  }
  const partes = [`${a.entradas.length} ${pluralizar(a.entradas.length, 'entrada')} y ${a.ventas.length} ${pluralizar(a.ventas.length, 'venta')} listas para importar.`];
  if (a.nuevos) partes.push(`Se crearán ${a.nuevos} ${pluralizar(a.nuevos, 'producto nuevo', 'productos nuevos')}.`);
  if (a.advertencias.length) partes.push(`Aviso: ${a.advertencias.length} ${pluralizar(a.advertencias.length, 'fila deja', 'filas dejan')} stock negativo (puede pasar si tu historial está incompleto):\n${a.advertencias.slice(0, 4).join('\n')}`);
  if (a.errores.length) partes.push(`${a.errores.length} ${pluralizar(a.errores.length, 'fila tiene', 'filas tienen')} problemas y se omitirán:\n${a.errores.slice(0, 4).join('\n')}${a.errores.length > 4 ? `\n…y ${a.errores.length - 4} más.` : ''}`);
  mostrarDialogo({
    titulo: 'Confirmar importación', mensaje: partes.join('\n\n'),
    textoConfirmar: `Importar ${total}`, textoCancelar: 'Cancelar',
    onConfirmar: () => ejecutarImportacion(a)
  });
}

async function ejecutarImportacion(a) {
  try {
    if (a.entradas.length) {
      const prep = prepararEntrada({ lineas: a.entradas });
      const r = await ejecutarOperacion(operacionGuardarTicket(prep), { titulo: 'No se pudo importar' });
      if (!r) return;
    }
    if (a.ventas.length) {
      const prep = prepararVenta({ lineas: a.ventas, permitirNegativo: true });
      const r = await ejecutarOperacion(operacionGuardarTicket(prep), { titulo: 'No se pudieron importar las ventas' });
      if (!r) return;
    }
    avisar(`Importación lista: ${a.entradas.length + a.ventas.length} movimientos.`);
  } catch (e) {
    mostrarDialogo({ titulo: 'No se pudo importar', mensaje: e.message });
  }
}
