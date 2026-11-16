// FIREtrack calculation core: pure functions with no DOM access, shared by the page
// and by tests/calc.test.js. Loaded as a classic script so file:// still works.

function presentValueOfIncome(income, years, rr) {
  if (income <= 0 || years <= 0) return 0;
  return rr > 0 ? income * (1 - Math.pow(1 + rr, -years)) / rr : income * years;
}

const MEDICARE_AGE = 65;

function projectFireYear(totalInv, totalC, fireNum, rr, contribGrowth = 0) {
  let portfolio = totalInv;
  for (let y = 0; y <= 60; y++) {
    if (portfolio >= fireNum) return y;
    portfolio = portfolio * (1 + rr) + totalC * Math.pow(1 + contribGrowth, y);
  }
  return null;
}

function computeFireMath({age, retireAge, expenses, socialSecurityIncome, pensionIncome, ssStartAge, swr, rr, totalInv, totalC, blendedTaxRate = 0, contribGrowth = 0, healthPre65 = 0}) {
  let assumedFireAge = retireAge;
  let fireYear = null;
  let spendingNeedAfterGuaranteedIncome = 0;
  let ssGapYears = 0;
  let ssGapSurcharge = 0;
  let healthGapYears = 0;
  let healthSurcharge = 0;
  let fireNum = 0;

  const tried = new Set();
  for (let i = 0; i < 8; i++) {
    // An earlier assumed FIRE age raises the bridge costs, which can push the projected age later
    // and loop back. On a repeat, settle on the earliest age tried (the larger, conservative number).
    if (tried.has(assumedFireAge)) assumedFireAge = Math.min(...tried);
    const settling = tried.has(assumedFireAge);
    tried.add(assumedFireAge);
    spendingNeedAfterGuaranteedIncome = Math.max(0, expenses - pensionIncome - socialSecurityIncome);
    ssGapYears = Math.max(0, ssStartAge - assumedFireAge);
    ssGapSurcharge = presentValueOfIncome(socialSecurityIncome, ssGapYears, rr);
    healthGapYears = Math.max(0, MEDICARE_AGE - assumedFireAge);
    healthSurcharge = presentValueOfIncome(healthPre65, healthGapYears, rr);
    const surcharges = ssGapSurcharge + healthSurcharge;
    fireNum = swr > 0 && (spendingNeedAfterGuaranteedIncome > 0 || surcharges > 0)
      ? spendingNeedAfterGuaranteedIncome / swr + surcharges
      : 0;
    fireYear = projectFireYear(totalInv, totalC, fireNum, rr, contribGrowth);
    const nextFireAge = fireYear !== null ? age + fireYear : retireAge;
    if (settling || nextFireAge === assumedFireAge) break;
    assumedFireAge = nextFireAge;
  }

  const taxAdjustedWithdrawal = spendingNeedAfterGuaranteedIncome > 0 && blendedTaxRate < 1
    ? spendingNeedAfterGuaranteedIncome / Math.max(0.01, 1 - blendedTaxRate)
    : 0;
  const taxDrag = Math.max(0, taxAdjustedWithdrawal - spendingNeedAfterGuaranteedIncome);
  const taxAdjustedFireNum = swr > 0 && (taxAdjustedWithdrawal > 0 || ssGapSurcharge + healthSurcharge > 0)
    ? taxAdjustedWithdrawal / swr + ssGapSurcharge + healthSurcharge
    : 0;

  return {fireNum, fireYear, bridgeStartAge: assumedFireAge, spendingNeedAfterGuaranteedIncome, ssGapYears, ssGapSurcharge, healthGapYears, healthSurcharge, taxAdjustedWithdrawal, taxDrag, taxAdjustedFireNum};
}

function buildProjection({age, totalInv, totalC, fireNum, fireYear, expenses, pensionIncome, socialSecurityIncome, ssStartAge, rr, contribGrowth = 0, healthPre65 = 0}) {
  let portfolio = totalInv;
  const pd = [], pl = [];
  for (let y = 0; y <= 60; y++) {
    pd.push(Math.round(portfolio));
    pl.push((age + y).toString());
    const retired = fireYear !== null && y >= fireYear;
    if (retired) {
      const currentAge = age + y;
      const ssActive = currentAge >= ssStartAge;
      const health = currentAge < MEDICARE_AGE ? healthPre65 : 0;
      const withdrawal = Math.max(0, expenses + health - pensionIncome - (ssActive ? socialSecurityIncome : 0));
      portfolio = Math.max(0, portfolio * (1 + rr) - withdrawal);
    } else {
      portfolio = portfolio * (1 + rr) + totalC * Math.pow(1 + contribGrowth, y);
    }
  }
  return {pd, pl};
}

// ── CALCULATE ──

function computeState(src) {
  const gv = src.gv;
  const age = gv('age'), retireAge = gv('retireAge'), ytf = Math.max(retireAge-age,1);
  const hasP = src.hasP;

  const salary=gv('salary'),bonus=gv('bonus'),rsus=gv('rsus'),side=gv('sideIncome');
  const pSalary=hasP?gv('partnerSalary'):0, pBonus=hasP?gv('partnerBonus'):0, pRSUs=hasP?gv('partnerRSUs'):0, pSide=hasP?gv('partnerSideIncome'):0;
  const youInc = salary+bonus+rsus+side, partInc = pSalary+pBonus+pRSUs+pSide, totalInc = youInc+partInc;

  const currentExpenses = gv('expenses');
  const retireExpensesInput = gv('retireExpenses');
  const retireExpenses = retireExpensesInput > 0 ? retireExpensesInput : currentExpenses;
  const expenses = retireExpenses, swr=gv('swr')/100;
  const ss=gv('socialSecurity'), ssStartAge=Math.max(gv('ssStartAge')||67, retireAge);
  const pSS=hasP?gv('partnerSS'):0;
  const totalSS=ss+pSS;
  const retireTaxRate = gv('retireTaxRate')/100;

  // Account balances — separate Roth vs Traditional
  const k401=gv('k401'), roth401k=gv('roth401k');
  const roth=gv('rothIra'), tIra=gv('tradIra');
  const hsa=gv('hsa'), brok=gv('brokerage'), cash=gv('cash');
  const homeVal=gv('homeEquity');
  const pensionIncome=gv('pension');   // Now annual income, not lump sum
  const col=gv('college');
  const k401c=gv('k401Contrib'), k401Match=gv('k401Match'), hsac=gv('hsaContrib'), brokc=gv('brokerageContrib');
  const rothIraContrib=gv('rothIraContrib');

  const p401=hasP?gv('partner401k'):0, p401c=hasP?gv('partner401kContrib'):0, pMatch=hasP?gv('partner401kMatch'):0;
  const pRoth=hasP?gv('partnerRothIra'):0, pHSA=hasP?gv('partnerHSA'):0, pBrok=hasP?gv('partnerBrokerage'):0;
  const pCash=hasP?gv('partnerCash'):0;

  const ccRateRaw = parseFloat(src.raw('ccRate'));
  const mortgage=gv('mortgage'), stuLoans=gv('studentLoans'), carL=gv('carLoan'), ccD=gv('ccDebt'), ccRate=Number.isFinite(ccRateRaw) ? ccRateRaw : 24.99;
  const rr = gv('returnRate')/100;
  const contribGrowth = Math.min(10, Math.max(0, gv('contribGrowth'))) / 100;
  const healthPre65 = Math.max(0, gv('healthPre65'));
  const rothConversion = Math.max(0, gv('rothConversion'));
  const em = gv('emergencyMonths'), efund = (currentExpenses/12)*em;

  // Home equity = market value − mortgage
  const homeEq = Math.max(0, homeVal - mortgage);

  // Tax bucket classification
  const preTaxYou = k401 + tIra;
  const taxFreeYou = roth401k + roth + hsa;
  const taxableYou = brok;
  const preTaxPart = hasP ? p401 : 0;
  const taxFreePart = hasP ? pRoth + pHSA : 0;
  const taxablePart = hasP ? pBrok : 0;
  const totalPreTax = preTaxYou + preTaxPart;
  const totalTaxFree = taxFreeYou + taxFreePart;
  const totalTaxable = taxableYou + taxablePart;

  // Assets: pension is now income, NOT added to asset totals
  const youAssets = k401+roth401k+roth+tIra+hsa+brok+cash+homeVal+col;
  const partAssets = p401+pRoth+pHSA+pBrok+pCash;
  const totalAssets = youAssets + partAssets;
  const totalDebts = mortgage + stuLoans + carL + ccD;
  const netWorth = totalAssets - totalDebts;

  // Investable: pension removed (it's income now), home/529/emergency cash excluded
  const youInv = k401+roth401k+roth+tIra+hsa+brok+Math.max(0,cash-efund);
  const partInv = p401+pRoth+pHSA+pBrok;
  const totalInv = youInv + partInv;

  // Savings rate includes employee contributions, employer match, HSA, brokerage, and Roth IRA
  const youC = k401c + k401Match + hsac + brokc + rothIraContrib, partC = p401c + pMatch, totalC = youC + partC;
  const savRate = totalInc>0 ? totalC/totalInc : 0;

  // Tax-adjusted gross withdrawal
  const preTaxPct = totalInv > 0 ? totalPreTax/totalInv : 0;
  const taxablePct2 = totalInv > 0 ? totalTaxable/totalInv : 0;
  const blendedTaxRate = (preTaxPct + taxablePct2 * 0.5) * retireTaxRate;
  const totalGuaranteedIncome = totalSS + pensionIncome;
  const fireMath = computeFireMath({
    age, retireAge, expenses,
    socialSecurityIncome: totalSS,
    pensionIncome,
    ssStartAge, swr, rr, totalInv, totalC, blendedTaxRate, contribGrowth, healthPre65
  });
  const {fireNum, fireYear, bridgeStartAge, spendingNeedAfterGuaranteedIncome, ssGapYears, ssGapSurcharge, healthGapYears, healthSurcharge, taxAdjustedWithdrawal, taxDrag, taxAdjustedFireNum} = fireMath;
  const adjExp = spendingNeedAfterGuaranteedIncome;
  const grossWithdrawal = taxAdjustedWithdrawal;
  const progress = fireNum > 0 ? Math.min(1, totalInv / fireNum) : 0;
  const coastNum = fireNum > 0 ? fireNum / Math.pow(1+rr, ytf) : 0;
  const isCoast = coastNum > 0 && totalInv >= coastNum;
  const {pd, pl} = buildProjection({age,totalInv,totalC,fireNum,fireYear,expenses,pensionIncome,socialSecurityIncome:totalSS,ssStartAge,rr,contribGrowth,healthPre65});

  const fireType = src.fireType;

  return { age,retireAge,ytf,hasP,youInc,partInc,totalInc,currentExpenses,retireExpenses,expenses,swr,
    k401,roth401k,roth,tIra,hsa,brok,cash,homeVal,homeEq,pensionIncome,col,p401,pRoth,pHSA,pBrok,pCash,
    totalAssets,totalDebts,netWorth,totalInv,youInv,partInv,youAssets,partAssets,
    fireNum,adjExp,savRate,totalC,youC,partC,progress,pd,pl,fireYear,
    coastNum,isCoast,rr,ss,pSS,totalSS,totalGuaranteedIncome,k401c,k401Match,hsac,brokc,p401c,pMatch,rothIraContrib,
    mortgage,stuLoans,carL,ccD,ccRate,mortgageRate:gv('mortgageRate'),efund,
    totalPreTax,totalTaxFree,totalTaxable,retireTaxRate,grossWithdrawal,taxDrag,blendedTaxRate,taxAdjustedFireNum,
    ssGapYears,ssGapSurcharge,ssStartAge,fireType,
    contribGrowth,healthPre65,healthGapYears,healthSurcharge,rothConversion,bridgeStartAge };
}

const INPUT_IDS = [
  'age','retireAge','dependents','filingStatus',
  'salary','bonus','rsus','sideIncome',
  'partnerAge','partnerRetireAge','partnerSalary','partnerBonus','partnerRSUs','partnerSideIncome',
  'partner401k','partner401kContrib','partner401kMatch','partnerRothIra','partnerHSA','partnerBrokerage','partnerCash','partnerSS',
  'expenses','retireExpenses','healthPre65','emergencyMonths','contribGrowth','rothConversion',
  'k401','roth401k','k401Contrib','k401Match','rothIra','rothIraContrib','tradIra','hsa','hsaContrib','brokerage','brokerageContrib',
  'homeEquity','cash','college','pension',
  'mortgage','mortgageRate','studentLoans','studentLoanRate','carLoan','carLoanRate','ccDebt','ccRate','monthlyDebtPayments',
  'returnRate','swr','socialSecurity','ssStartAge','retireTaxRate'
];

const FIRE_TYPES = ['lean', 'regular', 'fat', 'coast', 'barista'];

function profileId() {
  return 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

// Backup files may come from anywhere, so rebuild them from known fields only.
// Ids are regenerated and strings are stripped of markup/quote characters so
// imported values can never break out of the HTML they are rendered into.
function cleanStr(value, max) {
  return String(value ?? '').replace(/[<>"'`\\]/g, '').slice(0, max);
}
function cleanNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function sanitizeBackup(backup) {
  const profiles = backup.profiles.slice(0, 50).map((p, i) => {
    if (!p || typeof p !== 'object') throw new Error('Bad profile');
    const src = p.data && typeof p.data === 'object' ? p.data : {};
    const data = {};
    INPUT_IDS.forEach(key => { if (key in src) data[key] = cleanStr(src[key], 40); });
    data._partnerOpen = src._partnerOpen === true;
    if (FIRE_TYPES.includes(src._fireType)) data._fireType = src._fireType;
    const history = (Array.isArray(p.history) ? p.history : []).slice(-60)
      .filter(h => h && typeof h === 'object' && !isNaN(new Date(h.ts)))
      .map(h => ({
        ts: new Date(h.ts).toISOString(),
        label: cleanStr(h.label, 40),
        netWorth: cleanNum(h.netWorth) ?? 0,
        investable: cleanNum(h.investable) ?? 0,
        fireNum: cleanNum(h.fireNum) ?? 0,
        progress: cleanNum(h.progress) ?? 0,
        savRate: cleanNum(h.savRate) ?? 0,
        fireAge: cleanNum(h.fireAge),
      }));
    const created = new Date(p.createdAt);
    return {
      oldId: p.id,
      id: profileId() + i,
      name: cleanStr(p.name, 60).trim() || `Profile ${i + 1}`,
      data,
      history,
      createdAt: isNaN(created) ? new Date().toISOString() : created.toISOString()
    };
  });
  const active = profiles.find(p => p.oldId === backup.activeId) || profiles[0];
  profiles.forEach(p => delete p.oldId);
  return { activeId: active.id, profiles };
}

// ── MONTE CARLO SUCCESS ODDS ──
// Seeded so results stay stable while the user types.
function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function runMonteCarlo(s, vol, runs = 1000, endAge = 95) {
  if (!(s.fireNum > 0) || !(s.age > 0) || s.age >= endAge) return null;
  // Seed from the plan's key numbers: stable while values are unchanged, distinct across plans.
  const seedKey = [s.age, s.totalInv, s.totalC, s.fireNum, s.rr, vol, s.contribGrowth, s.healthPre65]
    .map(v => Math.round((v || 0) * 1000)).join('|');
  let seed = 2166136261;
  for (let i = 0; i < seedKey.length; i++) seed = Math.imul(seed ^ seedKey.charCodeAt(i), 16777619);
  const rand = mulberry32(seed);
  const gauss = () => {
    let u = 0; while (u === 0) u = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
  };
  // Log-normal returns whose median matches the deterministic real return.
  const mu = Math.log(1 + s.rr), sigma = vol / 100;
  const years = endAge - s.age;
  const retireYear = s.fireYear !== null ? s.fireYear : Math.max(0, s.retireAge - s.age);
  const targetYear = Math.max(0, s.retireAge - s.age);
  const paths = Array.from({length: years + 1}, () => new Float64Array(runs));
  let survived = 0, hitTarget = 0;
  for (let r = 0; r < runs; r++) {
    let p = s.totalInv, alive = true, hit = false;
    for (let y = 0; y <= years; y++) {
      paths[y][r] = p;
      if (y === targetYear && p >= s.fireNum) hit = true;
      if (y === years) break;
      const growth = Math.exp(mu + sigma * gauss());
      if (y >= retireYear) {
        const age = s.age + y;
        const health = age < MEDICARE_AGE ? s.healthPre65 : 0;
        const need = Math.max(0, s.expenses + health - s.pensionIncome - (age >= s.ssStartAge ? s.totalSS : 0));
        p = p * growth - need;
        if (p <= 0) { p = 0; alive = false; }
      } else {
        p = p * growth + s.totalC * Math.pow(1 + s.contribGrowth, y);
      }
    }
    if (alive) survived++;
    if (hit || (targetYear > years && p >= s.fireNum)) hitTarget++;
  }
  const pct = (arr, q) => { const a = Array.from(arr).sort((x, y) => x - y); return a[Math.floor(q * (a.length - 1))]; };
  return {
    success: survived / runs,
    targetOdds: hitTarget / runs,
    retireAge: s.age + retireYear,
    endAge, runs,
    labels: paths.map((_, y) => String(s.age + y)),
    p10: paths.map(a => pct(a, 0.1)),
    p50: paths.map(a => pct(a, 0.5)),
    p90: paths.map(a => pct(a, 0.9)),
  };
}
