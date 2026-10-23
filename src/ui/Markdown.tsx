import type { Block, Inline } from "../domain/markdown"
import { parseMarkdown } from "../domain/markdown"

const inlineKey = (it: Inline, i: number): string => `${i}:${it.kind}:${it.text.slice(0, 12)}`

const InlineView = ({ items }: { items: readonly Inline[] }) => (
  <>
    {items.map((it, i) => {
      const key = inlineKey(it, i)
      switch (it.kind) {
        case "strong":
          return <strong key={key}>{it.text}</strong>
        case "em":
          return <em key={key}>{it.text}</em>
        case "code":
          return <code key={key}>{it.text}</code>
        case "del":
          return <del key={key}>{it.text}</del>
        case "link":
          return (
            <a key={key} href={it.href} target="_blank" rel="noopener noreferrer">
              {it.text}
            </a>
          )
        case "text":
          return <span key={key}>{it.text}</span>
        default:
          return null
      }
    })}
  </>
)

const Heading = ({ level, items }: { level: 1 | 2 | 3; items: readonly Inline[] }) => {
  const Tag = `h${level}` as const
  return (
    <Tag className="md-heading">
      <InlineView items={items} />
    </Tag>
  )
}

const blockKey = (block: Block, i: number): string => {
  switch (block.kind) {
    case "heading":
      return `${i}:h${block.level}:${block.inlines[0]?.text.slice(0, 16) ?? ""}`
    case "paragraph":
      return `${i}:p:${block.inlines[0]?.text.slice(0, 16) ?? ""}`
    case "code":
      return `${i}:code:${block.lang}:${block.text.slice(0, 16)}`
    case "quote":
      return `${i}:q:${block.inlines[0]?.text.slice(0, 16) ?? ""}`
    case "list":
      return `${i}:list:${block.ordered ? "ol" : "ul"}:${block.items.length}`
  }
}

const BlockView = ({ block }: { block: Block }) => {
  switch (block.kind) {
    case "heading":
      return <Heading level={block.level} items={block.inlines} />
    case "paragraph":
      return (
        <p className="md-p">
          <InlineView items={block.inlines} />
        </p>
      )
    case "code":
      return (
        <pre className="md-code" data-lang={block.lang}>
          <code>{block.text}</code>
        </pre>
      )
    case "quote":
      return (
        <blockquote className="md-quote">
          <InlineView items={block.inlines} />
        </blockquote>
      )
    case "list": {
      const items = block.items.map((it) => (
        <li key={it.map((x) => `${x.kind}:${x.text}`).join("|")}>
          <InlineView items={it} />
        </li>
      ))
      return block.ordered ? (
        <ol className="md-list">{items}</ol>
      ) : (
        <ul className="md-list">{items}</ul>
      )
    }
  }
}

export const Markdown = ({ text }: { text: string }) => (
  <div className="md">
    {parseMarkdown(text).map((b, i) => (
      <BlockView key={blockKey(b, i)} block={b} />
    ))}
  </div>
)
