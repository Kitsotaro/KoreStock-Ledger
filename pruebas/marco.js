// © 2026 Kitsótaro · KoreStock Ledger · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// MARCO.JS — mini marco de pruebas (navegador y Node, sin dependencias).
// Expone: prueba, grupo, igual, igualProfundo, verdadero, lanza, ejecutarPruebas.
// ============================================================

const PRUEBAS_REGISTRADAS = [];
let GRUPO_ACTUAL = '';

function grupo(nombre) { GRUPO_ACTUAL = nombre; }

function prueba(nombre, fn) { PRUEBAS_REGISTRADAS.push({ grupo: GRUPO_ACTUAL, nombre, fn }); }

function igual(obtenido, esperado, mensaje) {
  if (obtenido !== esperado) {
    throw new Error(`${mensaje ? mensaje + ': ' : ''}se esperaba ${JSON.stringify(esperado)} y salió ${JSON.stringify(obtenido)}`);
  }
}

function igualProfundo(obtenido, esperado, mensaje) {
  const a = JSON.stringify(obtenido), b = JSON.stringify(esperado);
  if (a !== b) throw new Error(`${mensaje ? mensaje + ': ' : ''}se esperaba ${b} y salió ${a}`);
}

function verdadero(valor, mensaje) {
  if (!valor) throw new Error(mensaje || 'se esperaba verdadero');
}

async function lanza(fn, mensaje) {
  try { await fn(); } catch (e) { return; }
  throw new Error(mensaje || 'se esperaba un error');
}

async function ejecutarPruebas(alReportar) {
  const resultados = [];
  for (const p of PRUEBAS_REGISTRADAS) {
    const inicio = Date.now();
    try {
      await p.fn();
      resultados.push({ ...p, ok: true, ms: Date.now() - inicio });
    } catch (e) {
      resultados.push({ ...p, ok: false, error: e && e.message ? e.message : String(e), ms: Date.now() - inicio });
    }
    if (alReportar) alReportar(resultados[resultados.length - 1]);
  }
  return resultados;
}
