import { useEffect, useRef } from 'react'
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, dropCursor, rectangularSelection, crosshairCursor } from '@codemirror/view'
import { EditorState, Compartment } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { autocompletion, completionKeymap } from '@codemirror/autocomplete'
import { bracketMatching, indentOnInput, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { javascript } from '@codemirror/lang-javascript'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { json } from '@codemirror/lang-json'
import { python } from '@codemirror/lang-python'
import { markdown } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'
import { guessLang } from '../lib/util'

function langExt(path: string) {
  switch (guessLang(path)) {
    case 'typescript':
      return javascript({ typescript: true })
    case 'tsx':
      return javascript({ typescript: true, jsx: true })
    case 'jsx':
    case 'javascript':
      return javascript({ jsx: true })
    case 'html':
      return html()
    case 'css':
      return css()
    case 'json':
      return json()
    case 'python':
      return python()
    case 'markdown':
      return markdown()
    default:
      return []
  }
}

const baseTheme = EditorView.theme({
  '&': { backgroundColor: 'transparent', color: 'var(--ink)', height: '100%' },
  '.cm-content': { caretColor: 'var(--a2)', padding: '10px 0 40px' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--a2)', borderLeftWidth: '2px' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'color-mix(in oklab, var(--a1) 32%, transparent) !important',
  },
  '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--ink-4)', border: 'none', paddingRight: 4 },
  '.cm-activeLine': { backgroundColor: 'color-mix(in oklab, var(--a1) 8%, transparent)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--ink-2)' },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 6px 0 8px', fontSize: '11px', minWidth: '26px' },
  '.cm-scroller': { overflow: 'auto' },
  '.cm-matchingBracket': { backgroundColor: 'color-mix(in oklab, var(--a2) 22%, transparent)', outline: 'none' },
  '.cm-selectionMatch': { backgroundColor: 'color-mix(in oklab, var(--a1) 18%, transparent)' },
})

export function CodeEditor({
  path, value, onChange, readOnly,
}: {
  path: string
  value: string
  onChange: (v: string) => void
  readOnly?: boolean
}) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const langComp = useRef(new Compartment())
  const readComp = useRef(new Compartment())
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!host.current) return
    const dark = document.documentElement.dataset.theme !== 'light'
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        history(),
        drawSelection(),
        dropCursor(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        indentOnInput(),
        bracketMatching(),
        autocompletion(),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, ...completionKeymap, indentWithTab]),
        baseTheme,
        ...(dark ? [oneDark] : [syntaxHighlighting(defaultHighlightStyle, { fallback: true })]),
        langComp.current.of(langExt(path)),
        readComp.current.of(EditorState.readOnly.of(!!readOnly)),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChangeRef.current(u.state.doc.toString())
        }),
      ],
    })
    const v = new EditorView({ state, parent: host.current })
    view.current = v
    return () => {
      v.destroy()
      view.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path])

  // external value changes (e.g. reload from disk)
  useEffect(() => {
    const v = view.current
    if (!v) return
    const cur = v.state.doc.toString()
    if (cur !== value && !v.hasFocus) {
      v.dispatch({ changes: { from: 0, to: cur.length, insert: value } })
    }
  }, [value])

  return <div className="editorhost" ref={host} />
}
