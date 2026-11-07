"use client"

import { useParams, useRouter } from "next/navigation"
import { Suspense, useEffect, useRef, useState } from "react"
import { api } from "@/ui/api"
import { Button, Card, ErrorText } from "@/ui/kit"

/**
 * QR-code landing page. The one-time token is in the URL fragment (never sent to
 * the server in the page request, so link previewers can't use it up). The page
 * swaps it for a device cookie, then opens the game.
 */
function JoinPage() {
  const { code } = useParams<{ code: string }>()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const started = useRef(false)

  async function join() {
    const token = window.location.hash.slice(1)
    if (!token) {
      setError("This link is missing its join code. Scan the QR code again.")
      return
    }
    setBusy(true)
    try {
      await api.join(code, token)
      history.replaceState(null, "", window.location.pathname)
      router.replace(`/g/${code}`)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  useEffect(() => {
    if (started.current) return
    started.current = true
    join()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <main className="safe-top mx-auto w-full max-w-md flex-1 px-4 py-16">
      <Card className="space-y-3 p-6">
        <h1 className="text-xl font-semibold">Joining game {code}…</h1>
        {error ? (
          <>
            <ErrorText>{error}</ErrorText>
            <Button onClick={join} disabled={busy}>
              Try again
            </Button>
          </>
        ) : (
          <p className="text-text-2">Linking this phone to your seat.</p>
        )}
      </Card>
    </main>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-md px-4 py-16 text-text-2">Loading…</main>}>
      <JoinPage />
    </Suspense>
  )
}
