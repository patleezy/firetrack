// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// calc.js is a browser classic script; wrap it in a function to collect its declarations.
const code = fs.readFileSync(path.join(__dirname, '..', 'calc.js'), 'utf8');
const calc = vm.runInThisContext(`(function () {\n${code}\nreturn { presentValueOfIncome, projectFireYear,
  computeFireMath, buildProjection, computeState, runMonteCarlo, sanitizeBackup, cleanStr, INPUT_IDS,
  MEDICARE_AGE, FIRE_TYPES, CONTRIB_LIMITS, limitsFor, fillLimitTokens };\n})`, { filename: 'calc.js' })();

const SAMPLE = {
  age: 32, retireAge: 50, salary: 95000, bonus: 8000, expenses: 55000, emergencyMonths: 4,
  k401: 87000, k401Contrib: 23000, rothIra: 22000, hsa: 9500, hsaContrib: 4300,
  brokerage: 34000, brokerageContrib: 5000, homeEquity: 350000, cash: 18000,
  mortgage: 285000, mortgageRate: 6.5, studentLoans: 18000, ccRate: 24.99,
  returnRate: 7, swr: 4, socialSecurity: 18000, ssStartAge: 67, retireTaxRate: 15,
};
const source = (overrides = {}, { hasP = false, fireType = 'regular' } = {}) => {
  const data = { ...SAMPLE, ...overrides };
  const raw = id => (data[id] === undefined ? '' : String(data[id]));
  return { gv: id => parseFloat(raw(id)) || 0, raw, hasP, fireType };
};
const fireAgeOf = s => (s.fireYear === null ? null : s.age + s.fireYear);

test('present value of income', () => {
  assert.equal(calc.presentValueOfIncome(10000, 5, 0), 50000);
  assert.equal(calc.presentValueOfIncome(0, 5, 0.07), 0);
  assert.equal(calc.presentValueOfIncome(10000, 0, 0.07), 0);
  assert.ok(Math.abs(calc.presentValueOfIncome(10000, 10, 0.05) - 77217.35) < 0.01);
});

test('projectFireYear: already there, unreachable, and raises help', () => {
  assert.equal(calc.projectFireYear(1e6, 0, 1e6, 0.07), 0);
  assert.equal(calc.projectFireYear(0, 0, 1e6, 0.07), null);
  const flat = calc.projectFireYear(100000, 20000, 1.5e6, 0.07, 0);
  const growing = calc.projectFireYear(100000, 20000, 1.5e6, 0.07, 0.05);
  assert.ok(growing < flat, `raise growth should shorten the timeline (${growing} vs ${flat})`);
});

test('FIRE number is spending need / SWR with no guaranteed income', () => {
  const m = calc.computeFireMath({ age: 40, retireAge: 70, expenses: 60000, socialSecurityIncome: 0,
    pensionIncome: 12000, ssStartAge: 67, swr: 0.04, rr: 0.05, totalInv: 0, totalC: 0 });
  assert.equal(m.fireNum, 48000 / 0.04);
  assert.equal(m.healthSurcharge, 0);
});

test('Social Security bridge adds the present value of the gap', () => {
  const m = calc.computeFireMath({ age: 60, retireAge: 60, expenses: 60000, socialSecurityIncome: 20000,
    pensionIncome: 0, ssStartAge: 67, swr: 0.04, rr: 0.05, totalInv: 1e7, totalC: 0 });
  assert.equal(m.ssGapYears, 7);
  assert.ok(Math.abs(m.ssGapSurcharge - calc.presentValueOfIncome(20000, 7, 0.05)) < 1e-6);
  assert.ok(Math.abs(m.fireNum - (40000 / 0.04 + m.ssGapSurcharge)) < 1e-6);
});

test('healthcare surcharge applies only before Medicare age', () => {
  const base = { expenses: 50000, socialSecurityIncome: 0, pensionIncome: 0, ssStartAge: 67,
    swr: 0.04, rr: 0.05, totalInv: 1e7, totalC: 0, healthPre65: 10000 };
  const early = calc.computeFireMath({ ...base, age: 55, retireAge: 55 });
  assert.equal(early.healthGapYears, calc.MEDICARE_AGE - 55);
  assert.ok(Math.abs(early.healthSurcharge - calc.presentValueOfIncome(10000, 10, 0.05)) < 1e-6);
  const late = calc.computeFireMath({ ...base, age: 66, retireAge: 66 });
  assert.equal(late.healthSurcharge, 0);
});

test('bridge-age iteration settles conservatively and labels stay consistent', () => {
  // This plan used to oscillate between two FIRE ages and stop on an arbitrary one.
  const s = calc.computeState(source({ healthPre65: 12000 }));
  const fireAge = fireAgeOf(s);
  assert.ok(fireAge !== null);
  assert.ok(s.bridgeStartAge <= fireAge && fireAge - s.bridgeStartAge <= 1);
  assert.equal(s.healthGapYears, calc.MEDICARE_AGE - s.bridgeStartAge);
  assert.equal(s.ssGapYears, s.ssStartAge - s.bridgeStartAge);
  assert.deepEqual(calc.computeState(source({ healthPre65: 12000 })).fireNum, s.fireNum);
});

test('projection withdraws healthcare only until 65', () => {
  const args = { age: 55, totalInv: 2e6, totalC: 0, fireNum: 1, fireYear: 0, expenses: 40000,
    pensionIncome: 0, socialSecurityIncome: 0, ssStartAge: 99, rr: 0 };
  const without = calc.buildProjection(args).pd;
  const withHealth = calc.buildProjection({ ...args, healthPre65: 10000 }).pd;
  const at = age => age - 55;
  assert.equal(without[at(65)] - withHealth[at(65)], 10 * 10000);
  assert.equal(without[at(70)] - withHealth[at(70)], 10 * 10000, 'no healthcare withdrawals after 65');
});

test('employer match counts toward savings; partner fields ignored when partner is off', () => {
  const plain = calc.computeState(source());
  const matched = calc.computeState(source({ k401Match: 5000 }));
  assert.equal(matched.totalC - plain.totalC, 5000);
  assert.ok(matched.savRate > plain.savRate);
  const partnerOff = calc.computeState(source({ partnerSalary: 90000, partner401kMatch: 4000 }));
  assert.equal(partnerOff.totalInc, plain.totalInc);
  assert.equal(partnerOff.totalC, plain.totalC);
  const partnerOn = calc.computeState(source({ partnerSalary: 90000, partner401kMatch: 4000 }, { hasP: true }));
  assert.equal(partnerOn.totalC - plain.totalC, 4000);
});

test('Monte Carlo is deterministic per plan and varies across plans', () => {
  const s = calc.computeState(source());
  const a = calc.runMonteCarlo(s, 15, 200);
  const b = calc.runMonteCarlo(s, 15, 200);
  assert.equal(a.success, b.success);
  assert.ok(a.success >= 0 && a.success <= 1);
  const other = calc.runMonteCarlo(calc.computeState(source({ brokerage: 34001 })), 15, 200);
  assert.notDeepEqual(other.p50, a.p50);
  assert.equal(calc.runMonteCarlo({ ...s, fireNum: 0 }, 15), null);
});

test('backup import keeps known fields only and cannot inject markup', () => {
  const backup = {
    activeId: 'b',
    profiles: [
      { id: 'a', name: 'One', data: { age: '40' } },
      { id: 'b', name: '<img src=x onerror=alert(1)>Two', createdAt: 'nope',
        data: { age: '35"><script>', _partnerOpen: true, _fireType: 'fat', evil: 'x' },
        history: [{ ts: '2026-01-01', label: '<b>', netWorth: 'NaN', fireAge: 50 }, { ts: 'bad' }] },
    ],
  };
  const out = calc.sanitizeBackup(backup);
  const two = out.profiles[1];
  assert.equal(out.activeId, two.id, 'active profile maps to its new id');
  assert.notEqual(two.id, 'b', 'ids are regenerated');
  assert.ok(!/[<>"]/.test(two.name) && !/[<>"]/.test(two.data.age));
  assert.equal(two.data.evil, undefined);
  assert.equal(two.data._partnerOpen, true);
  assert.equal(two.data._fireType, 'fat');
  assert.equal(two.history.length, 1);
  assert.equal(two.history[0].netWorth, 0);
  assert.equal(out.profiles[0].data._partnerOpen, false);
  assert.equal(out.profiles[0].data._fireType, undefined);
});

test('backup import rejects non-boolean partner flags and unknown FIRE types', () => {
  const out = calc.sanitizeBackup({ profiles: [{ data: { _partnerOpen: 'true', _fireType: 'regular"]' } }] });
  assert.equal(out.profiles[0].data._partnerOpen, false);
  assert.equal(out.profiles[0].data._fireType, undefined);
  const many = calc.sanitizeBackup({ profiles: Array.from({ length: 80 }, () => ({ data: {} })) });
  assert.equal(many.profiles.length, 50);
});

test('contribution limits pick the right tax year', () => {
  assert.equal(calc.limitsFor(2026).k401, 24500);
  assert.equal(calc.limitsFor(2027).k401, 25500);
  assert.equal(calc.limitsFor(2027).hsaSelf, 4500);
  const latest = Math.max(...Object.keys(calc.CONTRIB_LIMITS).map(Number));
  assert.equal(calc.limitsFor(latest + 3).year, latest, 'future years fall back to the latest known');
  assert.equal(calc.limitsFor(1999).year, Math.min(...Object.keys(calc.CONTRIB_LIMITS).map(Number)));
  for (const L of Object.values(calc.CONTRIB_LIMITS)) {
    assert.ok(L.k401CatchUp6063 > L.k401CatchUp50 && L.hsaFamily > L.hsaSelf && L.total415c > L.k401);
    assert.ok(L.rothSingle[0] < L.rothSingle[1] && L.rothJoint[0] < L.rothJoint[1]);
  }
});

test('help-text placeholders are filled with formatted limits', () => {
  const L = calc.limitsFor(2026);
  assert.equal(calc.fillLimitTokens('{{year}}: {{k401}} ({{k401_50}} if 50+)', L), '2026: $24,500 ($32,500 if 50+)');
  assert.equal(calc.fillLimitTokens('{{k401_6063}} / {{ira_50}} / {{rothJoint}}', L), '$35,750 / $8,600 / $242K–$252K');
  assert.equal(calc.fillLimitTokens('{{unknown}} stays', L), '{{unknown}} stays');
});
