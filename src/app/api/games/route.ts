import { getDb } from "@/server/db"
import { createGame, type CreateGameInput } from "@/server/games"
import { creatorCookie, handle, readJson, setIdentityCookie } from "@/server/http"

export async function POST(req: Request) {
  return handle(async () => {
    const input = await readJson<CreateGameInput>(req)
    const { code, creatorToken } = await createGame(getDb(), input)
    await setIdentityCookie(creatorCookie(code), creatorToken)
    return { code }
  })
}
