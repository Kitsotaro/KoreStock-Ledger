# KoreStock Ledger

Sistema para gestionar tu negocio: controla el abastecimiento de
productos y te ayuda a decidir qué comprar y en qué dejar de invertir.
Para tiendas, talleres, abarrotes, bodegas, servicios de paquetería y
negocios similares.

🔗 [App en vivo](https://korestock.kitsotaro.com)

Corre en tu navegador, sin servidor propio, y guarda tus datos en una
hoja de Google Sheets dentro de tu propio Google Drive.

## Código disponible (Source Available)

KoreStock es código disponible: puedes leer cómo funciona para confiar
en lo que hace con tus datos, pero el código y la marca pertenecen a su
autor, con todos los derechos reservados. No se permite copiarlo,
redistribuirlo ni usarlo para ofrecer otro servicio. Si quieres una
licencia comercial, escríbenos. Detalles en [`LICENSE`](./LICENSE).

## ✨ Qué hace

- **Registrar** — entradas (compras) y ventas (despacho), con búsqueda
  de producto, SKU autogenerado, importación desde Excel y detección de
  producto nuevo o existente.
- **Stock & Catálogo** — semáforo de inventario, valor de bodega y
  gráfico de distribución (pastel/barras) con navegación por niveles.
- **Dashboard** — historial de movimientos con filtros, buscador y
  anulación (nada se borra: solo se marca anulado).
- **Panorama** — costo promedio ponderado, ROI, proyección de
  agotamiento, resumen de combustible y punto de equilibrio.
- **Costos Operativos** — costos fijos con categorías y control de
  combustible por vehículo.
- Tema claro/oscuro, instalable como app (PWA) y pensada primero para
  el teléfono.

## 🧱 Cómo está hecha

JavaScript, HTML y CSS puros, sin frameworks ni compilación. Tu "base
de datos" es una hoja de Google Sheets que la app lee y escribe
directamente desde tu navegador con las APIs de Google.

## 📄 Licencia, privacidad y términos

- [`LICENSE`](./LICENSE) — derechos sobre el código.
- [`PRIVACY.md`](./PRIVACY.md) — qué datos toca la app y quién los ve.
- [`TERMS.md`](./TERMS.md) — términos de uso de la aplicación.

## Autor

Wilber Adonay Escobar Solorzano ("Kitsótaro")
