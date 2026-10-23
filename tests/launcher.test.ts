import { describe, expect, test } from "bun:test"
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const repoRoot = join(import.meta.dir, "..")
const launcher = join(repoRoot, "tools", "start.ps1")

type Sandbox = { dir: string; port: number; script: string }

const makeSandbox = async (port: number): Promise<Sandbox> => {
  const dir = await mkdtemp(join(tmpdir(), "spider-launcher-"))
  await mkdir(join(dir, "tools"), { recursive: true })
  await mkdir(join(dir, "dist"), { recursive: true })
  await writeFile(join(dir, "dist", "index.html"), "<!doctype html><title>sandbox</title>")
  await copyFile(launcher, join(dir, "tools", "start.ps1"))
  return { dir, port, script: join(dir, "tools", "start.ps1") }
}

const runSandbox = async (sandbox: Sandbox, extraEnv: Record<string, string>) => {
  const proc = Bun.spawn(
    ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", sandbox.script],
    {
      cwd: sandbox.dir,
      env: {
        ...process.env,
        SPIDER_PORT: String(sandbox.port),
        SPIDER_READY_TIMEOUT: "4",
        SPIDER_NO_BROWSER: "1",
        ...extraEnv,
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  )
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return { out, err, code }
}

const dispose = async (sandbox: Sandbox) => {
  await stopPort(sandbox.port)
  await rm(sandbox.dir, { recursive: true, force: true })
}

const stopPort = async (port: number) => {
  const proc = Bun.spawn([
    "powershell",
    "-NoProfile",
    "-Command",
    `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }`,
  ])
  await proc.exited
}

describe("one-click launcher", () => {
  test("reports failure when the runtime never serves the page", async () => {
    const sandbox = await makeSandbox(4391)
    await writeFile(join(sandbox.dir, "tools", "dead-bun.cmd"), "@echo off\r\nexit /b 0\r\n")

    const result = await runSandbox(sandbox, {
      SPIDER_BUN: join(sandbox.dir, "tools", "dead-bun.cmd"),
    })
    await dispose(sandbox)

    expect(result.code).toBe(1)
    expect(result.out).not.toContain("已成功启动")
    expect(result.out).toContain("[失败]")
    expect(result.out).toContain("4391")
  }, 90_000)

  test("reports failure when SPIDER_BUN points at a missing file", async () => {
    const sandbox = await makeSandbox(4392)

    const result = await runSandbox(sandbox, {
      SPIDER_BUN: join(sandbox.dir, "tools", "does-not-exist.exe"),
    })

    await dispose(sandbox)

    expect(result.code).toBe(1)
    expect(result.out).not.toContain("已成功启动")
    expect(result.out).toContain("SPIDER_BUN")
  }, 90_000)

  test("reports success only after the page actually answers", async () => {
    const sandbox = await makeSandbox(4393)
    const fakeServer = join(sandbox.dir, "tools", "fake-server.ts")
    await writeFile(
      fakeServer,
      `Bun.serve({ port: Number(process.env.SPIDER_PORT), fetch: () => new Response("<title>Spider sandbox</title>", { headers: { "content-type": "text/html" } }) })\nconsole.log("sandbox up")\n`,
    )
    await writeFile(
      join(sandbox.dir, "tools", "live-bun.cmd"),
      `@echo off\r\n"${process.execPath}" "${fakeServer}"\r\n`,
    )

    try {
      const result = await runSandbox(sandbox, {
        SPIDER_BUN: join(sandbox.dir, "tools", "live-bun.cmd"),
      })

      expect(result.code).toBe(0)
      expect(result.out).toContain("已成功启动")
      const page = await fetch(`http://127.0.0.1:${sandbox.port}/`)
      expect(page.status).toBe(200)
      expect(await page.text()).toContain("Spider sandbox")
    } finally {
      await dispose(sandbox)
    }
  }, 90_000)
})
