import { useEffect, useRef, useState } from 'react'
import {
  AmbientTrack,
  BREAK_PRESETS,
  FOCUS_PRESETS,
  MusicTrack,
  Settings
} from '@shared/types'
import { PETS } from '@/pets/petData'
import { THEMES } from '@/themes'
import { IconClose, IconShield } from '@/icons'
import Pill from './Pill'
import MusicFolder from './MusicFolder'

interface Props {
  settings: Settings
  onApply: (next: Partial<Settings>) => void
  onClose: () => void
}

function Toggle({
  label,
  checked,
  onChange
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}): JSX.Element {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <button
        className={`switch ${checked ? 'on' : ''}`}
        onClick={() => onChange(!checked)}
        type="button"
      >
        <span className="knob" />
      </button>
    </label>
  )
}

const MUSIC_OPTS: { v: MusicTrack; label: string }[] = [
  { v: 'none', label: 'Off' },
  { v: 'lofi1', label: 'Chill' },
  { v: 'lofi2', label: 'Autumn' },
  { v: 'lofi3', label: 'Dreams' },
  { v: 'lofi4', label: 'Mellow' }
]
const AMBIENT_OPTS: { v: AmbientTrack; label: string }[] = [
  { v: 'none', label: 'Off' },
  { v: 'rain', label: 'Rain' },
  { v: 'brown', label: 'Ocean' },
  { v: 'whitenoise', label: 'Brown' },
  { v: 'cafe', label: 'Café' }
]

export default function SettingsPanel({ settings, onApply, onClose }: Props): JSX.Element {
  const [d, setD] = useState<Settings>(settings)
  const [shieldResult, setShieldResult] = useState('')
  // Raw blocklist text — kept as the user types (so Enter adds a line) and only
  // parsed into entries on Apply.
  const [blockText, setBlockText] = useState(settings.blockList.join('\n'))
  // Draft initialises from settings on open (the panel remounts each time) — we
  // deliberately don't reset it on every `settings` change, since the timer
  // broadcasts a new settings object each tick and that would wipe edits.
  const set = <K extends keyof Settings>(k: K, v: Settings[K]): void =>
    setD((p) => ({ ...p, [k]: v }))

  // Live theme preview: reflect the picked theme on the device immediately, and
  // roll back to the committed theme if the user cancels (closes without Apply).
  const appliedRef = useRef(false)
  const committedTheme = useRef(settings.theme)
  useEffect(() => {
    committedTheme.current = settings.theme
  }, [settings.theme])
  useEffect(() => {
    document.documentElement.dataset.theme = d.theme
  }, [d.theme])
  useEffect(
    () => () => {
      if (!appliedRef.current) document.documentElement.dataset.theme = committedTheme.current
    },
    []
  )

  const parseBlocklist = (text: string): string[] =>
    text.split('\n').map((s) => s.trim()).filter(Boolean)

  const apply = (): void => {
    appliedRef.current = true
    onApply({ ...d, blockList: parseBlocklist(blockText) })
    onClose()
  }

  const testShield = async (): Promise<void> => {
    setShieldResult('Checking… approve any macOS permission prompts.')
    const r = await window.pomodoro.testBlocker()
    if (r.error) {
      setShieldResult('⚠️ Cannot read the active window — grant Accessibility/Automation in System Settings → Privacy & Security, then retry.')
    } else {
      const where = r.url || r.title || r.app || 'unknown'
      setShieldResult(
        r.blocked
          ? `✅ Detected “${where}” → would block (“${r.blocked}”).`
          : `Seeing “${where}” (app: ${r.app}). Not in your blocklist.`
      )
    }
  }

  return (
    <div className="panel-backdrop" onClick={onClose}>
      <div className="panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <span>Settings</span>
          <button className="panel-x" onClick={onClose}>
            <IconClose size={15} />
          </button>
        </div>

        <div className="section">Look</div>
        <div className="theme-grid">
          {THEMES.map((t) => (
            <button
              key={t.id}
              className={`theme-chip ${d.theme === t.id ? 'on' : ''}`}
              onClick={() => set('theme', t.id)}
              title={t.label}
            >
              <span
                className="theme-swatch"
                style={{
                  background: `linear-gradient(135deg, ${t.swatch[0]} 0 40%, ${t.swatch[1]} 40% 75%, ${t.swatch[2]} 75% 100%)`
                }}
              />
              <span className="theme-name">{t.label}</span>
            </button>
          ))}
        </div>

        <div className="section">Timer</div>
        <label className="panel-label">Focus length (min)</label>
        <div className="pills">
          {FOCUS_PRESETS.map((m) => (
            <Pill key={m} label={String(m)} active={d.focusMin === m} onClick={() => set('focusMin', m)} />
          ))}
        </div>
        <label className="panel-label">Short break (min)</label>
        <div className="pills">
          {BREAK_PRESETS.map((m) => (
            <Pill key={m} label={String(m)} active={d.shortMin === m} onClick={() => set('shortMin', m)} />
          ))}
        </div>
        <label className="panel-label">
          Long break <span className="val">{d.longMin}m</span>
        </label>
        <input type="range" min={15} max={30} value={d.longMin} onChange={(e) => set('longMin', +e.target.value)} />
        <label className="panel-label">
          Long break after <span className="val">{d.longBreakAfter}</span>
        </label>
        <input type="range" min={2} max={8} value={d.longBreakAfter} onChange={(e) => set('longBreakAfter', +e.target.value)} />
        <label className="panel-label">
          Daily goal <span className="val">{d.sessionGoal}</span>
        </label>
        <input type="range" min={1} max={12} value={d.sessionGoal} onChange={(e) => set('sessionGoal', +e.target.value)} />

        <div className="section">Automation</div>
        <Toggle label="Auto-start breaks" checked={d.autoStartBreak} onChange={(v) => set('autoStartBreak', v)} />
        <Toggle label="Auto-start next work" checked={d.autoStartWork} onChange={(v) => set('autoStartWork', v)} />
        <Toggle label="Strict mode (fullscreen breaks)" checked={d.strictMode} onChange={(v) => set('strictMode', v)} />
        <Toggle label="Mute notifications during focus" checked={d.muteNotificationsDuringFocus} onChange={(v) => set('muteNotificationsDuringFocus', v)} />

        <div className="section">Sound</div>
        <label className="panel-label">
          Master volume <span className="val">{Math.round(d.volume * 100)}</span>
        </label>
        <input type="range" min={0} max={100} value={Math.round(d.volume * 100)} onChange={(e) => set('volume', +e.target.value / 100)} />
        <label className="panel-label">Focus music</label>
        <div className="pills">
          {MUSIC_OPTS.map((o) => (
            <Pill key={o.v} label={o.label} active={d.focusMusic === o.v} onClick={() => set('focusMusic', o.v)} />
          ))}
        </div>
        <label className="panel-label">Break music</label>
        <div className="pills">
          {MUSIC_OPTS.map((o) => (
            <Pill key={o.v} label={o.label} active={d.breakMusic === o.v} onClick={() => set('breakMusic', o.v)} />
          ))}
        </div>
        <label className="panel-label">
          Music volume <span className="val">{Math.round(d.musicVolume * 100)}</span>
        </label>
        <input type="range" min={0} max={100} value={Math.round(d.musicVolume * 100)} onChange={(e) => set('musicVolume', +e.target.value / 100)} />
        <label className="panel-label">Ambient sound</label>
        <div className="pills">
          {AMBIENT_OPTS.map((o) => (
            <Pill key={o.v} label={o.label} active={d.ambient === o.v} onClick={() => set('ambient', o.v)} />
          ))}
        </div>
        <label className="panel-label">
          Ambient volume <span className="val">{Math.round(d.ambientVolume * 100)}</span>
        </label>
        <input type="range" min={0} max={100} value={Math.round(d.ambientVolume * 100)} onChange={(e) => set('ambientVolume', +e.target.value / 100)} />
        <label className="panel-label">Music folder</label>
        <MusicFolder />
        <div className="hint">
          Songs in the folder play as a playlist — fast-forward and skip from the speaker bar.
        </div>

        <div className="section">Focus shield (strict mode)</div>
        <label className="panel-label">Distracting apps / sites — one per line</label>
        <textarea
          className="block-input"
          rows={3}
          placeholder={'twitter.com\nyoutube.com\nSlack'}
          value={blockText}
          onChange={(e) => setBlockText(e.target.value)}
        />
        <div className="hint">
          While strict mode is on, opening one of these during a focus session covers the
          screen until you return. macOS will ask for permission the first time so the app can
          read the active browser tab — click Test and approve the prompts.
        </div>
        <button className="folder-btn" onClick={testShield}>
          <IconShield size={14} /> Test focus shield
        </button>
        {shieldResult && <div className="shield-result">{shieldResult}</div>}

        <div className="section">Pet</div>
        <div className="pills">
          {PETS.map((p) => (
            <Pill key={p.kind} label={p.label} active={d.pet === p.kind} onClick={() => set('pet', p.kind)} />
          ))}
        </div>

        <div className="panel-actions">
          <button className="text-btn" onClick={onClose}>
            CANCEL
          </button>
          <button className="text-btn primary" onClick={apply}>
            APPLY
          </button>
        </div>
      </div>
    </div>
  )
}
