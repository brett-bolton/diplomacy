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


describe("Winter builds (reinforcement round)", () => {
  /**
   * 7-player game from a custom Fall 1901 position: only Russia has units.
   * Its St Petersburg fleet is out in the Gulf of Bothnia and its army takes
   * Rumania this Fall, so Russia gets one build with Moscow (inland) and
   * St Petersburg (two coasts) empty.
   */
  async function russiaWithOneBuild() {
    const parts = SEVEN.map((name, seat) => ({ name, seat, isGameMaster: seat === 0 }))
    const { code, creatorToken } = await createGame(db, {
      name: "Builds",
      playerCount: 7,
      participants: parts,
      custom: {
        year: 1901,
        season: "fall",
        units: [
          { power: "RUS", type: "A", location: { province: "war" } },
          { power: "RUS", type: "F", location: { province: "sev" } },
          { power: "RUS", type: "F", location: { province: "bot" } },
          { power: "RUS", type: "A", location: { province: "rum" } },
        ],
        owners: { mos: "RUS", stp: "RUS", war: "RUS", sev: "RUS" },
      },
    })
    const creator = { creatorToken }
    const v = await getView(db, code, creator)
    const t = await issueJoinToken(db, code, creator, v.participants.find((p) => p.name === "Russia")!.id, false)
    const russia = { deviceToken: (await joinGame(db, code, t)).deviceToken }
    await submitOrders(db, code, russia, "fall") // all hold; Russia keeps Rumania
    const winter = await getView(db, code, russia)
    return { code, russia, winter, creator }
  }

  it("gives Russia one build after taking Rumania", async () => {
    const { winter } = await russiaWithOneBuild()
    expect(winter.phase.label).toBe("Winter 1901 · Builds")
    const rus = winter.powers.find((p) => p.power === "RUS")!
    expect(rus.supplyCenters).toBe(5)
    expect(rus.adjustment).toBe(1)
    expect(rus.required).toBe(true)
  })

  it("rejects impossible builds", async () => {
    const { code, russia } = await russiaWithOneBuild()
    const bad = [
      { kind: "build", unitType: "F", at: { province: "mos" } }, // fleet inland
      { kind: "build", unitType: "F", at: { province: "stp" } }, // coast not chosen
      { kind: "build", unitType: "A", at: { province: "war" } }, // occupied
      { kind: "build", unitType: "A", at: { province: "rum" } }, // not a home center
    ] as const
    for (const o of bad) await expectError(saveDraft(db, code, russia, "RUS", [o]), 400)
    await expectError(
      saveDraft(db, code, russia, "RUS", [
        { kind: "build", unitType: "A", at: { province: "mos" } },
        { kind: "build", unitType: "F", at: { province: "stp", coast: "nc" } },
      ]),
      400,
      /at most 1/,
    )
  })

  it("builds a fleet on the chosen coast of St Petersburg", async () => {
    const { code, russia } = await russiaWithOneBuild()
    await saveDraft(db, code, russia, "RUS", [{ kind: "build", unitType: "F", at: { province: "stp", coast: "nc" } }])
    // Changing your mind before locking in: switch to the south coast.
    await saveDraft(db, code, russia, "RUS", [{ kind: "build", unitType: "F", at: { province: "stp", coast: "sc" } }])
    await submitOrders(db, code, russia, "winter")
    const spring = await getView(db, code, russia)
    expect(spring.phase.label).toBe("Spring 1902 · Orders")
    expect(spring.state.units).toContainEqual({ power: "RUS", type: "F", location: { province: "stp", coast: "sc" } })
    expect(spring.state.units.filter((u) => u.power === "RUS")).toHaveLength(5)
    expect(spring.checklist?.steps.map((s) => s.text)).toEqual(["Place a new Russian fleet in StP/sc"])
    const hist = await getHistory(db, code, russia)
    const winter = hist.find((h) => h.label === "Winter 1901 · Builds")!
    expect(winter.record?.adjustments?.built).toEqual([{ power: "RUS", type: "F", location: { province: "stp", coast: "sc" } }])
  })

  it("builds an army in an inland home center", async () => {
    const { code, russia } = await russiaWithOneBuild()
    await saveDraft(db, code, russia, "RUS", [{ kind: "build", unitType: "A", at: { province: "mos" } }])
    await submitOrders(db, code, russia, "winter")
    const spring = await getView(db, code, russia)
    expect(spring.state.units).toContainEqual({ power: "RUS", type: "A", location: { province: "mos" } })
  })

  it("waives the build when none is chosen", async () => {
    const { code, russia } = await russiaWithOneBuild()
    await submitOrders(db, code, russia, "winter")
    const spring = await getView(db, code, russia)
    expect(spring.phase.label).toBe("Spring 1902 · Orders")
    expect(spring.state.units.filter((u) => u.power === "RUS")).toHaveLength(4)
  })

  it("ignores a build that wasn't locked in when the timer runs out", async () => {
    const { code, russia, creator } = await russiaWithOneBuild()
    // Austria's player is the game master in this game.
    const v = await getView(db, code, creator)
    const t = await issueJoinToken(db, code, creator, v.participants.find((p) => p.isGameMaster)!.id, false)
    const gm = { deviceToken: (await joinGame(db, code, t)).deviceToken }
    await saveDraft(db, code, russia, "RUS", [{ kind: "build", unitType: "F", at: { province: "stp", coast: "sc" } }])
    await setTimer(db, code, gm, 5)
    tick(5 * 60_000)
    await expectError(saveDraft(db, code, russia, "RUS", []), 409, /Time's up/)
    const spring = await getView(db, code, russia)
    expect(spring.phase.label).toBe("Spring 1902 · Orders")
    expect(spring.state.units.filter((u) => u.power === "RUS")).toHaveLength(4)
  })
})

describe("Winter disbands (reinforcement round)", () => {
  /**
   * 7-player game from a custom Fall 1901 position. Russia owns its four home
   * centers but has five units (six for two disbands), none on another supply
   * center, so after an all-hold Fall it must disband. Turkey has one army in
   * Constantinople and one center, so it has nothing to do in Winter.
   * Under the default civil-disorder rule (farthest from home first, fleets
   * before armies, then alphabetical) Russia's order is F Bot, A Lvn, A Pru, A Ukr.
   */
  async function russiaWithDisbands(count: 1 | 2) {
    const parts = SEVEN.map((name, seat) => ({ name, seat, isGameMaster: seat === 0 }))
    const { code, creatorToken } = await createGame(db, {
      name: "Disbands",
      playerCount: 7,
      participants: parts,
      custom: {
        year: 1901,
        season: "fall",
        units: [
          { power: "RUS", type: "A", location: { province: "war" } },
          { power: "RUS", type: "F", location: { province: "sev" } },
          { power: "RUS", type: "F", location: { province: "bot" } },
          { power: "RUS", type: "A", location: { province: "ukr" } },
          { power: "RUS", type: "A", location: { province: "lvn" } },
          ...(count === 2 ? [{ power: "RUS" as const, type: "A" as const, location: { province: "pru" } }] : []),
          { power: "TUR", type: "A", location: { province: "con" } },
        ],
        owners: { mos: "RUS", stp: "RUS", war: "RUS", sev: "RUS", con: "TUR" },
      },
    })
    const creator = { creatorToken }
    const v = await getView(db, code, creator)
    const join = async (name: string) => {
      const t = await issueJoinToken(db, code, creator, v.participants.find((p) => p.name === name)!.id, false)
      return { deviceToken: (await joinGame(db, code, t)).deviceToken }
    }
    const russia = await join("Russia")
    const turkey = await join("Turkey")
    await submitOrders(db, code, turkey, "fall") // all hold; nothing changes hands
    await submitOrders(db, code, russia, "fall")
    const winter = await getView(db, code, russia)
    return { code, russia, turkey, winter, creator }
  }

  const russianUnits = (view: Awaited<ReturnType<typeof getView>>) =>
    view.state.units
      .filter((u) => u.power === "RUS")
      .map((u) => `${u.type} ${u.location.province}`)
      .sort()

  it("makes Russia disband when it has more units than supply centers", async () => {
    const one = await russiaWithDisbands(1)
    expect(one.winter.phase.label).toBe("Winter 1901 · Builds")
    const rus = one.winter.powers.find((p) => p.power === "RUS")!
    expect(rus.supplyCenters).toBe(4)
    expect(rus.adjustment).toBe(-1)
    expect(rus.required).toBe(true)
    // Nobody else has anything to do this Winter.
    expect(one.winter.powers.filter((p) => p.required).map((p) => p.power)).toEqual(["RUS"])

    const two = await russiaWithDisbands(2)
    expect(two.winter.powers.find((p) => p.power === "RUS")!.adjustment).toBe(-2)
  })

  it("removes exactly the unit the player picks", async () => {
    const { code, russia } = await russiaWithDisbands(1)
    await saveDraft(db, code, russia, "RUS", [{ kind: "remove", unit: "lvn" }])
    // Changing your mind before locking in: disband Ukraine instead.
    await saveDraft(db, code, russia, "RUS", [{ kind: "remove", unit: "ukr" }])
    await submitOrders(db, code, russia, "winter")
    const spring = await getView(db, code, russia)
    expect(spring.phase.label).toBe("Spring 1902 · Orders")
    expect(russianUnits(spring)).toEqual(["A lvn", "A war", "F bot", "F sev"])
    expect(spring.checklist?.steps.map((s) => s.text)).toEqual(["Remove Russia's A Ukr"])
    const hist = await getHistory(db, code, russia)
    const winter = hist.find((h) => h.label === "Winter 1901 · Builds")!
    expect(winter.record?.adjustments?.removed).toEqual([{ power: "RUS", type: "A", location: { province: "ukr" } }])
    expect(winter.record?.adjustments?.civilDisorder).toEqual([])
  })

  it("removes both units when two disbands are due", async () => {
    const { code, russia } = await russiaWithDisbands(2)
    await saveDraft(db, code, russia, "RUS", [
      { kind: "remove", unit: "war" },
      { kind: "remove", unit: "sev" },
    ])
    await submitOrders(db, code, russia, "winter")
    const spring = await getView(db, code, russia)
    expect(russianUnits(spring)).toEqual(["A lvn", "A pru", "A ukr", "F bot"])
    expect(spring.checklist?.steps.map((s) => s.text)).toEqual(["Remove Russia's A War", "Remove Russia's F Sev"])
  })

  it("rejects disbanding a unit that isn't yours, twice, or too many", async () => {
    const { code, russia, turkey } = await russiaWithDisbands(1)
    await expectError(saveDraft(db, code, russia, "RUS", [{ kind: "remove", unit: "con" }]), 400, /isn't yours/) // Turkey's army
    await expectError(saveDraft(db, code, russia, "RUS", [{ kind: "remove", unit: "mos" }]), 400, /isn't yours/) // empty home center
    await expectError(saveDraft(db, code, russia, "RUS", [{ kind: "build", unitType: "A", at: { province: "mos" } }]), 400, /disbands, not builds/)
    // Russia can't give Turkey's orders, Turkey has nothing to disband, and Turkey can't disband for Russia.
    await expectError(saveDraft(db, code, russia, "TUR", [{ kind: "remove", unit: "con" }]), 403)
    await expectError(saveDraft(db, code, turkey, "TUR", [{ kind: "remove", unit: "con" }]), 400, /No builds or disbands/)
    await expectError(saveDraft(db, code, turkey, "RUS", [{ kind: "remove", unit: "ukr" }]), 403)
    await expectError(
      saveDraft(db, code, russia, "RUS", [
        { kind: "remove", unit: "ukr" },
        { kind: "remove", unit: "lvn" },
      ]),
      400,
      /exactly 1/,
    )

    const two = await russiaWithDisbands(2)
    await expectError(
      saveDraft(db, two.code, two.russia, "RUS", [
        { kind: "remove", unit: "ukr" },
        { kind: "remove", unit: "ukr" },
      ]),
      400,
      /already being disbanded/,
    )
    await expectError(
      saveDraft(db, two.code, two.russia, "RUS", [
        { kind: "remove", unit: "ukr" },
        { kind: "remove", unit: "lvn" },
        { kind: "remove", unit: "pru" },
      ]),
      400,
      /exactly 2/,
    )

    // None of the rejected drafts stuck: locking in leaves it to the civil-disorder rule.
    await submitOrders(db, code, russia, "winter")
    const spring = await getView(db, code, russia)
    expect(russianUnits(spring)).toEqual(["A lvn", "A ukr", "A war", "F sev"])
    expect(spring.state.units).toContainEqual({ power: "TUR", type: "A", location: { province: "con" } })
  })

  it("removes the rest by the civil-disorder rule when too few are chosen", async () => {
    const { code, russia } = await russiaWithDisbands(2)
    await saveDraft(db, code, russia, "RUS", [{ kind: "remove", unit: "ukr" }])
    await submitOrders(db, code, russia, "winter")
    const spring = await getView(db, code, russia)
    expect(russianUnits(spring)).toEqual(["A lvn", "A pru", "A war", "F sev"])
    expect(spring.checklist?.steps.map((s) => s.text)).toEqual([
      "Remove Russia's A Ukr",
      "Remove Russia's F Bot (removed by the civil-disorder rule)",
    ])
    const hist = await getHistory(db, code, russia)
    const winter = hist.find((h) => h.label === "Winter 1901 · Builds")!
    expect(winter.record?.adjustments?.civilDisorder).toEqual([{ power: "RUS", type: "F", location: { province: "bot" } }])
  })

  it("removes every unit by the civil-disorder rule when none are chosen", async () => {
    const { code, russia } = await russiaWithDisbands(1)
    await submitOrders(db, code, russia, "winter")
    const spring = await getView(db, code, russia)
    expect(russianUnits(spring)).toEqual(["A lvn", "A ukr", "A war", "F sev"])
    expect(spring.checklist?.steps.map((s) => s.text)).toEqual(["Remove Russia's F Bot (removed by the civil-disorder rule)"])
  })

  it("ignores disbands that weren't locked in when the timer runs out", async () => {
    const { code, russia, creator } = await russiaWithDisbands(1)
    const v = await getView(db, code, creator)
    const t = await issueJoinToken(db, code, creator, v.participants.find((p) => p.isGameMaster)!.id, false)
    const gm = { deviceToken: (await joinGame(db, code, t)).deviceToken }
    await saveDraft(db, code, russia, "RUS", [{ kind: "remove", unit: "war" }])
    await setTimer(db, code, gm, 5)
    tick(5 * 60_000)
    await expectError(saveDraft(db, code, russia, "RUS", []), 409, /Time's up/)
    const spring = await getView(db, code, russia)
    expect(spring.phase.label).toBe("Spring 1902 · Orders")
    // The civil-disorder rule chose instead: the Warsaw army survives.
    expect(russianUnits(spring)).toEqual(["A lvn", "A ukr", "A war", "F sev"])
  })
})
