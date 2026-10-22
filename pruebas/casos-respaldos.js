// © 2026 Kitsótaro · KoreStock Ledger · Código disponible, todos los derechos reservados (ver LICENSE).
// Respaldos, exportar y restaurar (V3 §14, §18.2, §18.4 punto 4).

grupo('Respaldos, exportar y restaurar');

const totalesDe = (hojas) => JSON.stringify(totalesManifiesto(hojas));

prueba('respaldo diario: la copia está completa y quedan solo 2 generaciones', async () => {
  if (!hayBasePrueba()) return;
  const id = await abrirBasePruebaV3(false);
  for (let i = 0; i < 3; i++) await hacerRespaldo(id, 'prueba');
  const lista = await listarRespaldos(id);
  igual(lista.length, GENERACIONES_RESPALDO, 'solo 2 respaldos');
  const copia = await leerHojas(lista[0].id, NOMBRES_HOJAS);
  igual(copia.LOG_TRANS.length, Almacen.movimientos.length, 'todas las filas');
  igual(totalesDe(copia), totalesDe(Almacen.hojas));
  igual(await respaldoDiarioSiHaceFalta(id), null, 'hoy ya hay respaldo: no copia otra vez');
  // Los respaldos no compiten con la base principal.
  const principales = await Hoja.listarArchivos({ propiedades: { korestock: 'base', tipo: 'principal' } });
  igualProfundo(principales.map(p => p.id), [id]);
});

prueba('§18.4.4: si la copia sale incompleta, se descarta y se conservan las anteriores', async () => {
  if (!hayBasePrueba()) return;
  const id = await abrirBasePruebaV3(false);
  await hacerRespaldo(id, 'bueno');
  const antes = (await listarRespaldos(id)).map(r => r.id);
  // Simula una copia cortada: Drive copia sin la última fila del historial.
  const copiarOriginal = MotorDemo.copiarArchivo;
  MotorDemo.copiarArchivo = async function (origen, opciones) {
    const nuevo = await copiarOriginal.call(this, origen, opciones);
    DriveDemo.archivo(nuevo).hojas.LOG_TRANS.pop();
    return nuevo;
  };
  try { await lanza(() => hacerRespaldo(id, 'cortado'), 'debe fallar la verificación'); }
  finally { MotorDemo.copiarArchivo = copiarOriginal; }
  igualProfundo((await listarRespaldos(id)).map(r => r.id), antes, 'el respaldo bueno sigue');
});

prueba('exportar y restaurar: mismos datos en una base nueva, que solo se activa al final', async () => {
  if (!hayBasePrueba()) return;
  const id = await abrirBasePruebaV3(false);
  const bytes = XLSX.write(construirLibroExportacion(Almacen.hojas), { type: 'array', bookType: 'xlsx' });
  const libro = XLSX.read(bytes, { type: 'array' });
  const r = await restaurarDesdeLibro(libro);
  verdadero(r.ok, r.comparacion && r.comparacion.errores.join('; '));
  verdadero(r.idNuevo !== id, 'nunca mezcla con la base actual');
  igual(DriveDemo.archivo(r.idNuevo).propiedades.tipo, 'pendiente', 'aún no es la principal');
  const restaurada = await leerHojas(r.idNuevo, NOMBRES_HOJAS);
  NOMBRES_HOJAS.forEach(n => igual(restaurada[n].length, Almacen.hojas[n].length, `filas de ${n}`));
  igual(totalesDe(restaurada), totalesDe(Almacen.hojas));
  await activarBaseNueva(r.idNuevo, id);
  const principales = await Hoja.listarArchivos({ propiedades: { korestock: 'base', tipo: 'principal' } });
  igualProfundo(principales.map(p => p.id), [r.idNuevo], 'una sola principal');
  igual(DriveDemo.archivo(id).propiedades.tipo, 'reemplazada', 'la anterior no se borra');
});

prueba('restaurar rechaza archivos ajenos o modificados', async () => {
  if (!hayBasePrueba()) return;
  await abrirBasePruebaV3(false);
  const leer = () => XLSX.read(XLSX.write(construirLibroExportacion(Almacen.hojas), { type: 'array', bookType: 'xlsx' }), { type: 'array' });
  const sinManifiesto = leer();
  sinManifiesto.SheetNames = sinManifiesto.SheetNames.filter(n => n !== HOJA_MANIFIESTO);
  await lanza(() => leerLibroRestauracion(sinManifiesto), 'sin MANIFIESTO');
  // Alguien cambia el total de una venta en Excel.
  const editado = leer();
  const filas = XLSX.utils.sheet_to_json(editado.Sheets.LOG_TRANS, { header: 1, raw: true, defval: '' });
  const col = indiceColumna('LOG_TRANS', 'totalVenta');
  const i = filas.findIndex((f, k) => k > 0 && f[3] === TIPOS_MOV.VENTA);
  filas[i][col] = Number(filas[i][col]) + 1;
  editado.Sheets.LOG_TRANS = XLSX.utils.aoa_to_sheet(filas);
  await lanza(() => leerLibroRestauracion(editado), 'totales que no cuadran');
  // Una fila borrada.
  const corto = leer();
  const f2 = XLSX.utils.sheet_to_json(corto.Sheets.CLIENTES, { header: 1, raw: true, defval: '' });
  if (f2.length > 1) { f2.pop(); corto.Sheets.CLIENTES = XLSX.utils.aoa_to_sheet(f2); await lanza(() => leerLibroRestauracion(corto), 'faltan filas'); }
});
