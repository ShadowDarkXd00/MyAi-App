/**
 * Tiny, dependency-free ANSI → HTML renderer for terminal output.
 * Handles SGR colours (16/256/truecolour), bold, dim, italic, underline and
 * inverse. Everything else is stripped. Input is HTML-escaped first.
 */

const FG: Record<number, string> = {
  30: '#3b4048', 31: '#ff6b81', 32: '#6ee7a8', 33: '#ffd479', 34: '#7aa2ff',
  35: '#d18aff', 36: '#67e8f9', 37: '#dfe3ee', 90: '#6b7280', 91: '#ff8fa3',
  92: '#a7f3c4', 93: '#ffe39b', 94: '#a8c0ff', 95: '#e6b8ff', 96: '#9ef0ff', 97: '#ffffff',
}
const BG: Record<number, string> = {
  40: '#3b4048', 41: '#ff6b81', 42: '#6ee7a8', 43: '#ffd479', 44: '#7aa2ff',
  45: '#d18aff', 46: '#67e8f9', 47: '#dfe3ee', 100: '#6b7280', 101: '#ff8fa3',
  102: '#a7f3c4', 103: '#ffe39b', 104: '#a8c0ff', 105: '#e6b8ff', 106: '#9ef0ff', 107: '#ffffff',
}

function xterm256(n: number): string {
  if (n < 16) {
    const basic = [30, 31, 32, 33, 34, 35, 36, 37, 90, 91, 92, 93, 94, 95, 96, 97]
    return FG[basic[n]] || '#dfe3ee'
  }
  if (n >= 232) {
    const v = 8 + (n - 232) * 10
    return `rgb(${v},${v},${v})`
  }
  const i = n - 16
  const r = Math.floor(i / 36)
  const g = Math.floor((i % 36) / 6)
  const b = i % 6
  const c = (x: number) => (x === 0 ? 0 : 55 + x * 40)
  return `rgb(${c(r)},${c(g)},${c(b)})`
}

export function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

interface Style {
  fg?: string
  bg?: string
  bold?: boolean
  dim?: boolean
  italic?: boolean
  underline?: boolean
  inverse?: boolean
}

function styleToCss(s: Style): string {
  const parts: string[] = []
  let fg = s.fg
  let bg = s.bg
  if (s.inverse) {
    const t = fg
    fg = bg || '#0b0c11'
    bg = t || '#cdd3e4'
  }
  if (fg) parts.push(`color:${fg}`)
  if (bg) parts.push(`background:${bg}`)
  if (s.bold) parts.push('font-weight:700')
  if (s.dim) parts.push('opacity:.62')
  if (s.italic) parts.push('font-style:italic')
  if (s.underline) parts.push('text-decoration:underline')
  return parts.join(';')
}

/** Returns HTML with spans. Strips cursor-movement sequences. */
export function ansiToHtml(input: string): string {
  let out = ''
  let style: Style = {}
  let i = 0
  let buf = ''
  const flush = () => {
    if (!buf) return
    const css = styleToCss(style)
    const html = escapeHtml(buf)
    out += css ? `<span style="${css}">${html}</span>` : html
    buf = ''
  }

  while (i < input.length) {
    const ch = input[i]
    if (ch === '\x1b' && input[i + 1] === '[') {
      flush()
      const m = /^\x1b\[([0-9;?]*)([A-Za-z])/.exec(input.slice(i))
      if (!m) {
        i += 1
        continue
      }
      const params = m[1]
      const cmd = m[2]
      i += m[0].length
      if (cmd === 'm') {
        const codes = params.split(';').filter((x) => x !== '').map(Number)
        if (!codes.length) style = {}
        for (let k = 0; k < codes.length; k++) {
          const c = codes[k]
          if (c === 0) style = {}
          else if (c === 1) style.bold = true
          else if (c === 2) style.dim = true
          else if (c === 3) style.italic = true
          else if (c === 4) style.underline = true
          else if (c === 7) style.inverse = true
          else if (c === 22) { style.bold = false; style.dim = false }
          else if (c === 23) style.italic = false
          else if (c === 24) style.underline = false
          else if (c === 27) style.inverse = false
          else if (c === 39) style.fg = undefined
          else if (c === 49) style.bg = undefined
          else if (FG[c]) style.fg = FG[c]
          else if (BG[c]) style.bg = BG[c]
          else if (c === 38 || c === 48) {
            const isFg = c === 38
            const mode = codes[k + 1]
            if (mode === 5) {
              const n = codes[k + 2]
              const col = xterm256(n)
              if (isFg) style.fg = col
              else style.bg = col
              k += 2
            } else if (mode === 2) {
              const r = codes[k + 2], g = codes[k + 3], b = codes[k + 4]
              const col = `rgb(${r},${g},${b})`
              if (isFg) style.fg = col
              else style.bg = col
              k += 4
            }
          }
        }
      }
      // cursor movement / other CSI: ignored
      continue
    }
    if (ch === '\x1b') {
      // other escapes (OSC etc.) — skip to terminator
      flush()
      i += 1
      continue
    }
    if (ch === '\r') {
      // carriage return: strip trailing spaces on the current visual line
      const idx = out.lastIndexOf('\n')
      const tail = out.slice(idx + 1)
      const cleaned = tail.replace(/<[^>]+>/g, (m) => m).replace(/\s+$/, '')
      void cleaned
      i += 1
      continue
    }
    if (ch === '\b') {
      flush()
      out = out.replace(/(?:<[^>]+>)*[^<]\s*$/, '')
      i += 1
      continue
    }
    if (ch === '\u0007') {
      i += 1
      continue
    }
    buf += ch
    i++
  }
  flush()
  return out
}

/** Remove ANSI entirely (for copying / logs). */
export function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '')
}
