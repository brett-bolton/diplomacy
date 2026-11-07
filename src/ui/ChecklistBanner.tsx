"use client"

import { useState } from "react"
import type { GameView } from "@/server/games"
import { api } from "./api"
import { Button, Card } from "./kit"

/** "Update the board" checklist after each adjudication. Ticks are shared by everyone. */
export function ChecklistBanner({ view, code, onChanged }: { view: GameView; code: string; onChanged: () => void }) {
  const list = view.checklist
  const [open, setOpen] = useState(true)
  const [optimistic, setOptimistic] = useState<Record<number, boolean>>({})
  if (!list) return null
  const isTicked = (i: number) => optimistic[i] ?? list.ticks.includes(i)
  const done = list.steps.filter((_, i) => isTicked(i)).length
  const canTick = !!view.me.participantId || view.me.creator

  return (
    <Card className="border-accent/40 p-4">
      <button className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setOpen((o) => !o)}>
        <span>
          <span className="block font-semibold">Update the board</span>
          <span className="block text-sm text-text-2">
            {list.label} · {done} of {list.steps.length} done
          </span>
        </span>
        <span className="text-sm text-accent">{open ? "Hide" : "Show"}</span>
      </button>
      {open ? (
        <>
          <ol className="mt-3 space-y-1.5">
            {list.steps.map((s, i) => (
              <li key={i}>
                <label className={`flex min-h-10 items-center gap-3 rounded-lg px-1 ${canTick ? "cursor-pointer" : ""}`}>
                  {canTick ? (
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-[var(--accent)]"
                    checked={isTicked(i)}
                    disabled={!canTick}
                    onChange={async (e) => {
                      const done = e.target.checked
                      setOptimistic((o) => ({ ...o, [i]: done }))
                      try {
                        await api.tick(code, list.phaseId, i, done)
                      } finally {
                        onChanged()
                      }
                    }}
                  />
                  ) : (
                    <span className="w-5 text-center text-text-3" aria-hidden>
                      {isTicked(i) ? "✓" : "•"}
                    </span>
                  )}
                  <span className={`text-[15px] ${isTicked(i) ? "text-text-3 line-through" : ""}`}>{s.text}</span>
                </label>
              </li>
            ))}
          </ol>
          {canTick ? (
            <Button
              className="mt-3 w-full"
              onClick={async () => {
                await api.synced(code, list.phaseId)
                onChanged()
              }}
            >
              Board updated
            </Button>
          ) : null}
        </>
      ) : null}
    </Card>
  )
}
