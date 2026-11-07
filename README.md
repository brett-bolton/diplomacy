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
npm run dev        # http://localhost:3000
npm test           # rules engine + DATC suite
npm run typecheck
```

`DATABASE_URL` (Neon Postgres) and `GAME_CREATE_PASSPHRASE` go in `.env.local`, never in the repo.

## Layout

- `src/engine/` — pure, deterministic rules engine (map, legal orders, adjudicator, phases). No I/O.
- `src/app/` — Next.js routes and UI.
- `src/db/` — Drizzle schema for Neon Postgres.

## License

Code: MIT (see `LICENSE`). The adapted map artwork is CC BY-SA 3.0 (see `LICENSE-map.md`).
