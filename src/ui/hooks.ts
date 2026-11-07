"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { GameView } from "@/server/games"
import { api, ApiError } from "./api"

/** Polls the game every few seconds (and right away when the tab comes back). */
export function useGame(code: string, intervalMs = 3000) {
  const [view, setView] = useState<GameView | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const offset = useRef(0)
  const inFlight = useRef(false)

  const refresh = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      const v = await api.view(code)
      offset.current = new Date(v.serverNow).getTime() - Date.now()
      setView(v)
      setError(null)
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, "Can't reach the server. Retrying…"))
    } finally {
      inFlight.current = false
    }
  }, [code])

  useEffect(() => {
    const first = setTimeout(refresh, 0)
    const id = setInterval(() => {
      if (!document.hidden) refresh()
    }, intervalMs)
    const onVisible = () => {
      if (!document.hidden) refresh()
    }
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("focus", onVisible)
    return () => {
      clearTimeout(first)
      clearInterval(id)
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("focus", onVisible)
    }
  }, [refresh, intervalMs])

  /** Server-clock "now", corrected for this phone's clock being off. */
  const serverNow = useCallback(() => Date.now() + offset.current, [])

  return { view, error, refresh, serverNow }
}

/** Seconds left until `deadline` on the server clock (null when no timer). */
export function useCountdown(deadline: string | null | undefined, serverNow: () => number, onExpire?: () => void) {
  const [nowMs, setNowMs] = useState(() => serverNow())
  const fired = useRef<string | null>(null)
  useEffect(() => {
    if (!deadline) return
    const end = new Date(deadline).getTime()
    const id = setInterval(() => {
      const t = serverNow()
      setNowMs(t)
      if (t >= end && fired.current !== deadline) {
        fired.current = deadline
        onExpire?.()
      }
    }, 250)
    return () => clearInterval(id)
  }, [deadline, serverNow, onExpire])
  if (!deadline) return null
  return Math.max(0, Math.ceil((new Date(deadline).getTime() - nowMs) / 1000))
}

export function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}
