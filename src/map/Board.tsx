"use client"

// The game board: an SVG map with units, supply centers, order arrows,
// highlights, tap targets, and pinch-zoom / pan for phones.

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react"
import { PROVINCES } from "../engine/map/standard"
import type { Power, ProvinceId, Unit } from "../engine/types"
import { locKey } from "../engine/types"
import { POWER_COLORS, POWER_TINTS, TINT_OPACITY } from "./colors"
import { DECOR_PATHS, DISLODGED_OFFSET, LABELS, PROVINCE_PATHS, SC_MARKERS, SC_RADIUS, UNIT_ANCHORS, UNIT_RADIUS, VIEWBOX } from "./geometry"

export type DrawnOrder = {
  power: Power
  kind: "hold" | "move" | "support-hold" | "support-move" | "convoy" | "retreat"
  /** Location key of the ordered unit, e.g. "par", "spa/sc". */
  from: string
  to?: string
  /** For support-move / convoy: location key of the supported / convoyed unit. */
  via?: string
  success: boolean
}

export interface BoardProps {
  units: Unit[]
  owners: Record<ProvinceId, Power>
  dislodged?: Unit[]
  orders?: DrawnOrder[]
  highlight?: { selectable?: string[]; targets?: string[]; selected?: string }
  onProvinceClick?: (province: ProvinceId) => void
  /** Provinces to frame when the board first appears (e.g. the player's units). */
  focus?: ProvinceId[]
  /** Show each power's supply-center count under the map (default true). */
  showCounts?: boolean
  className?: string
}

type Box = { x: number; y: number; w: number; h: number }
const FULL: Box = { x: 0, y: 0, w: VIEWBOX.width, h: VIEWBOX.height }
const MIN_W = 110

const anchor = (key: string) => UNIT_ANCHORS[key] ?? UNIT_ANCHORS[key.split("/")[0]] ?? { x: 0, y: 0 }
const prov = (key: string) => key.split("/")[0]

function clampBox(b: Box): Box {
  const w = Math.min(FULL.w, Math.max(MIN_W, b.w))
  const h = (w * FULL.h) / FULL.w
  return { w, h, x: Math.min(FULL.w - w, Math.max(0, b.x)), y: Math.min(FULL.h - h, Math.max(0, b.y)) }
}

function boxAround(provinces: ProvinceId[]): Box {
  if (!provinces.length) return FULL
  const pts = provinces.map((p) => anchor(p))
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const pad = 45
  let w = Math.max(...xs) - Math.min(...xs) + pad * 2
  let h = Math.max(...ys) - Math.min(...ys) + pad * 2
  if (w / h < FULL.w / FULL.h) w = (h * FULL.w) / FULL.h
  else h = (w * FULL.h) / FULL.w
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2
  const cy = (Math.max(...ys) + Math.min(...ys)) / 2
  return clampBox({ x: cx - w / 2, y: cy - h / 2, w, h })
}

function shorten(a: { x: number; y: number }, b: { x: number; y: number }, by: number) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  return { x: b.x - (dx / len) * by, y: b.y - (dy / len) * by }
}

function arrowHead(from: { x: number; y: number }, tip: { x: number; y: number }, size = 6) {
  const ang = Math.atan2(tip.y - from.y, tip.x - from.x)
  const a1 = ang + Math.PI * 0.82
  const a2 = ang - Math.PI * 0.82
  return `${tip.x},${tip.y} ${tip.x + Math.cos(a1) * size},${tip.y + Math.sin(a1) * size} ${tip.x + Math.cos(a2) * size},${tip.y + Math.sin(a2) * size}`
}

export function Board({ units, owners, dislodged = [], orders = [], highlight, onProvinceClick, focus, showCounts = true, className = "" }: BoardProps) {
  const [box, setBox] = useState<Box>(() => (focus?.length ? boxAround(focus) : FULL))
  const svgRef = useRef<SVGSVGElement>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ box: Box; moved: number; startDist?: number; startMid?: { x: number; y: number } } | null>(null)

  const selectable = useMemo(() => new Set((highlight?.selectable ?? []).map(prov)), [highlight?.selectable])
  const targets = useMemo(() => new Set((highlight?.targets ?? []).map(prov)), [highlight?.targets])
  const selected = highlight?.selected ? prov(highlight.selected) : undefined

  // Pointer → map coordinates.
  function toMap(clientX: number, clientY: number, b: Box) {
    const r = svgRef.current!.getBoundingClientRect()
    return { x: b.x + ((clientX - r.left) / r.width) * b.w, y: b.y + ((clientY - r.top) / r.height) * b.h }
  }

  function onPointerDown(e: ReactPointerEvent<SVGSVGElement>) {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 1) gesture.current = { box, moved: 0 }
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      gesture.current = { box, moved: 99, startDist: Math.hypot(a.x - b.x, a.y - b.y), startMid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }
    }
  }

  function onPointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    const prev = pointers.current.get(e.pointerId)
    if (!prev || !gesture.current) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const r = svgRef.current!.getBoundingClientRect()
    const g = gesture.current
    if (pointers.current.size >= 2 && g.startDist && g.startMid) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      const scale = g.startDist / Math.max(dist, 1)
      const mid = toMap(g.startMid.x, g.startMid.y, g.box)
      const w = g.box.w * scale
      const h = (w * FULL.h) / FULL.w
      const fx = (g.startMid.x - r.left) / r.width
      const fy = (g.startMid.y - r.top) / r.height
      setBox(clampBox({ x: mid.x - fx * w, y: mid.y - fy * h, w, h }))
      return
    }
    const dx = e.clientX - prev.x
    const dy = e.clientY - prev.y
    g.moved += Math.abs(dx) + Math.abs(dy)
    if (g.moved > 6 && box.w < FULL.w) {
      setBox((b) => clampBox({ ...b, x: b.x - (dx / r.width) * b.w, y: b.y - (dy / r.height) * b.h }))
    }
  }

  function onPointerUp(e: ReactPointerEvent<SVGSVGElement>) {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size === 0) setTimeout(() => (gesture.current = null), 0)
  }

  function onWheel(e: ReactWheelEvent<SVGSVGElement>) {
    if (!e.ctrlKey && !e.metaKey && Math.abs(e.deltaY) < 30) return
    const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15
    const at = toMap(e.clientX, e.clientY, box)
    const w = box.w * factor
    const h = (w * FULL.h) / FULL.w
    setBox(clampBox({ x: at.x - ((at.x - box.x) / box.w) * w, y: at.y - ((at.y - box.y) / box.h) * h, w, h }))
  }

  function zoom(factor: number) {
    const cx = box.x + box.w / 2
    const cy = box.y + box.h / 2
    const w = box.w * factor
    const h = (w * FULL.h) / FULL.w
    setBox(clampBox({ x: cx - w / 2, y: cy - h / 2, w, h }))
  }

  function click(p: ProvinceId) {
    if ((gesture.current?.moved ?? 0) > 6) return
    onProvinceClick?.(p)
  }

  const scaleFactor = box.w / FULL.w // labels/units shrink a little less when zoomed in
  const ids = Object.keys(PROVINCE_PATHS)

  return (
    <div className={`relative select-none ${className}`}>
      <svg
        ref={svgRef}
        viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
        className="block h-auto w-full touch-none"
        role="img"
        aria-label="Game board"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        <rect x={0} y={0} width={FULL.w} height={FULL.h} fill="var(--map-sea)" />
        {DECOR_PATHS.filter((d) => d.kind !== "water").map((d) => (
          <path
            key={d.id}
            d={d.d}
            fill={d.kind === "water" ? "var(--map-sea)" : d.kind === "impassable" ? "var(--map-impassable)" : "var(--map-land)"}
            stroke={d.kind === "impassable" ? "var(--map-line)" : "none"}
            strokeWidth={0.5}
          />
        ))}

        {/* Provinces */}
        {ids.map((id) => {
          const p = PROVINCES[id]
          const owner = p.supplyCenter ? owners[id] : undefined
          const isTarget = targets.has(id)
          const isSel = selected === id
          const canSelect = selectable.has(id)
          return (
            <g key={id} onClick={() => click(id)} style={{ cursor: onProvinceClick ? "pointer" : undefined }}>
              <path d={PROVINCE_PATHS[id]} fill={p.kind === "sea" ? "var(--map-sea)" : "var(--map-land)"} stroke="var(--map-line)" strokeWidth={0.6} strokeLinejoin="round" />
              {owner ? <path d={PROVINCE_PATHS[id]} fill={POWER_TINTS[owner]} fillOpacity={TINT_OPACITY} stroke="none" /> : null}
              {isTarget ? <path d={PROVINCE_PATHS[id]} fill="var(--accent)" fillOpacity={0.28} stroke="var(--accent)" strokeWidth={1.4} /> : null}
              {canSelect || isSel ? (
                <path d={PROVINCE_PATHS[id]} fill={isSel ? "var(--accent)" : "none"} fillOpacity={isSel ? 0.18 : 0} stroke="var(--accent)" strokeWidth={isSel ? 2 : 1.3} strokeDasharray={isSel ? undefined : "3 2"} />
              ) : null}
            </g>
          )
        })}

        {/* Water inlets (Bosporus, Danish straits, Kiel canal) sit on top of their provinces. */}
        <g pointerEvents="none">
          {DECOR_PATHS.filter((d) => d.kind === "water").map((d) => (
            <path key={d.id} d={d.d} fill="var(--map-sea)" stroke="none" />
          ))}
        </g>

        {/* Labels and supply centers */}
        <g pointerEvents="none">
          {ids.map((id) => {
            const l = LABELS[id]
            if (!l) return null
            return (
              <text key={id} x={l.x} y={l.y} fontSize={Math.max(6, 8 * Math.sqrt(scaleFactor))} fill="var(--map-label)" fontWeight={500} textAnchor="middle" dominantBaseline="central">
                {PROVINCES[id].abbr}
              </text>
            )
          })}
          {Object.entries(SC_MARKERS).map(([id, m]) => {
            const owner = owners[id]
            const c = owner ? POWER_COLORS[owner] : undefined
            return <circle key={id} cx={m.x} cy={m.y} r={SC_RADIUS} fill={c?.fill ?? "var(--map-sc)"} stroke={c?.stroke ?? "var(--map-line)"} strokeWidth={0.8} />
          })}
        </g>

        {/* Orders */}
        <g pointerEvents="none">
          {orders.map((o, i) => (
            <OrderShape key={i} o={o} />
          ))}
        </g>

        {/* Units */}
        <g pointerEvents="none">
          {units.map((u) => (
            <UnitGlyph key={locKey(u.location)} unit={u} at={anchor(locKey(u.location))} />
          ))}
          {dislodged.map((u) => {
            const a = anchor(locKey(u.location))
            const at = { x: a.x + DISLODGED_OFFSET.x, y: a.y + DISLODGED_OFFSET.y }
            return (
              <g key={`d-${locKey(u.location)}`}>
                <circle cx={at.x} cy={at.y} r={UNIT_RADIUS + 2.5} fill="none" stroke="#e5322d" strokeWidth={1.6} />
                <UnitGlyph unit={u} at={at} />
              </g>
            )
          })}
        </g>
      </svg>

      <div className="absolute right-2 top-2 flex flex-col gap-1">
        <button className="h-9 w-9 rounded-lg border border-line bg-surface/90 text-lg leading-none shadow-sm" onClick={() => zoom(1 / 1.5)} aria-label="Zoom in">
          +
        </button>
        <button className="h-9 w-9 rounded-lg border border-line bg-surface/90 text-lg leading-none shadow-sm" onClick={() => zoom(1.5)} aria-label="Zoom out">
          −
        </button>
        {box.w < FULL.w ? (
          <button className="h-9 w-9 rounded-lg border border-line bg-surface/90 text-[11px] leading-none shadow-sm" onClick={() => setBox(FULL)} aria-label="Show whole map">
            All
          </button>
        ) : null}
      </div>
      {showCounts ? <CenterCounts owners={owners} /> : null}
      <p className="px-3 pb-2 pt-1 text-[10px] text-text-3">Map: Martin Asal, CC BY-SA 3.0 (Wikimedia Commons), adapted</p>
    </div>
  )
}

const COUNT_ORDER: Power[] = ["AUS", "ENG", "FRA", "GER", "ITA", "RUS", "TUR"]
const NAMES: Record<Power, string> = { AUS: "Austria", ENG: "England", FRA: "France", GER: "Germany", ITA: "Italy", RUS: "Russia", TUR: "Turkey" }

/** Supply centers per power: just the color and the number, in a fixed order. */
function CenterCounts({ owners }: { owners: Record<ProvinceId, Power> }) {
  const counts = new Map<Power, number>()
  for (const p of Object.values(owners)) counts.set(p, (counts.get(p) ?? 0) + 1)
  const label = `Supply centers: ${COUNT_ORDER.map((p) => `${NAMES[p]} ${counts.get(p) ?? 0}`).join(", ")}`
  return (
    <ul className="flex items-center justify-between gap-1 border-t border-line px-3 py-2" aria-label={label} title={label}>
      {COUNT_ORDER.map((p) => {
        const n = counts.get(p) ?? 0
        const c = POWER_COLORS[p]
        return (
          <li key={p} className={`flex items-center gap-1 ${n === 0 ? "opacity-40" : ""}`} aria-hidden>
            <span className="h-3.5 w-3.5 shrink-0 rounded-full border ring-1 ring-line-strong" style={{ background: c.fill, borderColor: c.stroke }} />
            <span className="text-sm font-semibold tabular-nums">{n}</span>
          </li>
        )
      })}
    </ul>
  )
}

function UnitGlyph({ unit, at }: { unit: Unit; at: { x: number; y: number } }) {
  const c = POWER_COLORS[unit.power]
  const r = UNIT_RADIUS
  return (
    <g>
      {unit.type === "A" ? (
        <circle cx={at.x} cy={at.y} r={r} fill={c.fill} stroke={c.stroke} strokeWidth={1.1} />
      ) : (
        <path
          d={`M${at.x - r * 1.35},${at.y - r * 0.55} h${r * 2.7} l${-r * 0.45},${r * 1.25} h${-r * 1.8} z`}
          fill={c.fill}
          stroke={c.stroke}
          strokeWidth={1.1}
          strokeLinejoin="round"
        />
      )}
      <text x={at.x} y={at.y + (unit.type === "F" ? 0.3 : 0.4)} fontSize={r * 1.15} fontWeight={700} fill={c.text} textAnchor="middle" dominantBaseline="middle">
        {unit.type}
      </text>
    </g>
  )
}

function OrderShape({ o }: { o: DrawnOrder }) {
  const color = POWER_COLORS[o.power].fill === "#f7f6f1" ? "#6b6b6b" : POWER_COLORS[o.power].fill
  const opacity = o.success ? 0.95 : 0.5
  const from = anchor(o.from)
  const fail = (at: { x: number; y: number }) =>
    o.success ? null : (
      <g stroke="#e5322d" strokeWidth={1.8} strokeLinecap="round">
        <line x1={at.x - 3} y1={at.y - 3} x2={at.x + 3} y2={at.y + 3} />
        <line x1={at.x - 3} y1={at.y + 3} x2={at.x + 3} y2={at.y - 3} />
      </g>
    )

  if (o.kind === "hold") return null

  if ((o.kind === "move" || o.kind === "retreat") && o.to) {
    const to = anchor(o.to)
    const tip = shorten(from, to, UNIT_RADIUS + 1)
    const start = shorten(to, from, UNIT_RADIUS)
    const mid = { x: (start.x + tip.x) / 2, y: (start.y + tip.y) / 2 }
    return (
      <g opacity={opacity}>
        <line x1={start.x} y1={start.y} x2={tip.x} y2={tip.y} stroke="white" strokeWidth={4} strokeLinecap="round" opacity={0.7} />
        <line x1={start.x} y1={start.y} x2={tip.x} y2={tip.y} stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeDasharray={o.kind === "retreat" ? "5 2 1 2" : undefined} />
        <polygon points={arrowHead(start, tip, 6.5)} fill={color} stroke="white" strokeWidth={0.6} />
        {fail(mid)}
      </g>
    )
  }

  if (o.kind === "support-hold" && o.to) {
    const to = anchor(o.to)
    const end = shorten(from, to, UNIT_RADIUS + 3)
    return (
      <g opacity={opacity}>
        <line x1={from.x} y1={from.y} x2={end.x} y2={end.y} stroke={color} strokeWidth={1.6} strokeDasharray="3 2" />
        <circle cx={to.x} cy={to.y} r={UNIT_RADIUS + 3} fill="none" stroke={color} strokeWidth={1.4} strokeDasharray="3 2" />
        {fail({ x: (from.x + end.x) / 2, y: (from.y + end.y) / 2 })}
      </g>
    )
  }

  if ((o.kind === "support-move" || o.kind === "convoy") && o.to && o.via) {
    const a = anchor(o.via)
    const b = anchor(o.to)
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const end = shorten(from, mid, 2)
    return (
      <g opacity={opacity}>
        <line x1={from.x} y1={from.y} x2={end.x} y2={end.y} stroke={color} strokeWidth={1.6} strokeDasharray={o.kind === "convoy" ? "1 2.5" : "3 2"} strokeLinecap="round" />
        <circle cx={mid.x} cy={mid.y} r={2.2} fill={color} />
        {fail({ x: (from.x + end.x) / 2, y: (from.y + end.y) / 2 })}
      </g>
    )
  }
  return null
}
