"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button, Card } from "@/ui/kit"

export default function Home() {
  const router = useRouter()
  const [code, setCode] = useState("")
  return (
    <main className="safe-top safe-bottom mx-auto w-full max-w-md flex-1 space-y-5 px-4 py-10">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Diplomacy companion</h1>
        <p className="mt-2 text-text-2">
          Submit orders from your phone, get every move adjudicated by the rules with an explanation, and step back through the game turn by turn. Keep moving
          the pieces on your own board.
        </p>
      </div>
      <Card className="p-5">
        <h2 className="font-semibold">Start a game</h2>
        <p className="mb-4 mt-1 text-sm text-text-2">Set up players, empires and a game master. Everyone joins by scanning a QR code.</p>
        <Link href="/new" className="block">
          <Button variant="primary" className="w-full">
            Create a game
          </Button>
        </Link>
      </Card>
      <Card className="p-5">
        <h2 className="font-semibold">Watch a game</h2>
        <p className="mb-3 mt-1 text-sm text-text-2">Enter a game code to see the board. To play, scan the QR code the game creator shows you.</p>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (code.trim()) router.push(`/g/${code.trim().toUpperCase()}`)
          }}
        >
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="K7QF2M"
            autoCapitalize="characters"
            autoComplete="off"
            className="min-h-11 flex-1 rounded-xl border border-line bg-surface px-3 font-mono uppercase tracking-widest"
            aria-label="Game code"
          />
          <Button type="submit">Open</Button>
        </form>
      </Card>
      <p className="text-center text-xs text-text-3">Not affiliated with Hasbro or Avalon Hill. Diplomacy is a trademark of Hasbro, Inc.</p>
    </main>
  )
}
