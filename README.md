# lt-audio-sheets

Single source of truth for Latin Trading's audio **spec sheet** + **sales sheet** render engine.

Framework-agnostic, no build needed. Consumed two ways:

- **ACC** (static `index.html`, no bundler) — imports pinned jsDelivr ESM:
  `import { renderSpecSheet } from 'https://cdn.jsdelivr.net/gh/caibolivia2025/lt-audio-sheets@v1.1.0/product-sheets.js'`
- **Catalog** (Vite) — `npm i github:caibolivia2025/lt-audio-sheets#v1.1.0` then `import { renderSpecSheet } from 'lt-audio-sheets'`

## Exports
- `productToSheetData(row, extras)` — Supabase row (+ joins) → canonical sheet object. **Never pass cost from the catalog.**
- `renderSpecSheet(data)` / `renderSalesSheet(data)` — canonical → HTML string (pure, no DOM).
- `injectSheetStyles(doc?)` — idempotent `<style>` + fonts.
- `hydrateBarcodes(rootEl, JsBarcode)` — fill barcode SVGs after mount (host supplies JsBarcode v3.12.3).
- `mergeCustom(baseSpecs, custom)` / `applySpecDoc(data, docData)` — overlay a saved `product_sheets` spec doc's custom layer onto the live canonical (same merge ACC uses).
- `blankEditorial()` / `applySalesDoc(data, docData)` — the blank sales-editorial template + overlay of a saved `product_sheets` sales doc (`data` jsonb, the flat `ed` shape) onto the canonical's `editorial` (+ `meta.brandMode`) for `renderSalesSheet`. Same overlay ACC's Fichas editor uses; the per-dealer price stays live in `data.price` and is never part of the doc.

`npm test` runs the adapter unit tests (`node --test`, zero deps).

The sheet doc is the editable layer only — **price/cost is never stored in it**; the per-dealer price is injected live at render.
