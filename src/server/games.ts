// Game service: every rule about who can do what, when. Route handlers stay thin.
//
// Concurrency: every write (and every read that may trigger a lazy timer expiry)
// runs in one transaction that locks the current phase row (SELECT … FOR UPDATE),
// so the last submit or the timer expiry adjudicates exactly once.

import { and, asc, eq } from "drizzle-orm"
import { adjustmentDelta, supplyCenterCounts } from "@/engine/adjudicate/adjust"
import { checklist, type ChecklistStep } from "@/engine/checklist"
import { checkCustomPosition, type CustomPosition } from "@/engine/custom"
import type { AdjustmentOrder, MovementOrder, RetreatOrder } from "@/engine/orders"
import { validateAdjustmentOrders, validateMovementOrder, validateRetreatOrder } from "@/engine/orders/legal"
import {
  closedProvinces,
  customGame,
  isEliminated,
  newGame,
  phaseLabel,
  powersToOrder,
  resolvePhase,
  seatPowers,
  unplayedPowers,
  type GameState,
  type PhaseRecord,
} from "@/engine/phase"
import { POWERS, type Power, type ProvinceId } from "@/engine/types"
import { variant } from "@/engine/variants"
import type { Db, Tx } from "./db"
import { games, orderSets, participants, phases } from "./schema"
import { hashToken, newGameCode, newId, newToken, now, secureRandom } from "./tokens"

export class GameError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

const TIMES_UP = "Time's up — orders are closed."

const fail = (status: number, message: string): never => {
  throw new GameError(status, message)
}

export type AnyOrder = MovementOrder | RetreatOrder | AdjustmentOrder

export interface Credentials {
  creatorToken?: string
  deviceToken?: string
}

type GameRow = typeof games.$inferSelect
type ParticipantRow = typeof participants.$inferSelect
type PhaseRow = typeof phases.$inferSelect

interface Identity {
  creator: boolean
  participant?: ParticipantRow
}

// ---------------------------------------------------------------------------
// Create and join

export interface NewParticipant {
  name: string
  /** Seat index in the variant, or null for a standalone game master. */
  seat: number | null
  isGameMaster: boolean
}

export interface CreateGameInput {
  passphrase?: string
  name: string
  playerCount: number
  participants: NewParticipant[]
  custom?: CustomPosition
}

export async function createGame(db: Db, input: CreateGameInput): Promise<{ code: string; creatorToken: string }> {
  const required = process.env.GAME_CREATE_PASSPHRASE
  if (required && input.passphrase !== required) fail(403, "That passphrase isn't right.")
  if (!Number.isInteger(input.playerCount) || input.playerCount < 2 || input.playerCount > 7) fail(400, "Choose 2 to 7 players.")
  const v = variant(input.playerCount)
  const name = input.name?.trim() || "Diplomacy"
  if (name.length > 60) fail(400, "Keep the game name under 60 characters.")

  const seats = input.participants.filter((p) => p.seat !== null).map((p) => p.seat!)
  for (let i = 0; i < v.seats.length; i++) {
    if (seats.filter((s) => s === i).length !== 1) fail(400, "Every seat needs exactly one player.")
  }
  if (seats.length !== v.seats.length || seats.some((s) => s < 0 || s >= v.seats.length)) fail(400, "Every seat needs exactly one player.")
  const gms = input.participants.filter((p) => p.isGameMaster)
  if (gms.length !== 1) fail(400, "Choose exactly one game master.")
  if (input.participants.some((p) => p.seat === null && !p.isGameMaster)) fail(400, "Everyone without a seat must be the game master.")
  for (const p of input.participants) {
    const n = p.name?.trim()
    if (!n || n.length > 40) fail(400, "Each name must be 1–40 characters.")
  }

  let state: GameState
  if (input.custom) {
    const check = checkCustomPosition(input.custom, input.playerCount)
    if (check.errors.length) fail(400, check.errors.join(" "))
    state = customGame(input.playerCount, input.custom)
  } else {
    state = newGame(input.playerCount)
  }

  const creatorToken = newToken()
  const gameId = newId()
  let code = newGameCode()
  await db.transaction(async (tx) => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const clash = await tx.select({ id: games.id }).from(games).where(eq(games.code, code))
      if (!clash.length) break
      code = newGameCode()
    }
    await tx.insert(games).values({
      id: gameId,
      code,
      name,
      playerCount: input.playerCount,
      startKind: input.custom ? "custom" : "standard",
      creatorTokenHash: hashToken(creatorToken),
    })
    await tx.insert(participants).values(
      input.participants.map((p) => ({
        id: newId(),
        gameId,
        displayName: p.name.trim(),
        seat: p.seat,
        isGameMaster: p.isGameMaster,
      })),
    )
    const [phase] = await tx
      .insert(phases)
      .values({ gameId, seq: 0, year: state.year, season: state.season, phase: state.phase, state })
      .returning({ id: phases.id })
    await tx.update(games).set({ currentPhaseId: phase.id }).where(eq(games.id, gameId))
  })
  return { code, creatorToken }
}

/** Creator: get a fresh one-time join link for a participant. `reset` also signs out their current phone. */
export async function issueJoinToken(db: Db, code: string, creds: Credentials, participantId: string, reset: boolean): Promise<string> {
  return db.transaction(async (tx) => {
    const game = await loadGame(tx, code)
    const me = await identify(tx, game, creds)
    if (!me.creator) fail(403, "Only the game creator can do that.")
    const [p] = await tx.select().from(participants).where(and(eq(participants.id, participantId), eq(participants.gameId, game.id)))
    if (!p) fail(404, "No such participant.")
    const token = newToken()
    await tx
      .update(participants)
      .set({ joinTokenHash: hashToken(token), ...(reset ? { deviceTokenHash: null, boundAt: null } : {}) })
      .where(eq(participants.id, participantId))
    return token
  })
}

/** A phone scanned its QR code: swap the one-time join token for a device token. */
export async function joinGame(db: Db, code: string, joinToken: string): Promise<{ deviceToken: string; name: string }> {
  return db.transaction(async (tx) => {
    const game = await loadGame(tx, code)
    const [p] = await tx
      .select()
      .from(participants)
      .where(and(eq(participants.gameId, game.id), eq(participants.joinTokenHash, hashToken(joinToken))))
    if (!p) fail(404, "This join link has already been used or replaced. Ask the game creator for a new QR code.")
    const deviceToken = newToken()
    await tx
      .update(participants)
      .set({ joinTokenHash: null, deviceTokenHash: hashToken(deviceToken), boundAt: now() })
      .where(eq(participants.id, p.id))
    return { deviceToken, name: p.displayName }
  })
}

// ---------------------------------------------------------------------------
// Reading the game

export interface PowerStatus {
  power: Power
  seat: number | null
  playerName: string | null
  supplyCenters: number
  units: number
  /** Winter only: + builds / − disbands due. */
  adjustment: number | null
  unplayed: boolean
  eliminated: boolean
  /** Must submit this phase. */
  required: boolean
  submitted: boolean
}

export interface GameView {
  game: { code: string; name: string; playerCount: number; status: string; startKind: string; result: GameState["result"] | null }
  me: {
    creator: boolean
    participantId: string | null
    name: string | null
    isGameMaster: boolean
    powers: Power[]
  }
  participants: { id: string; name: string; seat: number | null; isGameMaster: boolean; powers: Power[]; joined: boolean }[]
  phase: {
    id: number
    seq: number
    label: string
    year: number
    season: string
    type: string
    deadlineAt: string | null
    timerExtensions: number
  }
  serverNow: string
  state: GameState
  closed: ProvinceId[]
  powers: PowerStatus[]
  /** The caller's own order sets for the current phase (never anyone else's). */
  myOrders: { power: Power; status: "draft" | "submitted"; orders: AnyOrder[] }[]
  /** Checklist for the most recently adjudicated phase, until the board is marked updated. */
  checklist: { phaseId: number; label: string; steps: ChecklistStep[]; ticks: number[]; synced: boolean } | null
}

export async function getView(db: Db, code: string, creds: Credentials): Promise<GameView> {
  return db.transaction(async (tx) => {
    const game0 = await loadGame(tx, code)
    await expireIfDue(tx, game0)
    const game = await loadGame(tx, code)
    const me = await identify(tx, game, creds)
    const parts = await tx.select().from(participants).where(eq(participants.gameId, game.id)).orderBy(asc(participants.seat))
    const phase = await currentPhase(tx, game)
    const state = phase.state as GameState
    const sets = await tx.select().from(orderSets).where(eq(orderSets.phaseId, phase.id))
    const seats = seatPowers(state)
    const unplayed = new Set(unplayedPowers(state))
    const required = new Set(phase.status === "open" ? powersToOrder(state) : [])
    const counts = supplyCenterCounts(new Map(Object.entries(state.owners)))
    const owners = new Map(Object.entries(state.owners)) as Map<ProvinceId, Power>
    const myPowers = me.participant?.seat != null ? seats[me.participant.seat] ?? [] : []

    const powers: PowerStatus[] = POWERS.map((power) => {
      const seat = seats.findIndex((s) => s.includes(power))
      const player = seat >= 0 ? parts.find((p) => p.seat === seat) : undefined
      const set = sets.find((s) => s.power === power)
      return {
        power,
        seat: seat >= 0 ? seat : null,
        playerName: player?.displayName ?? null,
        supplyCenters: counts.get(power) ?? 0,
        units: state.units.filter((u) => u.power === power).length,
        adjustment: state.phase === "adjustment" ? adjustmentDelta(power, owners, state.units) : null,
        unplayed: unplayed.has(power),
        eliminated: isEliminated(state, power),
        required: required.has(power),
        submitted: required.has(power) ? set?.status === "submitted" : false,
      }
    })

    const myOrders = sets
      .filter((s) => myPowers.includes(s.power as Power))
      .map((s) => ({ power: s.power as Power, status: s.status, orders: s.orders as AnyOrder[] }))

    // Checklist for the latest adjudicated phase.
    let list: GameView["checklist"] = null
    const [last] = await tx
      .select()
      .from(phases)
      .where(and(eq(phases.gameId, game.id), eq(phases.status, "adjudicated")))
      .orderBy(asc(phases.seq))
      .then((rows) => rows.slice(-1))
    if (last && !last.boardSyncedAt) {
      const steps = await checklistForGame(tx, game, last)
      list = { phaseId: last.id, label: phaseLabel(last.state as GameState), steps, ticks: last.checklistTicks, synced: false }
      if (list.steps.length === 0) list = null
    }

    return {
      game: {
        code: game.code,
        name: game.name,
        playerCount: game.playerCount,
        status: game.status,
        startKind: game.startKind,
        result: (game.result as GameState["result"]) ?? null,
      },
      me: {
        creator: me.creator,
        participantId: me.participant?.id ?? null,
        name: me.participant?.displayName ?? null,
        isGameMaster: !!me.participant?.isGameMaster,
        powers: myPowers,
      },
      participants: parts.map((p) => ({
        id: p.id,
        name: p.displayName,
        seat: p.seat,
        isGameMaster: p.isGameMaster,
        powers: p.seat != null ? seats[p.seat] ?? [] : [],
        joined: !!p.deviceTokenHash,
      })),
      phase: {
        id: phase.id,
        seq: phase.seq,
        label: phaseLabel(state),
        year: state.year,
        season: state.season,
        type: state.phase,
        deadlineAt: phase.status === "open" ? (phase.deadlineAt?.toISOString() ?? null) : null,
        timerExtensions: phase.timerExtensions,
      },
      serverNow: now().toISOString(),
      state,
      closed: [...closedProvinces(state)],
      powers,
      myOrders,
      checklist: list,
    }
  })
}

/**
 * Checklist steps for an adjudicated phase. Auto-resolved phases that follow it
 * (e.g. a Winter with only civil-disorder removals) are folded in.
 */
async function checklistForGame(tx: Tx, game: GameRow, phase: PhaseRow): Promise<ChecklistStep[]> {
  const later = await tx
    .select()
    .from(phases)
    .where(and(eq(phases.gameId, game.id), eq(phases.status, "adjudicated")))
    .orderBy(asc(phases.seq))
  const steps: ChecklistStep[] = []
  // Include the phase itself plus any auto phases immediately before it that weren't synced.
  for (const row of later.filter((r) => r.seq <= phase.seq).reverse()) {
    if (row.id !== phase.id && (row.trigger !== "auto" || row.boardSyncedAt)) break
    steps.unshift(...checklist(row.record as PhaseRecord))
  }
  return steps
}

// ---------------------------------------------------------------------------
// Orders

/** Save (replace) the draft orders for one of the caller's powers. */
export async function saveDraft(db: Db, code: string, creds: Credentials, power: Power, orders: AnyOrder[]): Promise<void> {
  await db.transaction(async (tx) => {
    const game = await loadGame(tx, code)
    if (await expireIfDue(tx, game)) fail(409, TIMES_UP)
    const me = await identify(tx, game, creds)
    const phase = await lockCurrentPhase(tx, game)
    const state = phase.state as GameState
    assertCanOrder(game, phase, state, me, power)
    validateOrders(state, power, orders)
    const [existing] = await tx.select().from(orderSets).where(and(eq(orderSets.phaseId, phase.id), eq(orderSets.power, power)))
    if (existing?.status === "submitted") fail(409, "These orders are locked in and can't be changed.")
    if (existing) {
      await tx.update(orderSets).set({ orders, updatedAt: now() }).where(and(eq(orderSets.phaseId, phase.id), eq(orderSets.power, power)))
    } else {
      await tx.insert(orderSets).values({ phaseId: phase.id, power, orders, updatedAt: now() })
    }
  })
}

/**
 * Lock in the caller's orders for all of their powers this phase (one
 * confirmation covers every power a player controls). Adjudicates if this was
 * the last power still to submit.
 */
export async function submitOrders(db: Db, code: string, creds: Credentials, requestId: string): Promise<{ adjudicated: boolean }> {
  return db.transaction(async (tx) => {
    const game = await loadGame(tx, code)
    if (await expireIfDue(tx, game)) fail(409, TIMES_UP)
    const me = await identify(tx, game, creds)
    const phase = await lockCurrentPhase(tx, game)
    const state = phase.state as GameState
    if (game.status !== "active") fail(409, "The game is over.")
    if (phase.status !== "open") fail(409, "This phase has already been adjudicated.")
    if (!me.participant || me.participant.seat == null) fail(403, "Only players can submit orders.")
    const mine = seatPowers(state)[me.participant!.seat!] ?? []
    const required = powersToOrder(state).filter((p) => mine.includes(p))
    if (required.length === 0) return { adjudicated: false }

    const sets = await tx.select().from(orderSets).where(eq(orderSets.phaseId, phase.id))
    // Idempotent retry: already submitted with this request id.
    if (required.every((p) => sets.find((s) => s.power === p)?.status === "submitted")) {
      return { adjudicated: false }
    }
    for (const power of required) {
      const set = sets.find((s) => s.power === power)
      if (set?.status === "submitted") continue
      if (set) {
        await tx
          .update(orderSets)
          .set({ status: "submitted", submittedAt: now(), submitRequestId: requestId })
          .where(and(eq(orderSets.phaseId, phase.id), eq(orderSets.power, power)))
      } else {
        await tx.insert(orderSets).values({ phaseId: phase.id, power, orders: [], status: "submitted", submittedAt: now(), submitRequestId: requestId })
      }
    }
    const after = await tx.select().from(orderSets).where(eq(orderSets.phaseId, phase.id))
    const allIn = powersToOrder(state).every((p) => after.find((s) => s.power === p)?.status === "submitted")
    if (!allIn) return { adjudicated: false }
    await adjudicate(tx, game, phase, "all_submitted")
    return { adjudicated: true }
  })
}

function assertCanOrder(game: GameRow, phase: PhaseRow, state: GameState, me: Identity, power: Power) {
  if (game.status !== "active") fail(409, "The game is over.")
  if (phase.status !== "open") fail(409, "This phase has already been adjudicated.")
  if (!me.participant || me.participant.seat == null) fail(403, "Only players can give orders.")
  const mine = seatPowers(state)[me.participant!.seat!] ?? []
  if (!mine.includes(power)) fail(403, "That isn't your power.")
  if (phase.deadlineAt && now() >= phase.deadlineAt) fail(409, TIMES_UP)
}

function validateOrders(state: GameState, power: Power, orders: AnyOrder[]) {
  if (!Array.isArray(orders)) fail(400, "Orders must be a list.")
  if (orders.length > 40) fail(400, "Too many orders.")
  if (state.phase === "movement") {
    const seen = new Set<ProvinceId>()
    for (const o of orders) {
      if (!o || !("unit" in o) || !["hold", "move", "support-hold", "support-move", "convoy"].includes(o.kind)) fail(400, "That isn't a movement order.")
      const mo = o as MovementOrder
      if (seen.has(mo.unit)) fail(400, "Each unit gets one order.")
      seen.add(mo.unit)
      const r = validateMovementOrder(state.units, power, mo, { closed: closedProvinces(state) })
      if (!r.ok) fail(400, r.reason)
    }
  } else if (state.phase === "retreat") {
    const seen = new Set<ProvinceId>()
    for (const o of orders) {
      if (!o || (o.kind !== "retreat" && o.kind !== "disband")) fail(400, "That isn't a retreat order.")
      const ro = o as RetreatOrder
      if (seen.has(ro.unit)) fail(400, "Each unit gets one order.")
      seen.add(ro.unit)
      const r = validateRetreatOrder(state.dislodged, power, ro)
      if (!r.ok) fail(400, r.reason)
    }
  } else {
    if (orders.some((o) => !o || !["build", "remove", "waive"].includes(o.kind))) fail(400, "That isn't a build or disband order.")
    const r = validateAdjustmentOrders(state.units, new Map(Object.entries(state.owners)) as Map<ProvinceId, Power>, power, orders as AdjustmentOrder[])
    if (!r.ok) fail(400, r.reason)
  }
}

// ---------------------------------------------------------------------------
// Timer (game master only)

export async function setTimer(db: Db, code: string, creds: Credentials, minutes: number): Promise<void> {
  await db.transaction(async (tx) => {
    const game = await loadGame(tx, code)
    if (await expireIfDue(tx, game)) fail(409, "The timer ran out and the phase has been adjudicated. Set a new timer for the next phase if you want one.")
    const me = await identify(tx, game, creds)
    if (!me.participant?.isGameMaster) fail(403, "Only the game master can set the timer.")
    const phase = await lockCurrentPhase(tx, game)
    if (game.status !== "active" || phase.status !== "open") fail(409, "There's no open phase to time.")
    if (phase.deadlineAt && now() < phase.deadlineAt) fail(409, "A timer is already running. Extend it instead.")
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 240) fail(400, "Choose 1 to 240 minutes.")
    await tx
      .update(phases)
      .set({ deadlineAt: new Date(now().getTime() + minutes * 60_000), timerSetAt: now(), timerExtensions: 0 })
      .where(eq(phases.id, phase.id))
  })
}

export async function extendTimer(db: Db, code: string, creds: Credentials): Promise<void> {
  await db.transaction(async (tx) => {
    const game = await loadGame(tx, code)
    if (await expireIfDue(tx, game)) fail(409, "The timer has already run out.")
    const me = await identify(tx, game, creds)
    if (!me.participant?.isGameMaster) fail(403, "Only the game master can extend the timer.")
    const phase = await lockCurrentPhase(tx, game)
    if (phase.status !== "open" || !phase.deadlineAt) fail(409, "There's no running timer to extend.")
    if (now() >= phase.deadlineAt!) fail(409, "The timer has already run out.")
    await tx
      .update(phases)
      .set({ deadlineAt: new Date(phase.deadlineAt!.getTime() + 5 * 60_000), timerExtensions: phase.timerExtensions + 1 })
      .where(eq(phases.id, phase.id))
  })
}

/** If the current phase's timer has run out, adjudicate it with whatever was submitted. Returns true if it did. */
async function expireIfDue(tx: Tx, game: GameRow): Promise<boolean> {
  if (game.status !== "active" || !game.currentPhaseId) return false
  const phase = await lockCurrentPhase(tx, game)
  if (phase.status === "open" && phase.deadlineAt && now() >= phase.deadlineAt) {
    await adjudicate(tx, game, phase, "timer_expired")
    return true
  }
  return false
}

// ---------------------------------------------------------------------------
// Adjudication

async function adjudicate(tx: Tx, game: GameRow, phase: PhaseRow, trigger: "all_submitted" | "timer_expired") {
  const state = phase.state as GameState
  const sets = await tx.select().from(orderSets).where(eq(orderSets.phaseId, phase.id))
  // Only locked-in orders count; drafts are ignored (missed timer = default orders).
  const orders = new Map<Power, AnyOrder[]>()
  for (const s of sets) if (s.status === "submitted") orders.set(s.power as Power, s.orders as AnyOrder[])

  const { records, state: next } = resolvePhase(state, orders, { random: secureRandom })
  const at = now()
  const strip = (r: PhaseRecord) => {
    const rest: Partial<PhaseRecord> = { ...r }
    delete rest.before
    return rest
  }
  await tx
    .update(phases)
    .set({ status: "adjudicated", record: strip(records[0]), trigger, adjudicatedAt: at })
    .where(eq(phases.id, phase.id))
  let seq = phase.seq
  for (const r of records.slice(1)) {
    seq++
    await tx.insert(phases).values({
      gameId: game.id,
      seq,
      year: r.year,
      season: r.season,
      phase: r.phase,
      state: r.before,
      status: "adjudicated",
      record: strip(r),
      trigger: "auto",
      adjudicatedAt: at,
    })
  }
  if (next.result) {
    await tx.update(games).set({ status: "finished", result: next.result }).where(eq(games.id, game.id))
    return
  }
  const [open] = await tx
    .insert(phases)
    .values({ gameId: game.id, seq: seq + 1, year: next.year, season: next.season, phase: next.phase, state: next })
    .returning({ id: phases.id })
  await tx.update(games).set({ currentPhaseId: open.id }).where(eq(games.id, game.id))
}

// ---------------------------------------------------------------------------
// History, checklist, draw

export interface HistoryEntry {
  id: number
  seq: number
  label: string
  trigger: string | null
  imported: boolean
  state: GameState
  record: Omit<PhaseRecord, "before"> | null
  /** Locked-in orders per power (only for adjudicated phases). */
  orders: { power: Power; orders: AnyOrder[] }[]
}

export async function getHistory(db: Db, code: string, creds: Credentials): Promise<HistoryEntry[]> {
  return db.transaction(async (tx) => {
    const game = await loadGame(tx, code)
    await identify(tx, game, creds)
    const rows = await tx.select().from(phases).where(eq(phases.gameId, game.id)).orderBy(asc(phases.seq))
    const out: HistoryEntry[] = []
    for (const row of rows) {
      const adjudicated = row.status === "adjudicated"
      const sets = adjudicated ? await tx.select().from(orderSets).where(eq(orderSets.phaseId, row.id)) : []
      out.push({
        id: row.id,
        seq: row.seq,
        label: phaseLabel(row.state as GameState),
        trigger: row.trigger,
        imported: row.seq === 0 && game.startKind === "custom",
        state: row.state as GameState,
        record: adjudicated ? (row.record as Omit<PhaseRecord, "before">) : null,
        orders: sets.filter((s) => s.status === "submitted").map((s) => ({ power: s.power as Power, orders: s.orders as AnyOrder[] })),
      })
    }
    return out
  })
}

export async function tickChecklist(db: Db, code: string, creds: Credentials, phaseId: number, change: { index: number; done: boolean } | { synced: true }) {
  await db.transaction(async (tx) => {
    const game = await loadGame(tx, code)
    const me = await identify(tx, game, creds)
    if (!me.participant && !me.creator) fail(403, "Join the game first.")
    const [row] = await tx.select().from(phases).where(and(eq(phases.id, phaseId), eq(phases.gameId, game.id))).for("update")
    if (!row || row.status !== "adjudicated") fail(404, "No checklist for that phase.")
    if ("synced" in change) {
      await tx.update(phases).set({ boardSyncedAt: now() }).where(eq(phases.id, phaseId))
      // Earlier auto phases folded into this checklist are synced too.
      const earlier = await tx.select().from(phases).where(and(eq(phases.gameId, game.id), eq(phases.trigger, "auto")))
      for (const e of earlier) if (e.seq < row.seq && !e.boardSyncedAt) await tx.update(phases).set({ boardSyncedAt: now() }).where(eq(phases.id, e.id))
      return
    }
    const ticks = new Set(row.checklistTicks)
    if (change.done) ticks.add(change.index)
    else ticks.delete(change.index)
    await tx.update(phases).set({ checklistTicks: [...ticks].sort((a, b) => a - b) }).where(eq(phases.id, phaseId))
  })
}

export async function recordDraw(db: Db, code: string, creds: Credentials) {
  await db.transaction(async (tx) => {
    const game = await loadGame(tx, code)
    const me = await identify(tx, game, creds)
    if (!me.creator) fail(403, "Only the game creator can record a draw.")
    if (game.status !== "active") fail(409, "The game is already over.")
    await tx.update(games).set({ status: "finished", result: { kind: "draw" } }).where(eq(games.id, game.id))
  })
}

// ---------------------------------------------------------------------------
// Helpers

async function loadGame(tx: Tx, code: string): Promise<GameRow> {
  const [game] = await tx.select().from(games).where(eq(games.code, (code ?? "").toUpperCase()))
  if (!game) fail(404, "No game with that code.")
  return game!
}

async function identify(tx: Tx, game: GameRow, creds: Credentials): Promise<Identity> {
  const creator = !!creds.creatorToken && hashToken(creds.creatorToken) === game.creatorTokenHash
  let participant: ParticipantRow | undefined
  if (creds.deviceToken) {
    ;[participant] = await tx
      .select()
      .from(participants)
      .where(and(eq(participants.gameId, game.id), eq(participants.deviceTokenHash, hashToken(creds.deviceToken))))
  }
  return { creator, participant }
}

async function currentPhase(tx: Tx, game: GameRow): Promise<PhaseRow> {
  const [row] = await tx.select().from(phases).where(eq(phases.id, game.currentPhaseId!))
  if (!row) fail(500, "Game has no current phase.")
  return row!
}

async function lockCurrentPhase(tx: Tx, game: GameRow): Promise<PhaseRow> {
  const [row] = await tx.select().from(phases).where(eq(phases.id, game.currentPhaseId!)).for("update")
  if (!row) fail(500, "Game has no current phase.")
  return row!
}
