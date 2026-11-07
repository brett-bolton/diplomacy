"use client"

import { useState } from "react"
import type { GameView } from "@/server/games"
import { api } from "./api"
import { formatClock, useCountdown } from "./hooks"
import { Button, Card, ErrorText } from "./kit"
import { powerName } from "./text"

const PRESETS = [5, 10, 15, 30]

export function GmPanel({ view, code, serverNow, onChanged }: { view: GameView; code: string; serverNow: () => number; onChanged: () => void }) {
  const left = useCountdown(view.phase.deadlineAt, serverNow)
  const [custom, setCustom] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const firstTurn = view.phase.seq === 0
  const suggested = firstTurn ? 30 : 15
  const open = view.game.status === "active"
  const running = left !== null && left > 0

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const required = view.powers.filter((p) => p.required)
  return (
    <div className="space-y-3">
      <Card className="p-4">
        <h2 className="text-base font-semibold">Turn timer</h2>
        {!open ? (
          <p className="mt-1 text-sm text-text-2">The game is over.</p>
        ) : running ? (
          <>
            <p className="mt-2 text-4xl font-semibold tabular-nums">{formatClock(left!)}</p>
            <p className="text-sm text-text-2">
              Everyone sees this countdown. When it runs out, orders close and unsubmitted drafts are ignored.
              {view.phase.timerExtensions ? ` Extended ${view.phase.timerExtensions}×.` : ""}
            </p>
            <Button className="mt-3 w-full" disabled={busy} onClick={() => run(() => api.extendTimer(code))}>
              +5 minutes
            </Button>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-text-2">
              Optional. Set it any time during this phase. The rulebook suggests 30 minutes before the first turn and 15 before each later turn.
            </p>
            <div className="mt-3 grid grid-cols-4 gap-2">
              {PRESETS.map((m) => (
                <Button key={m} variant={m === suggested ? "primary" : "secondary"} disabled={busy} onClick={() => run(() => api.setTimer(code, m))}>
                  {m} min
                </Button>
              ))}
            </div>
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                const m = Number(custom)
                if (!Number.isInteger(m) || m < 1 || m > 240) return setError("Enter whole minutes from 1 to 240.")
                run(() => api.setTimer(code, m))
              }}
            >
              <input
                inputMode="numeric"
                placeholder="Custom minutes"
                value={custom}
                onChange={(e) => {
                  setCustom(e.target.value)
                  setError(null)
                }}
                className="min-h-11 flex-1 rounded-xl border border-line bg-surface px-3"
              />
              <Button type="submit" disabled={busy}>
                Start
              </Button>
            </form>
          </>
        )}
        <div className="mt-2">
          <ErrorText>{error}</ErrorText>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="text-base font-semibold">Who has submitted</h2>
        <p className="text-sm text-text-2">You see who&apos;s done, never what they ordered.</p>
        <ul className="mt-3 divide-y divide-line">
          {required.length === 0 ? <li className="py-2 text-sm text-text-2">Nobody needs to order right now.</li> : null}
          {required.map((p) => (
            <li key={p.power} className="flex items-center justify-between py-2 text-[15px]">
              <span>
                {powerName(p.power)} <span className="text-text-3">· {p.playerName}</span>
              </span>
              <span className={p.submitted ? "text-success" : "text-text-3"}>{p.submitted ? "Submitted" : "Not yet"}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
