/*
 * productToSheetData(row, extras) — the SINGLE adapter that maps a Supabase
 * product (+ joined tables) into the canonical object both sheet renders consume.
 *
 * Pure, DOM-free, framework-agnostic, unit-testable. No Supabase calls inside:
 * the HOST gathers the rows (one Promise.all keyed by sku) and hands them in.
 *
 * Generalizes:
 *   - the spec-sheet's loadSkuIntoForm()/applySpecMappingToRow() column-mapper
 *   - the catalog's adaptProduct()/buildSpecs() in src/lib/productos.js
 * Both of those get REPLACED by this (CLAUDE.md invariant 14: zero drift).
 *
 * ── Canonical spec-row shape (CLAUDE.md invariant 5) ──
 * Reconciles the two generators (spec-sheet `items:[{label,value}]`, one-page
 * `rows:[{key,value}]`) and the catalog (flat `[{l,v}]`) into ONE shape:
 *
 *     specs: [ { title, rows: [ { label, value } ] } ]
 *
 * - Grouped: array of { title, rows }. A group with zero rows is omitted.
 * - Every row is { label, value } — both strings, audience-facing LatAm Spanish.
 *
 * ── Omission rule (CLAUDE.md invariant 10) ──
 * Null/undefined/empty → the row is OMITTED, never a placeholder. Never invent.
 * Booleans are TRI-STATE: true → "Sí", false → "No", null/undefined → omitted
 * (false is a real, known value and is worth showing on a spec sheet; null means
 * "unknown / not backfilled" and is dropped).
 */

/* ── helpers ── */

// A value worth rendering: not null/undefined, and not an empty/whitespace string.
function present(v) {
  if (v == null) return false;
  if (typeof v === 'string') return v.trim() !== '';
  return true;
}

// "N/A" sentinels in the DB count as absent (mirrors catalog buildSpecs).
function meaningful(v) {
  return present(v) && String(v).trim().toUpperCase() !== 'N/A';
}

// Push { label, value } only when value is meaningful. Coerces to trimmed string.
function pushRow(rows, label, value) {
  if (!meaningful(value)) return;
  rows.push({ label, value: String(value).trim() });
}

// Tri-state boolean → "Sí"/"No" row, or nothing when null/undefined.
function pushBool(rows, label, value) {
  if (value == null) return;
  rows.push({ label, value: value ? 'Sí' : 'No' });
}

// Only keep groups that actually have rows.
function group(title, rows) {
  return rows.length ? { title, rows } : null;
}

/*
 * Build the grouped tech specs from the structured `products` columns.
 * Groups are fixed + Spanish-labelled; empty groups drop out.
 */
export function buildSpecRows(row) {
  const audio = [];
  pushRow(audio, 'Driver', row.driver);
  pushRow(audio, 'Potencia', row.watts); // text in DB ("100W", "2x10W") — kept verbatim

  const bateria = [];
  pushRow(bateria, 'Batería', row.battery);

  const conectividad = [];
  pushBool(conectividad, 'Bluetooth', row.bluetooth);
  pushBool(conectividad, 'Auracast', row.auracast);
  pushBool(conectividad, 'USB', row.usb);
  pushBool(conectividad, 'Radio FM', row.fm_radio);
  pushBool(conectividad, 'TWS', row.tws);
  if (Number(row.wireless_mic_qty) > 0) {
    const q = Number(row.wireless_mic_qty);
    conectividad.push({
      label: 'Micrófono inalámbrico',
      value: q > 1 ? `${q} incluidos` : 'Incluido',
    });
  }

  const fisico = [];
  pushBool(fisico, 'Trípode', row.tripod);

  return [
    group('Audio', audio),
    group('Batería / Power', bateria),
    group('Conectividad', conectividad),
    group('Físico / Physical', fisico),
  ].filter(Boolean);
}

/* product_images[] → { hero, gallery:[url] } (hero first, then gallery by sort_order). */
function buildImages(images) {
  if (!Array.isArray(images) || images.length === 0) {
    return { hero: null, gallery: [] };
  }
  const bySort = (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0);
  const hero = images.filter((i) => i.kind === 'hero').sort(bySort)[0];
  const heroUrl = hero ? hero.url : [...images].sort(bySort)[0]?.url ?? null;
  const gallery = images
    .filter((i) => i.kind !== 'hero' && i.url && i.url !== heroUrl)
    .sort(bySort)
    .map((i) => i.url);
  return { hero: heroUrl, gallery };
}

/*
 * Resolve one price from prices[] + price_lists[] (mirrors catalog: latest
 * effective_date wins; currency from the dealer's single list, default USD).
 * Accepts a pre-resolved { amount, currency } too. RLS already scoped the rows.
 */
function buildPrice(extras) {
  if (extras.price && typeof extras.price === 'object') {
    const amt = extras.price.amount;
    return {
      amount: present(amt) && !Number.isNaN(Number(amt)) ? Number(amt) : null,
      currency: extras.price.currency || extras.currency || 'USD',
    };
  }
  const prices = Array.isArray(extras.prices) ? extras.prices : [];
  const lists = Array.isArray(extras.priceLists) ? extras.priceLists : [];
  const currency = lists[0]?.currency || extras.currency || 'USD';
  let latest = null;
  for (const p of prices) {
    if (!latest || String(p.effective_date) > String(latest.effective_date)) latest = p;
  }
  const amt = latest?.amount;
  return {
    amount: present(amt) && !Number.isNaN(Number(amt)) ? Number(amt) : null,
    currency,
  };
}

/* product_packaging[] (tier ∈ unit/inner/master) → { unit, inner, master }. */
function buildPackaging(row, packaging) {
  const tiers = { unit: null, inner: null, master: null };
  for (const p of Array.isArray(packaging) ? packaging : []) {
    if (!p || !(p.tier in tiers)) continue;
    tiers[p.tier] = {
      L: present(p.length_mm) ? Number(p.length_mm) : null,
      W: present(p.width_mm) ? Number(p.width_mm) : null,
      H: present(p.height_mm) ? Number(p.height_mm) : null,
      weight: present(p.weight_kg) ? Number(p.weight_kg) : null,
      units: present(p.units) ? Number(p.units) : null,
      material: present(p.material) ? String(p.material).trim() : null,
      type: present(p.pack_type) ? String(p.pack_type).trim() : null,
    };
  }
  return {
    ...tiers,
    loadingQty40hq: present(row.loading_qty_40hq) ? Number(row.loading_qty_40hq) : null,
    unitsPerCarton: present(row.units_per_carton) ? Number(row.units_per_carton) : null,
  };
}

/*
 * productToSheetData(row, extras)
 *
 * @param {object} row    a Supabase `products` row (required)
 * @param {object} extras optional joined data the host gathered:
 *   - images      product_images[] rows
 *   - cost        product_costs row (ACC ONLY — never pass from the catalog; invariant 6)
 *   - prices      prices[] rows        (or pass a resolved `price`)
 *   - priceLists  price_lists[] rows   (for currency)
 *   - price       { amount, currency } pre-resolved (alternative to prices/priceLists)
 *   - currency    fallback currency string
 *   - packaging   product_packaging[] rows (tier-keyed)
 *   - attrs       product_catalog_attrs row (moq, lead_time, hs_code, ...)
 *
 * @returns CanonicalSheetData — the single shape both renders consume.
 */
export function productToSheetData(row, extras = {}) {
  if (!row || !present(row.sku)) {
    throw new Error('productToSheetData: row with a `sku` is required');
  }
  const attrs = extras.attrs || {};
  const images = buildImages(extras.images);
  const price = buildPrice(extras);

  return {
    // ── identity (db: products) ──
    sku: row.sku,
    model: row.sku, // sku → model (the generators' `state.model`)
    brand: present(row.brand) ? row.brand : null,
    series: present(row.series) ? row.series : null,
    category: present(row.category) ? row.category : 'Audio',
    name: row.name || row.description || row.sku,
    nameEn: present(row.name_en) ? row.name_en : null,
    barcode: present(row.barcode) ? String(row.barcode).trim() : null,

    // ── tech specs (derived: products columns → grouped Sí/No rows) ──
    specs: buildSpecRows(row),

    // ── images (rel: product_images) ──
    images,
    productImg: images.hero,
    brandLogo: null, // resolved by the render from `brand` (BRAND_LOGOS) — not an adapter concern

    // ── packaging (rel: product_packaging + products) ──
    packaging: buildPackaging(row, extras.packaging),

    // ── commercial ──
    price, // { amount, currency } — rel: prices/price_lists (RLS, dealer list)
    fobUsd: extras.cost && present(extras.cost.fob_usd) ? Number(extras.cost.fob_usd) : null, // internal, ACC only
    moq: present(attrs.moq) ? attrs.moq : null,
    leadTime: present(attrs.lead_time) ? attrs.lead_time : null,
    hsCode: present(attrs.hs_code) ? attrs.hs_code : null,
    countryOfOrigin: present(attrs.country_of_origin) ? attrs.country_of_origin : null,
    warranty: present(attrs.warranty) ? attrs.warranty : null,

    // ── sales-sheet editorial (NOT DB-backed; author-entered in the Sheets UI) ──
    // Present-but-empty so the canonical shape is stable; the host/UI fills these.
    editorial: {
      headline: '', headlineEm: '', subhead: '',
      stats: [], bar: [], features: [],
      pitch: { eyebrow: '', headline: '', headlineEm: '', body: '', signoff: '' },
      box: [],
      seriesLogo: null, lifestyleImg: null,
    },
  };
}

export default productToSheetData;
