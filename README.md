# Mortgager

A static, no-build UK mortgage scenario calculator.

Compare purchase mortgages side-by-side, or remortgage from a given year of an
existing scenario. Real lender rates (May 2026), capital repayment / interest-only /
offset / part-and-part, SDLT (England & NI), overpayments (fixed £ or %), and a
rate-shock stress test against the lender's revert SVR.

## Running locally

It's a static site — three options:

```sh
python -m http.server 8000
```

```sh
npx serve .
```

Or any static-file server. Open <http://localhost:8000>.

ES modules don't work over `file://` in browsers, so a server is required.

## Deploying to a VPS (Caddy)

First time on the box:

```sh
git clone https://github.com/desastreger/mortgager.git ~/mortgager
cd ~/mortgager
chmod +x deploy.sh
MORTGAGER_DOMAIN=mortgager.yourdomain.com ./deploy.sh --caddy
```

`deploy.sh --caddy` renders `caddy/mortgager.caddy` with your repo path and
domain, drops it into `/etc/caddy/Caddyfile.d/mortgager.caddy`, validates, and
reloads Caddy. The main `/etc/caddy/Caddyfile` must import the snippet
directory once:

```caddy
import /etc/caddy/Caddyfile.d/*.caddy
```

Subsequent updates:

```sh
cd ~/mortgager && git pull && ./deploy.sh --caddy
```

Or skip `--caddy` if you only changed app code (Caddy serves directly from the
working tree, no rebuild needed — `git pull` is sufficient).

## Project layout

```
index.html       markup
styles.css       editorial typography + 5-col instrument-panel layout
data.js          UK lender rates, SVRs, SDLT bands, BoE Bank Rate
calc.js          pure mortgage maths (amortisation, SDLT, overpayments)
app.js           UI, state, dashboard rendering, mode switch
```

## Modes

- **Purchase** — buyer's situation in a master block, scenarios per lender below.
- **Remortgage** — current property value + outstanding balance instead of deposit;
  no SDLT. Click `↦ Remortgage` on any purchase scenario to fast-forward to a
  specific year's balance (overpayments and rate path included).
