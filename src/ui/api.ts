// Client-side API helpers.

import type { AnyOrder, CreateGameInput, GameView, HistoryEntry } from "@/server/games"
import type { Power } from "@/engine/types"

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? "Something went wrong. Try again.")
  return data as T
}

const g = (code: string) => `/api/games/${encodeURIComponent(code)}`

export const api = {
  create: (input: CreateGameInput) => call<{ code: string }>("POST", "/api/games", input),
  view: (code: string) => call<GameView>("GET", g(code)),
  join: (code: string, token: string) => call<{ name: string }>("POST", `${g(code)}/join`, { token }),
  saveDraft: (code: string, power: Power, orders: AnyOrder[]) => call("PUT", `${g(code)}/orders`, { power, orders }),
  submit: (code: string, requestId: string) => call<{ adjudicated: boolean }>("POST", `${g(code)}/submit`, { requestId }),
  setTimer: (code: string, minutes: number) => call("POST", `${g(code)}/timer`, { action: "set", minutes }),
  extendTimer: (code: string) => call("POST", `${g(code)}/timer`, { action: "extend" }),
  joinLink: (code: string, participantId: string, reset: boolean) =>
    call<{ url: string }>("POST", `${g(code)}/participants/${participantId}/link`, { reset }),
  history: (code: string) => call<HistoryEntry[]>("GET", `${g(code)}/history`),
  tick: (code: string, phaseId: number, index: number, done: boolean) => call("POST", `${g(code)}/checklist`, { phaseId, index, done }),
  synced: (code: string, phaseId: number) => call("POST", `${g(code)}/checklist`, { phaseId, synced: true }),
  draw: (code: string) => call("POST", `${g(code)}/draw`),
}
