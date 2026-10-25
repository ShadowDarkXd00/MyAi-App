import React, { useMemo, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { copyText } from '../lib/bridge'

/* ------------------------------------------------------------------ copy */
function CopyBtn({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      onClick={async () => {
        await copyText(text)
        setDone(true)
        setTimeout(() => setDone(false), 1400)
      }}
      className="btn ghost sm"
      style={{ height: 24, padding: '0 8px', fontSize: 10.5, gap: 4, color: 'var(--ink-3)' }}
    >
      {done ? <Check size={11} /> : <Copy size={11} />}
      {done ? 'Copied' : 'Copy'}
    </button>
  )
}

/* --------------------------------------------------------------- inline md */
function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(\[[^\]]+\]\([^)]+\))|(https?:\/\/[^\s<)]+)/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    const token = m[0]
    const key = `${keyBase}-${i++}`
    if (m[1]) nodes.push(<code key={key}>{token.slice(1, -1)}</code>)
    else if (m[2]) nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>)
    else if (m[3]) nodes.push(<em key={key}>{token.slice(1, -1)}</em>)
    else if (m[4]) {
      const mm = token.match(/\[([^\]]+)\]\(([^)]+)\)/)
      nodes.push(
        <a key={key} href={mm?.[2]} target="_blank" rel="noreferrer noopener">
          {mm?.[1]}
        </a>,
      )
    } else if (m[5]) {
      nodes.push(
        <a key={key} href={token} target="_blank" rel="noreferrer noopener">
          {token.length > 46 ? token.slice(0, 44) + '…' : token}
        </a>,
      )
    }
    last = m.index + token.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

/* -------------------------------------------------------------- block md */
export function Markdown({ text }: { text: string }) {
  const blocks = useMemo(() => parseBlocks(text || ''), [text])
  return <div className="md">{blocks}</div>
}

function parseBlocks(src: string): React.ReactNode[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n')
  const out: React.ReactNode[] = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]

    // fenced code
    const fence = line.match(/^\s*```(\w+)?\s*$/)
    if (fence) {
      const lang = fence[1] || 'text'
      const buf: string[] = []
      i++
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) buf.push(lines[i++])
      i++
      const code = buf.join('\n')
      out.push(
        <div className="codeblock" key={key++}>
          <div className="codeblock-head">
            <span>{lang}</span>
            <CopyBtn text={code} />
          </div>
          <pre>
            <code>{code}</code>
          </pre>
        </div>,
      )
      continue
    }

    // headings
    const h = line.match(/^(#{1,4})\s+(.*)$/)
    if (h) {
      const level = h[1].length
      const content = renderInline(h[2], `h${key}`)
      if (level === 1) out.push(<h1 key={key++}>{content}</h1>)
      else if (level === 2) out.push(<h2 key={key++}>{content}</h2>)
      else out.push(<h3 key={key++}>{content}</h3>)
      i++
      continue
    }

    // hr
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      out.push(<hr key={key++} />)
      i++
      continue
    }

    // table
    if (/^\s*\|/.test(line) && /^\s*\|?[\s:|-]+\|/.test(lines[i + 1] || '')) {
      const header = splitRow(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(splitRow(lines[i++]))
      out.push(
        <table key={key++}>
          <thead>
            <tr>{header.map((c, ci) => <th key={ci}>{renderInline(c, `th${ci}`)}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>{r.map((c, ci) => <td key={ci}>{renderInline(c, `td${ri}${ci}`)}</td>)}</tr>
            ))}
          </tbody>
        </table>,
      )
      continue
    }

    // blockquote
    if (/^\s*>\s?/.test(line)) {
      const buf: string[] = []
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''))
      out.push(<blockquote key={key++}>{renderInline(buf.join(' '), `bq${key}`)}</blockquote>)
      continue
    }

    // lists
    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line)
      const items: string[] = []
      while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*+]|\d+\.)\s+/, ''))
        i++
        // lazy continuation lines
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
          items[items.length - 1] += ' ' + lines[i].trim()
          i++
        }
      }
      const rendered = items.map((it, ii) => <li key={ii}>{renderInline(it, `li${key}${ii}`)}</li>)
      out.push(ordered ? <ol key={key++}>{rendered}</ol> : <ul key={key++}>{rendered}</ul>)
      continue
    }

    // blank
    if (!line.trim()) {
      i++
      continue
    }

    // paragraph
    const buf: string[] = [line]
    i++
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^\s*```/.test(lines[i]) &&
      !/^(#{1,4})\s/.test(lines[i]) &&
      !/^\s*([-*+]|\d+\.)\s+/.test(lines[i]) &&
      !/^\s*\|/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i])
    ) {
      buf.push(lines[i++])
    }
    out.push(<p key={key++}>{renderInline(buf.join('\n'), `p${key}`)}</p>)
  }
  return out
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim())
}
