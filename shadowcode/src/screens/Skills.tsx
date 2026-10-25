import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Check, Download, FileUp, Link2, Plus, Search, Sparkles, Trash2, Wand2, X, Store, Info,
} from 'lucide-react'
import { useStore } from '../lib/store'
import { Btn, Empty, Field, Sheet, SkillIcon } from '../components/ui'
import { pickFile, httpRequest, toast as nativeToast } from '../lib/bridge'
import { EXPORT_TEMPLATE, SKILL_CATEGORIES, SKILL_ICONS, normaliseSkill } from '../lib/skills'
import type { Skill } from '../lib/types'

export function SkillsScreen() {
  const skills = useStore((s) => s.skills)
  const session = useStore((s) => s.sessions.find((x) => x.id === s.currentSessionId))
  const toggle = useStore((s) => s.toggleSkill)
  const remove = useStore((s) => s.removeSkill)
  const install = useStore((s) => s.installSkill)
  const importText = useStore((s) => s.importSkillText)
  const toast = useStore((s) => s.toast)

  const [q, setQ] = useState('')
  const [cat, setCat] = useState('All')
  const [detail, setDetail] = useState<Skill | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [urlOpen, setUrlOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [paste, setPaste] = useState('')
  const [loadingUrl, setLoadingUrl] = useState(false)

  const cats = useMemo(() => ['All', ...new Set(skills.map((s) => s.category))], [skills])
  const filtered = skills.filter(
    (s) =>
      (cat === 'All' || s.category === cat) &&
      (s.name.toLowerCase().includes(q.toLowerCase()) || s.desc.toLowerCase().includes(q.toLowerCase())),
  )
  const enabled = skills.filter((s) => s.enabled).length
  const inChat = new Set(session?.skillIds || [])

  const installFromUrl = async () => {
    if (!/^https?:\/\//i.test(url)) {
      toast('Enter a valid https URL', 'bad')
      return
    }
    setLoadingUrl(true)
    const res = await httpRequest({ url, method: 'GET', timeoutMs: 30000 })
    setLoadingUrl(false)
    if (!res.status || res.status >= 400) {
      toast(`Could not load (${res.status || 'network'})`, 'bad')
      return
    }
    const ok = await importText(res.body, url.split('/').pop())
    if (ok) {
      setUrlOpen(false)
      setUrl('')
    }
  }

  return (
    <div className="screen">
      <div className="page">
        <div className="row" style={{ padding: '2px 0 12px', gap: 10 }}>
          <div className="grow">
            <div style={{ fontSize: 23, fontWeight: 700, letterSpacing: '-0.035em' }}>
              Skills
            </div>
            <div className="small muted" style={{ marginTop: 1 }}>
              {enabled} enabled · {skills.length} installed · stack them like plugins
            </div>
          </div>
          <Btn variant="accent" icon onClick={() => setCreateOpen(true)} aria-label="New skill">
            <Plus size={19} />
          </Btn>
        </div>

        <div className="row" style={{ gap: 8, marginBottom: 10 }}>
          <div className="row grow" style={{ background: 'var(--surface)', borderRadius: 14, padding: '0 12px', border: '1px solid var(--line)' }}>
            <Search size={15} className="muted" />
            <input
              className="input"
              placeholder="Search skills"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ border: 0, background: 'transparent', padding: '10px 8px' }}
            />
            {q && <button onClick={() => setQ('')} className="dim"><X size={14} /></button>}
          </div>
        </div>

        <div className="tabbar-scroll">
          {cats.map((c) => (
            <button key={c} className={`chip ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>
              {c}
            </button>
          ))}
        </div>

        <div className="row" style={{ gap: 8, margin: '10px 0 14px' }}>
          <Btn size="sm" block onClick={() => setImportOpen(true)}><FileUp size={14} /> Import file</Btn>
          <Btn size="sm" block onClick={() => setUrlOpen(true)}><Link2 size={14} /> From URL</Btn>
        </div>

        <div className="skill-grid stagger">
          {filtered.map((s) => (
            <motion.button
              layout
              key={s.id}
              className={`skillcard ${s.enabled ? 'on' : ''}`}
              onClick={() => setDetail(s)}
            >
              {s.enabled && <span className="glowdot" />}
              <div className="tile" style={{ background: s.color || 'linear-gradient(135deg,var(--a1),var(--a2))' }}>
                <SkillIcon name={s.icon} />
              </div>
              <div className="name">{s.name}</div>
              <div className="desc">{s.desc}</div>
              <div className="row" style={{ gap: 5, marginTop: 'auto' }}>
                <span className="tiny dim">{s.category}</span>
                {inChat.has(s.id) && (
                  <span className="badge" style={{ background: 'color-mix(in oklab, var(--a2) 22%, transparent)', color: 'var(--a2)', fontSize: 9 }}>
                    IN CHAT
                  </span>
                )}
              </div>
            </motion.button>
          ))}
        </div>

        {!filtered.length && (
          <Empty icon={<Wand2 size={24} />} title="No skills match" sub="Try another category, or create your own skill." />
        )}

        <div style={{ height: 20 }} />
      </div>

      {/* ---------------------------------------------------------- detail */}
      <Sheet
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.name}
        footer={
          detail && (
            <div className="row" style={{ gap: 8 }}>
              <Btn
                block
                variant={detail.enabled ? 'default' : 'accent'}
                onClick={() => {
                  toggle(detail.id)
                  setDetail({ ...detail, enabled: !detail.enabled })
                }}
              >
                {detail.enabled ? <><X size={15} /> Disable</> : <><Check size={15} /> Enable</>}
              </Btn>
              {!detail.builtin && (
                <Btn
                  variant="danger"
                  icon
                  onClick={() => {
                    remove(detail.id)
                    setDetail(null)
                    toast('Skill removed', 'ok')
                  }}
                  aria-label="Delete"
                >
                  <Trash2 size={16} />
                </Btn>
              )}
            </div>
          )
        }
      >
        {detail && (
          <div>
            <div className="row" style={{ gap: 12, marginBottom: 14 }}>
              <div
                className="tile"
                style={{
                  width: 54, height: 54, borderRadius: 17, display: 'grid', placeItems: 'center', color: '#fff',
                  background: detail.color || 'linear-gradient(135deg,var(--a1),var(--a2))',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.3)',
                }}
              >
                <SkillIcon name={detail.icon} size={25} />
              </div>
              <div className="grow">
                <div className="small" style={{ color: 'var(--ink-2)' }}>{detail.desc}</div>
                <div className="tiny dim" style={{ marginTop: 4 }}>
                  {detail.category} · v{detail.version} · {detail.author}
                </div>
              </div>
            </div>
            <div className="label" style={{ marginBottom: 6 }}>Instructions sent to the agent</div>
            <div
              className="mono"
              style={{
                fontSize: 11.5, lineHeight: 1.6, whiteSpace: 'pre-wrap', background: 'var(--surface-hi)',
                padding: 13, borderRadius: 14, maxHeight: 260, overflow: 'auto', color: 'var(--ink-2)',
              }}
            >
              {detail.prompt}
            </div>
            {!!detail.tools?.length && (
              <>
                <div className="label" style={{ margin: '14px 0 6px' }}>Tools it may use</div>
                <div className="row wrap" style={{ gap: 6 }}>
                  {detail.tools.map((t) => <span key={t} className="chip mono tiny">{t}</span>)}
                </div>
              </>
            )}
          </div>
        )}
      </Sheet>

      {/* ---------------------------------------------------------- create */}
      <CreateSkillSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={(sk) => {
          install(sk)
          setCreateOpen(false)
        }}
      />

      {/* ---------------------------------------------------------- import */}
      <Sheet
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import a skill"
        footer={<Btn variant="accent" block disabled={!paste.trim()} onClick={async () => { const ok = await importText(paste); if (ok) { setImportOpen(false); setPaste('') } }}><Download size={15} /> Install from text</Btn>}
      >
        <div className="banner info" style={{ marginBottom: 12 }}>
          Accepts a <b>JSON</b> skill or a <b>Markdown</b> file with optional <span className="mono">---</span> front-matter. Nothing is uploaded.
        </div>
        <Btn block onClick={async () => {
          const f = await pickFile()
          if (!f) return
          const ok = await importText(f.content, f.name)
          if (ok) setImportOpen(false)
        }}>
          <FileUp size={16} /> Choose file from device
        </Btn>
        <div className="hr-label" style={{ margin: '16px 0 10px' }}>or paste</div>
        <textarea
          className="textarea"
          style={{ minHeight: 160, fontFamily: 'var(--mono)', fontSize: 12 }}
          placeholder={EXPORT_TEMPLATE}
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
        />
      </Sheet>

      {/* ---------------------------------------------------------- url */}
      <Sheet
        open={urlOpen}
        onClose={() => setUrlOpen(false)}
        title="Install from URL"
        footer={<Btn variant="accent" block disabled={!url || loadingUrl} onClick={installFromUrl}>{loadingUrl ? 'Loading…' : 'Fetch & install'}</Btn>}
      >
        <div className="banner info" style={{ marginBottom: 12 }}>
          Point this at any raw <span className="mono">.json</span> or <span className="mono">.md</span> skill file — a GitHub raw link works well.
        </div>
        <Field label="Skill file URL">
          <input className="input" placeholder="https://raw.githubusercontent.com/…/skill.json" value={url} onChange={(e) => setUrl(e.target.value)} />
        </Field>
        <div className="small muted">
          Want a marketplace? Host a folder of skill JSON files anywhere and share the links — ShadowCode keeps zero accounts and zero telemetry.
        </div>
      </Sheet>
    </div>
  )
}

/* ------------------------------------------------------------------ create */
function CreateSkillSheet({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (s: Skill) => void }) {
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [prompt, setPrompt] = useState('')
  const [icon, setIcon] = useState('sparkles')
  const [cat, setCat] = useState('My skills')

  const reset = () => {
    setName(''); setDesc(''); setPrompt(''); setIcon('sparkles'); setCat('My skills')
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New skill"
      footer={
        <Btn
          variant="accent"
          block
          disabled={!name.trim() || !prompt.trim()}
          onClick={() => {
            onCreate(normaliseSkill({ name, desc, prompt, icon, category: cat }))
            reset()
          }}
        >
          <Sparkles size={15} /> Create & enable
        </Btn>
      }
    >
      <Field label="Name">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Landing page specialist" />
      </Field>
      <Field label="When should the agent use it?">
        <input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Marketing pages with strong typography" />
      </Field>
      <Field label="Category">
        <select className="select" value={cat} onChange={(e) => setCat(e.target.value)}>
          {SKILL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </Field>
      <Field label="Icon">
        <div className="row wrap" style={{ gap: 6 }}>
          {SKILL_ICONS.map((i) => (
            <button
              key={i}
              onClick={() => setIcon(i)}
              className="center"
              style={{
                width: 38, height: 38, borderRadius: 12,
                background: icon === i ? 'linear-gradient(135deg,var(--a1),var(--a2))' : 'var(--surface)',
                border: '1px solid var(--line)',
                color: icon === i ? '#fff' : 'var(--ink-2)',
              }}
            >
              <SkillIcon name={i} size={17} />
            </button>
          ))}
        </div>
      </Field>
      <Field label="Instructions" hint="Be explicit: process, rules, output format.">
        <textarea className="textarea" style={{ minHeight: 150 }} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={'You are…\nAlways…\nNever…\nDeliver…'} />
      </Field>
      <div className="banner"><Info size={15} style={{ flex: 'none', marginTop: 1 }} /> Skills are stored locally and injected only into chats where you attach them.</div>
    </Sheet>
  )
}

export function SkillsBadge() {
  const n = useStore((s) => s.skills.filter((x) => x.enabled).length)
  return n > 0 ? <span className="badge">{n}</span> : null
}

export { nativeToast }
