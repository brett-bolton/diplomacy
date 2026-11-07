import { getDb } from "@/server/db"
import { issueJoinToken } from "@/server/games"
import { credentialsFor, handle, readJson } from "@/server/http"

/** Creator: a fresh one-time join link. The token goes in the URL fragment so it's never sent to a server or link previewer. */
export async function POST(req: Request, ctx: RouteContext<"/api/games/[code]/participants/[id]/link">) {
  const { code, id } = await ctx.params
  return handle(async () => {
    const { reset } = await readJson<{ reset?: boolean }>(req)
    const token = await issueJoinToken(getDb(), code, await credentialsFor(code), id, !!reset)
    const origin = new URL(req.url).origin
    return { url: `${origin}/j/${code.toUpperCase()}#${token}` }
  })
}
