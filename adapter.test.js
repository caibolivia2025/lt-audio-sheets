import { test } from 'node:test';
import assert from 'node:assert/strict';
import { productToSheetData, buildSpecRows } from './adapter.js';

/* ── fixtures: real-ish Supabase rows ── */

// 1) Fully-populated SKU: every structured column set, all joins present.
const ROW_FULL = {
  sku: 'RPS-220B',
  brand: 'rca',
  series: 'Ibiza',
  category: 'Bocina Party',
  name: 'Bocina de Fiesta RPS-220B',
  name_en: 'RPS-220B Party Speaker',
  barcode: '7501234567890',
  driver: '8"',
  watts: '2x10W', // text on purpose — must be kept verbatim, not parsed to 2
  battery: 'Li-ion 3600mAh',
  bluetooth: true,
  auracast: true,
  usb: true,
  fm_radio: true,
  tripod: true,
  tws: false, // known-false → "No"
  wireless_mic_qty: 2,
  loading_qty_40hq: 1200,
  units_per_carton: 2,
  status: 'active',
};
const EXTRAS_FULL = {
  images: [
    { sku: 'RPS-220B', url: 'hero.webp', kind: 'hero', sort_order: 0 },
    { sku: 'RPS-220B', url: 'g2.webp', kind: 'gallery', sort_order: 2 },
    { sku: 'RPS-220B', url: 'g1.webp', kind: 'gallery', sort_order: 1 },
  ],
  cost: { sku: 'RPS-220B', fob_usd: 42.5, stock_cost: 50 },
  prices: [
    { sku: 'RPS-220B', amount: 199, price_list_id: 3, effective_date: '2026-01-01' },
    { sku: 'RPS-220B', amount: 210, price_list_id: 3, effective_date: '2026-06-01' }, // newest wins
  ],
  priceLists: [{ id: 3, code: 'LOCAL-PA', currency: 'USD' }],
  packaging: [
    { sku: 'RPS-220B', tier: 'master', length_mm: 800, width_mm: 600, height_mm: 500, weight_kg: 18, units: 2, material: 'Cartón', pack_type: 'Master' },
    { sku: 'RPS-220B', tier: 'unit', length_mm: 380, width_mm: 380, height_mm: 600, weight_kg: 8, units: 1, material: 'Color box', pack_type: null },
  ],
  attrs: { sku: 'RPS-220B', moq: 200, lead_time: '45 días', hs_code: '8518.22', country_of_origin: 'China', warranty: '12 meses' },
};

// 2) Sparse SKU: heavy nulls / 'N/A' / missing joins. Proves omission, no fabrication.
const ROW_SPARSE = {
  sku: 'WBS1080B',
  brand: 'westinghouse',
  series: null,
  category: null,
  name: null,
  description: 'Bocina compacta', // name falls back to description
  name_en: null,
  barcode: null,
  driver: 'N/A', // sentinel → dropped
  watts: null,
  battery: '   ', // whitespace → dropped
  bluetooth: null, // unknown → dropped (NOT "No")
  auracast: null,
  usb: null,
  fm_radio: null,
  tripod: null,
  tws: null,
  wireless_mic_qty: 0, // 0 → dropped
  loading_qty_40hq: null,
  units_per_carton: null,
  status: 'active',
};
// no extras at all (anon/dealer with no price, no images, no cost)

// 3) Mid SKU: some booleans known-false, auracast true, watts present, partial joins.
const ROW_MID = {
  sku: 'RCABTSPK10',
  brand: 'rca',
  series: 'Go',
  category: 'Portátil',
  name: 'Bocina Portátil',
  name_en: 'Portable Speaker',
  barcode: '7500000000001',
  driver: '3"',
  watts: '10W',
  battery: null, // dropped
  bluetooth: true,
  auracast: false, // known-false → "No"
  usb: false, // known-false → "No"
  fm_radio: null, // dropped
  tripod: false, // known-false → "No"
  tws: true,
  wireless_mic_qty: 1, // singular wording
  status: 'active',
};
const EXTRAS_MID = {
  // catalog-side: no cost passed (invariant 6); price via pre-resolved object
  price: { amount: 0, currency: 'USD' }, // amount 0 is a real price, kept
};

/* ── tests ── */

test('full row: identity mapping (sku → model, fallbacks, defaults)', () => {
  const d = productToSheetData(ROW_FULL, EXTRAS_FULL);
  assert.equal(d.sku, 'RPS-220B');
  assert.equal(d.model, 'RPS-220B'); // sku → model
  assert.equal(d.brand, 'rca');
  assert.equal(d.series, 'Ibiza');
  assert.equal(d.category, 'Bocina Party');
  assert.equal(d.name, 'Bocina de Fiesta RPS-220B');
  assert.equal(d.nameEn, 'RPS-220B Party Speaker');
  assert.equal(d.barcode, '7501234567890');
});

test('full row: specs grouped { title, rows:[{label,value}] }, booleans → Sí/No', () => {
  const d = productToSheetData(ROW_FULL, EXTRAS_FULL);
  // shape: array of groups, each with rows of {label,value}
  for (const g of d.specs) {
    assert.ok(typeof g.title === 'string' && Array.isArray(g.rows) && g.rows.length > 0);
    for (const r of g.rows) {
      assert.deepEqual(Object.keys(r).sort(), ['label', 'value']);
    }
  }
  const flat = Object.fromEntries(d.specs.flatMap((g) => g.rows).map((r) => [r.label, r.value]));
  assert.equal(flat['Driver'], '8"');
  assert.equal(flat['Potencia'], '2x10W'); // verbatim text, NOT parsed to "2W"
  assert.equal(flat['Batería'], 'Li-ion 3600mAh');
  assert.equal(flat['Bluetooth'], 'Sí');
  assert.equal(flat['Auracast'], 'Sí');
  assert.equal(flat['USB'], 'Sí');
  assert.equal(flat['Radio FM'], 'Sí');
  assert.equal(flat['Trípode'], 'Sí');
  assert.equal(flat['TWS'], 'No'); // known-false
  assert.equal(flat['Micrófono inalámbrico'], '2 incluidos');
});

test('full row: images, price (latest effective_date), fob, packaging, attrs', () => {
  const d = productToSheetData(ROW_FULL, EXTRAS_FULL);
  assert.equal(d.images.hero, 'hero.webp');
  assert.deepEqual(d.images.gallery, ['g1.webp', 'g2.webp']); // sorted by sort_order, hero excluded
  assert.equal(d.productImg, 'hero.webp');
  assert.equal(d.price.amount, 210); // 2026-06-01 beats 2026-01-01
  assert.equal(d.price.currency, 'USD');
  assert.equal(d.fobUsd, 42.5);
  assert.equal(d.packaging.unit.L, 380);
  assert.equal(d.packaging.unit.type, null); // pack_type was null
  assert.equal(d.packaging.master.units, 2);
  assert.equal(d.packaging.inner, null); // no inner tier row
  assert.equal(d.packaging.loadingQty40hq, 1200);
  assert.equal(d.packaging.unitsPerCarton, 2);
  assert.equal(d.moq, 200);
  assert.equal(d.leadTime, '45 días');
  assert.equal(d.hsCode, '8518.22');
  assert.equal(d.countryOfOrigin, 'China');
  assert.equal(d.warranty, '12 meses');
});

test('sparse row: null/N/A/empty fields omitted — nothing fabricated', () => {
  const d = productToSheetData(ROW_SPARSE); // no extras
  // name falls back to description; category defaults; others null
  assert.equal(d.name, 'Bocina compacta');
  assert.equal(d.category, 'Audio');
  assert.equal(d.series, null);
  assert.equal(d.barcode, null);

  const labels = d.specs.flatMap((g) => g.rows).map((r) => r.label);
  // every dropped field must be ABSENT (no "No", no "—", no empty row)
  for (const gone of ['Driver', 'Potencia', 'Batería', 'Bluetooth', 'Auracast', 'USB',
    'Radio FM', 'TWS', 'Trípode', 'Micrófono inalámbrico']) {
    assert.ok(!labels.includes(gone), `expected "${gone}" to be omitted`);
  }
  assert.equal(d.specs.length, 0, 'no groups when no meaningful specs');

  // joins absent → safe nulls/empties, never invented
  assert.equal(d.images.hero, null);
  assert.deepEqual(d.images.gallery, []);
  assert.equal(d.price.amount, null);
  assert.equal(d.price.currency, 'USD');
  assert.equal(d.fobUsd, null);
  assert.equal(d.packaging.unit, null);
  assert.equal(d.packaging.loadingQty40hq, null);
  assert.equal(d.moq, null);
});

test('mid row: known-false booleans render "No", null booleans omitted', () => {
  const d = productToSheetData(ROW_MID, EXTRAS_MID);
  const flat = Object.fromEntries(d.specs.flatMap((g) => g.rows).map((r) => [r.label, r.value]));
  assert.equal(flat['Bluetooth'], 'Sí');
  assert.equal(flat['Auracast'], 'No'); // known-false
  assert.equal(flat['USB'], 'No'); // known-false
  assert.equal(flat['Trípode'], 'No'); // known-false
  assert.equal(flat['TWS'], 'Sí');
  assert.equal(flat['Potencia'], '10W');
  assert.equal(flat['Micrófono inalámbrico'], 'Incluido'); // singular for qty 1
  assert.ok(!('Radio FM' in flat), 'null fm_radio omitted');
  assert.ok(!('Batería' in flat), 'null battery omitted');
  // amount 0 is a real, known price → kept (not treated as missing)
  assert.equal(d.price.amount, 0);
});

test('editorial block is present-but-empty (DB adapter never fabricates copy)', () => {
  const d = productToSheetData(ROW_FULL, EXTRAS_FULL);
  assert.deepEqual(d.editorial.stats, []);
  assert.deepEqual(d.editorial.features, []);
  assert.equal(d.editorial.headline, '');
});

test('guards: row without sku throws', () => {
  assert.throws(() => productToSheetData({ brand: 'rca' }), /sku/);
  assert.throws(() => productToSheetData(null), /sku/);
});

test('buildSpecRows is independently usable and pure', () => {
  const a = buildSpecRows(ROW_FULL);
  const b = buildSpecRows(ROW_FULL);
  assert.deepEqual(a, b);
  assert.notEqual(a, b); // fresh arrays each call (no shared mutable state)
});
