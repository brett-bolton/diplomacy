import { getDb } from "@/server/db"
import { joinGame } from "@/server/games"
import { deviceCookie, handle, readJson, setIdentityCookie } from "@/server/http"

export async function POST(req: Request, ctx: RouteContext<"/api/games/[code]/join">) {
  const { code } = await ctx.params
  return handle(async () => {
    const { token } = await readJson<{ token: string }>(req)
    const { deviceToken, name } = await joinGame(getDb(), code, String(token ?? ""))
    await setIdentityCookie(deviceCookie(code), deviceToken)
    return { name }
  })
}
