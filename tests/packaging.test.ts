import { describe, expect, test } from "bun:test"
import { join } from "node:path"

const repoRoot = join(import.meta.dir, "..")
const serverEntry = join(repoRoot, "src", "server", "index.ts")

const readSource = (path: string) => Bun.file(path).text()

describe("sidecar packaging contract", () => {
  test("server serves static files from SPIDER_STATIC_DIR", async () => {
    const source = await readSource(serverEntry)
    expect(source).toContain('process.env["SPIDER_STATIC_DIR"]')
  })

  test("tauri config ships the sidecar and the built frontend", async () => {
    const raw = await readSource(join(repoRoot, "src-tauri", "tauri.conf.json"))
    const conf = JSON.parse(raw) as {
      bundle?: { externalBin?: string[]; resources?: Record<string, string> }
    }
    expect(conf.bundle?.externalBin).toContain("binaries/spider-server")
    expect(JSON.stringify(conf.bundle?.resources)).toContain("dist")
    expect(JSON.stringify(conf.bundle?.resources)).toContain("seed")
  })
  test("cargo crate name matches the shipped product name", async () => {
    const cargo = await readSource(join(repoRoot, "src-tauri", "Cargo.toml"))
    expect(cargo).toContain('name = "spider"')
    expect(await readSource(join(repoRoot, "src-tauri", "src", "main.rs"))).toContain(
      "spider_lib::run()",
    )
  })
})
