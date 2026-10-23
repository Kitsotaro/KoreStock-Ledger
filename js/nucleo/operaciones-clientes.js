// © 2026 Wilber Adonay Escobar Solórzano (Kitsótaro) · KoreStock Ledger · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// OPERACIONES-CLIENTES.JS — clientes mínimos de la v3 (D20, §10.3).
//   - Solo nombre y estado; el cliente es OPCIONAL al vender.
//   - El movimiento guarda ID_CLIENTE; el nombre se lee de CLIENTES, así
//     renombrar no rompe el historial.
//   - Nombre único comparado con normalizarTexto (como la placa, INV. 30).
//   - Se desactiva, nunca se borra.
//
// Expone: buscarClientePorNombre, operacionCrearCliente, operacionActualizarCliente.
// Depende de: almacen.js, esquema.js, cola-escritura.js, hoja.js, operaciones-catalogo.js (rangoFila).
// ============================================================

function buscarClientePorNombre(nombre, excluirId) {
  const n = normalizarIdentidad(nombre);
  return Almacen.hojas.CLIENTES.find(c => c.idCliente !== excluirId && normalizarIdentidad(c.nombre) === n) || null;
}

function operacionCrearCliente(nombre) {
  const limpio = String(nombre || '').trim().replace(/\s+/g, ' ');
  if (!limpio) throw new Error('Escribe el nombre del cliente.');
  const repetido = buscarClientePorNombre(limpio);
  if (repetido) throw new Error(`Ya existe un cliente llamado «${repetido.nombre}».`);
  const cliente = { idCliente: Almacen.tomarId('ID_CLIENTE'), nombre: limpio, estado: ESTADOS.ACTIVO };
  const op = crearOperacion('Crear cliente', [{
    nombre: 'cliente',
    fn: async (ctx) => {
      const r = await Hoja.agregar(Almacen.baseId, 'CLIENTES', [objetoAFila('CLIENTES', cliente, true)]);
      cliente._fila = r.primeraFila;
      Almacen.agregarFilas('CLIENTES', [cliente]);
      ctx.resultado = cliente;
      Almacen.notificar('clientes'); guardarCacheBase();
    }
  }]);
  op.contexto.cliente = cliente;
  return op;
}

function operacionActualizarCliente(idCliente, cambios) {
  const actual = Almacen.cliente(idCliente);
  if (!actual) throw new Error('Cliente no encontrado');
  const nuevo = Object.assign({}, actual, cambios);
  nuevo.nombre = String(nuevo.nombre || '').trim().replace(/\s+/g, ' ');
  if (!nuevo.nombre) throw new Error('El nombre no puede quedar vacío.');
  const repetido = buscarClientePorNombre(nuevo.nombre, idCliente);
  if (repetido) throw new Error(`Ya existe un cliente llamado «${repetido.nombre}».`);
  return crearOperacion('Guardar cliente', [{
    nombre: 'cliente',
    fn: async (ctx) => {
      await Hoja.actualizar(Almacen.baseId, [{ rango: rangoFila('CLIENTES', nuevo._fila), valores: [objetoAFila('CLIENTES', nuevo, false)] }]);
      Almacen.reemplazarFila('CLIENTES', nuevo);
      ctx.resultado = nuevo;
      Almacen.notificar('clientes'); guardarCacheBase();
    }
  }]);
}
