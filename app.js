// Mortgauger — the conductor.
// Owns app state, the Scenario component, and the comparison dashboard.

import { LENDERS, BANK_OF_ENGLAND } from './data.js';
import { computeScenario, monthlyPayment } from './calc.js';

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

const COLOURS_HEX = ['#7A1B1B', '#4E5E3B', '#3C5570', '#B8842B', '#5D3A52', '#88541F'];

function formatGBP(n, decimals = 0) {
  if (!isFinite(n)) return '£—';
  return '£' + new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Math.round(n * 10 ** decimals) / 10 ** decimals);
}

const pct = (n, d = 1) =>
  !isFinite(n) ? '—' : n.toFixed(d) + '%';

const yearsFromMonths = (m) => (m / 12).toFixed(m % 12 === 0 ? 0 : 1) + ' yrs';

const lenderById = (id) => LENDERS.find((l) => l.id === id);
const productById = (lenderId, productId) =>
  lenderById(lenderId)?.products.find((p) => p.id === productId);

// ---------------------------------------------------------------------------
// Product picking + breakpoint logic
// ---------------------------------------------------------------------------

// Given an LTV %, find the products in this lender that the borrower qualifies for
// (i.e. product.maxLtv >= ltv). Returns the cheapest by rate, preferring the
// requested initial-period length when tied.
function pickBestProduct(lenderId, ltvPct, preferInitialYears = 5) {
  const lender = lenderById(lenderId);
  if (!lender) return null;
  const eligible = lender.products.filter((p) => p.maxLtv >= ltvPct);
  if (!eligible.length) return null;
  // Within ~0.25pp the user's preferred term wins; beyond that, rate dominates.
  return eligible.slice().sort((a, b) => {
    const rateDiff = a.rate - b.rate;
    if (Math.abs(rateDiff) < 0.25) {
      return Math.abs(a.initialYears - preferInitialYears)
           - Math.abs(b.initialYears - preferInitialYears);
    }
    return rateDiff;
  })[0];
}

// Find the next BETTER LTV tier within this lender for the same initial-period.
// e.g. currently at 90% tier → returns the lender's 85% (or 80%) tier product.
function findNextBetterTier(lenderId, currentMaxLtv, initialYears) {
  const lender = lenderById(lenderId);
  if (!lender) return null;
  const lower = lender.products
    .filter((p) => p.initialYears === initialYears && p.maxLtv < currentMaxLtv)
    .sort((a, b) => b.maxLtv - a.maxLtv); // closest lower tier first
  return lower[0] || null;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let nextId = 1;
function newId() { return 's' + (nextId++); }

// Default buyer situation — shared across every scenario via STATE.master.
const PURCHASE_DEFAULT_MASTER = {
  mode: 'purchase',
  propertyValue: 400000,
  deposit: 100000,
  termYears: 25,
  repaymentType: 'repayment',
  partRepaymentPct: 50,
  offsetSavings: 0,
  firstTimeBuyer: false,
  additionalProperty: false,
  overpaymentMode: 'fixed',
  monthlyOverpayment: 0,
  overpaymentPercent: 0,
  lumpSumOverpayment: 0,
  feeFinanced: 'add',
};

const REMORTGAGE_DEFAULT_MASTER = {
  mode: 'remortgage',
  propertyValue: 450000,        // today's value (often higher than purchase price)
  outstandingBalance: 240000,   // what you still owe on the existing loan
  termYears: 20,                // remaining term
  repaymentType: 'repayment',
  partRepaymentPct: 50,
  offsetSavings: 0,
  overpaymentMode: 'fixed',
  monthlyOverpayment: 0,
  overpaymentPercent: 0,
  lumpSumOverpayment: 0,
  feeFinanced: 'add',
};

// LTV for a master object — uses outstandingBalance when remortgaging.
function baseLtv(master) {
  if (master.propertyValue <= 0) return 0;
  const baseLoan = master.mode === 'remortgage'
    ? (master.outstandingBalance || 0)
    : (master.propertyValue - master.deposit);
  return (baseLoan / master.propertyValue) * 100;
}

// A scenario now only owns lender-specific fields.
function makeDefaultScenario(seed = {}) {
  const master = (typeof STATE !== 'undefined' && STATE.master) || PURCHASE_DEFAULT_MASTER;
  const ltv = baseLtv(master);
  const lenderId = seed.lenderId ?? 'halifax';
  const product = pickBestProduct(lenderId, ltv, seed.preferTerm ?? 5);
  return {
    id: newId(),
    name: '',
    custom: false,
    lenderId,
    productId: product?.id ?? '',
    rateInitial: product?.rate ?? 4.5,
    initialYears: product?.initialYears ?? 5,
    rateRevert: lenderById(lenderId)?.svr ?? 7.5,
    fee: product?.fee ?? 999,
  };
}

const STATE = {
  mode: 'purchase',
  purchase: {
    master: { ...PURCHASE_DEFAULT_MASTER },
    scenarios: [],
  },
  remortgage: {
    master: { ...REMORTGAGE_DEFAULT_MASTER },
    scenarios: [],
    // When this remortgage was seeded from a purchase scenario, the source
    // is stored here so changing the year of the original mortgage
    // re-simulates and updates the outstanding balance + remaining term.
    source: null, // { scenario, masterSnapshot, atYear } | null
  },
  rateShock: 0, // applied to all revert rates regardless of mode
};

// Aliases — kept pointing at the active mode's data so existing code that
// reads STATE.master / STATE.scenarios keeps working.
STATE.master = STATE.purchase.master;
STATE.scenarios = STATE.purchase.scenarios;

// Seed two contrasting purchase scenarios.
STATE.purchase.scenarios.push(
  makeDefaultScenario({ lenderId: 'halifax',    preferTerm: 5 }),
  makeDefaultScenario({ lenderId: 'nationwide', preferTerm: 2 }),
);
// And two for remortgage — but seed them after we briefly point the alias at it.
STATE.master = STATE.remortgage.master;
STATE.scenarios = STATE.remortgage.scenarios;
STATE.remortgage.scenarios.push(
  makeDefaultScenario({ lenderId: 'barclays', preferTerm: 5 }),
  makeDefaultScenario({ lenderId: 'hsbc',     preferTerm: 2 }),
);
// Point back to purchase for the initial render.
STATE.master = STATE.purchase.master;
STATE.scenarios = STATE.purchase.scenarios;

// ---------------------------------------------------------------------------
// Effective scenario (applies rate shock to revert)
// ---------------------------------------------------------------------------

// Merge master + scenario into a flat object the calc engine understands.
// Master holds buyer-side fields (property/deposit/term/type/SDLT/overpays/feeFinanced),
// scenario holds lender-side fields (lender/product/rates/fee).
function effectiveScenario(s, shock = STATE.rateShock) {
  const m = STATE.master;
  const partRepaymentRatio =
    m.repaymentType === 'part-and-part'
      ? Math.max(0, Math.min(1, (m.partRepaymentPct ?? 50) / 100))
      : 0.5;
  const isRemo = m.mode === 'remortgage';
  return {
    mode: m.mode || 'purchase',
    propertyValue: m.propertyValue,
    deposit: isRemo ? 0 : (m.deposit || 0),
    outstandingBalance: isRemo ? (m.outstandingBalance || 0) : 0,
    termYears: m.termYears,
    repaymentType: m.repaymentType,
    partRepaymentRatio,
    offsetSavings: m.offsetSavings || 0,
    firstTimeBuyer: isRemo ? false : !!m.firstTimeBuyer,
    additionalProperty: isRemo ? false : !!m.additionalProperty,
    overpaymentMode: m.overpaymentMode || 'fixed',
    monthlyOverpayment: m.monthlyOverpayment || 0,
    overpaymentPercent: m.overpaymentPercent || 0,
    lumpSumOverpayment: m.lumpSumOverpayment || 0,
    feeFinanced: m.feeFinanced,
    // scenario fields
    lenderId: s.lenderId,
    productId: s.productId,
    rateInitial: s.rateInitial,
    initialYears: s.initialYears,
    rateRevert: Math.max(0, (s.rateRevert ?? 0) + shock),
    fee: s.fee,
  };
}

// ---------------------------------------------------------------------------
// Auto-name
// ---------------------------------------------------------------------------

function autoName(s, master = STATE.master) {
  const lender = lenderById(s.lenderId);
  if (!lender) return 'Scenario';
  const product = productById(s.lenderId, s.productId);
  const initial = product
    ? `${product.initialYears}y ${product.type === 'tracker' ? 'tracker' : 'fix'}`
    : `${s.initialYears}y fix`;
  const ltvTier = product ? `${product.maxLtv}% LTV` : '';
  const termYears = master?.termYears ?? '';
  return `${lender.name} · ${termYears}y · ${initial}${ltvTier ? ' · ' + ltvTier : ''}`;
}

// ---------------------------------------------------------------------------
// DOM: build a scenario card from the <template>
// ---------------------------------------------------------------------------

const rail = document.getElementById('scenarioRail');
const tpl = document.getElementById('scenarioTemplate');

function buildScenarioNode(s, index) {
  const node = tpl.content.firstElementChild.cloneNode(true);
  node.dataset.id = s.id;

  // Make radio `name` attributes unique to this scenario
  node.querySelectorAll('input[type="radio"]').forEach((r) => {
    if (r.name.includes('${id}')) r.name = r.name.replace('${id}', s.id);
  });

  // Letter + colour
  const letter = String.fromCharCode(65 + index); // A, B, C…
  node.querySelector('[data-letter]').textContent = letter;
  const colourHex = COLOURS_HEX[index % COLOURS_HEX.length];
  node.style.setProperty('--scenario-color', colourHex);

  // Lender + product dropdowns
  const lenderSelect = node.querySelector('[data-field="lenderId"]');
  lenderSelect.innerHTML = LENDERS.map(
    (l) => `<option value="${l.id}">${l.name}</option>`
  ).join('');

  const productSelect = node.querySelector('[data-field="productId"]');
  populateProductDropdown(productSelect, s.lenderId);

  // Hook up listeners
  attachListeners(node, s);

  return node;
}

function populateProductDropdown(select, lenderId) {
  const lender = lenderById(lenderId);
  if (!lender) { select.innerHTML = ''; return; }
  select.innerHTML = lender.products
    .map((p) => `<option value="${p.id}">${p.label}</option>`)
    .join('');
}

// ---------------------------------------------------------------------------
// Listeners: any field change updates state then re-renders
// ---------------------------------------------------------------------------

function attachListeners(node, s) {
  // Inputs (number, text), selects, checkboxes, radios — handled by [data-field]
  node.querySelectorAll('[data-field]').forEach((el) => {
    const field = el.dataset.field;
    const evt = el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'radio'
      ? 'change' : 'input';
    el.addEventListener(evt, () => onFieldChange(s.id, field, el));
  });

  // Action buttons
  node.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => onAction(s.id, btn.dataset.action));
  });
}

function onFieldChange(scenarioId, field, el) {
  const s = STATE.scenarios.find((x) => x.id === scenarioId);
  if (!s) return;

  let value = el.value;
  if (el.type === 'checkbox') value = el.checked;
  else if (el.type === 'number') value = el.value === '' ? 0 : parseFloat(el.value);
  else if (el.type === 'radio') {
    if (!el.checked) return;
    value = el.value;
  }

  if (field === 'name') {
    s.name = value;
    s.custom = value.trim() !== '';
    renderAll();
    return;
  }

  if (field === 'lenderId') {
    s.lenderId = value;
    const ltv = currentLtvForScenario(s);
    const product = pickBestProduct(value, ltv, s.initialYears);
    if (product) {
      s.productId = product.id;
      s.rateInitial = product.rate;
      s.initialYears = product.initialYears;
      s.fee = product.fee;
    }
    s.rateRevert = lenderById(value)?.svr ?? s.rateRevert;
  } else if (field === 'productId') {
    s.productId = value;
    const product = productById(s.lenderId, value);
    if (product) {
      s.rateInitial = product.rate;
      s.initialYears = product.initialYears;
      s.fee = product.fee;
    }
  } else {
    s[field] = value;
  }

  if (!s.custom) s.name = autoName(s);
  renderAll();
}

function currentLtvForScenario(s) {
  const m = STATE.master;
  if (m.propertyValue <= 0) return 0;
  const baseLoan = m.mode === 'remortgage'
    ? (m.outstandingBalance || 0)
    : (m.propertyValue - m.deposit);
  return ((baseLoan + (m.feeFinanced === 'add' ? s.fee : 0)) / m.propertyValue) * 100;
}

function onAction(scenarioId, action) {
  const idx = STATE.scenarios.findIndex((x) => x.id === scenarioId);
  if (idx < 0) return;
  if (action === 'remove') {
    if (STATE.scenarios.length <= 1) return;
    STATE.scenarios.splice(idx, 1);
  } else if (action === 'duplicate') {
    const copy = { ...STATE.scenarios[idx], id: newId(), custom: false, name: '' };
    STATE.scenarios.splice(idx + 1, 0, copy);
  } else if (action === 'to-remortgage') {
    copyScenarioToRemortgage(STATE.scenarios[idx]);
    return; // setMode handles the re-render
  }
  renderAll();
}

// ---------------------------------------------------------------------------
// Apply state to a rendered scenario node
// ---------------------------------------------------------------------------

function applyStateToNode(node, s, idx) {
  const letter = String.fromCharCode(65 + idx);
  node.querySelector('[data-letter]').textContent = letter;
  const colourHex = COLOURS_HEX[idx % COLOURS_HEX.length];
  node.style.setProperty('--scenario-color', colourHex);

  const nameInput = node.querySelector('[data-field="name"]');
  const displayName = s.custom ? s.name : autoName(s);
  if (document.activeElement !== nameInput && nameInput.value !== displayName) {
    nameInput.value = displayName;
  }

  setFieldValue(node, 'lenderId',     s.lenderId);
  populateProductDropdown(node.querySelector('[data-field="productId"]'), s.lenderId);
  setFieldValue(node, 'productId',    s.productId);
  setFieldValue(node, 'rateInitial',  s.rateInitial);
  setFieldValue(node, 'initialYears', s.initialYears);
  setFieldValue(node, 'rateRevert',   s.rateRevert);
  setFieldValue(node, 'fee',          s.fee);

  const result = computeScenario(effectiveScenario(s));
  setReadout(node, 'ltv',            pct(result.ltv));
  setReadout(node, 'monthlyInitial', formatGBP(result.monthlyInitial));
  setReadout(node, 'monthlyRevert',  formatGBP(result.monthlyRevert));
  setReadout(node, 'loan',           formatGBP(result.loan));
  setReadout(node, 'sdlt',           formatGBP(result.sdlt));
  setReadout(node, 'upfrontCash',    formatGBP(result.upfrontCash));
  setReadout(node, 'totalInterest',  formatGBP(result.totalInterest));
  setReadout(node, 'totalPaid',      formatGBP(result.totalPaid));
  setReadout(node, 'termActual',     yearsFromMonths(result.termActualMonths));
  setReadout(node, 'trueCost',       formatGBP(result.trueCostOfOwning));

  const residualRow = node.querySelector('[data-row="residual"]');
  if (residualRow) {
    residualRow.hidden = result.residualBalance < 1;
    setReadout(node, 'residual', formatGBP(result.residualBalance));
  }

  renderLtvHint(node, s, result);
}

function renderLtvHint(node, s, result) {
  const hint = node.querySelector('[data-readout="ltvHint"]');
  if (!hint) return;
  const m = STATE.master;
  const isRemo = m.mode === 'remortgage';
  const currentProduct = productById(s.lenderId, s.productId);
  if (!currentProduct) { hint.hidden = true; return; }
  const better = findNextBetterTier(s.lenderId, currentProduct.maxLtv, currentProduct.initialYears);
  if (!better) { hint.hidden = true; return; }
  const targetLoan = m.propertyValue * (better.maxLtv / 100);
  const currentBase = isRemo ? (m.outstandingBalance || 0) : (m.propertyValue - m.deposit);
  const currentLoan = currentBase + (m.feeFinanced === 'add' ? s.fee : 0);
  const gap = Math.max(0, currentLoan - targetLoan);

  if (gap < 1) { hint.hidden = true; return; }
  if (gap > m.propertyValue * 0.06) { hint.hidden = true; return; }

  const newMonthly = monthlyPayment(targetLoan, better.rate, m.termYears);
  const oldMonthly = monthlyPayment(currentLoan, s.rateInitial, m.termYears);
  const saving = oldMonthly - newMonthly;
  if (saving < 10) { hint.hidden = true; return; }

  const action = isRemo
    ? `pay down <strong>${formatGBP(gap)}</strong> of the balance before remortgaging`
    : `add <strong>${formatGBP(gap)}</strong> deposit`;

  hint.hidden = false;
  hint.innerHTML = `
    <strong>Tier breakpoint:</strong> ${action}
    to drop into the <strong>${better.maxLtv}% LTV</strong> tier
    (${better.rate.toFixed(2)}% p.a.) — saves roughly
    <strong>${formatGBP(saving)}/mo</strong> on the repayment portion.
  `;
}

function setFieldValue(node, field, value) {
  const el = node.querySelector(`[data-field="${field}"]:not([type="radio"]):not([type="checkbox"])`);
  if (!el) return;
  if (document.activeElement === el) return; // don't clobber a focused field
  el.value = value ?? '';
}

function setRadioValue(node, field, value) {
  const radios = node.querySelectorAll(`input[type="radio"][data-field="${field}"]`);
  radios.forEach((r) => { r.checked = (r.value === value); });
}

function setCheckValue(node, field, value) {
  const el = node.querySelector(`input[type="checkbox"][data-field="${field}"]`);
  if (el) el.checked = !!value;
}

function setReadout(node, name, value) {
  const el = node.querySelector(`[data-readout="${name}"]`);
  if (el) el.textContent = value;
}

// ---------------------------------------------------------------------------
// Top-level render
// ---------------------------------------------------------------------------

function renderAll() {
  // Master inputs reflect STATE.master (and computed LTV readout / type-extras visibility).
  applyMasterToDom();
  renderSourceStrip();

  // Sync scenario nodes to state
  const existing = new Map(
    [...rail.querySelectorAll('[data-scenario]')].map((n) => [n.dataset.id, n])
  );
  const want = new Set(STATE.scenarios.map((s) => s.id));

  // Remove orphans
  existing.forEach((node, id) => {
    if (!want.has(id)) node.remove();
  });

  // Add or reposition
  STATE.scenarios.forEach((s, idx) => {
    let node = existing.get(s.id);
    if (!node) {
      node = buildScenarioNode(s, idx);
      rail.appendChild(node);
    } else if (rail.children[idx] !== node) {
      rail.insertBefore(node, rail.children[idx]);
    }
    applyStateToNode(node, s, idx);
  });

  rail.classList.toggle('has-one', STATE.scenarios.length <= 1);

  // Scenario count pill — both master sections have one; update them all.
  const countText = STATE.scenarios.length === 1
    ? '1 scenario'
    : `${STATE.scenarios.length} scenarios`;
  document.querySelectorAll(`.master[data-mode="${STATE.mode}"] [data-scenario-count]`)
    .forEach((el) => { el.textContent = countText; });

  renderDashboard();
}

// ---------------------------------------------------------------------------
// Dashboard: headline cards, charts, legend, table
// ---------------------------------------------------------------------------

const dashCards     = document.getElementById('headlineCards');
const chartMonthly  = document.getElementById('chartMonthly');
const chartBalance  = document.getElementById('chartBalance');
const chartCumul    = document.getElementById('chartCumulative');
const axisMonthly   = document.getElementById('chartMonthlyAxis');
const axisBalance   = document.getElementById('chartBalanceAxis');
const axisCumul     = document.getElementById('chartCumulativeAxis');
const legendEl      = document.getElementById('chartLegend');
const tableEl       = document.getElementById('comparisonTable');

function renderDashboard() {
  // Compute every scenario once
  const computed = STATE.scenarios.map((s, idx) => ({
    s,
    idx,
    colour: COLOURS_HEX[idx % COLOURS_HEX.length],
    label: s.custom && s.name ? s.name : autoName(s),
    result: computeScenario(effectiveScenario(s)),
  }));

  renderHeadlineCards(computed);
  renderLegend(computed);
  renderCharts(computed);
  renderTable(computed);
}

function renderHeadlineCards(computed) {
  if (!computed.length) { dashCards.innerHTML = ''; return; }

  // Cards: cash at completion, monthly initial, monthly after revert, total cost
  const metrics = [
    {
      label: 'Cash at completion',
      sub: 'Deposit + SDLT + upfront fees.',
      get: (c) => c.result.upfrontCash,
      lowerIsBetter: true,
    },
    {
      label: 'Monthly · initial',
      sub: 'Payment during the fixed period.',
      get: (c) => c.result.monthlyInitial,
      lowerIsBetter: true,
    },
    {
      label: 'Monthly · after revert',
      sub: 'Payment when the fix expires (incl. rate shock).',
      get: (c) => c.result.monthlyRevert,
      lowerIsBetter: true,
    },
    {
      label: 'True cost of owning',
      sub: 'Deposit, fees, SDLT, all payments, any residual.',
      get: (c) => c.result.trueCostOfOwning,
      lowerIsBetter: true,
    },
  ];

  dashCards.innerHTML = metrics.map((m) => {
    const values = computed.map((c) => m.get(c));
    const max = Math.max(...values, 1);
    const best = m.lowerIsBetter ? Math.min(...values) : Math.max(...values);
    return `
      <div class="headline-card">
        <p class="headline-card__label">${m.label}</p>
        <div class="headline-card__bars">
          ${computed.map((c, i) => {
            const v = m.get(c);
            const w = Math.max(2, (v / max) * 100);
            const isBest = Math.abs(v - best) < 0.01;
            return `
              <div class="headline-card__row" style="--swatch:${c.colour}">
                <span class="headline-card__name" title="${escapeHtml(c.label)}">
                  <span class="headline-card__swatch"></span>
                  ${escapeHtml(shortLabel(c.label, 22))}
                </span>
                <span class="headline-card__bar"><span style="width:${w}%"></span></span>
                <span class="headline-card__value ${isBest ? 'headline-card__best' : ''}">${formatGBP(v)}</span>
              </div>
            `;
          }).join('')}
        </div>
        <p class="headline-card__sub">${m.sub}</p>
      </div>
    `;
  }).join('');
}

function renderLegend(computed) {
  legendEl.innerHTML = computed.map((c) => `
    <span class="legend__item" style="--swatch:${c.colour}">
      <span class="legend__swatch"></span>
      ${escapeHtml(c.label)}
    </span>
  `).join('');
}

// ---------------------------------------------------------------------------
// SVG chart rendering
// ---------------------------------------------------------------------------

const CHART_PAD = { top: 16, right: 16, bottom: 24, left: 56 };

function renderCharts(computed) {
  if (!computed.length) return;

  // X-axis stops at the longest *actual* term across scenarios — so if
  // overpayments close every loan by year 18, the charts don't waste space
  // drawing flat lines out to year 25.
  const maxYears = Math.max(
    1,
    Math.ceil(Math.max(...computed.map((c) => c.result.termActualMonths / 12)))
  );

  // --- Plot I: monthly outgoings over time -------------------------------
  const monthlySeries = computed.map((c) => ({
    colour: c.colour,
    points: buildMonthlySeries(c),
  }));
  drawChart(chartMonthly, axisMonthly, monthlySeries, {
    width: 800, height: 280,
    xMax: maxYears, yMin: 0,
    yFormat: (v) => formatGBP(v),
    xLabel: 'years',
    revertMarkers: computed.map((c) => ({
      x: c.s.initialYears,
      colour: c.colour,
    })),
  });

  // --- Plot II: balance remaining ----------------------------------------
  const balanceSeries = computed.map((c) => ({
    colour: c.colour,
    points: buildBalanceSeries(c, maxYears),
  }));
  drawChart(chartBalance, axisBalance, balanceSeries, {
    width: 800, height: 280,
    xMax: maxYears, yMin: 0,
    yFormat: (v) => formatGBP(v),
    xLabel: 'years',
  });

  // --- Plot III: cumulative cost -----------------------------------------
  const cumulSeries = computed.map((c) => ({
    colour: c.colour,
    points: buildCumulativeSeries(c, maxYears),
  }));
  drawChart(chartCumul, axisCumul, cumulSeries, {
    width: 1200, height: 320,
    xMax: maxYears, yMin: 0,
    yFormat: (v) => formatGBP(v),
    xLabel: 'years',
  });
}

// Year-by-year monthly payment, drawn as a true step.
// Flat at monthlyInitial during the fix, vertical jump, flat at monthlyRevert
// until the loan actually closes (so overpayments cut the line short).
function buildMonthlySeries(c) {
  const actualTerm = c.result.termActualMonths / 12;
  const initial = Math.min(c.s.initialYears, actualTerm);
  if (actualTerm <= initial) {
    return [
      [0, c.result.monthlyInitial],
      [actualTerm, c.result.monthlyInitial],
    ];
  }
  return [
    [0, c.result.monthlyInitial],
    [initial, c.result.monthlyInitial],
    [initial, c.result.monthlyRevert],
    [actualTerm, c.result.monthlyRevert],
  ];
}

// Balance schedule, sampled to year boundaries (using calc.js sample points).
function buildBalanceSeries(c, maxYears) {
  const pts = [[0, c.result.loan]];
  for (const p of c.result.schedule) {
    pts.push([p.month / 12, p.balance]);
  }
  // If term ended before maxYears, extend at 0 (or residual)
  const lastY = pts[pts.length - 1][0];
  if (lastY < maxYears) {
    pts.push([maxYears, c.result.residualBalance]);
  }
  return pts;
}

// Cumulative spend: starting at upfront cash (deposit + SDLT + upfront fee),
// then accumulate monthly payments.
function buildCumulativeSeries(c, maxYears) {
  const pts = [];
  let cum = c.result.upfrontCash;
  pts.push([0, cum]);
  // The schedule samples sparsely; estimate per-month between samples
  let prevMonth = 0;
  let prevPayment = c.result.monthlyInitial;
  for (const p of c.result.schedule) {
    const gap = p.month - prevMonth;
    if (gap > 0) {
      const avgPay = (prevPayment + p.payment) / 2;
      cum += avgPay * gap;
    }
    pts.push([p.month / 12, cum]);
    prevMonth = p.month;
    prevPayment = p.payment;
  }
  return pts;
}

function drawChart(svg, axisEl, series, opts) {
  const W = opts.width;
  const H = opts.height;
  const padL = CHART_PAD.left, padR = CHART_PAD.right;
  const padT = CHART_PAD.top,  padB = CHART_PAD.bottom;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  // Determine y range
  const allYs = series.flatMap((s) => s.points.map((p) => p[1]));
  const yMin = opts.yMin ?? Math.min(...allYs);
  const yMaxRaw = Math.max(...allYs, 1);
  const yMax = niceMax(yMaxRaw);

  const xToPx = (x) => padL + (x / opts.xMax) * plotW;
  const yToPx = (y) => padT + plotH - ((y - yMin) / (yMax - yMin)) * plotH;

  // Build SVG content
  const parts = [];

  // Background gridlines + y-axis ticks (5 lines)
  for (let i = 0; i <= 4; i++) {
    const v = yMin + (yMax - yMin) * (i / 4);
    const y = yToPx(v);
    parts.push(`<line class="chart__grid" x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}"/>`);
    parts.push(`<text class="chart__grid-label" x="${padL - 8}" y="${y + 3}" text-anchor="end">${opts.yFormat(v)}</text>`);
  }

  // X-axis tick labels: every ~5 years
  const tickStep = opts.xMax <= 15 ? 2 : 5;
  for (let x = 0; x <= opts.xMax; x += tickStep) {
    const px = xToPx(x);
    parts.push(`<text class="chart__grid-label" x="${px}" y="${H - padB + 14}" text-anchor="middle">${x}y</text>`);
  }

  // Revert markers (vertical dashed line where fix ends)
  if (opts.revertMarkers) {
    for (const m of opts.revertMarkers) {
      const px = xToPx(m.x);
      parts.push(`<line class="chart__revert-marker" x1="${px}" y1="${padT}" x2="${px}" y2="${H - padB}" style="stroke:${m.colour};opacity:0.4"/>`);
    }
  }

  // Lines
  for (const s of series) {
    if (!s.points.length) continue;
    const d = s.points.map((p, i) =>
      `${i === 0 ? 'M' : 'L'} ${xToPx(p[0]).toFixed(1)} ${yToPx(p[1]).toFixed(1)}`
    ).join(' ');
    parts.push(`<path class="chart__line" d="${d}" stroke="${s.colour}" style="stroke-dasharray:none;animation:none"/>`);
  }

  svg.innerHTML = parts.join('');
  if (axisEl) axisEl.innerHTML = ''; // axis labels are inside SVG now
}

function niceMax(v) {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const norm = v / mag;
  const steps = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 10];
  const nice = steps.find((s) => s >= norm) ?? 10;
  return nice * mag;
}

// ---------------------------------------------------------------------------
// Comparison table
// ---------------------------------------------------------------------------

function renderTable(computed) {
  const thead = tableEl.querySelector('thead');
  const tbody = tableEl.querySelector('tbody');

  thead.innerHTML = `
    <tr>
      <th>Figure</th>
      ${computed.map((c) =>
        `<th><span class="swatch" style="--swatch:${c.colour}"></span>${escapeHtml(shortLabel(c.label, 32))}</th>`
      ).join('')}
    </tr>
  `;

  const rows = [
    { label: 'Lender',                   get: (c) => lenderById(c.s.lenderId)?.name || '—' },
    { label: 'Product',                  get: (c) => productById(c.s.lenderId, c.s.productId)?.label || '—' },
    { label: 'Loan-to-value',            get: (c) => pct(c.result.ltv) },
    { label: 'Loan',                     get: (c) => formatGBP(c.result.loan),                    fmt: 'gbp', lower: true },
    { label: 'Initial rate',             get: (c) => c.s.rateInitial.toFixed(2) + '%',            fmt: 'pct', lower: true, raw: (c) => c.s.rateInitial },
    { label: 'Initial period',           get: (c) => c.s.initialYears + ' yrs' },
    { label: 'Revert rate (with shock)', get: (c) => (c.s.rateRevert + STATE.rateShock).toFixed(2) + '%', fmt: 'pct', lower: true, raw: (c) => c.s.rateRevert + STATE.rateShock },
    { label: 'Monthly · initial',        get: (c) => formatGBP(c.result.monthlyInitial),          fmt: 'gbp', lower: true, raw: (c) => c.result.monthlyInitial },
    { label: 'Monthly · after revert',   get: (c) => formatGBP(c.result.monthlyRevert),           fmt: 'gbp', lower: true, raw: (c) => c.result.monthlyRevert },
    { label: 'Term served',              get: (c) => yearsFromMonths(c.result.termActualMonths) },
    { label: 'Cash at completion',       get: (c) => formatGBP(c.result.upfrontCash),             fmt: 'gbp', lower: true, raw: (c) => c.result.upfrontCash },
    { label: 'SDLT',                     get: (c) => formatGBP(c.result.sdlt),                    fmt: 'gbp', lower: true, raw: (c) => c.result.sdlt },
    { label: 'Total interest',           get: (c) => formatGBP(c.result.totalInterest),           fmt: 'gbp', lower: true, raw: (c) => c.result.totalInterest },
    { label: 'True cost of owning',      get: (c) => formatGBP(c.result.trueCostOfOwning),        fmt: 'gbp', lower: true, raw: (c) => c.result.trueCostOfOwning },
  ];

  tbody.innerHTML = rows.map((row) => {
    let best, worst;
    if (row.raw) {
      const vals = computed.map(row.raw);
      best = row.lower ? Math.min(...vals) : Math.max(...vals);
      worst = row.lower ? Math.max(...vals) : Math.min(...vals);
    }
    return `
      <tr>
        <td>${row.label}</td>
        ${computed.map((c) => {
          let cls = '';
          if (row.raw) {
            const v = row.raw(c);
            if (Math.abs(v - best) < 0.005) cls = 'is-best';
            else if (Math.abs(v - worst) < 0.005) cls = 'is-worst';
          }
          return `<td class="${cls}">${escapeHtml(row.get(c))}</td>`;
        }).join('')}
      </tr>
    `;
  }).join('');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shortLabel(s, n) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  })[c]);
}

// ---------------------------------------------------------------------------
// Top-level controls (add / reset, rate-shock)
// ---------------------------------------------------------------------------

function addScenario() {
  const last = STATE.scenarios[STATE.scenarios.length - 1] || {};
  STATE.scenarios.push(makeDefaultScenario({
    lenderId: pickAnotherLender(last.lenderId),
    preferTerm: last.initialYears === 5 ? 2 : 5,
  }));
  renderAll();
}
document.getElementById('addScenarioBtn').addEventListener('click', addScenario);
const addBtnRemo = document.getElementById('addScenarioBtnRemo');
if (addBtnRemo) addBtnRemo.addEventListener('click', addScenario);

const resetBtnRemoEl = document.getElementById('resetBtnRemo');
if (resetBtnRemoEl) resetBtnRemoEl.addEventListener('click', () => document.getElementById('resetBtn').click());
document.getElementById('resetBtn').addEventListener('click', () => {
  const isRemo = STATE.mode === 'remortgage';
  const defaults = isRemo ? REMORTGAGE_DEFAULT_MASTER : PURCHASE_DEFAULT_MASTER;
  Object.assign(STATE.master, defaults);
  STATE.scenarios.length = 0;
  if (isRemo) {
    STATE.scenarios.push(
      makeDefaultScenario({ lenderId: 'barclays', preferTerm: 5 }),
      makeDefaultScenario({ lenderId: 'hsbc',     preferTerm: 2 }),
    );
  } else {
    STATE.scenarios.push(
      makeDefaultScenario({ lenderId: 'halifax',    preferTerm: 5 }),
      makeDefaultScenario({ lenderId: 'nationwide', preferTerm: 2 }),
    );
  }
  STATE.rateShock = 0;
  document.getElementById('rateShock').value = 0;
  updateRateShockLabel();
  renderAll();
});

// =============================================================================
// Mode switching — Purchase ↔ Remortgage
// =============================================================================

function setMode(newMode) {
  if (newMode !== 'purchase' && newMode !== 'remortgage') return;
  STATE.mode = newMode;
  STATE.master = STATE[newMode].master;
  STATE.scenarios = STATE[newMode].scenarios;

  document.body.classList.toggle('mode-purchase',  newMode === 'purchase');
  document.body.classList.toggle('mode-remortgage', newMode === 'remortgage');

  document.querySelectorAll('.mode-tab').forEach((b) => {
    const on = b.dataset.mode === newMode;
    b.setAttribute('aria-selected', on ? 'true' : 'false');
    b.classList.toggle('is-active', on);
  });

  renderAll();
}

document.querySelectorAll('.mode-tab').forEach((btn) => {
  btn.addEventListener('click', () => setMode(btn.dataset.mode));
});

// Copy a purchase scenario forward to the remortgage page. Stores a snapshot
// of the source so the user can pick any year of the original mortgage to
// jump to (accounting for overpayments, the fix→revert step, etc.).
function copyScenarioToRemortgage(scenario) {
  const pMaster = STATE.purchase.master;

  STATE.remortgage.source = {
    scenario: { ...scenario },
    masterSnapshot: { ...pMaster },
    atYear: Math.min(pMaster.termYears - 1, scenario.initialYears), // default: end of fix
  };

  // Carry over the buyer-style fields that still apply on a remortgage.
  Object.assign(STATE.remortgage.master, {
    mode: 'remortgage',
    propertyValue: pMaster.propertyValue,
    repaymentType: pMaster.repaymentType,
    partRepaymentPct: pMaster.partRepaymentPct,
    offsetSavings: pMaster.offsetSavings,
    overpaymentMode: pMaster.overpaymentMode,
    monthlyOverpayment: pMaster.monthlyOverpayment,
    overpaymentPercent: pMaster.overpaymentPercent,
    lumpSumOverpayment: 0,
    feeFinanced: pMaster.feeFinanced,
  });

  recomputeFromSource();

  // Reset remortgage scenarios: same lender, plus an alternative for contrast.
  STATE.remortgage.scenarios.length = 0;
  STATE.master = STATE.remortgage.master;
  STATE.scenarios = STATE.remortgage.scenarios;
  STATE.remortgage.scenarios.push(
    makeDefaultScenario({ lenderId: scenario.lenderId, preferTerm: 5 }),
    makeDefaultScenario({ lenderId: pickAnotherLender(scenario.lenderId), preferTerm: 2 }),
  );

  setMode('remortgage');
}

// Re-simulate the source purchase scenario and write the year-N values
// (outstanding balance + remaining term) into the remortgage master.
function recomputeFromSource() {
  const src = STATE.remortgage.source;
  if (!src) return;

  const merged = {
    mode: 'purchase',
    propertyValue: src.masterSnapshot.propertyValue,
    deposit: src.masterSnapshot.deposit,
    termYears: src.masterSnapshot.termYears,
    repaymentType: src.masterSnapshot.repaymentType,
    partRepaymentRatio: src.masterSnapshot.repaymentType === 'part-and-part'
      ? (src.masterSnapshot.partRepaymentPct ?? 50) / 100 : 0.5,
    offsetSavings: src.masterSnapshot.offsetSavings || 0,
    firstTimeBuyer: !!src.masterSnapshot.firstTimeBuyer,
    additionalProperty: !!src.masterSnapshot.additionalProperty,
    overpaymentMode: src.masterSnapshot.overpaymentMode || 'fixed',
    monthlyOverpayment: src.masterSnapshot.monthlyOverpayment || 0,
    overpaymentPercent: src.masterSnapshot.overpaymentPercent || 0,
    lumpSumOverpayment: src.masterSnapshot.lumpSumOverpayment || 0,
    feeFinanced: src.masterSnapshot.feeFinanced,
    // scenario fields
    lenderId: src.scenario.lenderId,
    productId: src.scenario.productId,
    rateInitial: src.scenario.rateInitial,
    initialYears: src.scenario.initialYears,
    rateRevert: src.scenario.rateRevert,
    fee: src.scenario.fee,
  };
  const result = computeScenario(merged);

  // Sample the schedule at the requested year. If no exact sample, take the
  // closest one before it (the loop ends at the first sample >= target).
  const targetMonth = src.atYear * 12;
  let sample = null;
  for (const p of result.schedule) {
    if (p.month <= targetMonth) sample = p;
    else break;
  }
  if (!sample) sample = { balance: result.loan }; // before any month: use full loan

  STATE.remortgage.master.outstandingBalance = Math.max(0, Math.round(sample.balance));
  STATE.remortgage.master.termYears = Math.max(1, src.masterSnapshot.termYears - src.atYear);

  // Re-pick best products for the remortgage scenarios at the new LTV.
  const newLtv = STATE.remortgage.master.propertyValue > 0
    ? (STATE.remortgage.master.outstandingBalance / STATE.remortgage.master.propertyValue) * 100
    : 0;
  for (const s of STATE.remortgage.scenarios) {
    const product = pickBestProduct(s.lenderId, newLtv, s.initialYears);
    if (product && product.id !== s.productId) {
      s.productId = product.id;
      s.rateInitial = product.rate;
      s.initialYears = product.initialYears;
      s.fee = product.fee;
    }
  }
}

// Render the "Pre-filled from..." strip in the remortgage master.
function renderSourceStrip() {
  const strip = document.querySelector('.master--remortgage .source-strip');
  if (!strip) return;
  const src = STATE.remortgage.source;
  if (!src) { strip.hidden = true; return; }
  strip.hidden = false;

  strip.querySelector('[data-readout="sourceName"]').textContent =
    autoName(src.scenario, src.masterSnapshot);
  strip.querySelector('[data-readout="sourceMaxYear"]').textContent =
    (src.masterSnapshot.termYears - 1);

  const yearInput = strip.querySelector('[data-readout="sourceYear"]');
  if (yearInput && document.activeElement !== yearInput) {
    yearInput.value = src.atYear;
    yearInput.max = src.masterSnapshot.termYears - 1;
  }
}

// Handlers for the source strip
document.addEventListener('input', (e) => {
  if (!e.target.matches('[data-readout="sourceYear"]')) return;
  const src = STATE.remortgage.source;
  if (!src) return;
  let v = parseFloat(e.target.value);
  if (!isFinite(v)) return;
  v = Math.max(1, Math.min(src.masterSnapshot.termYears - 1, v));
  src.atYear = v;
  recomputeFromSource();
  renderAll();
});

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action="detach-source"]');
  if (!btn) return;
  STATE.remortgage.source = null;
  renderAll();
});

// =============================================================================
// Master inputs — owned by STATE.master, propagate to every scenario on change
// =============================================================================

function attachMasterListeners() {
  document.querySelectorAll('[data-master]').forEach((el) => {
    const field = el.dataset.master;
    const evt = el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'radio'
      ? 'change' : 'input';
    el.addEventListener(evt, () => onMasterChange(field, el));
  });
}

function onMasterChange(field, el) {
  // The input lives inside a specific master section — find which mode it edits.
  const section = el.closest('.master');
  const sectionMode = section?.dataset.mode || STATE.mode;
  const master = STATE[sectionMode].master;
  if (!master) return;

  let value = el.value;
  if (el.type === 'checkbox') value = el.checked;
  else if (el.type === 'number') value = el.value === '' ? 0 : parseFloat(el.value);
  else if (el.type === 'radio') {
    if (!el.checked) return;
    value = el.value;
  }
  master[field] = value;

  // LTV-shifting fields → re-pick products for the affected scenarios.
  const ltvFields = ['propertyValue', 'deposit', 'outstandingBalance', 'feeFinanced'];
  if (ltvFields.includes(field)) {
    const scenarios = STATE[sectionMode].scenarios;
    const wasActive = sectionMode === STATE.mode;
    if (wasActive) {
      repickProductsForAllScenarios();
    } else {
      // Manually re-pick using the section's own master (without temporarily reassigning state)
      for (const s of scenarios) {
        const ltv = ((master.mode === 'remortgage' ? (master.outstandingBalance || 0) : (master.propertyValue - master.deposit))
                     + (master.feeFinanced === 'add' ? s.fee : 0)) / Math.max(1, master.propertyValue) * 100;
        const product = pickBestProduct(s.lenderId, ltv, s.initialYears);
        if (product && product.id !== s.productId) {
          s.productId = product.id;
          s.rateInitial = product.rate;
          s.initialYears = product.initialYears;
          s.fee = product.fee;
        }
      }
    }
  }

  if (sectionMode === STATE.mode) renderAll();
}

function repickProductsForAllScenarios() {
  for (const s of STATE.scenarios) {
    const ltv = currentLtvForScenario(s);
    const product = pickBestProduct(s.lenderId, ltv, s.initialYears);
    if (product && product.id !== s.productId) {
      s.productId = product.id;
      s.rateInitial = product.rate;
      s.initialYears = product.initialYears;
      s.fee = product.fee;
    }
  }
}

function applyMasterToDom() {
  const m = STATE.master;
  const activeSection = document.querySelector(`.master[data-mode="${m.mode}"]`);
  if (!activeSection) return;

  activeSection.querySelectorAll('[data-master]').forEach((el) => {
    const field = el.dataset.master;
    if (document.activeElement === el) return;
    if (el.type === 'checkbox') el.checked = !!m[field];
    else if (el.type === 'radio') el.checked = (el.value === m[field]);
    else el.value = m[field] ?? '';
  });

  // LTV readout (the section has at most one)
  const ltvEl = activeSection.querySelector('[data-readout="masterLtv"]');
  if (ltvEl) ltvEl.textContent = pct(baseLtv(m));

  // Show/hide repayment-type extras within the active section
  activeSection.querySelectorAll('.type-extras').forEach((box) => {
    box.hidden = box.dataset.showWhen !== m.repaymentType;
  });
  // Show/hide overpayment-mode extras
  activeSection.querySelectorAll('.over-extras').forEach((box) => {
    box.hidden = box.dataset.showWhen !== m.overpaymentMode;
  });
}

// Initialise BoE pill from data
(function stampBoE() {
  const el = document.getElementById('boeRatePill');
  if (el) el.textContent = `BoE · ${BANK_OF_ENGLAND.bankRate.toFixed(2)}%`;
})();

attachMasterListeners();

const rateShockInput = document.getElementById('rateShock');
rateShockInput.addEventListener('input', () => {
  STATE.rateShock = parseFloat(rateShockInput.value) || 0;
  updateRateShockLabel();
  renderAll();
});
document.getElementById('resetShockBtn').addEventListener('click', () => {
  STATE.rateShock = 0;
  rateShockInput.value = 0;
  updateRateShockLabel();
  renderAll();
});

function updateRateShockLabel() {
  const v = STATE.rateShock;
  const sign = v > 0 ? '+' : v < 0 ? '−' : '+';
  document.getElementById('rateShockValue').textContent = `${sign}${Math.abs(v).toFixed(2)} pp`;
}

function pickAnotherLender(currentId) {
  const others = LENDERS.filter((l) => l.id !== currentId);
  return others[Math.floor(Math.random() * others.length)]?.id || currentId;
}

// ---------------------------------------------------------------------------
// Date stamp
// ---------------------------------------------------------------------------

(function stampToday() {
  const el = document.getElementById('todayStamp');
  if (!el) return;
  const d = new Date();
  el.textContent = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
})();

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

setMode('purchase');
