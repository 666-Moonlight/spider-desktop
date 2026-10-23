import { describe, expect, test } from "bun:test"
import { parseInline, parseMarkdown, safeHref } from "../src/domain/markdown"

describe("safeHref", () => {
  test("allows http, https, mailto, anchors and site paths", () => {
    expect(safeHref("https://example.com/a?b=1")).toBe("https://example.com/a?b=1")
    expect(safeHref("http://127.0.0.1:4319/x")).toBe("http://127.0.0.1:4319/x")
    expect(safeHref("mailto:a@b.c")).toBe("mailto:a@b.c")
    expect(safeHref("#section")).toBe("#section")
    expect(safeHref("/api/maps")).toBe("/api/maps")
  })

  test("rejects script-bearing and protocol-relative schemes", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull()
    expect(safeHref("JavaScript:alert(1)")).toBeNull()
    expect(safeHref("data:text/html,<script>")).toBeNull()
    expect(safeHref("vbscript:msgbox(1)")).toBeNull()
    expect(safeHref("//evil.example")).toBeNull()
    expect(safeHref("   ")).toBeNull()
  })
})

describe("parseInline", () => {
  test("recognises bold, italic, code, strike and links", () => {
    expect(parseInline("**粗** *斜* `码` ~~删~~ [链](https://a.b)")).toEqual([
      { kind: "strong", text: "粗" },
      { kind: "text", text: " " },
      { kind: "em", text: "斜" },
      { kind: "text", text: " " },
      { kind: "code", text: "码" },
      { kind: "text", text: " " },
      { kind: "del", text: "删" },
      { kind: "text", text: " " },
      { kind: "link", text: "链", href: "https://a.b" },
    ])
  })

  test("degrades an unsafe link to its text", () => {
    expect(parseInline("[x](javascript:alert(1))")).toEqual([
      {
        kind: "text",
        text: "x",
      },
    ])
  })
})

describe("parseMarkdown blocks", () => {
  test("parses heading, list, quote and paragraph in order", () => {
    const blocks = parseMarkdown("## 标题\n\n- 一\n- 二\n\n> 引用\n\n正文段落")
    expect(blocks.map((b) => b.kind)).toEqual(["heading", "list", "quote", "paragraph"])
    const heading = blocks[0]
    expect(heading?.kind === "heading" && heading.level).toBe(2)
    const list = blocks[1]
    expect(list?.kind === "list" && list.items.length).toBe(2)
  })

  test("separates ordered from unordered lists", () => {
    const blocks = parseMarkdown("1. 甲\n2. 乙")
    const list = blocks[0]
    expect(list?.kind === "list" && list.ordered).toBe(true)
  })

  test("keeps fenced code verbatim and never parses its inlines", () => {
    const blocks = parseMarkdown("```ts\nconst a = **not bold**\n```")
    expect(blocks).toEqual([
      {
        kind: "code",
        lang: "ts",
        text: "const a = **not bold**",
      },
    ])
  })

  test("does not treat a heading marker inside a paragraph as a block", () => {
    const blocks = parseMarkdown("第一行\n# 第二行")
    expect(blocks.map((b) => b.kind)).toEqual(["paragraph", "heading"])
  })

  test("returns no blocks for whitespace-only input", () => {
    expect(parseMarkdown("   \n\n  ")).toEqual([])
  })
})
