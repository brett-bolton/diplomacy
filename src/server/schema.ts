// Database schema (Drizzle, Postgres). Neon in production, PGlite locally and in tests.

import { boolean, integer, jsonb, pgTable, primaryKey, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"

export const games = pgTable(
  "games",
  {
    id: text("id").primaryKey(),
    /** Short code used in URLs, e.g. "K7QF2M". */
    code: text("code").notNull(),
    name: text("name").notNull(),
    playerCount: integer("player_count").notNull(),
    status: text("status", { enum: ["active", "finished"] }).notNull().default("active"),
    startKind: text("start_kind", { enum: ["standard", "custom"] }).notNull().default("standard"),
    creatorTokenHash: text("creator_token_hash").notNull(),
    currentPhaseId: integer("current_phase_id"),
    /** { kind: "victory", seat, powers } | { kind: "draw" } */
    result: jsonb("result"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("games_code_idx").on(t.code)],
)

export const participants = pgTable("participants", {
  id: text("id").primaryKey(),
  gameId: text("game_id")
    .notNull()
    .references(() => games.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  /** Index into the variant's seats; null for a standalone game master. */
  seat: integer("seat"),
  isGameMaster: boolean("is_game_master").notNull().default(false),
  /** Hash of the current one-time join token (null once used). */
  joinTokenHash: text("join_token_hash"),
  /** Hash of the device cookie bound to this participant. */
  deviceTokenHash: text("device_token_hash"),
  boundAt: timestamp("bound_at", { withTimezone: true }),
})

export const phases = pgTable("phases", {
  id: serial("id").primaryKey(),
  gameId: text("game_id")
    .notNull()
    .references(() => games.id, { onDelete: "cascade" }),
  /** 0, 1, 2… in play order. */
  seq: integer("seq").notNull(),
  year: integer("year").notNull(),
  season: text("season", { enum: ["spring", "fall", "winter"] }).notNull(),
  phase: text("phase", { enum: ["movement", "retreat", "adjustment"] }).notNull(),
  /** GameState at the start of the phase. */
  state: jsonb("state").notNull(),
  status: text("status", { enum: ["open", "adjudicated"] }).notNull().default("open"),
  /** PhaseRecord (minus `before`) once adjudicated. */
  record: jsonb("record"),
  trigger: text("trigger", { enum: ["all_submitted", "timer_expired", "auto", "imported"] }),
  adjudicatedAt: timestamp("adjudicated_at", { withTimezone: true }),
  deadlineAt: timestamp("deadline_at", { withTimezone: true }),
  timerSetAt: timestamp("timer_set_at", { withTimezone: true }),
  timerExtensions: integer("timer_extensions").notNull().default(0),
  /** Indexes of ticked checklist steps. */
  checklistTicks: jsonb("checklist_ticks").$type<number[]>().notNull().default([]),
  boardSyncedAt: timestamp("board_synced_at", { withTimezone: true }),
})

export const orderSets = pgTable(
  "order_sets",
  {
    phaseId: integer("phase_id")
      .notNull()
      .references(() => phases.id, { onDelete: "cascade" }),
    power: text("power").notNull(),
    status: text("status", { enum: ["draft", "submitted"] }).notNull().default("draft"),
    orders: jsonb("orders").notNull().default([]),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    submitRequestId: text("submit_request_id"),
  },
  (t) => [primaryKey({ columns: [t.phaseId, t.power] })],
)
