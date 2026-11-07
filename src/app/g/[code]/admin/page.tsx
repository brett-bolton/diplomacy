"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import QRCode from "qrcode"
import { Suspense, useState } from "react"
import { api } from "@/ui/api"
import { useGame } from "@/ui/hooks"
import { Button, Card, ErrorText, Pill, Sheet } from "@/ui/kit"
import { powerName } from "@/ui/text"

function AdminPage() {
  const { code } = useParams<{ code: string }>()
  const { view, error, refresh } = useGame(code, 4000)
  const [qr, setQr] = useState<{ name: string; url: string; svg: string } | null>(null)
  const [confirmReset, setConfirmReset] = useState<{ id: string; name: string } | null>(null)
  const [confirmDraw, setConfirmDraw] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  async function showQr(id: string, name: string, reset: boolean) {
    setActionError(null)
    try {
      const { url } = await api.joinLink(code, id, reset)
      const svg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" })
      setQr({ name, url, svg })
      refresh()
    } catch (e) {
      setActionError((e as Error).message)
    }
  }

  if (!view) return <main className="mx-auto max-w-md px-4 py-16 text-text-2">{error ? error.message : "Loading…"}</main>
  if (!view.me.creator) {
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <Card className="p-5 text-text-2">Only the person who created this game can see this page.</Card>
      </main>
    )
  }

  const tvUrl = typeof window !== "undefined" ? `${window.location.origin}/g/${view.game.code}/tv` : ""
  const joined = view.participants.filter((p) => p.joined).length

  return (
    <main className="safe-top safe-bottom mx-auto w-full max-w-md flex-1 space-y-4 px-4 py-8">
      <div>
        <p className="text-sm text-text-2">Game code {view.game.code}</p>
        <h1 className="text-2xl font-semibold">{view.game.name}</h1>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Players</h2>
          <span className="text-sm text-text-2">
            {joined} of {view.participants.length} joined
          </span>
        </div>
        <p className="mt-1 text-sm text-text-2">Show each person their own QR code. Scanning it links their phone to their seat. Each code works once.</p>
        <ul className="mt-3 divide-y divide-line">
          {view.participants.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{p.name}</p>
                <p className="truncate text-sm text-text-2">
                  {p.powers.length ? p.powers.map(powerName).join(" + ") : ""}
                  {p.isGameMaster ? (p.powers.length ? " · game master" : "Game master") : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {p.joined ? <Pill tone="success">Joined</Pill> : null}
                {p.joined ? (
                  <Button variant="ghost" className="min-h-9 text-sm" onClick={() => setConfirmReset({ id: p.id, name: p.name })}>
                    Reset phone
                  </Button>
                ) : (
                  <Button className="min-h-9 text-sm" onClick={() => showQr(p.id, p.name, false)}>
                    Show QR
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
        <ErrorText>{actionError}</ErrorText>
      </Card>

      <Card className="space-y-2 p-4">
        <h2 className="font-semibold">Table view</h2>
        <p className="text-sm text-text-2">A read-only board with the timer and center counts, for a TV or laptop at the table.</p>
        <p className="break-all font-mono text-xs text-text-3">{tvUrl}</p>
        <div className="flex gap-2">
          <Link href={`/g/${view.game.code}/tv`} target="_blank" className="flex-1">
            <Button className="w-full">Open table view</Button>
          </Link>
          <Link href={`/g/${view.game.code}`} className="flex-1">
            <Button className="w-full">Open game</Button>
          </Link>
        </div>
      </Card>

      {view.game.status === "active" ? (
        <Card className="space-y-2 p-4">
          <h2 className="font-semibold">End the game</h2>
          <p className="text-sm text-text-2">If the players agree to a draw, record it here. Everyone still on the board shares it.</p>
          <Button variant="ghost" className="text-danger" onClick={() => setConfirmDraw(true)}>
            Record a draw
          </Button>
        </Card>
      ) : null}

      <Sheet open={!!qr} onClose={() => setQr(null)} title={qr ? `QR code for ${qr.name}` : ""}>
        {qr ? (
          <div className="space-y-3">
            <div className="mx-auto w-full max-w-[280px] rounded-xl bg-white p-3" dangerouslySetInnerHTML={{ __html: qr.svg }} />
            <p className="text-center text-sm text-text-2">Only {qr.name} should scan this. It works once.</p>
            <p className="break-all text-center font-mono text-[11px] text-text-3" data-testid="join-url">
              {qr.url}
            </p>
            <Button className="w-full" onClick={() => navigator.clipboard?.writeText(qr.url)}>
              Copy link instead
            </Button>
          </div>
        ) : null}
      </Sheet>

      <Sheet open={!!confirmReset} onClose={() => setConfirmReset(null)} title="Reset this phone?">
        <p className="text-[15px] text-text-2">
          {confirmReset?.name}&apos;s current phone will be signed out. You&apos;ll get a new QR code for them to scan. Their saved orders stay.
        </p>
        <div className="mt-4 grid gap-2">
          <Button
            variant="danger"
            onClick={async () => {
              const r = confirmReset!
              setConfirmReset(null)
              await showQr(r.id, r.name, true)
            }}
          >
            Reset and show new QR
          </Button>
          <Button variant="ghost" onClick={() => setConfirmReset(null)}>
            Cancel
          </Button>
        </div>
      </Sheet>

      <Sheet open={confirmDraw} onClose={() => setConfirmDraw(false)} title="Record a draw?">
        <p className="text-[15px] text-text-2">This ends the game for everyone. It can&apos;t be undone.</p>
        <div className="mt-4 grid gap-2">
          <Button
            variant="danger"
            onClick={async () => {
              setConfirmDraw(false)
              try {
                await api.draw(code)
                refresh()
              } catch (e) {
                setActionError((e as Error).message)
              }
            }}
          >
            End the game as a draw
          </Button>
          <Button variant="ghost" onClick={() => setConfirmDraw(false)}>
            Cancel
          </Button>
        </div>
      </Sheet>
    </main>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-md px-4 py-16 text-text-2">Loading…</main>}>
      <AdminPage />
    </Suspense>
  )
}
