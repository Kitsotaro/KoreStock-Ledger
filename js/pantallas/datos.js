// © 2026 KoreStock Ledger — un proyecto de Kitsótaro · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// PANTALLA DATOS (T19, T20) — «Exportar / Importar» del panel:
//   - Respaldo automático: cuándo fue el último, los que hay (2) y
//     «Hacer respaldo ahora».
//   - Copia en tu equipo: descarga un Excel con todo y su manifiesto; es lo
//     que protege si se pierde la cuenta de Google.
//   - Restaurar: desde una copia descargada, crea una base NUEVA; la actual
//     no se borra (queda como «reemplazada» en la carpeta).
//   - Importar compras y ventas desde Excel (heredado).
//   - Archivo histórico: cuándo toca archivar y el botón para hacerlo
//     (con aviso, respaldo previo y verificación; nunca solo).
// Lo que escribe en Drive se desactiva sin conexión (requiere-red).
//
// Expone: (registra la pantalla 'datos'), avisoRotacionSiToca, incluirHistoricosUI.
// Depende de: shell.js, componentes.js, cargador.js (cargarXLSX),
//   respaldos.js, historicos.js, importar-excel.js.
// ============================================================

const datosUI = { el: null, respaldos: null, historicos: null };

registrarPantalla('datos', {
  titulo: 'Exportar / Importar',
  montar(el) {
    datosUI.el = el;
    el.innerHTML = html`<div class="columna" id="datos-contenido"></div>`.texto;
    delegar(el, 'click', {
      'respaldar': (b) => respaldarAhoraUI(b),
      'descargar-copia': (b) => descargarCopiaUI(b),
      'restaurar': () => restaurarUI(),
      'importar': () => elegirArchivoImportacion(),
      'plantilla': () => descargarPlantillaImportacion(),
      'archivar': (b) => archivarUI(b)
    });
    Almacen.suscribir((m) => { if (Shell.actual === 'datos' && m !== 'carga') pintarDatos(); });
  },
  mostrar() { pintarDatos(); cargarListasDatos(); }
});

async function cargarListasDatos() {
  if (Almacen.sinConexion || !Almacen.baseId) return;
  try {
    datosUI.respaldos = await listarRespaldos(Almacen.baseId);
    datosUI.historicos = await listarHistoricos();
  } catch (e) { datosUI.respaldos = datosUI.respaldos || null; }
  if (Shell.actual === 'datos') pintarDatos();
}

function textoHace(ts) {
  if (!ts) return 'nunca';
  const dias = diasEntre(ts.slice(0, 10), obtenerFechaLocal());
  return dias <= 0 ? `hoy a las ${ts.slice(11, 16)}` : `hace ${dias} ${pluralizar(dias, 'día')}`;
}

function pintarDatos() {
  const sinRed = !!Almacen.sinConexion;
  const deshabilitar = sinRed ? seguro(' disabled title="Necesitas internet"') : '';
  const respaldos = datosUI.respaldos;
  const ultimo = leerLocal(CLAVES_LOCALES.ULTIMO_RESPALDO);
  const rot = necesitaRotacion(Almacen.movimientos);
  const limite = rot.desde ? (() => { const f = textoAFecha(rot.desde); f.setMonth(f.getMonth() + MESES_PARA_ROTAR); return fechaATexto(f); })() : '';
  const historicos = datosUI.historicos || [];
  const alDia = !!ultimo && diasEntre(ultimo.slice(0, 10), obtenerFechaLocal()) <= 1;
  $('#datos-contenido', datosUI.el).innerHTML = html`
    ${sinRed ? html`<div class="franja aviso-color">${seguro(icono('sin-nube', 'icono-sm'))}<span>Sin conexión: puedes descargar tu copia; respaldar, restaurar y archivar necesitan internet.</span></div>` : ''}

    <h2 class="titulo-grupo">Protege tus datos</h2>
    <section class="tarjeta columna" aria-labelledby="t-respaldo">
      <div class="tarjeta-titulo"><h2 id="t-respaldo">${seguro(icono('nube-check', 'icono-sm'))} Respaldo automático ${botonInfo('Respaldo automático', 'Cada día, al abrir la app, se guarda una copia de tu base en tu carpeta KoreStock de Google Drive. Se conservan las 2 más recientes y solo se reemplazan si la nueva salió completa.')}</h2>
        <span class="insignia ${alDia ? 'venta' : 'aviso'}">${alDia ? 'Al día' : 'Pendiente'}</span></div>
      <p class="t-secundario t-pequeno">Una copia diaria en tu Google Drive.</p>
      <div class="fila-separada"><span>Último respaldo</span><strong>${textoHace(ultimo)}</strong></div>
      ${respaldos && respaldos.length ? html`<div class="columna t-pequeno">${respaldos.map(r => html`<div class="fila-separada"><span>${formatearFechaCorta((r.propiedades.creado || r.creado || '').slice(0, 10))} ${(r.propiedades.creado || '').slice(11, 16)}</span><span class="t-secundario">${r.propiedades.motivo || 'diario'}</span></div>`)}</div>` : ''}
      <button type="button" class="boton boton-secundario boton-bloque" data-accion="respaldar"${deshabilitar}>${seguro(icono('nube', 'icono-sm'))}Hacer respaldo ahora</button>
    </section>

    <section class="tarjeta columna" aria-labelledby="t-copia">
      <div class="tarjeta-titulo"><h2 id="t-copia">${seguro(icono('descargar', 'icono-sm'))} Copia en tu equipo ${botonInfo('Copia en tu equipo', 'El respaldo vive en tu mismo Google Drive: si pierdes la cuenta, se pierde con ella. Descarga una copia de vez en cuando y guárdala en otro lugar (computadora, memoria USB, otro correo).')}</h2></div>
      <p class="t-secundario t-pequeno">Guárdala fuera de Google Drive de vez en cuando.</p>
      <button type="button" class="boton boton-primario boton-bloque" data-accion="descargar-copia">${seguro(icono('descargar', 'icono-sm'))}Descargar copia (Excel)</button>
    </section>

    <section class="tarjeta columna" aria-labelledby="t-restaurar">
      <div class="tarjeta-titulo"><h2 id="t-restaurar">${seguro(icono('papelera-restaurar', 'icono-sm'))} Restaurar una copia ${botonInfo('Restaurar una copia', 'Solo acepta copias descargadas desde aquí y sin modificar. Crea una base nueva con esa copia; tu base actual no se borra, queda guardada en la carpeta como «reemplazada».')}</h2></div>
      <p class="t-secundario t-pequeno">Tu base actual no se borra.</p>
      <button type="button" class="boton boton-secundario boton-bloque" data-accion="restaurar"${deshabilitar}>${seguro(icono('subir', 'icono-sm'))}Restaurar desde un archivo</button>
    </section>

    <h2 class="titulo-grupo">Mantenimiento</h2>
    <section class="tarjeta columna" aria-labelledby="t-importar">
      <div class="tarjeta-titulo"><h2 id="t-importar">${seguro(icono('archivo', 'icono-sm'))} Importar compras y ventas ${botonInfo('Importar compras y ventas', 'Para cargar muchos movimientos de una vez desde Excel. Usa la plantilla: cantidad positiva = compra; negativa = venta.')}</h2></div>
      <p class="t-secundario t-pequeno">Muchos movimientos de una vez desde Excel.</p>
      <div class="fila">
        <button type="button" class="boton boton-secundario crece" data-accion="importar"${deshabilitar}>${seguro(icono('subir', 'icono-sm'))}Elegir archivo</button>
        <button type="button" class="boton boton-texto" data-accion="plantilla">Descargar plantilla</button>
      </div>
    </section>

    <section class="tarjeta columna" aria-labelledby="t-historico">
      <div class="tarjeta-titulo"><h2 id="t-historico">${seguro(icono('carpeta', 'icono-sm'))} Archivo histórico ${botonInfo('Archivo histórico', `Para que la app siga rápida, cada 6 meses (o al llegar a ${formatearNumero(FILAS_PARA_ROTAR)} movimientos) tu base se archiva y empieza una nueva con tu catálogo, clientes, el stock al día y el último mes. Lo archivado no se borra y los reportes lo siguen usando.`)}</h2>
        ${rot.rotar ? html`<span class="insignia aviso">Toca archivar</span>` : ''}</div>
      <p class="t-secundario t-pequeno">Mantiene la app rápida; nada se borra.</p>
      ${rot.desde ? html`<div class="fila-separada"><span>Tu base cubre desde</span><strong>${formatearFechaCorta(rot.desde)}</strong></div>
        <div class="fila-separada"><span>Movimientos</span><strong>${formatearNumero(rot.filas)}</strong></div>
        <div class="fila-separada"><span>${rot.rotar ? 'Lista para archivar' : 'Se podrá archivar el'}</span><strong>${rot.rotar ? 'Sí' : formatearFechaCorta(limite)}</strong></div>` : html`<p class="t-pequeno t-secundario">Aún no hay movimientos.</p>`}
      ${historicos.length ? html`<div class="fila-separada"><span>Archivos históricos</span><strong>${historicos.length}</strong></div>` : ''}
      ${rot.rotar ? html`<button type="button" class="boton boton-aviso boton-bloque" data-accion="archivar"${deshabilitar}>${seguro(icono('carpeta', 'icono-sm'))}Archivar ahora</button>` : ''}
    </section>`.texto;
}

async function respaldarAhoraUI(boton) {
  boton.classList.add('cargando'); boton.disabled = true;
  try {
    await hacerRespaldo(Almacen.baseId, 'manual');
    avisar('Respaldo listo y verificado.');
    Shell.actualizarPanel();
    await cargarListasDatos();
  } catch (e) {
    mostrarDialogo({ titulo: 'No se pudo respaldar', mensaje: `${e.message}\n\nTus datos no cambiaron.` });
  } finally { boton.classList.remove('cargando'); boton.disabled = false; }
}

async function descargarCopiaUI(boton) {
  boton.classList.add('cargando'); boton.disabled = true;
  try {
    await cargarXLSX();
    const libro = construirLibroExportacion(Almacen.hojas);
    XLSX.writeFile(libro, `KoreStock_copia_${obtenerFechaLocal()}.xlsx`);
    avisar('Copia descargada. Guárdala fuera de tu Google Drive.');
  } catch (e) {
    mostrarDialogo({ titulo: 'No se pudo descargar', mensaje: e.message });
  } finally { boton.classList.remove('cargando'); boton.disabled = false; }
}

function restaurarUI() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xlsx';
  input.addEventListener('change', async () => {
    const archivo = input.files[0];
    if (!archivo) return;
    let libro, leido;
    try {
      await cargarXLSX();
      libro = XLSX.read(new Uint8Array(await archivo.arrayBuffer()), { type: 'array' });
      leido = leerLibroRestauracion(libro);
    } catch (e) { mostrarDialogo({ titulo: 'No se puede restaurar este archivo', mensaje: e.message }); return; }
    const t = totalesManifiesto(leido.hojas);
    const ok = await confirmarFuerte({
      titulo: '¿Restaurar esta copia?',
      mensaje: `Copia del ${String(leido.manifiesto.EXPORTADO || '').slice(0, 16)}: ${formatearNumero(leido.hojas.LOG_TRANS.length)} movimientos, ${formatearNumero(leido.hojas.CATALOGO.length)} productos, ventas ${formatearDinero(dinero(t.VENTAS))}.\n\nSe creará una base nueva con esta copia y la app pasará a usarla. Lo que registraste después de esa fecha NO estará en la nueva. Tu base actual no se borra: queda en tu carpeta como «reemplazada».`,
      palabra: 'RESTAURAR', textoConfirmar: 'Restaurar'
    });
    if (!ok) return;
    App.mostrar('carga'); App.textoCarga('Restaurando tu copia…');
    try {
      const r = await restaurarDesdeLibro(libro);
      if (!r.ok) throw new Error(`La base restaurada no coincide con la copia (${r.comparacion.errores.slice(0, 2).join('; ')}). No se cambió nada.`);
      await activarBaseNueva(r.idNuevo, Almacen.baseId);
      await App.abrir(r.idNuevo);
      avisar('Copia restaurada.');
    } catch (e) {
      App.mostrar('app');
      mostrarDialogo({ titulo: 'No se pudo restaurar', mensaje: e.message });
    }
  });
  input.click();
}

async function archivarUI(boton) {
  const ok = await confirmar({
    titulo: '¿Archivar tu base ahora?',
    mensaje: 'Primero se hace un respaldo. Luego se crea una base nueva con tu catálogo, clientes, el stock al día y el último mes, y se comprueba que stock, costos y ventas del mes salgan idénticos. Si algo no cuadra, no se cambia nada.\n\nPuede tardar unos minutos. No cierres la app y no la uses en otro dispositivo mientras tanto.',
    textoConfirmar: 'Archivar'
  });
  if (!ok) return;
  App.mostrar('carga');
  const anterior = Almacen.baseId;
  try {
    const r = await rotarBase(anterior, (paso, texto) => App.textoCarga(`${texto} (${paso} de 6)`));
    if (!r.ok) throw new Error(`No se archivó porque la comprobación encontró diferencias:\n${r.errores.slice(0, 4).join('\n')}\n\nTu base sigue igual.`);
    await App.abrir(r.idNuevo);
    avisar('Base archivada. Los reportes siguen incluyendo lo anterior.', { duracion: 6000 });
  } catch (e) {
    App.mostrar('app');
    mostrarDialogo({ titulo: 'No se pudo archivar', mensaje: e.message });
  }
}

// Períodos que empiezan antes que la base principal: lee los históricos
// en segundo plano (con franja de progreso) y vuelve a pintar al terminar.
// Solo pregunta si hay que leer de Drive más de un archivo o muchas filas.
let leyendoHistoricos = false;
async function incluirHistoricosUI(inicio, repintar) {
  if (leyendoHistoricos || PeriodosLargos.cubre(inicio) || PeriodosLargos.rechazado === inicio) return;
  leyendoHistoricos = true;
  const franja = (t) => Shell.mostrarFranja('historicos', html`${seguro(icono('carpeta', 'icono-sm'))}<span>${t}</span>`, 'info-color');
  try {
    const cambio = await PeriodosLargos.preparar(inicio, {
      sinRed: !!Almacen.sinConexion,
      alProgreso: (i, n) => franja(`Leyendo tu archivo histórico ${i} de ${n}… depende de tus datos y del navegador.`),
      confirmarLectura: ({ archivos, filas }) => confirmar({
        titulo: '¿Incluir tus archivos históricos?',
        mensaje: `Este período necesita ${archivos} ${pluralizar(archivos, 'archivo histórico', 'archivos históricos')}${filas ? ` (unos ${formatearNumero(filas)} movimientos)` : ''} que aún no están en este dispositivo. La primera vez puede tardar unos minutos; después es inmediato.

Si eliges «Ahora no», verás solo lo que está en tu base actual.`,
        textoConfirmar: 'Incluir', textoCancelar: 'Ahora no'
      })
    });
    if (cambio) repintar();
  } catch (e) {
    avisar('No se pudieron leer los históricos: se muestra solo tu base actual.');
  } finally {
    leyendoHistoricos = false;
    Shell.quitarFranja('historicos');
  }
}

// Nota bajo las cifras cuando el período sale de la base y no se incluyó lo archivado.
function notaHistoricosHTML(inicio) {
  const faltan = PeriodosLargos.necesarios(inicio).filter(h => !PeriodosLargos.datos.has(h.id));
  if (!faltan.length) return '';
  const desde = PeriodosLargos.faltaDesde(inicio);
  return html`<p class="t-pequeno t-secundario">${seguro(icono('info', 'icono-sm'))} Cifras desde ${formatearFechaCorta(desde)}: lo anterior está en tu archivo histórico${Almacen.sinConexion ? ' y se lee con internet' : ''}.</p>`;
}

// Aviso suave al abrir cuando ya toca archivar (nunca archiva solo).
function avisoRotacionSiToca() {
  const r = necesitaRotacion(Almacen.movimientos);
  if (!r.rotar) { Shell.quitarFranja('archivar'); return; }
  Shell.mostrarFranja('archivar', html`${seguro(icono('carpeta', 'icono-sm'))}<span>${r.porVolumen ? 'Tu base ya tiene muchos movimientos' : 'Tu base cumplió 6 meses'}: archívala para que la app siga rápida.</span>`, 'info-color',
    { texto: 'Ver', fn: () => Shell.ir('datos') });
}
