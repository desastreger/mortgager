// Pure mortgage maths. No DOM, no side effects.
import { SDLT } from './data.js';

// Standard capital-repayment monthly payment.
// principal × (r × (1+r)^n) / ((1+r)^n − 1),  r = monthly rate, n = total months.
export function monthlyPayment(principal, annualRatePct, years) {
  if (principal <= 0 || years <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  const n = years * 12;
  if (r === 0) return principal / n;
  const pow = Math.pow(1 + r, n);
  return (principal * r * pow) / (pow - 1);
}

// Month-by-month amortisation, handling:
//   - capital repayment, interest-only, part-and-part, offset (simplified)
//   - initial fix period then revert to lender SVR
//   - monthly overpayments + lump-sum overpayment at month 0
//   - arrangement fee either added to loan or paid upfront
//
// Returns headline numbers + a schedule the chart can draw.
export function amortise(s) {
  // ---- principal & splits ----
  // Purchase: loan = propertyValue − deposit (+ optionally financed fee)
  // Remortgage: loan = outstandingBalance (+ optionally financed fee)
  let loan = s.mode === 'remortgage'
    ? (s.outstandingBalance || 0)
    : (s.propertyValue - s.deposit);
  if (s.feeFinanced === 'add') loan += s.fee;
  loan -= s.lumpSumOverpayment || 0;
  if (loan < 0) loan = 0;

  const termMonths = Math.round(s.termYears * 12);
  const initialMonths = Math.min(Math.round(s.initialYears * 12), termMonths);

  let principalRepayPortion = 0;
  let principalIOPortion = 0;
  if (s.repaymentType === 'interest-only') {
    principalIOPortion = loan;
  } else if (s.repaymentType === 'part-and-part') {
    principalRepayPortion = loan * (s.partRepaymentRatio ?? 0.5);
    principalIOPortion = loan - principalRepayPortion;
  } else {
    principalRepayPortion = loan; // 'repayment' or 'offset'
  }

  // ---- headline initial monthly (no overpayments included) ----
  const rInit = s.rateInitial / 100 / 12;
  const rRev = s.rateRevert / 100 / 12;
  const monthlyInitial =
    monthlyPayment(principalRepayPortion, s.rateInitial, s.termYears) +
    principalIOPortion * rInit;

  // ---- simulate ----
  let balanceRepay = principalRepayPortion;
  const balanceIO = principalIOPortion;
  let totalInterest = 0;
  let totalPaid = 0;
  let actualMonths = 0;
  let monthlyRevert = null;
  const schedule = [];
  const sampleEvery = Math.max(1, Math.floor(termMonths / 80));

  // Level payment during initial period: constant, computed once.
  const initialLevelPayment = monthlyPayment(
    principalRepayPortion,
    s.rateInitial,
    s.termYears
  );
  // Level payment during revert: locked at the moment we enter revert,
  // based on the balance at that point amortised over the remaining term.
  // Critical: this stays fixed so overpayments shorten the loan instead of
  // reducing future payments (a re-amortise-every-month would do the latter).
  let revertLevelPayment = null;

  for (let month = 1; month <= termMonths; month++) {
    const inInitial = month <= initialMonths;
    const r = inInitial ? rInit : rRev;

    let levelRepayPayment;
    if (inInitial) {
      levelRepayPayment = initialLevelPayment;
    } else {
      if (revertLevelPayment === null) {
        const remainingYears = (termMonths - initialMonths) / 12;
        revertLevelPayment = monthlyPayment(
          balanceRepay,
          s.rateRevert,
          remainingYears
        );
        monthlyRevert = revertLevelPayment + balanceIO * rRev;
      }
      levelRepayPayment = revertLevelPayment;
    }

    // Offset: interest accrues on (repay balance − savings), floored at 0.
    const interestBase =
      s.repaymentType === 'offset'
        ? Math.max(0, balanceRepay - (s.offsetSavings || 0))
        : balanceRepay;

    const interestRepay = interestBase * r;
    const interestIO = balanceIO * r;

    // Overpayment: either a fixed £ amount each month, or a % above the level payment.
    const extraPayment = s.overpaymentMode === 'percent'
      ? levelRepayPayment * ((s.overpaymentPercent || 0) / 100)
      : (s.monthlyOverpayment || 0);
    let payRepay = levelRepayPayment + extraPayment;
    payRepay = Math.min(payRepay, balanceRepay + interestRepay);
    const principalPaid = payRepay - interestRepay;
    balanceRepay -= principalPaid;
    if (balanceRepay < 0.005) balanceRepay = 0;

    const payIO = interestIO; // IO never reduces principal

    const monthTotal = payRepay + payIO;
    totalInterest += interestRepay + interestIO;
    totalPaid += monthTotal;
    actualMonths = month;

    if (month % sampleEvery === 0 || month === termMonths || balanceRepay === 0) {
      schedule.push({
        month,
        balance: balanceRepay + balanceIO,
        payment: monthTotal,
      });
    }

    if (balanceRepay === 0 && balanceIO === 0) break;
  }

  if (monthlyRevert === null) {
    // Never reached revert (paid off during fix). Reuse initial as the headline.
    monthlyRevert = monthlyInitial;
  }

  return {
    loan,
    principalRepayPortion,
    principalIOPortion,
    monthlyInitial,
    monthlyRevert,
    totalInterest,
    totalPaid,
    termActualMonths: actualMonths,
    // Any debt left at the close of the term: IO principal (which is meant
    // to be repaid in a lump) plus any repayment balance not yet paid off.
    residualBalance: balanceIO + balanceRepay,
    schedule,
  };
}

// SDLT — England & NI residential rates (2026).
export function stampDuty(price, { firstTimeBuyer = false, additionalProperty = false } = {}) {
  if (price <= 0) return 0;
  const useFTB =
    firstTimeBuyer && price <= SDLT.firstTimeBuyer.reliefCap;
  const bands = useFTB ? SDLT.firstTimeBuyer.bands : SDLT.standard;
  const surcharge = additionalProperty ? SDLT.additionalPropertySurcharge : 0;

  let tax = 0;
  let prev = 0;
  for (const band of bands) {
    if (price <= prev) break;
    const portion = Math.min(price, band.upTo) - prev;
    if (portion > 0) tax += portion * (band.rate + surcharge);
    prev = band.upTo;
  }
  return tax;
}

// All the headline numbers a scenario card needs to render.
export function computeScenario(s) {
  const a = amortise(s);
  const ltv = s.propertyValue > 0 ? (a.loan / s.propertyValue) * 100 : 0;

  // No SDLT or deposit cost on a remortgage.
  const isRemo = s.mode === 'remortgage';
  const sdlt = isRemo ? 0 : stampDuty(s.propertyValue, {
    firstTimeBuyer: !!s.firstTimeBuyer,
    additionalProperty: !!s.additionalProperty,
  });

  const upfrontFee = s.feeFinanced === 'pay' ? s.fee : 0;
  const upfrontCash = isRemo
    ? upfrontFee + (s.lumpSumOverpayment || 0)
    : (s.deposit + sdlt + upfrontFee + (s.lumpSumOverpayment || 0));

  // True cost: every penny across the life of this product.
  // Purchase counts the deposit as part of "owning"; remortgage doesn't (it's
  // already sunk equity, not a new outlay).
  const trueCostOfOwning = isRemo
    ? a.totalPaid + upfrontFee + a.residualBalance
    : a.totalPaid + sdlt + upfrontFee + s.deposit + a.residualBalance;

  return { ...a, ltv, sdlt, upfrontCash, trueCostOfOwning };
}
