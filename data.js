// UK mortgage data — May 2026.
// Anchored against the Bank of England Bank Rate of 3.75% (held 30 April 2026)
// and headline best-buy mortgage rates from major lenders mid-May 2026.
// All numbers are illustrative; edit any cell in the calculator to match a personal quote.

// Bank of England headline rate — used as the macro anchor displayed in the UI
// and as the basis for tracker pricing (BoE + margin).
export const BANK_OF_ENGLAND = {
  bankRate: 3.75,
  asOf: '2026-04-30',
  source: 'Bank of England MPC',
};

export const LENDERS = [
  {
    id: 'halifax',
    name: 'Halifax',
    note: 'High-street lender, part of Lloyds Banking Group',
    svr: 7.99,
    products: [
      { id: 'hx-2y-60', label: '2-year fix · 60% LTV',  type: 'fix', initialYears: 2, rate: 3.94, fee: 1099, maxLtv: 60 },
      { id: 'hx-2y-75', label: '2-year fix · 75% LTV',  type: 'fix', initialYears: 2, rate: 4.09, fee: 999,  maxLtv: 75 },
      { id: 'hx-2y-80', label: '2-year fix · 80% LTV',  type: 'fix', initialYears: 2, rate: 4.19, fee: 999,  maxLtv: 80 },
      { id: 'hx-2y-85', label: '2-year fix · 85% LTV',  type: 'fix', initialYears: 2, rate: 4.34, fee: 999,  maxLtv: 85 },
      { id: 'hx-2y-90', label: '2-year fix · 90% LTV',  type: 'fix', initialYears: 2, rate: 4.59, fee: 999,  maxLtv: 90 },
      { id: 'hx-2y-95', label: '2-year fix · 95% LTV',  type: 'fix', initialYears: 2, rate: 5.04, fee: 999,  maxLtv: 95 },
      { id: 'hx-5y-60', label: '5-year fix · 60% LTV',  type: 'fix', initialYears: 5, rate: 4.04, fee: 1099, maxLtv: 60 },
      { id: 'hx-5y-75', label: '5-year fix · 75% LTV',  type: 'fix', initialYears: 5, rate: 4.19, fee: 999,  maxLtv: 75 },
      { id: 'hx-5y-80', label: '5-year fix · 80% LTV',  type: 'fix', initialYears: 5, rate: 4.28, fee: 999,  maxLtv: 80 },
      { id: 'hx-5y-85', label: '5-year fix · 85% LTV',  type: 'fix', initialYears: 5, rate: 4.39, fee: 999,  maxLtv: 85 },
      { id: 'hx-5y-90', label: '5-year fix · 90% LTV',  type: 'fix', initialYears: 5, rate: 4.59, fee: 999,  maxLtv: 90 },
      { id: 'hx-5y-95', label: '5-year fix · 95% LTV',  type: 'fix', initialYears: 5, rate: 4.94, fee: 999,  maxLtv: 95 },
      { id: 'hx-tr-75', label: 'Tracker · BoE +0.74%',  type: 'tracker', initialYears: 2, rate: 4.49, fee: 999, maxLtv: 75 },
    ],
  },
  {
    id: 'nationwide',
    name: 'Nationwide',
    note: 'Mutual building society — UK’s largest',
    svr: 6.99,
    products: [
      { id: 'nw-2y-60', label: '2-year fix · 60% LTV',  type: 'fix', initialYears: 2, rate: 3.99, fee: 999,  maxLtv: 60 },
      { id: 'nw-2y-75', label: '2-year fix · 75% LTV',  type: 'fix', initialYears: 2, rate: 4.14, fee: 999,  maxLtv: 75 },
      { id: 'nw-2y-85', label: '2-year fix · 85% LTV',  type: 'fix', initialYears: 2, rate: 4.34, fee: 999,  maxLtv: 85 },
      { id: 'nw-2y-90', label: '2-year fix · 90% LTV',  type: 'fix', initialYears: 2, rate: 4.54, fee: 999,  maxLtv: 90 },
      { id: 'nw-2y-95', label: '2-year fix · 95% LTV',  type: 'fix', initialYears: 2, rate: 4.94, fee: 999,  maxLtv: 95 },
      { id: 'nw-5y-60', label: '5-year fix · 60% LTV',  type: 'fix', initialYears: 5, rate: 4.04, fee: 999,  maxLtv: 60 },
      { id: 'nw-5y-75', label: '5-year fix · 75% LTV',  type: 'fix', initialYears: 5, rate: 4.14, fee: 999,  maxLtv: 75 },
      { id: 'nw-5y-85', label: '5-year fix · 85% LTV',  type: 'fix', initialYears: 5, rate: 4.29, fee: 999,  maxLtv: 85 },
      { id: 'nw-5y-90', label: '5-year fix · 90% LTV',  type: 'fix', initialYears: 5, rate: 4.49, fee: 999,  maxLtv: 90 },
      { id: 'nw-5y-95', label: '5-year fix · 95% LTV',  type: 'fix', initialYears: 5, rate: 4.84, fee: 999,  maxLtv: 95 },
    ],
  },
  {
    id: 'barclays',
    name: 'Barclays',
    note: 'High-street bank — notably low SVR',
    svr: 5.74,
    products: [
      { id: 'ba-2y-60', label: '2-year fix · 60% LTV',  type: 'fix', initialYears: 2, rate: 4.04, fee: 899,  maxLtv: 60 },
      { id: 'ba-2y-75', label: '2-year fix · 75% LTV',  type: 'fix', initialYears: 2, rate: 4.19, fee: 899,  maxLtv: 75 },
      { id: 'ba-2y-85', label: '2-year fix · 85% LTV',  type: 'fix', initialYears: 2, rate: 4.34, fee: 899,  maxLtv: 85 },
      { id: 'ba-2y-90', label: '2-year fix · 90% LTV',  type: 'fix', initialYears: 2, rate: 4.59, fee: 899,  maxLtv: 90 },
      { id: 'ba-2y-95', label: '2-year fix · 95% LTV',  type: 'fix', initialYears: 2, rate: 4.99, fee: 899,  maxLtv: 95 },
      { id: 'ba-5y-60', label: '5-year fix · 60% LTV',  type: 'fix', initialYears: 5, rate: 3.99, fee: 899,  maxLtv: 60 },
      { id: 'ba-5y-75', label: '5-year fix · 75% LTV',  type: 'fix', initialYears: 5, rate: 4.14, fee: 899,  maxLtv: 75 },
      { id: 'ba-5y-85', label: '5-year fix · 85% LTV',  type: 'fix', initialYears: 5, rate: 4.29, fee: 899,  maxLtv: 85 },
      { id: 'ba-5y-90', label: '5-year fix · 90% LTV',  type: 'fix', initialYears: 5, rate: 4.54, fee: 899,  maxLtv: 90 },
      { id: 'ba-5y-95', label: '5-year fix · 95% LTV',  type: 'fix', initialYears: 5, rate: 4.89, fee: 899,  maxLtv: 95 },
    ],
  },
  {
    id: 'hsbc',
    name: 'HSBC',
    note: 'Global bank, aggressive UK pricing',
    svr: 6.74,
    products: [
      { id: 'hb-2y-60', label: '2-year fix · 60% LTV',  type: 'fix', initialYears: 2, rate: 3.97, fee: 999,  maxLtv: 60 },
      { id: 'hb-2y-75', label: '2-year fix · 75% LTV',  type: 'fix', initialYears: 2, rate: 4.12, fee: 999,  maxLtv: 75 },
      { id: 'hb-2y-85', label: '2-year fix · 85% LTV',  type: 'fix', initialYears: 2, rate: 4.34, fee: 999,  maxLtv: 85 },
      { id: 'hb-2y-90', label: '2-year fix · 90% LTV',  type: 'fix', initialYears: 2, rate: 4.57, fee: 999,  maxLtv: 90 },
      { id: 'hb-2y-95', label: '2-year fix · 95% LTV',  type: 'fix', initialYears: 2, rate: 4.99, fee: 999,  maxLtv: 95 },
      { id: 'hb-5y-60', label: '5-year fix · 60% LTV',  type: 'fix', initialYears: 5, rate: 3.94, fee: 999,  maxLtv: 60 },
      { id: 'hb-5y-75', label: '5-year fix · 75% LTV',  type: 'fix', initialYears: 5, rate: 4.12, fee: 999,  maxLtv: 75 },
      { id: 'hb-5y-85', label: '5-year fix · 85% LTV',  type: 'fix', initialYears: 5, rate: 4.24, fee: 999,  maxLtv: 85 },
      { id: 'hb-5y-90', label: '5-year fix · 90% LTV',  type: 'fix', initialYears: 5, rate: 4.49, fee: 999,  maxLtv: 90 },
      { id: 'hb-5y-95', label: '5-year fix · 95% LTV',  type: 'fix', initialYears: 5, rate: 4.84, fee: 999,  maxLtv: 95 },
    ],
  },
  {
    id: 'natwest',
    name: 'NatWest',
    note: 'High-street bank, part of NatWest Group',
    svr: 6.99,
    products: [
      { id: 'nt-2y-60', label: '2-year fix · 60% LTV',  type: 'fix', initialYears: 2, rate: 3.97, fee: 995,  maxLtv: 60 },
      { id: 'nt-2y-75', label: '2-year fix · 75% LTV',  type: 'fix', initialYears: 2, rate: 4.14, fee: 995,  maxLtv: 75 },
      { id: 'nt-2y-85', label: '2-year fix · 85% LTV',  type: 'fix', initialYears: 2, rate: 4.27, fee: 995,  maxLtv: 85 },
      { id: 'nt-2y-90', label: '2-year fix · 90% LTV',  type: 'fix', initialYears: 2, rate: 4.49, fee: 995,  maxLtv: 90 },
      { id: 'nt-2y-95', label: '2-year fix · 95% LTV',  type: 'fix', initialYears: 2, rate: 4.94, fee: 995,  maxLtv: 95 },
      { id: 'nt-5y-60', label: '5-year fix · 60% LTV',  type: 'fix', initialYears: 5, rate: 4.42, fee: 995,  maxLtv: 60 },
      { id: 'nt-5y-75', label: '5-year fix · 75% LTV',  type: 'fix', initialYears: 5, rate: 4.49, fee: 995,  maxLtv: 75 },
      { id: 'nt-5y-85', label: '5-year fix · 85% LTV',  type: 'fix', initialYears: 5, rate: 4.59, fee: 995,  maxLtv: 85 },
      { id: 'nt-5y-90', label: '5-year fix · 90% LTV',  type: 'fix', initialYears: 5, rate: 4.74, fee: 995,  maxLtv: 90 },
      { id: 'nt-5y-95', label: '5-year fix · 95% LTV',  type: 'fix', initialYears: 5, rate: 4.99, fee: 995,  maxLtv: 95 },
    ],
  },
  {
    id: 'santander',
    name: 'Santander',
    note: 'High-street bank',
    svr: 7.00,
    products: [
      { id: 'sa-2y-60', label: '2-year fix · 60% LTV',  type: 'fix', initialYears: 2, rate: 4.27, fee: 999,  maxLtv: 60 },
      { id: 'sa-2y-75', label: '2-year fix · 75% LTV',  type: 'fix', initialYears: 2, rate: 4.39, fee: 999,  maxLtv: 75 },
      { id: 'sa-2y-85', label: '2-year fix · 85% LTV',  type: 'fix', initialYears: 2, rate: 4.59, fee: 999,  maxLtv: 85 },
      { id: 'sa-2y-90', label: '2-year fix · 90% LTV',  type: 'fix', initialYears: 2, rate: 4.79, fee: 999,  maxLtv: 90 },
      { id: 'sa-2y-95', label: '2-year fix · 95% LTV',  type: 'fix', initialYears: 2, rate: 5.12, fee: 999,  maxLtv: 95 },
      { id: 'sa-5y-60', label: '5-year fix · 60% LTV',  type: 'fix', initialYears: 5, rate: 4.21, fee: 999,  maxLtv: 60 },
      { id: 'sa-5y-75', label: '5-year fix · 75% LTV',  type: 'fix', initialYears: 5, rate: 4.29, fee: 999,  maxLtv: 75 },
      { id: 'sa-5y-85', label: '5-year fix · 85% LTV',  type: 'fix', initialYears: 5, rate: 4.44, fee: 999,  maxLtv: 85 },
      { id: 'sa-5y-90', label: '5-year fix · 90% LTV',  type: 'fix', initialYears: 5, rate: 4.59, fee: 999,  maxLtv: 90 },
      { id: 'sa-5y-95', label: '5-year fix · 95% LTV',  type: 'fix', initialYears: 5, rate: 4.89, fee: 999,  maxLtv: 95 },
    ],
  },
  {
    id: 'lloyds',
    name: 'Lloyds',
    note: 'High-street bank, sister to Halifax',
    svr: 7.99,
    products: [
      { id: 'll-2y-60', label: '2-year fix · 60% LTV',  type: 'fix', initialYears: 2, rate: 4.07, fee: 999,  maxLtv: 60 },
      { id: 'll-2y-75', label: '2-year fix · 75% LTV',  type: 'fix', initialYears: 2, rate: 4.22, fee: 999,  maxLtv: 75 },
      { id: 'll-5y-60', label: '5-year fix · 60% LTV',  type: 'fix', initialYears: 5, rate: 4.05, fee: 999,  maxLtv: 60 },
      { id: 'll-5y-75', label: '5-year fix · 75% LTV',  type: 'fix', initialYears: 5, rate: 4.19, fee: 999,  maxLtv: 75 },
    ],
  },
  {
    id: 'virgin',
    name: 'Virgin Money',
    note: 'Part of Nationwide Group from 2024',
    svr: 7.49,
    products: [
      { id: 'vm-2y-75', label: '2-year fix · 75% LTV',  type: 'fix', initialYears: 2, rate: 4.24, fee: 995,  maxLtv: 75 },
      { id: 'vm-5y-75', label: '5-year fix · 75% LTV',  type: 'fix', initialYears: 5, rate: 4.14, fee: 995,  maxLtv: 75 },
      { id: 'vm-5y-90', label: '5-year fix · 90% LTV',  type: 'fix', initialYears: 5, rate: 4.54, fee: 995,  maxLtv: 90 },
    ],
  },
  {
    id: 'ybs',
    name: 'Yorkshire BS',
    note: 'Mutual building society',
    svr: 6.74,
    products: [
      { id: 'yb-2y-75', label: '2-year fix · 75% LTV',  type: 'fix', initialYears: 2, rate: 4.17, fee: 995,  maxLtv: 75 },
      { id: 'yb-5y-75', label: '5-year fix · 75% LTV',  type: 'fix', initialYears: 5, rate: 4.08, fee: 995,  maxLtv: 75 },
      { id: 'yb-5y-90', label: '5-year fix · 90% LTV',  type: 'fix', initialYears: 5, rate: 4.46, fee: 995,  maxLtv: 90 },
    ],
  },
  {
    id: 'coventry',
    name: 'Coventry BS',
    note: 'Mutual building society, known for offsets',
    svr: 6.99,
    products: [
      { id: 'cv-2y-75', label: '2-year fix · 75% LTV',  type: 'fix', initialYears: 2, rate: 4.15, fee: 999,  maxLtv: 75 },
      { id: 'cv-5y-75', label: '5-year fix · 75% LTV',  type: 'fix', initialYears: 5, rate: 4.07, fee: 999,  maxLtv: 75 },
      { id: 'cv-5y-90', label: '5-year fix · 90% LTV',  type: 'fix', initialYears: 5, rate: 4.44, fee: 999,  maxLtv: 90 },
    ],
  },
  {
    id: 'tsb',
    name: 'TSB',
    note: 'High-street bank',
    svr: 7.74,
    products: [
      { id: 'ts-2y-75', label: '2-year fix · 75% LTV',  type: 'fix', initialYears: 2, rate: 4.19, fee: 995,  maxLtv: 75 },
      { id: 'ts-5y-75', label: '5-year fix · 75% LTV',  type: 'fix', initialYears: 5, rate: 4.12, fee: 995,  maxLtv: 75 },
    ],
  },
  {
    id: 'skipton',
    name: 'Skipton BS',
    note: 'Mutual building society',
    svr: 6.99,
    products: [
      { id: 'sk-2y-75', label: '2-year fix · 75% LTV',  type: 'fix', initialYears: 2, rate: 4.21, fee: 995,  maxLtv: 75 },
      { id: 'sk-5y-75', label: '5-year fix · 75% LTV',  type: 'fix', initialYears: 5, rate: 4.11, fee: 995,  maxLtv: 75 },
    ],
  },
];

// SDLT bands — England & Northern Ireland, 2026.
// Wales (LTT) and Scotland (LBTT) use different systems and are not modelled here.
export const SDLT = {
  standard: [
    { upTo: 125000,   rate: 0.00 },
    { upTo: 250000,   rate: 0.02 },
    { upTo: 925000,   rate: 0.05 },
    { upTo: 1500000,  rate: 0.10 },
    { upTo: Infinity, rate: 0.12 },
  ],
  firstTimeBuyer: {
    reliefCap: 500000,
    bands: [
      { upTo: 300000,   rate: 0.00 },
      { upTo: 500000,   rate: 0.05 },
      { upTo: Infinity, rate: 0.05 },
    ],
  },
  additionalPropertySurcharge: 0.05,
};
