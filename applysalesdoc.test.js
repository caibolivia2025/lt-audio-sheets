import { test } from 'node:test';
import assert from 'node:assert/strict';
import { productToSheetData } from './adapter.js';
import { renderSalesSheet, applySalesDoc, blankEditorial } from './product-sheets.js';

/*
 * Parity guard for the v1.1.0 promotion of the sales editorial overlay into the
 * engine. applySalesDoc + blankEditorial are a VERBATIM relocation of the two
 * inline helpers the ACC Fichas tab used (index.html blankEditorial + withEditorial).
 *
 * This proves: rendering a sales sheet the OLD way (ACC's inline withEditorial,
 * reproduced literally below) is byte-identical to the NEW way (engine
 * applySalesDoc) via the SAME shared renderSalesSheet. Because the catalog will
 * import the very same applySalesDoc + renderSalesSheet, ACC-new === catalog by
 * construction; so this Node check is the parity proof for all three consumers,
 * and the guarantee the Fichas polishing is unaffected by the move.
 */

/* ── OLD ACC inline helpers, copied verbatim from index.html (pre-v1.1.0) ── */
function blankEditorial_OLD() {
  return { headline: '', headlineEm: '', subhead: '', featuresEyebrow: 'Por qué se vende', featuresTitle: '', featuresTitleEm: '', featuresAside: '', features: [], stats: [], bar: [], pitchEyebrow: 'El argumento', pitchHeadline: '', pitchHeadlineEm: '', pitchBody: '', pitchSignoff: '', boxTitle: '', box: [], brandMode: 'extended', lifestyleImg: '', seriesLogo: '' };
}
// ACC read `ed` from a closure; here it's a param so the test is self-contained.
function withEditorial_OLD(data, ed) {
  var d = Object.assign({}, data);
  d.meta = Object.assign({}, data.meta, { brandMode: ed.brandMode || 'extended' });
  d.editorial = Object.assign({}, data.editorial, {
    headline: ed.headline, headlineEm: ed.headlineEm, subhead: ed.subhead,
    featuresEyebrow: ed.featuresEyebrow, featuresTitle: ed.featuresTitle, featuresTitleEm: ed.featuresTitleEm, featuresAside: ed.featuresAside,
    features: ed.features, stats: ed.stats, bar: ed.bar,
    pitch: { eyebrow: ed.pitchEyebrow, headline: ed.pitchHeadline, headlineEm: ed.pitchHeadlineEm, body: ed.pitchBody, signoff: ed.pitchSignoff },
    boxTitle: ed.boxTitle, box: ed.box,
    lifestyleImg: ed.lifestyleImg, seriesLogo: ed.seriesLogo,
  });
  return d;
}

/* ── a real-ish product row + per-dealer price (RLS-scoped in production) ── */
const ROW = {
  sku: 'RPS-220B', brand: 'rca', series: 'Ibiza', category: 'Bocina Party',
  name: 'Bocina de Fiesta RPS-220B', name_en: 'RPS-220B Party Speaker',
  barcode: '7501234567890', driver: '8"', watts: '2x10W', battery: 'Li-ion 3600mAh',
  bluetooth: true, auracast: true, usb: true, fm_radio: true, tripod: true, tws: false,
  wireless_mic_qty: 2, loading_qty_40hq: 1200, units_per_carton: 2, status: 'active',
};
const EXTRAS = {
  images: [{ sku: 'RPS-220B', url: 'https://x/hero.webp', kind: 'hero', sort_order: 0 }],
  prices: [{ sku: 'RPS-220B', amount: 210, price_list_id: 7, effective_date: '2026-06-01' }],
  priceLists: [{ id: 7, code: 'LOCAL-PA', name: 'Panamá', currency: 'USD' }],
  // NO cost — catalog never passes it (invariant 6).
};

/* The canonical object — built once, exactly as a host would. */
const canonical = productToSheetData(ROW, EXTRAS);

/* ── fixture saved docs (the product_sheets `data` jsonb, kind='sales') ── */
const DOC_PLAIN = { // a barely-filled default doc
  headline: 'Sonido que llena el lugar', subhead: 'Para cada fiesta',
};
const DOC_CUSTOM = { // a fully edited sales doc
  headline: 'La bocina', headlineEm: 'que manda', subhead: 'Potencia real, batería todo el día',
  featuresEyebrow: 'Lo que la vende', featuresTitle: 'Hecha para', featuresTitleEm: 'durar',
  featuresAside: 'Ideal para mayoristas',
  features: [{ num: '01', title: 'Bluetooth 5.3', desc: 'Conexión estable' }, { num: '02', title: 'TWS', desc: 'Empareja dos' }],
  stats: [{ value: '2x10W', label: 'Potencia' }, { value: '12h', label: 'Batería' }],
  bar: [{ label: 'Driver', value: '8 pulgadas' }],
  pitchEyebrow: 'El argumento', pitchHeadline: 'Margen', pitchHeadlineEm: 'y rotación',
  pitchBody: 'Se vende sola en el punto de venta.', pitchSignoff: 'Latin Trading Co.',
  boxTitle: 'En la caja', box: [{ item: 'Bocina', qty: '1' }, { item: 'Micrófono', qty: '2' }],
  brandMode: 'strict', lifestyleImg: 'https://x/life.webp', seriesLogo: 'data:image/png;base64,AAA',
};

function renderOld(docData) {
  // ACC seeds ed from blankEditorial then overlays the saved doc (index.html load path).
  const ed = Object.assign(blankEditorial_OLD(), docData);
  return renderSalesSheet(withEditorial_OLD(canonical, ed));
}
function renderNew(docData) {
  return renderSalesSheet(applySalesDoc(canonical, docData));
}

test('blankEditorial matches the old ACC inline template exactly', () => {
  assert.deepEqual(blankEditorial(), blankEditorial_OLD());
});

test('plain default doc — engine applySalesDoc renders byte-identical to ACC-old', () => {
  assert.equal(renderNew(DOC_PLAIN), renderOld(DOC_PLAIN));
});

test('fully custom doc — engine applySalesDoc renders byte-identical to ACC-old', () => {
  assert.equal(renderNew(DOC_CUSTOM), renderOld(DOC_CUSTOM));
});

test('per-dealer price reaches the sheet and the dealer USD amount is shown', () => {
  const html = renderNew(DOC_CUSTOM);
  assert.match(html, /210/); // the RLS-scoped dealer price, injected live (never stored in the doc)
});

test('null/empty doc is tolerated (no default sales doc edge)', () => {
  assert.equal(renderNew(null), renderOld({}));
  assert.equal(renderNew(undefined), renderOld({}));
});
