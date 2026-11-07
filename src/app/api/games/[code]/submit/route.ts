import { getDb } from "@/server/db"
import { submitOrders } from "@/server/games"
import { credentialsFor, handle, readJson } from "@/server/http"

export async function POST(req: Request, ctx: RouteContext<"/api/games/[code]/submit">) {
  const { code } = await ctx.params
  return handle(async () => {
    const { requestId } = await readJson<{ requestId: string }>(req)
    return submitOrders(getDb(), code, await credentialsFor(code), String(requestId ?? ""))
  })
}
