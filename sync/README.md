# Stash Ledger sync

Optional sync across devices for the Stash Ledger. It's a tiny Cloudflare Worker with a D1 database, on Cloudflare's free tier.

**How it works**
- There are no accounts. Turning sync on gives you a random 20-character **sync code**, and that code is the key to your save.
- The page sends the code only in a request header, never in a URL. The server stores a SHA-256 hash of the code, never the code itself.
- A save holds ticks, goal, Have counts and settings: a few KB of JSON, with a 32 KB limit. Nothing personal.
- Every save has a revision number. If two devices change things at the same time, the second one gets a "changed on another device" answer, and the page asks which progress to keep.
- Only `https://winter-scav-tools.github.io` may call it (CORS). Each save can be written at most about once every 1.5 seconds.
- CORS doesn't stop scripts, so each IP also has rate limits (Workers Rate Limiting, set in `wrangler.toml`): 30 requests a minute in total, and 3 **new** saves a minute. The page writes at most every 2.5 s and just retries after a "slow down", so normal use never notices. The limits are counted per Cloudflare location and are approximate: they stop one script from filling the database, not an attack from many IPs.
- Opening a save refreshes its "last opened" time at most once a day, so reads hardly ever cost a database write.
- Saves nobody has opened or changed for 180 days are deleted by a daily clean-up. Request logs are off.

**Files**
- `worker.js`: the Worker.
- `schema.sql`: the table.
- `wrangler.toml`: the config. It holds no secrets; the database id is an identifier, not a key.
- `test-worker.mjs`: tests with an in-memory database (`node test-worker.mjs`).
- `devserver.mjs`: runs the page and the Worker locally, for testing in a browser.

**Deploying** (needs a free Cloudflare account)
1. `npm install -g wrangler` (or use `npx wrangler`).
2. `npx wrangler login` signs in through the browser. Never paste an API token into a file.
3. `npx wrangler d1 create stash-ledger-sync`, then put the database id it prints into `wrangler.toml`.
4. `npx wrangler d1 execute stash-ledger-sync --remote --file schema.sql`
5. `npx wrangler deploy` prints the Worker URL. Put that URL in `SYNC_API` in `../index.html`.

**Updating the live Worker** (after changing `worker.js` or `wrangler.toml`), from this folder:
1. `npx wrangler@latest whoami`: check it's your account. If not, `npx wrangler@latest login`.
2. `node test-worker.mjs` should say "all passed".
3. `npx wrangler@latest deploy --dry-run` checks the config without uploading; then `npx wrangler@latest deploy`. Its output lists the bindings, including `LIMITER` and `CREATE_LIMITER`.
The URL stays the same, so the page needs no change. The database is untouched by a deploy.

The sync box stays hidden on the page until `SYNC_API` is set.
