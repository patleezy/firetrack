# FIREtrack 🔥

**Free, private Financial Independence calculator.** Calculate your FIRE number, track your path to early retirement, and model what-if scenarios — all in your browser. No accounts, no data collection, no servers.

## Features

- 🎯 FIRE Number calculator using expected retirement spending
- 🧮 Spending-only and tax-adjusted FIRE numbers
- 🏛️ Social Security and pension income modeling
- 🌉 Social Security bridge/gap surcharge based on projected FIRE age
- 📊 Net worth & portfolio projection charts (60-year horizon)
- ⛵ Coast FIRE calculator
- 💰 Tax picture in retirement (pre-tax vs Roth vs taxable breakdown)
- 🌉 Withdrawal bridge planner for early retirement before 59½
- 👫 Partner / spouse financial tracking
- 🔀 What-If scenario modeling (spending cuts, contributions, windfalls)
- ⚖️ Scenario comparison across saved local profiles
- 🗓️ Milestone timeline and assumption sensitivity ranges
- 💳 Debt inputs with APR context, including credit card rate guidance
- 💾 Local backup / restore for profiles and history
- ✅ Guided check-ins for clean progress snapshots
- 📈 History tracking over time
- 👤 Named local profiles for multiple plans or household scenarios
- 📤 Export to PDF, CSV, text, or email
- ♿ WCAG-focused legibility pass for font sizes, focus states, and color contrast
- 🔒 100% local — all data stays in your browser (localStorage)

## Calculator Model

FIREtrack keeps the core FIRE formula approachable:

```text
FIRE Number = annual retirement spending need / safe withdrawal rate
```

Recent formula updates make the surrounding assumptions more explicit:

- **Current annual household spending** is used for current-budget context, savings rate framing, and emergency fund coverage.
- **Expected annual retirement spending** is used for the FIRE number, projections, bridge planner, tax-adjusted FIRE estimate, and What-If scenarios. If left blank, it falls back to current spending.
- Expenses are treated as after-tax annual living expenses.
- Pension or annuity income is assumed to start at retirement and reduces the steady-state portfolio spending need.
- Social Security is assumed to start at the selected Social Security start age.
- The Social Security bridge surcharge applies only to Social Security, not pension income.
- Projected FIRE age is calculated iteratively so the Social Security bridge follows the projected retirement timing instead of only the target retirement age.
- The tax-adjusted FIRE number is a directional estimate using the current account mix and blended tax logic. Actual taxes depend on withdrawal sequencing, brackets, Roth conversions, and personal circumstances.

## Deployment

Single static HTML file — deploy anywhere.

### Vercel (recommended)
```bash
git clone https://github.com/YOUR_USERNAME/firetrack
cd firetrack
vercel
```

### Local
Just open `index.html` in any browser.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Main app |
| `og-image.png` | Social sharing preview image |
| `vercel.json` | Vercel deployment config + security headers |

## Disclaimer

For educational and planning purposes only — not financial advice. Always consult a licensed financial advisor, CPA, or tax professional before making retirement decisions.
