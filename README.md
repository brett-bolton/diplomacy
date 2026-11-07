# Diplomacy companion

A phone-first companion app for playing the physical *Diplomacy* board game at the table.

- Players submit orders privately from their phones (join by QR code, no install).
- Orders are built from lists of legal options and locked in with a 2-step submit.
- An optional turn timer is run by the game master.
- Orders are adjudicated per the 5th edition (2008) rulebook, verified against the DATC test suite, with a plain-English explanation for every result.
- Every phase is stored, so the group can step back through the game on the map.

Not affiliated with Hasbro or Avalon Hill. *Diplomacy* is a trademark of Hasbro, Inc.

## Development

```bash
npm install
neon link --project-id round-fog-72255858   # once; pulls DATABASE_URL into .env.local
neon checkout dev                           # work against the dev database branch
npm run db:migrate                          # apply migrations (uses the direct URL)
npm run dev                                 # http://localhost:3000
npm test                                    # engine, DATC suite and API tests
npm run typecheck
```

- **Database:** Neon Postgres. `production` branch for the live app, `dev` branch for local work and Vercel previews. Tests use PGlite (in-process Postgres), so they need no network.
- **Schema changes:** edit `src/server/schema.ts`, run `npm run db:generate`, then `npm run db:migrate` against `dev`. Before deploying, migrate `production` too.
- **Secrets:** `.env.local` is git-ignored and filled by `neon env pull` / `vercel env pull`. Never commit connection strings.
- **Optional:** set `GAME_CREATE_PASSPHRASE` (locally and in Vercel) so only your group can create games.

## Deploying

The repo is linked to the Vercel project `diplomacy`. `DATABASE_URL` is set for Production (Neon `production` branch), Preview and Development (Neon `dev` branch).

```bash
vercel          # preview deployment
vercel --prod   # production
```

## Layout

- `src/engine/` — pure, deterministic rules engine (map, legal orders, adjudicator, phases). No I/O. See `src/engine/README.md` for every rule choice.
- `src/server/` — Drizzle schema, game service (all the rules about who can do what, when) and route-handler helpers.
- `src/app/` — Next.js pages and `/api/games/*` route handlers.
- `src/ui/` — phone UI components. `src/map/` — the board renderer.

## License

Code: MIT (see `LICENSE`). The adapted map artwork is CC BY-SA 3.0 (see `LICENSE-map.md`).
