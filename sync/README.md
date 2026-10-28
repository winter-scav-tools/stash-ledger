# Stash Ledger sync

Optional sync across devices for the Stash Ledger. It's a tiny Cloudflare Worker with a D1 database, on Cloudflare's free tier.

**How it works**
- There are no accounts. Turning sync on gives you a random 20-character **sync code**, and that code is the key to your save.
- The page sends the code only in a request header, never in a URL. The server stores a SHA-256 hash of the code, never the code itself.
- A save holds ticks, goal, Have counts and settings: a few KB of JSON, with a 32 KB limit. Nothing personal.
- Every save has a revision number. If two devices change things at the same time, the second one gets a "changed on another device" answer, and the page asks which progress to keep.
- Only `https://winter-scav-tools.github.io` may call it (CORS). Each save can be written at most about once every 1.5 seconds.
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

The sync box stays hidden on the page until `SYNC_API` is set.
