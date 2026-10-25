import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ChevronRight, File, FilePlus2, FolderPlus, Folder, FolderOpen, RefreshCw, Save,
  Trash2, X, Code2, Eye, FolderTree, ExternalLink, Loader2, RotateCw, ArrowLeft, PanelLeft,
  Wand2,
} from 'lucide-react'
import { useStore } from '../lib/store'
import { fsDelete, fsList, fsMkdir, fsRead, fsWrite, homeDir, relPath, joinPath } from '../lib/bridge'
import { fmtBytes, guessLang } from '../lib/util'
import { Btn, Empty, Sheet, Segmented, SkillIcon } from '../components/ui'
import { TEMPLATES, type Template } from '../lib/templates'
import { CodeEditor } from '../components/CodeEditor'
import type { FsEntry } from '../lib/types'

type Mode = 'files' | 'code' | 'preview'

export function StudioScreen() {
  const [mode, setMode] = useState<Mode>('code')
  const [cwd, setCwd] = useState(homeDir)
  const [entries, setEntries] = useState<FsEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [openTabs, setOpenTabs] = useState<{ path: string; content: string; dirty: boolean }[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [previewDoc, setPreviewDoc] = useState<string>('')
  const [previewPath, setPreviewPath] = useState<string>('')
  const [busyPreview, setBusyPreview] = useState(false)
  const [treeOpen, setTreeOpen] = useState(false)
  const [newFileOpen, setNewFileOpen] = useState(false)
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [tplOpen, setTplOpen] = useState(false)
  const [name, setName] = useState('')
  const store = useStore()
  const toast = store.toast

  const refresh = useCallback(async (dir = cwd) => {
    setLoading(true)
    const items = await fsList(dir)
    setEntries(items.filter((e) => !e.name.startsWith('.shadowcode')))
    setLoading(false)
  }, [cwd])

  useEffect(() => {
    void refresh(cwd)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwd])

  const openFile = async (path: string) => {
    const existing = openTabs.find((t) => t.path === path)
    if (existing) {
      setActive(path)
      setMode('code')
      return
    }
    const content = await fsRead(path)
    setOpenTabs((t) => [...t, { path, content, dirty: false }])
    setActive(path)
    setMode('code')
  }

  const activeTab = openTabs.find((t) => t.path === active) || null

  const save = async (path = active, content?: string) => {
    const tab = openTabs.find((t) => t.path === path)
    const data = content ?? tab?.content ?? ''
    const ok = await fsWrite(path!, data)
    if (ok) {
      setOpenTabs((t) => t.map((x) => (x.path === path ? { ...x, dirty: false, content: data } : x)))
      toast('Saved', 'ok')
      void refresh(cwd)
    } else toast('Save failed', 'bad')
  }

  const closeTab = (path: string) => {
    setOpenTabs((t) => t.filter((x) => x.path !== path))
    if (active === path) setActive(openTabs.find((t) => t.path !== path)?.path || null)
  }

  const buildPreview = async (path: string) => {
    setBusyPreview(true)
    let html = await fsRead(path)
    if (!html) {
      toast('File is empty', 'bad')
      setBusyPreview(false)
      return
    }
    const dir = path.split('/').slice(0, -1).join('/')
    // inline sibling css/js so the sandboxed iframe works without a server
    const linkRe = /<link[^>]+href=["']([^"']+\.css)["'][^>]*>/gi
    const cssMatches = [...html.matchAll(linkRe)]
    for (const m of cssMatches) {
      const href = m[1]
      if (/^https?:/.test(href)) continue
      const cssText = await fsRead(joinPath(dir, href.replace(/^\.\//, '')))
      if (cssText) html = html.replace(m[0], `<style>${cssText}</style>`)
    }
    const scriptRe = /<script[^>]+src=["']([^"']+\.js)["'][^>]*>\s*<\/script>/gi
    const jsMatches = [...html.matchAll(scriptRe)]
    for (const m of jsMatches) {
      const src = m[1]
      if (/^https?:/.test(src)) continue
      const js = await fsRead(joinPath(dir, src.replace(/^\.\//, '')))
      if (js) html = html.replace(m[0], `<script>${js}<\/script>`)
    }
    setPreviewDoc(html)
    setPreviewPath(path)
    setMode('preview')
    setBusyPreview(false)
  }

  const pickPreviewTarget = async () => {
    const index = joinPath(cwd, 'index.html')
    const tryFiles = [active, index, ...entries.filter((e) => e.name.endsWith('.html')).map((e) => e.path)]
    for (const f of tryFiles) {
      if (f && f.endsWith('.html')) {
        const c = await fsRead(f)
        if (c) return buildPreview(f)
      }
    }
    toast('No HTML file to preview yet', 'bad')
  }

  const createFile = async () => {
    const clean = name.trim().replace(/\s+/g, '-')
    if (!clean) return
    const p = joinPath(cwd, clean)
    await fsWrite(p, '')
    setNewFileOpen(false)
    setName('')
    await refresh(cwd)
    void openFile(p)
  }
  const createFolder = async () => {
    const clean = name.trim().replace(/\s+/g, '-')
    if (!clean) return
    await fsMkdir(joinPath(cwd, clean))
    setNewFolderOpen(false)
    setName('')
    void refresh(cwd)
  }

  const sorted = useMemo(
    () => [...entries].sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1)),
    [entries],
  )

  return (
    <div className="screen" style={{ padding: '0 12px' }}>
      <div className="row" style={{ gap: 8, padding: '0 4px 10px' }}>
        <button className="row grow" style={{ gap: 6, minWidth: 0 }} onClick={() => setTreeOpen(true)}>
          <FolderOpen size={16} style={{ color: 'var(--a2)' }} />
          <span className="mono truncate" style={{ fontSize: 12.5 }}>{cwd === homeDir ? '~' : '~/' + relPath(cwd)}</span>
          <ChevronRight size={13} className="muted" />
        </button>
        <Btn variant="ghost" icon size="sm" onClick={() => setTplOpen(true)} aria-label="Templates">
          <Wand2 size={17} />
        </Btn>
        <Btn variant="ghost" icon size="sm" onClick={() => void refresh(cwd)} aria-label="Refresh">
          <RefreshCw size={16} className={loading ? 'spin' : ''} />
        </Btn>
        <Btn variant="ghost" icon size="sm" onClick={() => { setName(''); setNewFileOpen(true) }} aria-label="New file">
          <FilePlus2 size={17} />
        </Btn>
        <Btn variant="ghost" icon size="sm" onClick={() => { setName(''); setNewFolderOpen(true) }} aria-label="New folder">
          <FolderPlus size={17} />
        </Btn>
      </div>

      <div style={{ marginBottom: 10 }}>
        <Segmented<Mode>
          value={mode}
          onChange={setMode}
          options={[
            { value: 'files', label: 'Files', icon: <FolderTree size={13} /> },
            { value: 'code', label: 'Code', icon: <Code2 size={13} /> },
            { value: 'preview', label: 'Preview', icon: <Eye size={13} /> },
          ]}
        />
      </div>

      <div className="studio-body">
        <AnimatePresence mode="wait" initial={false}>
          {mode === 'files' && (
            <motion.div key="files" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <FileTree
                cwd={cwd}
                entries={sorted}
                loading={loading}
                onUp={() => setCwd(cwd === homeDir ? homeDir : cwd.split('/').slice(0, -1).join('/') || homeDir)}
                onOpen={(e) => (e.dir ? setCwd(e.path) : void openFile(e.path))}
                onDelete={async (e) => {
                  if (!confirm(`Delete ${e.name}?`)) return
                  await fsDelete(e.path)
                  void refresh(cwd)
                }}
                onPreviewHTML={(e) => void buildPreview(e.path)}
              />
            </motion.div>
          )}

          {mode === 'code' && (
            <motion.div key="code" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <div className="tabs">
                {openTabs.map((t) => (
                  <button key={t.path} className={`tab ${t.path === active ? 'on' : ''}`} onClick={() => setActive(t.path)}>
                    {t.dirty && <span className="dotmark" />}
                    <span className="mono">{t.path.split('/').pop()}</span>
                    <span
                      onClick={(e) => { e.stopPropagation(); closeTab(t.path) }}
                      style={{ display: 'grid', placeItems: 'center', opacity: 0.6 }}
                    >
                      <X size={11} />
                    </span>
                  </button>
                ))}
                <div className="spacer" />
                {activeTab && (
                  <Btn variant="ghost" icon size="sm" onClick={() => void save()} aria-label="Save" style={{ color: activeTab.dirty ? 'var(--a2)' : 'var(--ink-4)' }}>
                    <Save size={15} />
                  </Btn>
                )}
              </div>
              {activeTab ? (
                <>
                  <div className="row" style={{ padding: '4px 12px 6px', gap: 8, borderBottom: '1px solid var(--line)' }}>
                    <span className="tiny mono dim truncate">{relPath(activeTab.path)}</span>
                    <div className="spacer" />
                    <span className="tiny dim">{guessLang(activeTab.path)}</span>
                    {activeTab.path.endsWith('.html') && (
                      <button className="tiny" style={{ color: 'var(--a2)', fontWeight: 650 }} onClick={() => void buildPreview(activeTab.path)}>
                        Run
                      </button>
                    )}
                  </div>
                  <CodeEditor
                    path={activeTab.path}
                    value={activeTab.content}
                    onChange={(v) =>
                      setOpenTabs((tabs) => tabs.map((t) => (t.path === activeTab.path ? { ...t, content: v, dirty: true } : t)))
                    }
                  />
                </>
              ) : (
                <Empty
                  icon={<Code2 size={24} />}
                  title="No file open"
                  sub="Pick a file from the Files tab, or create one."
                  action={<Btn size="sm" onClick={() => setMode('files')}>Browse files</Btn>}
                />
              )}
            </motion.div>
          )}

          {mode === 'preview' && (
            <motion.div key="preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <div className="row" style={{ padding: '6px 10px', gap: 8, borderBottom: '1px solid var(--line)' }}>
                <span className="tiny mono dim truncate grow">{previewPath ? relPath(previewPath) : 'nothing loaded'}</span>
                <Btn variant="ghost" icon size="sm" onClick={() => void pickPreviewTarget()} aria-label="Reload">
                  <RotateCw size={14} />
                </Btn>
                <Btn variant="ghost" icon size="sm" onClick={() => setMode('code')} aria-label="Back">
                  <ArrowLeft size={15} />
                </Btn>
              </div>
              <div className="previewframe">
                {previewDoc ? (
                  <iframe title="preview" sandbox="allow-scripts allow-forms allow-modals allow-popups" srcDoc={previewDoc} />
                ) : (
                  <div style={{ background: 'var(--surface-solid)', height: '100%' }}>
                    <Empty
                      icon={<Eye size={24} />}
                      title="Nothing to preview"
                      sub="Open an HTML file and tap Run, or ask the agent to build a page."
                      action={<Btn size="sm" variant="accent" onClick={() => void pickPreviewTarget()}>Run index.html</Btn>}
                    />
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* bottom quick actions */}
      <div className="row" style={{ padding: '10px 0 2px', gap: 8 }}>
        <Btn size="sm" block onClick={() => void pickPreviewTarget()} disabled={busyPreview}>
          {busyPreview ? <Loader2 size={14} className="spin" /> : <Eye size={14} />} Run page
        </Btn>
        <Btn size="sm" block onClick={() => setTreeOpen(true)}>
          <PanelLeft size={14} /> Tree
        </Btn>
        <Btn size="sm" block variant={activeTab?.dirty ? 'accent' : 'default'} onClick={() => void save()} disabled={!activeTab}>
          <Save size={14} /> Save
        </Btn>
      </div>

      <Sheet open={treeOpen} onClose={() => setTreeOpen(false)} title={relPath(cwd)}>
        <FileTree
          cwd={cwd}
          entries={sorted}
          loading={loading}
          onUp={() => setCwd(cwd === homeDir ? homeDir : cwd.split('/').slice(0, -1).join('/') || homeDir)}
          onOpen={(e) => {
            setTreeOpen(false)
            if (e.dir) setCwd(e.path)
            else void openFile(e.path)
          }}
          onDelete={async (e) => {
            if (!confirm(`Delete ${e.name}?`)) return
            await fsDelete(e.path)
            void refresh(cwd)
          }}
          onPreviewHTML={(e) => {
            setTreeOpen(false)
            void buildPreview(e.path)
          }}
        />
      </Sheet>

      <Sheet open={newFileOpen} onClose={() => setNewFileOpen(false)} title="New file" footer={<Btn variant="accent" block onClick={createFile}><FilePlus2 size={15} /> Create</Btn>}>
        <input autoFocus className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="app.js · index.html · notes.md" />
        <div className="tiny dim" style={{ marginTop: 8 }}>Created in {relPath(cwd)}</div>
      </Sheet>
      <Sheet open={newFolderOpen} onClose={() => setNewFolderOpen(false)} title="New folder" footer={<Btn variant="accent" block onClick={createFolder}><FolderPlus size={15} /> Create</Btn>}>
        <input autoFocus className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="components" />
        <div className="tiny dim" style={{ marginTop: 8 }}>Created in {relPath(cwd)}</div>
      </Sheet>

      <Sheet open={tplOpen} onClose={() => setTplOpen(false)} title="Start from a template">
        <div className="small muted" style={{ marginBottom: 12 }}>
          Creates a folder with working files, opens it in the editor and runs the preview.
        </div>
        <TemplateList
          onPick={async (t: Template) => {
            setTplOpen(false)
            const folder = t.id === 'blank' ? 'page' : t.id === 'deck' ? 'slides' : t.id
            let base = joinPath(cwd, folder)
            let n = 2
            while ((await fsList(base)).length) {
              base = joinPath(cwd, `${folder}-${n++}`)
            }
            await fsMkdir(base)
            for (const [file, content] of Object.entries(t.files)) {
              await fsWrite(joinPath(base, file), content)
            }
            await refresh(base)
            setCwd(base)
            const entry = joinPath(base, t.entry)
            await openFile(entry)
            void buildPreview(entry)
          }}
        />
      </Sheet>
    </div>
  )
}

function FileTree({
  cwd, entries, loading, onUp, onOpen, onDelete, onPreviewHTML,
}: {
  cwd: string
  entries: FsEntry[]
  loading: boolean
  onUp: () => void
  onOpen: (e: FsEntry) => void
  onDelete: (e: FsEntry) => void
  onPreviewHTML: (e: FsEntry) => void
}) {
  return (
    <div className="tree">
      <button className="tree-row" onClick={onUp} style={{ color: 'var(--ink-3)' }}>
        <ArrowLeft size={14} /> <span>Up</span>
        <span className="sz mono">{relPath(cwd)}</span>
      </button>
      {loading && [0, 1, 2].map((i) => (
        <div key={i} className="skeleton" style={{ height: 30, margin: '6px 8px' }} />
      ))}
      {!loading && !entries.length && (
        <div className="small muted" style={{ padding: 18, textAlign: 'center' }}>Empty folder</div>
      )}
      {entries.map((e) => (
        <div key={e.path} className="row" style={{ gap: 2 }}>
          <button className="tree-row grow" onClick={() => onOpen(e)}>
            {e.dir ? <Folder size={14} color="var(--a2)" /> : <File size={14} className="muted" />}
            <span className="truncate">{e.name}</span>
            {!e.dir && <span className="sz">{fmtBytes(e.size)}</span>}
          </button>
          {!e.dir && /\.html?$/.test(e.name) && (
            <button className="btn ghost icon sm" style={{ width: 28, height: 28, color: 'var(--a2)' }} onClick={() => onPreviewHTML(e)} aria-label="Run">
              <Eye size={13} />
            </button>
          )}
          <button className="btn ghost icon sm" style={{ width: 28, height: 28, color: 'var(--ink-4)' }} onClick={() => onDelete(e)} aria-label="Delete">
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <div style={{ height: 20 }} />
    </div>
  )
}


function TemplateList({ onPick }: { onPick: (t: Template) => void }) {
  return (
    <div className="col" style={{ gap: 9 }}>
      {TEMPLATES.map((t) => (
        <button key={t.id} className="sugg" onClick={() => onPick(t)}>
          <span className="tile" style={{ width: 38, height: 38, borderRadius: 12, background: t.color, display: 'grid', placeItems: 'center', color: '#fff', flex: 'none' }}>
            <SkillIcon name={t.icon} size={18} />
          </span>
          <span className="grow">
            <span style={{ display: 'block', fontSize: 13.5, fontWeight: 620 }}>{t.name}</span>
            <span style={{ display: 'block', fontSize: 11.5, color: 'var(--ink-3)' }}>{t.desc}</span>
          </span>
          <ChevronRight size={16} className="muted" />
        </button>
      ))}
    </div>
  )
}
