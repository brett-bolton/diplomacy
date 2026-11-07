// Backend tests (test plan A5 + A6) against an in-process Postgres (PGlite).

import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { migrate } from "drizzle-orm/pglite/migrator"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { Db } from "./db"
import {
  GameError,
  createGame,
  extendTimer,
  getHistory,
  getView,
  issueJoinToken,
  joinGame,
  recordDraw,
  saveDraft,
  setTimer,
  submitOrders,
  tickChecklist,
  type Credentials,
} from "./games"
import * as schema from "./schema"
import { setNowForTests } from "./tokens"

let db: Db

beforeEach(async () => {
  const client = new PGlite()
  const d = drizzle(client, { schema })
  await migrate(d, { migrationsFolder: "./drizzle" })
  db = d as unknown as Db
  setNowForTests(new Date("2026-11-07T20:00:00Z"))
})

afterEach(() => setNowForTests(undefined))

let clock = new Date("2026-11-07T20:00:00Z").getTime()
function tick(ms: number) {
  clock += ms
  setNowForTests(new Date(clock))
}
beforeEach(() => {
  clock = new Date("2026-11-07T20:00:00Z").getTime()
})

const SEVEN = ["Austria", "England", "France", "Germany", "Italy", "Russia", "Turkey"]

/** 7-player game; seat i = POWERS[i] (AUS, ENG, FRA, GER, ITA, RUS, TUR). Optional standalone GM. */
async function sevenPlayerGame(opts: { standaloneGm?: boolean } = {}) {
  const parts = SEVEN.map((name, seat) => ({ name, seat, isGameMaster: !opts.standaloneGm && seat === 0 }))
  if (opts.standaloneGm) parts.push({ name: "GM", seat: null as unknown as number, isGameMaster: true })
  const { code, creatorToken } = await createGame(db, { name: "Test", playerCount: 7, participants: parts })
  const creator: Credentials = { creatorToken }
  const view = await getView(db, code, creator)
  const phones: Record<string, Credentials> = {}
  for (const p of view.participants) {
    const token = await issueJoinToken(db, code, creator, p.id, false)
    const { deviceToken } = await joinGame(db, code, token)
    phones[p.name] = { deviceToken }
  }
  return { code, creator, phones }
}

async function expectError(p: Promise<unknown>, status: number, match?: RegExp) {
  const err = await p.then(
    () => null,
    (e) => e,
  )
  expect(err, "expected an error").toBeInstanceOf(GameError)
  expect((err as GameError).status).toBe(status)
  if (match) expect((err as GameError).message).toMatch(match)
}

describe("creating and joining", () => {
  it("requires every seat filled exactly once and exactly one game master", async () => {
    await expectError(createGame(db, { name: "x", playerCount: 2, participants: [{ name: "A", seat: 0, isGameMaster: true }] }), 400, /seat/)
    await expectError(
      createGame(db, { name: "x", playerCount: 2, participants: [{ name: "A", seat: 0, isGameMaster: false }, { name: "B", seat: 1, isGameMaster: false }] }),
      400,
      /game master/,
    )
  })

  it("checks the passphrase when one is configured", async () => {
    process.env.GAME_CREATE_PASSPHRASE = "secret"
    try {
      const parts = [{ name: "A", seat: 0, isGameMaster: true }, { name: "B", seat: 1, isGameMaster: false }]
      await expectError(createGame(db, { name: "x", playerCount: 2, participants: parts, passphrase: "nope" }), 403)
      await expect(createGame(db, { name: "x", playerCount: 2, participants: parts, passphrase: "secret" })).resolves.toBeTruthy()
    } finally {
      delete process.env.GAME_CREATE_PASSPHRASE
    }
  })

  it("join tokens work once; reset signs the old phone out", async () => {
    const { code, creator } = await sevenPlayerGame()
    const view = await getView(db, code, creator)
    const france = view.participants.find((p) => p.name === "France")!
    const t1 = await issueJoinToken(db, code, creator, france.id, false)
    const { deviceToken: oldPhone } = await joinGame(db, code, t1)
    await expectError(joinGame(db, code, t1), 404)
    expect((await getView(db, code, { deviceToken: oldPhone })).me.powers).toEqual(["FRA"])

    const t2 = await issueJoinToken(db, code, creator, france.id, true)
    expect((await getView(db, code, { deviceToken: oldPhone })).me.participantId).toBeNull()
    const { deviceToken: newPhone } = await joinGame(db, code, t2)
    expect((await getView(db, code, { deviceToken: newPhone })).me.powers).toEqual(["FRA"])
  })

  it("only the creator can issue join links or record a draw", async () => {
    const { code, phones } = await sevenPlayerGame()
    const view = await getView(db, code, phones.France)
    await expectError(issueJoinToken(db, code, phones.France, view.participants[0].id, false), 403)
    await expectError(recordDraw(db, code, phones.France), 403)
  })

  it("stores tokens hashed, never in plain text", async () => {
    const { code, phones } = await sevenPlayerGame()
    const rows = await db.select().from(schema.participants)
    const all = JSON.stringify(rows)
    expect(all).not.toContain(phones.France.deviceToken!)
    const [game] = await db.select().from(schema.games).where(eq(schema.games.code, code))
    expect(game.creatorTokenHash).toHaveLength(64)
  })
})

describe("orders and privacy", () => {
  it("never shows another power's orders before adjudication", async () => {
    const { code, phones, creator } = await sevenPlayerGame({ standaloneGm: true })
    await saveDraft(db, code, phones.France, "FRA", [{ kind: "move", unit: "par", to: { province: "pic" } }])
    await submitOrders(db, code, phones.France, "r1")
    for (const who of [phones.England, phones.GM, creator, {}]) {
      const raw = JSON.stringify(await getView(db, code, who))
      expect(raw).not.toContain('"pic"')
    }
    const english = await getView(db, code, phones.England)
    expect(english.powers.find((p) => p.power === "FRA")?.submitted).toBe(true)
    expect(english.myOrders.every((o) => o.power === "ENG")).toBe(true)
    // History shows nothing for the open phase.
    const hist = await getHistory(db, code, phones.England)
    expect(hist.at(-1)?.orders).toEqual([])
    expect(JSON.stringify(hist)).not.toContain('"pic"')
  })

  it("rejects orders for other powers, from non-players, and invalid orders", async () => {
    const { code, phones, creator } = await sevenPlayerGame({ standaloneGm: true })
    await expectError(saveDraft(db, code, phones.England, "FRA", []), 403)
    await expectError(saveDraft(db, code, phones.GM, "FRA", []), 403)
    await expectError(saveDraft(db, code, creator, "FRA", []), 403)
    await expectError(saveDraft(db, code, phones.France, "FRA", [{ kind: "move", unit: "par", to: { province: "mar" } }]), 400)
    await expectError(saveDraft(db, code, phones.France, "FRA", [{ kind: "move", unit: "lon", to: { province: "nth" } }]), 400)
    await expectError(
      saveDraft(db, code, phones.France, "FRA", [
        { kind: "hold", unit: "par" },
        { kind: "move", unit: "par", to: { province: "bur" } },
      ]),
      400,
    )
  })

  it("locks orders on submit; retrying the submit is harmless", async () => {
    const { code, phones } = await sevenPlayerGame()
    await saveDraft(db, code, phones.France, "FRA", [{ kind: "move", unit: "par", to: { province: "bur" } }])
    await submitOrders(db, code, phones.France, "r1")
    await expectError(saveDraft(db, code, phones.France, "FRA", []), 409, /locked/)
    await expect(submitOrders(db, code, phones.France, "r1")).resolves.toEqual({ adjudicated: false })
  })

  it("adjudicates exactly once when the last power submits, then opens Fall", async () => {
    const { code, phones } = await sevenPlayerGame()
    await saveDraft(db, code, phones.France, "FRA", [{ kind: "move", unit: "par", to: { province: "bur" } }])
    const names = SEVEN
    const results = await Promise.all(names.map((n, i) => submitOrders(db, code, phones[n], `r${i}`)))
    expect(results.filter((r) => r.adjudicated)).toHaveLength(1)
    const view = await getView(db, code, phones.France)
    expect(view.phase.label).toBe("Fall 1901 · Orders")
    expect(view.state.units.some((u) => u.power === "FRA" && u.location.province === "bur")).toBe(true)
    const hist = await getHistory(db, code, phones.England)
    const spring = hist.find((h) => h.label === "Spring 1901 · Orders")!
    expect(spring.trigger).toBe("all_submitted")
    expect(spring.orders.find((o) => o.power === "FRA")?.orders).toEqual([{ kind: "move", unit: "par", to: { province: "bur" } }])
    expect(spring.record?.explanations?.par.verdict).toBe("Succeeds")
  })

  it("lets one confirmation lock all of a player's powers (3-player game)", async () => {
    const { code, creatorToken } = await createGame(db, {
      name: "3p",
      playerCount: 3,
      participants: [
        { name: "A", seat: 0, isGameMaster: true },
        { name: "B", seat: 1, isGameMaster: false },
        { name: "C", seat: 2, isGameMaster: false },
      ],
    })
    const creator = { creatorToken }
    const v = await getView(db, code, creator)
    const phone = async (name: string) => {
      const t = await issueJoinToken(db, code, creator, v.participants.find((p) => p.name === name)!.id, false)
      return { deviceToken: (await joinGame(db, code, t)).deviceToken }
    }
    const a = await phone("A")
    expect((await getView(db, code, a)).me.powers).toEqual(["ENG", "GER", "AUS"])
    await submitOrders(db, code, a, "x")
    const after = await getView(db, code, a)
    expect(after.powers.filter((p) => p.submitted).map((p) => p.power).sort()).toEqual(["AUS", "ENG", "GER"])
  })
})

describe("turn timer", () => {
  it("only the game master sets and extends it", async () => {
    const { code, phones } = await sevenPlayerGame({ standaloneGm: true })
    await expectError(setTimer(db, code, phones.France, 10), 403)
    await setTimer(db, code, phones.GM, 10)
    await expectError(setTimer(db, code, phones.GM, 10), 409, /already running/)
    await expectError(extendTimer(db, code, phones.France), 403)
    await extendTimer(db, code, phones.GM)
    const v = await getView(db, code, phones.France)
    expect(new Date(v.phase.deadlineAt!).getTime() - new Date(v.serverNow).getTime()).toBe(15 * 60_000)
    expect(v.phase.timerExtensions).toBe(1)
  })

  it("a player-GM can run the timer too", async () => {
    const { code, phones } = await sevenPlayerGame()
    await setTimer(db, code, phones.Austria, 5)
    expect((await getView(db, code, phones.France)).phase.deadlineAt).not.toBeNull()
  })

  it("closes ordering at expiry, ignores drafts, and adjudicates once on the next read", async () => {
    const { code, phones } = await sevenPlayerGame({ standaloneGm: true })
    await saveDraft(db, code, phones.France, "FRA", [{ kind: "move", unit: "par", to: { province: "bur" } }]) // never submitted
    await saveDraft(db, code, phones.Germany, "GER", [{ kind: "move", unit: "mun", to: { province: "ruh" } }])
    await submitOrders(db, code, phones.Germany, "g")
    await setTimer(db, code, phones.GM, 5)
    tick(5 * 60_000)
    await expectError(extendTimer(db, code, phones.GM), 409)
    await expectError(saveDraft(db, code, phones.France, "FRA", []), 409)
    const views = await Promise.all([getView(db, code, phones.France), getView(db, code, phones.England), getView(db, code, phones.GM)])
    expect(views.every((v) => v.phase.label === "Fall 1901 · Orders")).toBe(true)
    const hist = await getHistory(db, code, phones.France)
    expect(hist.filter((h) => h.label === "Spring 1901 · Orders")).toHaveLength(1)
    const spring = hist[0]
    expect(spring.trigger).toBe("timer_expired")
    const units = views[0].state.units
    expect(units.some((u) => u.power === "FRA" && u.location.province === "par")).toBe(true) // draft ignored
    expect(units.some((u) => u.power === "GER" && u.location.province === "ruh")).toBe(true) // submitted counted
    // The new phase has no timer and France orders normally.
    expect(views[0].phase.deadlineAt).toBeNull()
    await saveDraft(db, code, phones.France, "FRA", [{ kind: "move", unit: "par", to: { province: "bur" } }])
    await expect(submitOrders(db, code, phones.France, "f2")).resolves.toEqual({ adjudicated: false })
  })

  it("a submit just before the deadline counts", async () => {
    const { code, phones } = await sevenPlayerGame({ standaloneGm: true })
    await setTimer(db, code, phones.GM, 1)
    tick(59_000)
    await saveDraft(db, code, phones.France, "FRA", [{ kind: "move", unit: "par", to: { province: "bur" } }])
    await submitOrders(db, code, phones.France, "f")
    tick(2_000)
    const v = await getView(db, code, phones.France)
    expect(v.state.units.some((u) => u.power === "FRA" && u.location.province === "bur")).toBe(true)
  })
})

describe("physical moves checklist", () => {
  it("is shared between phones and can be marked done", async () => {
    const { code, phones } = await sevenPlayerGame()
    await saveDraft(db, code, phones.France, "FRA", [{ kind: "move", unit: "par", to: { province: "bur" } }])
    for (const [i, n] of SEVEN.entries()) await submitOrders(db, code, phones[n], `r${i}`)
    const v = await getView(db, code, phones.England)
    expect(v.checklist?.steps.map((s) => s.text)).toEqual(["Move A Par → Bur"])
    await tickChecklist(db, code, phones.England, v.checklist!.phaseId, { index: 0, done: true })
    expect((await getView(db, code, phones.Italy)).checklist?.ticks).toEqual([0])
    await tickChecklist(db, code, phones.Italy, v.checklist!.phaseId, { synced: true })
    expect((await getView(db, code, phones.France)).checklist).toBeNull()
  })
})

describe("draws", () => {
  it("lets the creator record a draw and ends the game", async () => {
    const { code, creator, phones } = await sevenPlayerGame()
    await recordDraw(db, code, creator)
    const v = await getView(db, code, phones.France)
    expect(v.game.status).toBe("finished")
    expect(v.game.result).toEqual({ kind: "draw" })
    await expectError(saveDraft(db, code, phones.France, "FRA", []), 409)
  })
})

