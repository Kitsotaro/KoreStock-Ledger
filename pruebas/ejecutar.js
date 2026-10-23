// © 2026 KoreStock Ledger — un proyecto de Kitsótaro · Código disponible, todos los derechos reservados (ver LICENSE).
// Ejecuta las pruebas en Node (solo desarrollo; la app no necesita Node).
// Uso:  node pruebas/ejecutar.js [ruta-base-prueba.xlsx]
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.join(__dirname, '..');
const contexto = vm.createContext({ console, setTimeout, clearTimeout, Date, Math, JSON, BigInt, Promise, Intl,
  RUTA_BASE_PRUEBA: process.argv[2] || path.join(raiz, '_privado', 'pruebas', 'StockCentral_DB_Prueba.xlsx'),
  leerArchivoBinario: (ruta) => fs.existsSync(ruta) ? new Uint8Array(fs.readFileSync(ruta)) : null });
contexto.globalThis = contexto;
contexto.window = contexto;

const lista = JSON.parse(fs.readFileSync(path.join(__dirname, 'archivos.json'), 'utf8'));
for (const archivo of lista) {
  const codigo = fs.readFileSync(path.join(raiz, archivo), 'utf8');
  vm.runInContext(codigo, contexto, { filename: archivo });
}

// Imprime cada prueba al terminar (las largas se ven avanzar).
let fallidas = 0;
let grupoAnterior = '';
contexto.reportarPrueba = (r) => {
  if (r.grupo !== grupoAnterior) { console.log(`
■ ${r.grupo}`); grupoAnterior = r.grupo; }
  const tiempo = r.ms > 2000 ? ` (${(r.ms / 1000).toFixed(1)} s)` : '';
  if (r.ok) console.log(`  ✓ ${r.nombre}${tiempo}`);
  else { fallidas++; console.log(`  ✗ ${r.nombre}${tiempo}
      ${r.error}`); }
};
vm.runInContext('ejecutarPruebas(reportarPrueba)', contexto).then(resultados => {
  console.log(`
${resultados.length - fallidas} de ${resultados.length} pruebas correctas.`);
  process.exit(fallidas ? 1 : 0);
});
