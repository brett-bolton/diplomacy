"use client"

import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { checkCustomPosition, type CustomPosition } from "@/engine/custom"
import { PROVINCES, STANDARD_START, SUPPLY_CENTERS, homeCenters, isValidUnitLocation } from "@/engine/map/standard"
import { POWERS, type Coast, type Power, type ProvinceId, type Unit, type UnitType } from "@/engine/types"
import { VARIANTS } from "@/engine/variants"
import type { NewParticipant } from "@/server/games"
import { api } from "@/ui/api"
import { Button, Card, ErrorText, Pill } from "@/ui/kit"
import { placeName, powerName, unitLabel } from "@/ui/text"

const inputCls = "min-h-11 w-full rounded-xl border border-line bg-surface px-3"

function seatLabel(powers: Power[]) {
  return powers.map(powerName).join(" + ")
}

function standardPosition(): CustomPosition {
  const owners: Record<ProvinceId, Power> = {}
  for (const p of POWERS) for (const sc of homeCenters(p)) owners[sc] = p
  return { year: 1901, season: "spring", units: STANDARD_START.map((u) => ({ ...u, location: { ...u.location } })), owners }
}

export default function NewGame() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [passphrase, setPassphrase] = useState("")
  const [count, setCount] = useState(7)
  const [names, setNames] = useState<string[]>(Array(7).fill(""))
  const [gmMode, setGmMode] = useState<"player" | "other">("player")
  const [gmSeat, setGmSeat] = useState(0)
  const [gmName, setGmName] = useState("")
  const [start, setStart] = useState<"standard" | "custom">("standard")
  const [custom, setCustom] = useState<CustomPosition>(standardPosition)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const variant = VARIANTS[count]
  const seats = variant.seats
  const check = useMemo(() => (start === "custom" ? checkCustomPosition(custom, count) : { errors: [], warnings: [] }), [start, custom, count])

  function setCountAndResize(n: number) {
    setCount(n)
    setNames((old) => Array.from({ length: n }, (_, i) => old[i] ?? ""))
    setGmSeat(0)
  }

  function shuffle() {
    const shuffled = [...names]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    setNames(shuffled)
  }

  async function create() {
    setError(null)
    if (names.some((n) => !n.trim())) return setError("Enter a name for every seat.")
    if (gmMode === "other" && !gmName.trim()) return setError("Enter the game master's name.")
    if (start === "custom" && check.errors.length) return setError("Fix the starting position first.")
    setBusy(true)
    try {
      const participants: NewParticipant[] = names.map((n, seat) => ({ name: n.trim(), seat, isGameMaster: gmMode === "player" && seat === gmSeat }))
      if (gmMode === "other") participants.push({ name: gmName.trim(), seat: null, isGameMaster: true })
      const { code } = await api.create({
        name: name.trim() || "Diplomacy",
        passphrase: passphrase || undefined,
        playerCount: count,
        participants,
        custom: start === "custom" ? custom : undefined,
      })
      router.push(`/g/${code}/admin`)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <main className="safe-top safe-bottom mx-auto w-full max-w-md flex-1 space-y-4 px-4 py-8">
      <h1 className="text-2xl font-semibold">New game</h1>

      <Card className="space-y-3 p-4">
        <label className="block">
          <span className="text-sm text-text-2">Game name</span>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Friday night" maxLength={60} />
        </label>
        <label className="block">
          <span className="text-sm text-text-2">Group passphrase (if your group set one)</span>
          <input className={inputCls} type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} autoComplete="off" />
        </label>
      </Card>

      <Card className="space-y-3 p-4">
        <div>
          <span className="text-sm text-text-2">Players</span>
          <div className="mt-1 grid grid-cols-6 gap-1.5">
            {[2, 3, 4, 5, 6, 7].map((n) => (
              <button
                key={n}
                onClick={() => setCountAndResize(n)}
                className={`min-h-11 rounded-xl border text-[15px] ${n === count ? "border-accent bg-accent-soft font-semibold text-accent" : "border-line bg-surface"}`}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-text-3">
            {count === 7
              ? "Standard game: one empire each."
              : count === 6
                ? "Italy is left out; its units hold in place."
                : count === 5
                  ? "Italy and Germany are left out; their units hold in place."
                  : count === 2
                    ? "World War I scenario: starts 1914, Italy is neutral and closed until a coin flip gives it to one player in 1915. First to 24 centers wins."
                    : "Some players control more than one empire. Centers and builds are counted per empire."}
          </p>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Who plays which empire</span>
          <Button variant="ghost" className="min-h-9 text-sm" onClick={shuffle}>
            Shuffle
          </Button>
        </div>
        {seats.map((powers, i) => (
          <label key={i} className="block">
            <span className="text-sm text-text-2">{seatLabel(powers)}</span>
            <input
              className={inputCls}
              value={names[i] ?? ""}
              onChange={(e) => setNames((ns) => ns.map((n, j) => (j === i ? e.target.value : n)))}
              placeholder="Player name"
              maxLength={40}
            />
          </label>
        ))}
        {variant.unplayed.length ? (
          <p className="text-xs text-text-3">Unplayed: {variant.unplayed.map(powerName).join(", ")}</p>
        ) : null}
      </Card>

      <Card className="space-y-3 p-4">
        <span className="text-sm font-medium">Game master</span>
        <p className="text-xs text-text-3">The game master runs the optional turn timer. They never see anyone&apos;s orders early.</p>
        <div className="grid grid-cols-2 gap-2">
          {(["player", "other"] as const).map((m) => (
            <button key={m} onClick={() => setGmMode(m)} className={`min-h-11 rounded-xl border text-[15px] ${gmMode === m ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface"}`}>
              {m === "player" ? "One of the players" : "Someone else"}
            </button>
          ))}
        </div>
        {gmMode === "player" ? (
          <select className={inputCls} value={gmSeat} onChange={(e) => setGmSeat(Number(e.target.value))} aria-label="Game master">
            {seats.map((powers, i) => (
              <option key={i} value={i}>
                {(names[i] || "Player") + " — " + seatLabel(powers)}
              </option>
            ))}
          </select>
        ) : (
          <input className={inputCls} value={gmName} onChange={(e) => setGmName(e.target.value)} placeholder="Game master's name" maxLength={40} />
        )}
      </Card>

      <Card className="space-y-3 p-4">
        <span className="text-sm font-medium">Starting position</span>
        <div className="grid grid-cols-2 gap-2">
          {(["standard", "custom"] as const).map((s) => (
            <button key={s} onClick={() => setStart(s)} className={`min-h-11 rounded-xl border text-[15px] ${start === s ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface"}`}>
              {s === "standard" ? "Standard start" : "Game in progress"}
            </button>
          ))}
        </div>
        {start === "custom" ? <CustomEditor value={custom} onChange={setCustom} errors={check.errors} warnings={check.warnings} /> : null}
      </Card>

      <ErrorText>{error}</ErrorText>
      <Button variant="primary" className="w-full" disabled={busy} onClick={create}>
        {busy ? "Creating…" : "Create game"}
      </Button>
    </main>
  )
}

function CustomEditor({ value, onChange, errors, warnings }: { value: CustomPosition; onChange: (v: CustomPosition) => void; errors: string[]; warnings: string[] }) {
  const [power, setPower] = useState<Power>("ENG")
  const [type, setType] = useState<UnitType>("A")
  const [prov, setProv] = useState<string>("")
  const [coast, setCoast] = useState<Coast | "">("")

  const occupied = new Set(value.units.map((u) => u.location.province))
  const choices = Object.values(PROVINCES)
    .filter((p) => !occupied.has(p.id) && (type === "A" ? p.kind !== "sea" : p.kind !== "inland"))
    .sort((a, b) => a.name.localeCompare(b.name))
  const coasts = type === "F" && prov ? (PROVINCES[prov]?.coasts ?? []) : []

  function add() {
    if (!prov) return
    const loc = coast ? { province: prov, coast } : { province: prov }
    if (!isValidUnitLocation(type, loc)) return
    onChange({ ...value, units: [...value.units, { power, type, location: loc }] })
    setProv("")
    setCoast("")
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-2">Copy the board as it stands right now. Start from the standard setup and change what&apos;s different.</p>
      <div className="grid grid-cols-2 gap-2">
        <label>
          <span className="text-sm text-text-2">Year</span>
          <input className={inputCls} inputMode="numeric" value={value.year} onChange={(e) => onChange({ ...value, year: Number(e.target.value) || 0 })} />
        </label>
        <label>
          <span className="text-sm text-text-2">Next orders</span>
          <select className={inputCls} value={value.season} onChange={(e) => onChange({ ...value, season: e.target.value as "spring" | "fall" })}>
            <option value="spring">Spring</option>
            <option value="fall">Fall</option>
          </select>
        </label>
      </div>

      <div>
        <p className="mb-1 text-sm font-medium">Units</p>
        {POWERS.map((p) => {
          const list = value.units.filter((u) => u.power === p)
          if (!list.length) return null
          return (
            <div key={p} className="mb-2">
              <p className="text-xs text-text-3">{powerName(p)}</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {list.map((u: Unit) => (
                  <button
                    key={u.location.province}
                    onClick={() => onChange({ ...value, units: value.units.filter((x) => x !== u) })}
                    className="rounded-full border border-line bg-surface-2 px-2.5 py-1 font-mono text-xs"
                    aria-label={`Remove ${unitLabel(u)}`}
                  >
                    {unitLabel(u)} ×
                  </button>
                ))}
              </div>
            </div>
          )
        })}
        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
          <select className={inputCls} value={power} onChange={(e) => setPower(e.target.value as Power)} aria-label="Power">
            {POWERS.map((p) => (
              <option key={p} value={p}>
                {powerName(p)}
              </option>
            ))}
          </select>
          <select className={inputCls} value={type} onChange={(e) => setType(e.target.value as UnitType)} aria-label="Unit type">
            <option value="A">Army</option>
            <option value="F">Fleet</option>
          </select>
          <select className={inputCls} value={prov} onChange={(e) => setProv(e.target.value)} aria-label="Province">
            <option value="">Province…</option>
            {choices.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {coasts.length ? (
            <select className={inputCls} value={coast} onChange={(e) => setCoast(e.target.value as Coast)} aria-label="Coast">
              <option value="">Coast…</option>
              {coasts.map((c) => (
                <option key={c} value={c}>
                  {placeName({ province: prov, coast: c })}
                </option>
              ))}
            </select>
          ) : (
            <span />
          )}
        </div>
        <Button className="mt-2 w-full" onClick={add} disabled={!prov || (coasts.length > 0 && !coast)}>
          Add unit
        </Button>
      </div>

      <div>
        <p className="mb-1 text-sm font-medium">Supply center owners</p>
        <div className="grid grid-cols-2 gap-1.5">
          {[...SUPPLY_CENTERS].sort((a, b) => PROVINCES[a].name.localeCompare(PROVINCES[b].name)).map((sc) => (
            <label key={sc} className="flex items-center justify-between gap-2 rounded-lg border border-line px-2 py-1">
              <span className="truncate text-xs">{PROVINCES[sc].name}</span>
              <select
                className="rounded-md bg-transparent text-xs"
                value={value.owners[sc] ?? ""}
                onChange={(e) => {
                  const owners = { ...value.owners }
                  if (e.target.value) owners[sc] = e.target.value as Power
                  else delete owners[sc]
                  onChange({ ...value, owners })
                }}
              >
                <option value="">Neutral</option>
                {POWERS.map((p) => (
                  <option key={p} value={p}>
                    {powerName(p)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </div>

      {errors.map((e) => (
        <ErrorText key={e}>{e}</ErrorText>
      ))}
      {warnings.length ? (
        <div className="space-y-1">
          {warnings.map((w) => (
            <div key={w}>
              <Pill tone="warning">{w}</Pill>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
