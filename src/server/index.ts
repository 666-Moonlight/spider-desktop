import { Hono } from "hono"
import { aiRoutes } from "./routesAi"
import { chatRoutes } from "./routesChat"
import { graphRoutes } from "./routesGraph"
import { mapRoutes } from "./routesMaps"

const app = new Hono()
app.route("/api/maps", mapRoutes)
app.route("/api", chatRoutes)
app.route("/api", graphRoutes)
app.route("/api", aiRoutes)

const staticDir = process.env["SPIDER_STATIC_DIR"] ?? "./dist"

const server = Bun.serve({
  port: Number(process.env["SPIDER_PORT"] ?? 4319),
  async fetch(req) {
    const url = new URL(req.url)
    if (url.pathname.startsWith("/api/")) return app.fetch(req)
    const path = url.pathname === "/" ? "/index.html" : url.pathname
    const file = Bun.file(`${staticDir}${path}`)
    if (await file.exists()) return new Response(file)
    return new Response(Bun.file(`${staticDir}/index.html`))
  },
})

console.log(`Spider standalone: http://127.0.0.1:${server.port}`)
