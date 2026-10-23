// © 2026 KoreStock Ledger — un proyecto de Kitsótaro · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// SW.JS — Service Worker: guarda los ARCHIVOS DE LA APP para abrir sin
// conexión (D27: offline solo lectura; los datos viven en IndexedDB).
//
// - Red primero, copia como respaldo (INVARIANTE 28: no hace falta subir un
//   número de versión para ver los cambios).
// - Solo guarda archivos PROPIOS (mismo origen) pedidos con GET. Nunca
//   guarda respuestas de Google (datos, verificación de acceso): eso
//   corrige el hallazgo de la auditoría T01.
// - Al activarse borra cachés viejas (incluida la de la v2, que guardaba
//   respuestas de Google).
// ============================================================

const CACHE_APP = 'korestock-app-v3';
// Todo lo necesario para abrir y consultar sin conexión (D27).
const ARCHIVOS_APP = [
  './', './index.html', './manifest.json', './assets/logo.png', './assets/icono-192.png', './assets/icono-512.png', './assets/favicon-48.png', './assets/iconos.svg', './js/ui/arranque.js',
  './css/tokens.css', './css/tema-claro.css', './css/tema-oscuro.css', './css/base.css',
  './css/componentes/icono.css', './css/componentes/boton.css', './css/componentes/campo.css',
  './css/componentes/tarjeta.css', './css/componentes/chip.css', './css/componentes/lista.css',
  './css/componentes/controles.css', './css/componentes/barras.css', './css/componentes/superposiciones.css',
  './css/pantallas/landing.css', './css/pantallas/app.css', './css/pantallas/registro.css',
  './css/pantallas/stock.css', './css/pantallas/dashboard.css', './css/pantallas/panorama.css', './css/pantallas/gastos.css', './css/componentes/escritorio.css',
  './js/nucleo/config.js', './js/nucleo/dinero.js', './js/nucleo/utilidades.js', './js/nucleo/esquema.js',
  './js/nucleo/calculos.js', './js/nucleo/hoja.js', './js/nucleo/hoja-google.js', './js/demo/hoja-demo.js',
  './js/nucleo/base-datos.js', './js/nucleo/migracion.js', './js/nucleo/cache-local.js', './js/nucleo/almacen.js',
  './js/nucleo/sincronizacion.js', './js/nucleo/sesion.js', './js/nucleo/cola-escritura.js', './js/nucleo/sku.js',
  './js/nucleo/operaciones-catalogo.js', './js/nucleo/operaciones-movimientos.js',
  './js/nucleo/operaciones-clientes.js', './js/nucleo/operaciones-gastos.js', './js/nucleo/operaciones-lotes.js',
  './js/nucleo/respaldos.js', './js/nucleo/historicos.js', './js/ui/componentes.js', './js/ui/selector-color.js', './js/ui/presentacion.js', './js/ui/cargador.js',
  './js/ui/shell.js', './js/ui/selector-archivo.js', './js/ui/campos.js', './js/ui/selector-producto.js',
  './js/ui/filtros.js', './js/demo/modo-demo.js', './js/pantallas/migracion.js', './js/pantallas/primer-uso.js',
  './js/pantallas/venta.js', './js/pantallas/importar-excel.js', './js/pantallas/entrada.js',
  './js/pantallas/grafico-stock.js', './js/pantallas/stock.js', './js/pantallas/reasignar.js',
  './js/pantallas/dashboard.js', './js/pantallas/lotes.js', './js/pantallas/panorama.js', './js/pantallas/gastos.js',
  './js/pantallas/combustible.js', './js/pantallas/clientes.js', './js/pantallas/datos.js', './js/pantallas/ayuda.js', './PRIVACY.md', './TERMS.md', './LICENSE', './js/app.js',
  './lib/chart.umd.min.js', './lib/xlsx.full.min.js', './lib/marked.umd.js', './lib/fuentes/InterVariable.woff2',
  './lib/fuentes/JetBrainsMono.ttf'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_APP).then((cache) => Promise.allSettled(ARCHIVOS_APP.map((a) => cache.add(a)))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((nombres) => Promise.all(nombres.filter((n) => n !== CACHE_APP).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const peticion = e.request;
  if (peticion.method !== 'GET') return;
  const url = new URL(peticion.url);
  if (url.origin !== self.location.origin || url.pathname.includes('/_privado/')) return;
  e.respondWith(
    fetch(peticion, { cache: 'no-cache' }) // revalida siempre: nunca una versión vieja pegada
      .then((respuesta) => {
        if (respuesta.ok && respuesta.type === 'basic') {
          const copia = respuesta.clone();
          caches.open(CACHE_APP).then((cache) => cache.put(peticion, copia));
        }
        return respuesta;
      })
      .catch(() => caches.match(peticion).then((guardada) => guardada || (peticion.mode === 'navigate' ? caches.match('./index.html') : undefined)))
  );
});
