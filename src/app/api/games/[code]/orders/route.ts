import { getDb } from "@/server/db"
import { saveDraft, type AnyOrder } from "@/server/games"
import { credentialsFor, handle, readJson } from "@/server/http"
import type { Power } from "@/engine/types"

export async function PUT(req: Request, ctx: RouteContext<"/api/games/[code]/orders">) {
  const { code } = await ctx.params
  return handle(async () => {
    const { power, orders } = await readJson<{ power: Power; orders: AnyOrder[] }>(req)
    await saveDraft(getDb(), code, await credentialsFor(code), power, orders)
  })
}
