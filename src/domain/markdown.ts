/** Pure markdown parser: no DOM, no React; consumed by src/ui/Markdown.tsx. */

export type Inline =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "strong"; readonly text: string }
  | { readonly kind: "em"; readonly text: string }
  | { readonly kind: "code"; readonly text: string }
  | { readonly kind: "del"; readonly text: string }
  | { readonly kind: "link"; readonly text: string; readonly href: string }

export type Block =
  | {
      readonly kind: "heading"
      readonly level: 1 | 2 | 3
      readonly inlines: readonly Inline[]
    }
  | { readonly kind: "paragraph"; readonly inlines: readonly Inline[] }
  | { readonly kind: "code"; readonly lang: string; readonly text: string }
  | {
      readonly kind: "list"
      readonly ordered: boolean
      readonly items: readonly (readonly Inline[])[]
    }
  | { readonly kind: "quote"; readonly inlines: readonly Inline[] }

const SAFE_HREF = /^(https?:\/\/|mailto:|#|\/(?!\/))/i

/** Security boundary: drops javascript:/data:/vbscript: before any href reaches the DOM. */
export const safeHref = (raw: string): string | null => {
  const href = raw.trim()
  if (href === "") return null
  return SAFE_HREF.test(href) ? href : null
}

interface FoundLink {
  readonly start: number
  readonly end: number
  readonly label: string
  readonly href: string
}

const findLink = (text: string, from: number): FoundLink | null => {
  let open = text.indexOf("[", from)
  while (open !== -1) {
    const close = text.indexOf("](", open + 1)
    if (close !== -1) {
      let depth = 1
      let j = close + 2
      while (j < text.length && depth > 0) {
        const ch = text[j]
        if (ch === "(") depth += 1
        else if (ch === ")") depth -= 1
        if (depth === 0) break
        j += 1
      }
      if (depth === 0) {
        return {
          start: open,
          end: j + 1,
          label: text.slice(open + 1, close),
          href: text.slice(close + 2, j),
        }
      }
    }
    open = text.indexOf("[", open + 1)
  }
  return null
}

const pushEmphasis = (out: Inline[], seg: string): void => {
  for (const part of seg.split(/(\*\*[^*]+\*\*|~~[^~]+~~)/)) {
    if (part === "") continue
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      out.push({ kind: "strong", text: part.slice(2, -2) })
    } else if (part.startsWith("~~") && part.endsWith("~~") && part.length > 4) {
      out.push({ kind: "del", text: part.slice(2, -2) })
    } else {
      pushItalic(out, part)
    }
  }
}

const pushItalic = (out: Inline[], seg: string): void => {
  for (const part of seg.split(/(\*[^*]+\*)/)) {
    if (part === "") continue
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      out.push({ kind: "em", text: part.slice(1, -1) })
    } else {
      out.push({ kind: "text", text: part })
    }
  }
}

const pushPlain = (out: Inline[], seg: string): void => {
  let rest = 0
  for (;;) {
    const link = findLink(seg, rest)
    if (link === null) {
      pushEmphasis(out, seg.slice(rest))
      return
    }
    pushEmphasis(out, seg.slice(rest, link.start))
    const href = safeHref(link.href)
    out.push(
      href === null ? { kind: "text", text: link.label } : { kind: "link", text: link.label, href },
    )
    rest = link.end
  }
}

export const parseInline = (text: string): readonly Inline[] => {
  const out: Inline[] = []
  for (const part of text.split(/(`[^`]+`)/)) {
    if (part === "") continue
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      out.push({ kind: "code", text: part.slice(1, -1) })
    } else {
      pushPlain(out, part)
    }
  }
  return out
}

const headingLevel = (line: string): 1 | 2 | 3 | null => {
  const m = /^(#{1,3})\s+(.*)$/.exec(line)
  if (m === null) return null
  const depth = (m[1] ?? "").length
  return depth === 1 ? 1 : depth === 2 ? 2 : 3
}

const listItem = (line: string): { ordered: boolean; text: string } | null => {
  const ul = /^\s{0,3}[-*+]\s+(.*)$/.exec(line)
  if (ul !== null) return { ordered: false, text: ul[1] ?? "" }
  const ol = /^\s{0,3}\d{1,3}[.)]\s+(.*)$/.exec(line)
  if (ol !== null) return { ordered: true, text: ol[1] ?? "" }
  return null
}

const isBlockStart = (line: string): boolean =>
  line.trim() === "" ||
  line.startsWith("```") ||
  line.startsWith(">") ||
  headingLevel(line) !== null ||
  listItem(line) !== null

export const parseMarkdown = (src: string): readonly Block[] => {
  const lines = src.replace(/\r\n?/g, "\n").split("\n")
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i] ?? ""
    if (line.trim() === "") {
      i += 1
      continue
    }
    const fence = /^```(\w*)\s*$/.exec(line)
    if (fence !== null) {
      const body: string[] = []
      i += 1
      while (i < lines.length && !(lines[i] ?? "").startsWith("```")) {
        body.push(lines[i] ?? "")
        i += 1
      }
      i += 1
      blocks.push({
        kind: "code",
        lang: fence[1] ?? "",
        text: body.join("\n"),
      })
      continue
    }
    const level = headingLevel(line)
    if (level !== null) {
      blocks.push({
        kind: "heading",
        level,
        inlines: parseInline(line.slice(level).trim()),
      })
      i += 1
      continue
    }
    if (line.startsWith(">")) {
      const quoted: string[] = []
      while (i < lines.length && (lines[i] ?? "").startsWith(">")) {
        quoted.push((lines[i] ?? "").replace(/^>\s?/, ""))
        i += 1
      }
      blocks.push({
        kind: "quote",
        inlines: parseInline(quoted.join(" ").trim()),
      })
      continue
    }
    const first = listItem(line)
    if (first !== null) {
      const items: Inline[][] = []
      let ordered = first.ordered
      while (i < lines.length) {
        const cur = listItem(lines[i] ?? "")
        if (cur === null) break
        ordered = cur.ordered
        items.push([...parseInline(cur.text.trim())])
        i += 1
      }
      blocks.push({ kind: "list", ordered, items })
      continue
    }
    const para: string[] = []
    while (i < lines.length && !isBlockStart(lines[i] ?? "")) {
      para.push((lines[i] ?? "").trim())
      i += 1
    }
    blocks.push({
      kind: "paragraph",
      inlines: parseInline(para.join(" ")),
    })
  }
  return blocks
}
