# Mortgauger

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

## Deploying to a VPS (alongside dicegram-caddy)

Mortgauger runs as a small `caddy:2-alpine` container that joins the existing
`caddy_net` Docker network. The edge Caddy (the one already serving
`dicegram`, `houses`, `pb`, etc.) reverse-proxies `mortgauger.<your-domain>`
to it. No new ports opened, no port conflicts.

### First-time setup

```sh
git clone https://github.com/desastreger/mortgauger.git ~/mortgauger
cd ~/mortgauger
./deploy.sh --print-block
```

That prints the server block to copy into `/root/dicegram/Caddyfile`
(alongside `houses.desastreger.cloud { … }` and `pb.desastreger.cloud { … }`).
Save the file, then:

```sh
docker restart dicegram-caddy   # picks up the new block + fetches a cert
./deploy.sh                     # brings up the mortgauger container
```

### Subsequent updates

```sh
cd ~/mortgauger && git pull && ./deploy.sh
```

The site files are bind-mounted into the container (`/srv` read-only), so
`git pull` alone is usually enough — `./deploy.sh` just confirms the
container is still healthy. Caddy edits aren't needed after the first time.

### Files

- `docker-compose.yml` — mortgauger service definition (joins `caddy_net`).
- `caddy/site.Caddyfile` — runs *inside* the mortgauger container: `file_server`,
  cache headers, dotfile blocking.
- `caddy/mortgauger.caddy` — server block to paste into the edge Caddyfile.
- `deploy.sh` — sanity checks + `docker compose up -d`.

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
