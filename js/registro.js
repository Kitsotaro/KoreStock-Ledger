// ============================================================
// REGISTRO.JS — Pestaña "Registrar": formularios de Entrada/Venta,
// reloj de captura, importación masiva desde Excel, autocompletado
// de campos de producto, preview de ganancia y guardado de movimientos.
// ============================================================

let productoVentaSeleccionado = null;
let productoEntradaSeleccionado = null; // null = nada elegido | 'NUEVO' | objeto de catalogoProductos
let guardandoMovimiento = false; // evita que dos envíos (doble clic, Enter repetido) se procesen a la vez

window.addEventListener('DOMContentLoaded', () => {
  const fechaInput = document.getElementById('fecha-mov');
  if (fechaInput) fechaInput.value = obtenerFechaLocal();

  iniciarRelojCaptura();
  inicializarAutocompletesEntrada();
  inicializarBuscadorEntrada();
  inicializarBuscadorVenta();
  inicializarPreviaGanancia();
  inicializarValidacionStock();
});

// GANANCIA POR UNIDAD DE EMPAQUE + MARGEN % (informativo, no se escribe en Excel)
function inicializarPreviaGanancia() {
  ['precio-distribuidor', 'precio-consumidor'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', actualizarPreviaGanancia);
  });
}

function actualizarPreviaGanancia() {
  const pDist = parseFloat(document.getElementById('precio-distribuidor').value) || 0;
  const pCons = parseFloat(document.getElementById('precio-consumidor').value) || 0;
  const tipoEmp = document.getElementById('prod-tipo-empaque').value.trim();
  const ganancia = pCons - pDist;
  const margenPct = pDist > 0 ? (ganancia / pDist) * 100 : 0;

  document.getElementById('profit-unit-label').textContent = tipoEmp || 'Unidad';
  document.getElementById('profit-ganancia').textContent = `$${ganancia.toFixed(2)}`;
  document.getElementById('profit-margen').textContent = `${margenPct.toFixed(1)}%`;

  actualizarAvisoCambioPrecio();
}

// AVISO VISUAL (v2.3): si se está reabasteciendo un producto YA EXISTENTE
// y se toca su precio, la caja de Tarifas se pone naranja — se llama desde
// actualizarPreviaGanancia() porque esa ya corre en TODOS los momentos que
// nos importan (al escribir un precio, y al elegir/limpiar un producto).
function actualizarAvisoCambioPrecio() {
  const caja = document.getElementById('caja-tarifas');
  if (!caja) return;

  const esProductoExistente = productoEntradaSeleccionado && productoEntradaSeleccionado !== 'NUEVO';
  if (!esProductoExistente) {
    caja.classList.remove('precio-modificado');
    return;
  }

  const pDist = parseFloat(document.getElementById('precio-distribuidor').value) || 0;
  const pCons = parseFloat(document.getElementById('precio-consumidor').value) || 0;
  // Mismo criterio que al guardar: un campo en 0/vacío significa
  // "no tocar ese precio", no "bajarlo a 0".
  const pDistResuelto = pDist || productoEntradaSeleccionado.pDist;
  const pConsResuelto = pCons || productoEntradaSeleccionado.pCons;

  const hayCambio = pDistResuelto !== productoEntradaSeleccionado.pDist || pConsResuelto !== productoEntradaSeleccionado.pCons;
  caja.classList.toggle('precio-modificado', hayCambio);
}

// VALIDACIÓN DE STOCK DISPONIBLE EN VENTA
function inicializarValidacionStock() {
  const input = document.getElementById('mov-cantidad-out');
  if (!input) return;
  input.addEventListener('input', () => {
    if (!productoVentaSeleccionado) return;
    const val = parseFloat(input.value);
    if (!isNaN(val) && val > productoVentaSeleccionado.stock) {
      mostrarDialogo({
        titulo: 'Stock insuficiente',
        mensaje: `Disponible: ${productoVentaSeleccionado.stock} ${productoVentaSeleccionado.tipoEmpaque || ''}.`.trim()
      });
      input.value = productoVentaSeleccionado.stock;
    }
  });
}

// RELOJ DE CAPTURA EN VIVO (muestra el timestamp que se grabará al guardar)
function iniciarRelojCaptura() {
  const el = document.getElementById('log-timestamp-live');
  if (!el) return;
  const actualizar = () => {
    const now = new Date();
    el.textContent = now.toLocaleString('es-ES', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    });
  };
  actualizar();
  setInterval(actualizar, 1000);
}

// MOSTRAR/OCULTAR LAS OPCIONES DE IMPORTACIÓN (Plantilla / Importar Excel)
function toggleOpcionesImportar() {
  document.getElementById('opciones-importar').classList.toggle('hidden');
  document.getElementById('hint-importar').classList.toggle('hidden');
}

// ===== IMPORTACIÓN MASIVA DE ENTRADAS DESDE EXCEL =====
const COLUMNAS_IMPORTACION = [
  'Fecha', 'Marca', 'Producto', 'Tipo de Empaque', 'Cantidad', 'Presentacion',
  'Variante', 'Contenido_Vol', 'Cantidad_Bonificada', 'Precio_Distribuidor', 'Precio_Consumidor'
];

function descargarPlantillaExcel() {
  const hoy = obtenerFechaLocal();
  const ws = XLSX.utils.aoa_to_sheet([
    COLUMNAS_IMPORTACION,
    [hoy, 'La Constancia', 'Pepsi', 'Caja', 10, 'Botella', 'Uva', '1.5 Lts', 0, 10, 12]
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Plantilla');
  XLSX.writeFile(wb, 'Plantilla_Importar_Entradas.xlsx');
}

// Convierte lo que venga en la columna Fecha (fecha nativa de Excel, texto, o número de serie) a 'YYYY-MM-DD'
function normalizarFechaImportada(valor) {
  if (valor instanceof Date && !isNaN(valor)) {
    return valor.toISOString().split('T')[0];
  }
  if (typeof valor === 'number') {
    const f = XLSX.SSF.parse_date_code(valor);
    if (f) return `${f.y}-${String(f.m).padStart(2, '0')}-${String(f.d).padStart(2, '0')}`;
  }
  if (typeof valor === 'string' && valor.trim()) {
    const texto = valor.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto;
    const parseada = new Date(texto);
    if (!isNaN(parseada)) return parseada.toISOString().split('T')[0];
  }
  return null;
}

function onArchivoExcelSeleccionado(event) {
  const file = event.target.files[0];
  event.target.value = ''; // permite volver a seleccionar el mismo archivo después
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: 'array', cellDates: true });
      const hoja = wb.Sheets[wb.SheetNames[0]];
      const filas = XLSX.utils.sheet_to_json(hoja, { defval: '' });
      procesarFilasImportadas(filas);
    } catch (err) {
      mostrarDialogo({ titulo: 'Error al leer el archivo', mensaje: err.message });
    }
  };
  reader.readAsArrayBuffer(file);
}

function procesarFilasImportadas(filas) {
  const validas = [];
  const errores = [];
  const advertenciasStock = []; // no bloquean la fila, solo se muestran antes de confirmar
  const hoy = obtenerFechaLocal();

  // Copia de trabajo del catálogo: aquí SÍ vamos agregando los productos
  // nuevos fila por fila, para que el correlativo del SKU salga correcto
  // incluso si el mismo Excel trae varias variantes nuevas de un mismo
  // producto. También se usa para simular el efecto de cada fila sobre el
  // stock, en el orden del archivo — así dos Ventas seguidas del mismo
  // producto en el mismo Excel se validan una contra el efecto de la otra,
  // no contra el stock real sin actualizar.
  const catalogoSimulado = catalogoProductos.map(p => ({ ...p }));

  // v2.1: comparación normalizada (sin mayúsculas/minúsculas ni espacios de
  // más) — evita crear un producto duplicado solo porque el Excel trae
  // "PEPSI" y el catálogo ya tenía "Pepsi". Mismo criterio que usa
  // generarSKUCompacto() en sku.js.
  function buscarProductoSimulado(marca, linea, magnitud, volumen, variante) {
    return catalogoSimulado.find(p =>
      normalizarTexto(p.marca) === normalizarTexto(marca) &&
      normalizarTexto(p.linea) === normalizarTexto(linea) &&
      normalizarTexto(p.magnitud) === normalizarTexto(magnitud) &&
      normalizarTexto(p.volumen) === normalizarTexto(volumen) &&
      normalizarTexto(p.variante || '') === normalizarTexto(variante || '')
    );
  }

  filas.forEach((fila, i) => {
    const numFila = i + 2; // fila 1 es el encabezado
    const marca = String(fila['Marca'] || '').trim();
    const linea = String(fila['Producto'] || '').trim();
    const tipoEmpaque = String(fila['Tipo de Empaque'] || '').trim();
    const cantidad = parseFloat(fila['Cantidad']);
    const presentacion = String(fila['Presentacion'] || '').trim();
    const variante = String(fila['Variante'] || '').trim();
    const volumen = String(fila['Contenido_Vol'] || '').trim();
    const bonif = parseFloat(fila['Cantidad_Bonificada']) || 0;
    const pDist = parseFloat(fila['Precio_Distribuidor']);
    const pCons = parseFloat(fila['Precio_Consumidor']);

    const fechaCruda = fila['Fecha'];
    let fecha = hoy;
    if (fechaCruda !== '' && fechaCruda !== undefined && fechaCruda !== null) {
      const fechaNormalizada = normalizarFechaImportada(fechaCruda);
      if (!fechaNormalizada) {
        errores.push(`Fila ${numFila}: la fecha "${fechaCruda}" no se pudo interpretar.`);
        return;
      }
      fecha = fechaNormalizada;
    }

    if (!marca || !linea || !presentacion || !volumen) {
      errores.push(`Fila ${numFila}: faltan Marca, Producto, Presentación o Contenido/Vol.`);
      return;
    }
    if (isNaN(cantidad) || cantidad === 0) {
      errores.push(`Fila ${numFila}: Cantidad inválida o en cero.`);
      return;
    }

    const esVenta = cantidad < 0;
    const productoExistente = buscarProductoSimulado(marca, linea, presentacion, volumen, variante);

    if (esVenta) {
      if (!productoExistente) {
        errores.push(`Fila ${numFila}: cantidad negativa (venta), pero "${marca} ${linea}" no existe en el catálogo ni fue creado antes en este mismo archivo.`);
        return;
      }
      // ADVERTENCIA, no error: si el histórico está incompleto (ej. faltan
      // entradas de meses anteriores que no se van a recuperar), vender más
      // de lo que el sistema cree tener es una realidad válida — se avisa
      // pero se deja continuar si la persona confirma.
      const stockProyectado = productoExistente.stock + cantidad; // cantidad ya es negativa
      if (stockProyectado < 0) {
        advertenciasStock.push(`Fila ${numFila}: "${marca} ${linea}" quedaría con stock negativo (${stockProyectado}).`);
      }
      productoExistente.stock = stockProyectado;
    } else {
      if (!tipoEmpaque || isNaN(pDist) || isNaN(pCons)) {
        errores.push(`Fila ${numFila}: Entrada requiere Tipo de Empaque y Precio Distribuidor/Consumidor válidos.`);
        return;
      }
      // v2.2: la bonificación entra como stock físico también en la
      // simulación del import, igual que en el guardado real más abajo.
      if (productoExistente) {
        productoExistente.stock += cantidad + bonif;
      } else {
        // Se agrega a la copia de trabajo para que la siguiente fila del mismo
        // archivo ya lo "vea" si es otra variante de este mismo producto.
        catalogoSimulado.push({ marca, linea, magnitud: presentacion, volumen, variante, stock: cantidad + bonif });
      }
    }

    validas.push({
      fecha, marca, linea, tipoEmpaque, cantidad: Math.abs(cantidad),
      tipoMov: esVenta ? 'VENTA' : 'ENTRADA',
      presentacion, variante, volumen, bonif, pDist, pCons
    });
  });

  if (validas.length === 0) {
    mostrarDialogo({
      titulo: 'Nada para importar',
      mensaje: errores.length > 0
        ? `No se encontró ninguna fila válida.\n\n${errores.slice(0, 5).join('\n')}`
        : 'El archivo no tiene filas de datos.'
    });
    return;
  }

  let mensaje = `Se encontraron ${validas.length} fila(s) válidas para importar.`;

  if (advertenciasStock.length > 0) {
    mensaje += `\n\n⚠️ ${advertenciasStock.length} fila(s) dejarán el stock en negativo:\n${advertenciasStock.slice(0, 5).join('\n')}`;
    if (advertenciasStock.length > 5) mensaje += `\n...y ${advertenciasStock.length - 5} más.`;
    mensaje += `\n\nSi es un historial incompleto (ej. migrando datos y faltan entradas de meses anteriores), puedes continuar igual y ajustar el stock real después desde Registrar o Stock.`;
  }

  if (errores.length > 0) {
    mensaje += `\n\n${errores.length} fila(s) con problemas se omitirán:\n${errores.slice(0, 5).join('\n')}`;
    if (errores.length > 5) mensaje += `\n...y ${errores.length - 5} más.`;
  }

  mostrarDialogo({
    titulo: advertenciasStock.length > 0 ? '⚠️ Confirmar importación (stock negativo)' : 'Confirmar importación',
    mensaje,
    textoConfirmar: `Importar ${validas.length} fila(s)`,
    textoCancelar: 'Cancelar',
    onConfirmar: () => ejecutarImportacionMasiva(validas)
  });
}

async function ejecutarImportacionMasiva(filasValidas) {
  document.getElementById('status').innerText = `Importando ${filasValidas.length} movimiento(s)...`;

  // Continuar la numeración de folio (IN- y FAC- por separado) desde el máximo ya usado
  let maxIN = 0, maxFAC = 0;
  try {
    const rows = await leerRango('LOG_TRANS!A:A');
    rows.forEach(r => {
      if (r[0] && r[0].startsWith('IN-')) {
        const num = parseInt(r[0].replace('IN-', ''));
        if (!isNaN(num) && num > maxIN) maxIN = num;
      } else if (r[0] && r[0].startsWith('FAC-')) {
        const num = parseInt(r[0].replace('FAC-', ''));
        if (!isNaN(num) && num > maxFAC) maxFAC = num;
      }
    });
  } catch (e) { /* si falla, continúa desde 0 */ }

  const filasLog = [];
  const filasHistoricoPrecios = []; // acumula cambios de precio detectados durante la importación

  filasValidas.forEach(f => {
    const timestampLog = obtenerTimestampLocal();
    const sku = generarSKUCompacto(f.marca, f.linea, f.presentacion, f.volumen, f.variante);

    if (f.tipoMov === 'ENTRADA') {
      maxIN++;
      const transId = `IN-${String(maxIN).padStart(6, '0')}`;
      const totalInversion = f.cantidad * f.pDist;
      const margenUnit = f.pCons - f.pDist;

      // v2.0: LOG_TRANS ya no tiene columna CANT_EMPAQUE (era la única
      // línea que la usaba, con valor fijo "1"; se quitó sin reemplazo).
      filasLog.push([
        transId, timestampLog, f.fecha, 'ENTRADA', sku,
        f.marca, f.linea, f.presentacion, f.volumen, f.variante,
        f.cantidad, f.bonif, f.pDist, f.pCons,
        totalInversion, margenUnit, '', '', f.tipoEmpaque, ''
      ]);

      const prodIndex = catalogoProductos.findIndex(p => p.sku === sku);
      if (prodIndex >= 0) {
        const pDistAnterior = catalogoProductos[prodIndex].pDist;
        const pConsAnterior = catalogoProductos[prodIndex].pCons;
        if (f.pDist !== pDistAnterior || f.pCons !== pConsAnterior) {
          filasHistoricoPrecios.push([
            `LOG-${Date.now()}-${filasHistoricoPrecios.length}`, sku, pDistAnterior, f.pDist, pConsAnterior, f.pCons,
            timestampLog, 'USUARIO_ACTIVO'
          ]);
        }
        // v2.2: la bonificación suma al stock físico recibido, igual que en
        // el guardado manual — el costo (totalInversion arriba) NO la incluye.
        catalogoProductos[prodIndex].stock += f.cantidad + f.bonif;
        // v2.2: también se acumula cuánto de ese stock es "gratis", para
        // poder calcular después "Valor Invertido en Bodega" (ver stock.js).
        catalogoProductos[prodIndex].stockBonificado = (catalogoProductos[prodIndex].stockBonificado || 0) + f.bonif;
        catalogoProductos[prodIndex].pDist = f.pDist;
        catalogoProductos[prodIndex].pCons = f.pCons;
        catalogoProductos[prodIndex].tipoEmpaque = f.tipoEmpaque;
      } else {
        catalogoProductos.push({
          sku, marca: f.marca, linea: f.linea, magnitud: f.presentacion,
          volumen: f.volumen, variante: f.variante,
          pDist: f.pDist, pCons: f.pCons, stock: f.cantidad + f.bonif, estado: 'ACTIVO',
          tipoEmpaque: f.tipoEmpaque, idProducto: generarIdProducto(),
          fechaCreacion: timestampLog, modificacionAnterior: '',
          stockBonificado: f.bonif
        });
      }
    } else {
      // VENTA: usa el precio y tipo de empaque ACTUALES del catálogo, igual que una venta manual
      const prod = catalogoProductos.find(p => p.sku === sku);
      if (!prod) return; // ya validado antes; por seguridad, se omite si no aparece

      maxFAC++;
      const transId = `FAC-${String(maxFAC).padStart(6, '0')}`;
      const margenUnit = prod.pCons - prod.pDist;
      const totalInversion = f.cantidad * prod.pDist;
      const totalVenta = f.cantidad * prod.pCons;
      const utilidadNeta = f.cantidad * margenUnit;

      filasLog.push([
        transId, timestampLog, f.fecha, 'VENTA', sku,
        prod.marca, prod.linea, prod.magnitud, prod.volumen, prod.variante,
        -f.cantidad, 0, prod.pDist, prod.pCons,
        totalInversion, margenUnit, totalVenta, utilidadNeta, prod.tipoEmpaque, ''
      ]);

      prod.stock -= f.cantidad;
    }
  });

  try {
    await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'LOG_TRANS!A:T',
      valueInputOption: 'USER_ENTERED',
      resource: { values: filasLog }
    });

    if (filasHistoricoPrecios.length > 0) {
      await gapi.client.sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: 'LOG_HISTORICO_PRECIOS!A:H',
        valueInputOption: 'USER_ENTERED',
        resource: { values: filasHistoricoPrecios }
      });
    }

    await reescribirHojaCatalogo();
    await cargarDatosIniciales();

    document.getElementById('status').innerText = `¡${filasValidas.length} movimiento(s) importados correctamente!`;
    mostrarDialogo({ titulo: 'Importación completada', mensaje: `Se importaron ${filasValidas.length} movimiento(s) correctamente.` });
  } catch (err) {
    document.getElementById('status').innerText = 'Error al importar: ' + err.message;
    mostrarDialogo({ titulo: 'Error al importar', mensaje: err.message });
  }
}

function limpiarFormularioActivo() {
  if (tipoMovimiento === 'ENTRADA') {
    document.getElementById('form-entrada').reset();
    resetearBuscadorEntrada();
  } else {
    document.getElementById('form-venta').reset();
    const tipoEmpEl = document.getElementById('venta-prod-tipo-empaque');
    if (tipoEmpEl) tipoEmpEl.value = '';
    productoVentaSeleccionado = null;
    document.getElementById('btn-save-out').disabled = true;
  }
  document.getElementById('fecha-mov').value = obtenerFechaLocal();
  generarFolioCorrelativo();
}

// ===== AUTOCOMPLETADO DE CAMPOS DE ENTRADA =====
// SEGURIDAD: renderItem pasa por escaparHTML() porque el valor sugerido es
// texto libre que escribió el usuario alguna vez (marca, producto, etc.) y
// se inserta con innerHTML en el dropdown.
function inicializarAutocompletesEntrada() {
  crearAutocomplete('prod-marca', 'ac-marca', q => sugerirValoresUnicos('marca', q),
    v => { document.getElementById('prod-marca').value = v; }, v => escaparHTML(v), 'hint-marca');
  crearAutocomplete('prod-linea', 'ac-linea', q => sugerirValoresUnicos('linea', q),
    v => { document.getElementById('prod-linea').value = v; }, v => escaparHTML(v), 'hint-linea');
  crearAutocomplete('prod-tipo-empaque', 'ac-tipoempaque', q => sugerirValoresUnicos('tipoEmpaque', q),
    v => { document.getElementById('prod-tipo-empaque').value = v; actualizarPreviaGanancia(); }, v => escaparHTML(v), 'hint-tipoempaque');
  crearAutocomplete('prod-presentacion', 'ac-presentacion', q => sugerirValoresUnicos('magnitud', q),
    v => { document.getElementById('prod-presentacion').value = v; }, v => escaparHTML(v), 'hint-presentacion');
  crearAutocomplete('prod-variante', 'ac-variante', q => sugerirValoresUnicos('variante', q),
    v => { document.getElementById('prod-variante').value = v; }, v => escaparHTML(v), 'hint-variante');
  crearAutocomplete('prod-volumen', 'ac-volumen', q => sugerirValoresUnicos('volumen', q),
    v => { document.getElementById('prod-volumen').value = v; }, v => escaparHTML(v), 'hint-volumen');
}

// ===== BUSCADOR/OMNIBOX DE ENTRADA (elige producto existente o "+ Agregar producto nuevo") =====
const CAMPOS_IDENTIDAD_ENTRADA = ['prod-marca', 'prod-linea', 'prod-tipo-empaque', 'prod-presentacion', 'prod-variante', 'prod-volumen'];

function bloquearCamposIdentidadEntrada(bloquear) {
  CAMPOS_IDENTIDAD_ENTRADA.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.disabled = bloquear;
    el.classList.toggle('input-disabled', bloquear);
  });
}

function limpiarCamposIdentidadEntrada() {
  CAMPOS_IDENTIDAD_ENTRADA.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
}

function mostrarModoProductoNuevo(mostrar) {
  document.getElementById('btn-save-in').classList.toggle('btn-nuevo-producto', mostrar);
  document.getElementById('leyenda-producto-nuevo').classList.toggle('hidden', !mostrar);
}

// Vuelve al estado inicial: nada elegido, campos de identidad bloqueados y vacíos,
// precios vacíos, botón verde y deshabilitado. Se usa al iniciar, al limpiar el
// formulario y después de guardar una entrada.
function resetearBuscadorEntrada() {
  productoEntradaSeleccionado = null;
  const buscador = document.getElementById('buscar-producto-entrada');
  if (buscador) buscador.value = '';
  bloquearCamposIdentidadEntrada(true);
  limpiarCamposIdentidadEntrada();
  document.getElementById('precio-distribuidor').value = '';
  document.getElementById('precio-consumidor').value = '';
  mostrarModoProductoNuevo(false);
  document.getElementById('btn-save-in').disabled = true;
  actualizarPreviaGanancia();
}

function inicializarBuscadorEntrada() {
  const input = document.getElementById('buscar-producto-entrada');
  const dropdown = document.getElementById('dropdown-productos-entrada');
  if (!input || !dropdown) return;

  function buscar(query) {
    let resultados = query.trim() ? catalogoProductos.filter(p => p.estado === 'ACTIVO' && coincideBusqueda(p, query)).slice(0, 7) : [];
    resultados.push('NUEVO'); // opción permanente, siempre al final (o la única, si no hay match)
    return resultados;
  }

  function seleccionar(item) {
    if (item === 'NUEVO') {
      productoEntradaSeleccionado = 'NUEVO';
      input.value = '+ Agregar producto nuevo';
      bloquearCamposIdentidadEntrada(false);
      limpiarCamposIdentidadEntrada();
      document.getElementById('precio-distribuidor').value = '';
      document.getElementById('precio-consumidor').value = '';
      mostrarModoProductoNuevo(true);
      document.getElementById('btn-save-in').disabled = false;
      actualizarPreviaGanancia();
      return;
    }

    productoEntradaSeleccionado = item;
    input.value = `[${item.sku}] ${item.marca} ${item.linea}`;
    document.getElementById('prod-marca').value = item.marca;
    document.getElementById('prod-linea').value = item.linea;
    document.getElementById('prod-tipo-empaque').value = item.tipoEmpaque || '';
    document.getElementById('prod-presentacion').value = item.magnitud;
    document.getElementById('prod-variante').value = item.variante || '';
    document.getElementById('prod-volumen').value = item.volumen;
    bloquearCamposIdentidadEntrada(true);
    document.getElementById('precio-distribuidor').value = item.pDist;
    document.getElementById('precio-consumidor').value = item.pCons;
    mostrarModoProductoNuevo(false);
    document.getElementById('btn-save-in').disabled = false;
    actualizarPreviaGanancia();
  }

  // SEGURIDAD: marca/línea/volumen/variante/sku/magnitud son texto libre del
  // catálogo — pasan por escaparHTML() antes de ir al innerHTML del dropdown.
  crearAutocomplete('buscar-producto-entrada', 'dropdown-productos-entrada', buscar, seleccionar, item => {
    if (item === 'NUEVO') return `<div class="ac-item-main">➕ Agregar producto nuevo</div>`;
    return `
      <div class="ac-item-main">${escaparHTML(item.marca)} ${escaparHTML(item.linea)} ${escaparHTML(item.volumen)}${item.variante ? ' · ' + escaparHTML(item.variante) : ''}</div>
      <div class="ac-item-sub">SKU: ${escaparHTML(item.sku)} · ${escaparHTML(item.magnitud)} · Stock: ${item.stock}</div>
    `;
  });

  input.addEventListener('input', () => { if (productoEntradaSeleccionado) resetearBuscadorEntrada(); });

  resetearBuscadorEntrada(); // estado inicial: esperando selección
}

// ===== BUSCADOR DE VENTA =====
function inicializarBuscadorVenta() {
  const input = document.getElementById('buscar-producto-venta');
  const dropdown = document.getElementById('dropdown-productos-venta');
  const btnSave = document.getElementById('btn-save-out');
  if (!input || !dropdown) return;

  function limpiarSeleccion() {
    productoVentaSeleccionado = null;
    ['venta-prod-marca', 'venta-prod-linea', 'venta-prod-presentacion', 'venta-prod-variante', 'venta-prod-volumen', 'venta-prod-tipo-empaque']
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    if (btnSave) btnSave.disabled = true;
  }

  function buscar(query) {
    if (!query.trim()) return [];
    return catalogoProductos.filter(p => p.estado === 'ACTIVO' && coincideBusqueda(p, query)).slice(0, 8);
  }

  function seleccionar(p) {
    productoVentaSeleccionado = p;
    input.value = `[${p.sku}] ${p.marca} ${p.linea}`;
    document.getElementById('venta-prod-marca').value = p.marca;
    document.getElementById('venta-prod-linea').value = p.linea;
    document.getElementById('venta-prod-presentacion').value = p.magnitud;
    document.getElementById('venta-prod-variante').value = p.variante;
    document.getElementById('venta-prod-volumen').value = p.volumen;
    const tipoEmpEl = document.getElementById('venta-prod-tipo-empaque');
    if (tipoEmpEl) tipoEmpEl.value = p.tipoEmpaque || '--';
    if (btnSave) btnSave.disabled = false;
  }

  // SEGURIDAD: mismo motivo que el buscador de Entrada — texto libre del
  // catálogo escapado antes de ir al innerHTML del dropdown.
  crearAutocomplete('buscar-producto-venta', 'dropdown-productos-venta', buscar, seleccionar, p => `
    <div class="ac-item-main">${escaparHTML(p.marca)} ${escaparHTML(p.linea)} ${escaparHTML(p.volumen)}${p.variante ? ' · ' + escaparHTML(p.variante) : ''}</div>
    <div class="ac-item-sub">SKU: ${escaparHTML(p.sku)} · ${escaparHTML(p.magnitud)} · Stock: ${p.stock}</div>
  `);

  input.addEventListener('input', () => { if (productoVentaSeleccionado) limpiarSeleccion(); });
}

// TOGGLE TIPO MOVIMIENTO (ENTRADA / VENTA)
function setTipoMovimiento(tipo) {
  tipoMovimiento = tipo;
  document.getElementById('btn-tipo-entrada').classList.toggle('active', tipo === 'ENTRADA');
  document.getElementById('btn-tipo-venta').classList.toggle('active', tipo === 'VENTA');

  document.getElementById('form-entrada').classList.toggle('hidden', tipo !== 'ENTRADA');
  document.getElementById('form-venta').classList.toggle('hidden', tipo !== 'VENTA');

  generarFolioCorrelativo();
}

// GUARDAR MOVIMIENTO
async function guardarMovimiento(event) {
  event.preventDefault();

  // SEGURIDAD (v2.1): si ya hay un guardado en curso, ignora este envío.
  // Cierra la puerta a doble clic o Enter repetido mientras la petición a
  // Sheets todavía está en camino (o mientras se espera la confirmación
  // del diálogo de "Cambio de precio").
  if (guardandoMovimiento) return;
  guardandoMovimiento = true;

  const btn = (tipoMovimiento === 'ENTRADA') ? document.getElementById('btn-save-in') : document.getElementById('btn-save-out');
  btn.disabled = true;

  // Suelta el candado sin guardar nada — se usa en cada salida temprana
  // (validación fallida o el usuario cancela el diálogo de precio).
  const cancelar = (mensaje) => {
    if (mensaje) document.getElementById('status').innerText = mensaje;
    btn.disabled = false;
    guardandoMovimiento = false;
  };

  try {
    const transId = document.getElementById('trans-id').value;
    const timestampLog = obtenerTimestampLocal();
    const fechaMov = document.getElementById('fecha-mov').value;

    let marca, linea, magnitud, volumen, variante, pDist, pCons, sku, rawCantidad, bonif, tipoEmpaque;
    // v2.3: datos para el aviso de "Cambio de precio" (solo aplica a
    // ENTRADA sobre un producto YA EXISTENTE).
    let cambioPrecio = false, pDistAnterior, pConsAnterior, pDistMostrado, pConsMostrado;

    if (tipoMovimiento === 'ENTRADA') {
      if (!productoEntradaSeleccionado) {
        mostrarDialogo({ titulo: 'Falta el producto', mensaje: 'Busca un producto existente o elige "+ Agregar producto nuevo" antes de guardar.' });
        return cancelar();
      }

      rawCantidad = parseFloat(document.getElementById('mov-cantidad-in').value) || 0;
      bonif = parseFloat(document.getElementById('mov-bonificacion').value) || 0;

      // SEGURIDAD (v2.3): ninguna de las dos puede ser negativa, y entre
      // las dos debe haber ALGO mayor a 0 — así una bonificación sola
      // (sin cajas compradas) sigue siendo un movimiento válido, pero
      // dejar todo en 0 sigue bloqueado.
      if (rawCantidad < 0 || bonif < 0) {
        mostrarDialogo({ titulo: 'Cantidad inválida', mensaje: 'La cantidad y la bonificación no pueden ser negativas.' });
        return cancelar();
      }
      if (rawCantidad === 0 && bonif === 0) {
        mostrarDialogo({ titulo: 'Cantidad inválida', mensaje: 'Ingresa una cantidad o una bonificación mayor a 0.' });
        return cancelar();
      }
      pDist = parseFloat(document.getElementById('precio-distribuidor').value) || 0;
      pCons = parseFloat(document.getElementById('precio-consumidor').value) || 0;

      if (productoEntradaSeleccionado === 'NUEVO') {
        marca = document.getElementById('prod-marca').value.trim();
        linea = document.getElementById('prod-linea').value.trim();
        magnitud = document.getElementById('prod-presentacion').value.trim();
        volumen = document.getElementById('prod-volumen').value.trim();
        variante = document.getElementById('prod-variante').value.trim();
        tipoEmpaque = document.getElementById('prod-tipo-empaque').value.trim();
        sku = generarSKUCompacto(marca, linea, magnitud, volumen, variante);
      } else {
        marca = productoEntradaSeleccionado.marca;
        linea = productoEntradaSeleccionado.linea;
        magnitud = productoEntradaSeleccionado.magnitud;
        volumen = productoEntradaSeleccionado.volumen;
        variante = productoEntradaSeleccionado.variante;
        tipoEmpaque = productoEntradaSeleccionado.tipoEmpaque || '';
        sku = productoEntradaSeleccionado.sku;

        // v2.3: mismo cálculo que ya hacía este archivo más abajo al
        // guardar — se adelanta aquí SOLO para decidir si hace falta
        // pedir confirmación. La resolución real (qué precio queda) la
        // sigue haciendo ejecutarGuardadoMovimiento(), sin cambios.
        pDistAnterior = productoEntradaSeleccionado.pDist;
        pConsAnterior = productoEntradaSeleccionado.pCons;
        pDistMostrado = pDist || pDistAnterior;
        pConsMostrado = pCons || pConsAnterior;
        cambioPrecio = (pDistMostrado !== pDistAnterior) || (pConsMostrado !== pConsAnterior);
      }
    } else {
      if (!productoVentaSeleccionado) {
        mostrarDialogo({ titulo: 'Falta el producto', mensaje: 'Debes seleccionar un producto válido antes de guardar la venta.' });
        return cancelar();
      }
      rawCantidad = parseFloat(document.getElementById('mov-cantidad-out').value);
      // SEGURIDAD (v2.1): mismo candado que en Entrada.
      if (!Number.isFinite(rawCantidad) || rawCantidad <= 0) {
        mostrarDialogo({ titulo: 'Cantidad inválida', mensaje: 'La cantidad debe ser un número mayor a 0.' });
        return cancelar();
      }
      if (rawCantidad > productoVentaSeleccionado.stock) {
        mostrarDialogo({
          titulo: 'Stock insuficiente',
          mensaje: `Disponible: ${productoVentaSeleccionado.stock} ${productoVentaSeleccionado.tipoEmpaque || ''}.`.trim()
        });
        return cancelar();
      }
      marca = productoVentaSeleccionado.marca;
      linea = productoVentaSeleccionado.linea;
      magnitud = productoVentaSeleccionado.magnitud;
      volumen = productoVentaSeleccionado.volumen;
      variante = productoVentaSeleccionado.variante;
      tipoEmpaque = productoVentaSeleccionado.tipoEmpaque || '';
      bonif = 0;
      pDist = productoVentaSeleccionado.pDist;
      pCons = productoVentaSeleccionado.pCons;
      sku = productoVentaSeleccionado.sku;
    }

    const datos = { transId, timestampLog, fechaMov, marca, linea, magnitud, volumen, variante, pDist, pCons, sku, rawCantidad, bonif, tipoEmpaque, btn };

    // AVISO (v2.3): reabastecer un producto YA EXISTENTE con un precio
    // distinto actualiza su precio base para TODAS las próximas
    // operaciones — se confirma antes de escribir nada, igual que al
    // editar un producto desde Stock.
    if (cambioPrecio) {
      mostrarDialogo({
        titulo: '⚠️ Cambio de precio',
        mensaje: `Vas a actualizar el precio de ${marca} ${linea}: Distribuidor $${pDistAnterior.toFixed(5)} → $${pDistMostrado.toFixed(5)}, Consumidor $${pConsAnterior.toFixed(2)} → $${pConsMostrado.toFixed(2)}. Esto actualiza el precio base del producto en la Base de Datos para todas las operaciones futuras. ¿Deseas continuar?`,
        textoConfirmar: 'Sí, actualizar precio',
        textoCancelar: 'Cancelar',
        onConfirmar: () => ejecutarGuardadoMovimiento(datos),
        onCancelar: () => cancelar('Guardado cancelado.')
      });
      return;
    }

    await ejecutarGuardadoMovimiento(datos);
  } catch (err) {
    cancelar('Error: ' + err.message);
  }
}

// Hace el guardado real (Sheets + catálogo en memoria). Separado de
// guardarMovimiento() para poder frenar a mitad de camino y esperar la
// confirmación del diálogo de "Cambio de precio" sin duplicar el candado
// guardandoMovimiento/btn.disabled en dos lugares distintos.
async function ejecutarGuardadoMovimiento(datos) {
  const { transId, timestampLog, fechaMov, marca, linea, magnitud, volumen, variante, pDist, pCons, sku, rawCantidad, bonif, tipoEmpaque, btn } = datos;

  try {
    document.getElementById('status').innerText = 'Guardando registro...';

    const cantidadSigno = (tipoMovimiento === 'VENTA') ? -Math.abs(rawCantidad) : Math.abs(rawCantidad);
    const totalInversion = Math.abs(cantidadSigno) * pDist;
    const margenUnit = pCons - pDist;
    const totalVenta = (tipoMovimiento === 'VENTA') ? Math.abs(cantidadSigno) * pCons : '';
    const utilidadNeta = (tipoMovimiento === 'VENTA') ? Math.abs(cantidadSigno) * margenUnit : '';

    // v2.2: la bonificación (unidades gratis) SÍ suma al stock físico
    // recibido, pero nunca al costo — por eso totalInversion/margenUnit
    // arriba se calculan solo sobre cantidadSigno, nunca sobre bonif. Para
    // VENTA, bonif ya quedó fijado en 0 más arriba, así que sumarlo aquí
    // no cambia nada en ese caso.
    const stockDelta = cantidadSigno + bonif;

    // v2.0: sin columna CANT_EMPAQUE (ya no existe en LOG_TRANS).
    await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'LOG_TRANS!A:T',
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [[
          transId, timestampLog, fechaMov, tipoMovimiento, sku,
          marca, linea, magnitud, volumen, variante,
          cantidadSigno, bonif, pDist, pCons,
          totalInversion, margenUnit, totalVenta, utilidadNeta, tipoEmpaque, ''
        ]]
      }
    });

    let prodIndex = catalogoProductos.findIndex(p => p.sku === sku);
    if (prodIndex >= 0) {
      catalogoProductos[prodIndex].stock += stockDelta;
      // v2.2: acumula cuánto de ese stock es "gratis" (bonif es siempre 0
      // en una VENTA, así que aquí solo suma algo cuando es una ENTRADA
      // con bonificación). Se usa en Stock para "Valor Invertido en Bodega".
      catalogoProductos[prodIndex].stockBonificado = (catalogoProductos[prodIndex].stockBonificado || 0) + bonif;
      if (tipoMovimiento === 'ENTRADA') {
        const pDistAnterior = catalogoProductos[prodIndex].pDist;
        const pConsAnterior = catalogoProductos[prodIndex].pCons;
        const pDistNuevo = pDist || pDistAnterior;
        const pConsNuevo = pCons || pConsAnterior;

        // Reabastecer con un precio distinto también es un "cambio de precio":
        // se registra igual que si se editara desde Stock.
        if (pDistNuevo !== pDistAnterior || pConsNuevo !== pConsAnterior) {
          await registrarHistoricoPrecio(sku, pDistAnterior, pDistNuevo, pConsAnterior, pConsNuevo);
        }

        catalogoProductos[prodIndex].pDist = pDistNuevo;
        catalogoProductos[prodIndex].pCons = pConsNuevo;
        catalogoProductos[prodIndex].tipoEmpaque = tipoEmpaque || catalogoProductos[prodIndex].tipoEmpaque;
      }
    } else {
      // Producto nuevo: se marca la fecha de creación una sola vez; queda
      // fija para siempre (reescribirHojaCatalogo nunca la vuelve a tocar).
      catalogoProductos.push({
        sku, marca, linea, magnitud, volumen, variante,
        pDist, pCons, stock: stockDelta, estado: 'ACTIVO',
        tipoEmpaque: tipoEmpaque || '',
        idProducto: generarIdProducto(),
        fechaCreacion: timestampLog,
        modificacionAnterior: '',
        stockBonificado: bonif
      });
    }

    await reescribirHojaCatalogo();

    document.getElementById('status').innerText = '¡Guardado correctamente!';
    if (tipoMovimiento === 'ENTRADA') {
      document.getElementById('form-entrada').reset();
      resetearBuscadorEntrada();
    } else {
      document.getElementById('form-venta').reset();
      document.getElementById('btn-save-out').disabled = true;
      productoVentaSeleccionado = null;
    }
    document.getElementById('fecha-mov').value = obtenerFechaLocal();
    await cargarDatosIniciales();
  } catch (err) {
    document.getElementById('status').innerText = 'Error: ' + err.message;
  } finally {
    btn.disabled = false;
    guardandoMovimiento = false;
  }
}