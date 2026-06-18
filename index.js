/* lt-audio-sheets — single source of truth for the LT spec/sales sheet engine.
 * Consumed by the ACC (jsDelivr ESM, no build) and the catalog (npm git dep, Vite). */
export { productToSheetData, buildSpecRows } from './adapter.js';
export {
  renderSpecSheet, renderSalesSheet,
  injectSheetStyles, hydrateBarcodes,
  mergeCustom, applySpecDoc,
} from './product-sheets.js';
