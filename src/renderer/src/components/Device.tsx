import { useState } from 'react'
import { usePomodoro } from '@/state/usePomodoro'
import { useAudio } from '@/audio/useAudio'
import LcdScreen from './LcdScreen'
import Controls from './Controls'
import SpeakerBar from './SpeakerBar'
import SettingsPanel from './SettingsPanel'
import TasksPanel from './TasksPanel'
import StatsPanel from './StatsPanel'
import { IconTasks, IconStats, IconSkip, IconMini, IconSettings, IconPomodoro, IconClose } from '@/icons'

type Panel = 'none' | 'tasks' | 'stats' | 'settings'

export default function Device(): JSX.Element {
  useAudio()
  const state = usePomodoro((s) => s.state)
  const stats = usePomodoro((s) => s.stats)
  const tasks = usePomodoro((s) => s.tasks)
  const toggle = usePomodoro((s) => s.toggle)
  const reset = usePomodoro((s) => s.reset)
  const skip = usePomodoro((s) => s.skip)
  const updateSettings = usePomodoro((s) => s.updateSettings)

  const initial = (new URLSearchParams(window.location.search).get('panel') as Panel) || 'none'
  const [panel, setPanel] = useState<Panel>(['tasks', 'stats', 'settings'].includes(initial) ? initial : 'none')

  if (!state) return <div className="loading">…</div>
  const activeTask = tasks.find((t) => t.id === state.activeTaskId) ?? null

  return (
    <div className="device-wrap">
      <div className="device-shell">
        <div className="toolbar">
          <div className="toolbar-pill">
            <button className="tool" onClick={() => setPanel('tasks')} title="Tasks">
              <IconTasks size={17} />
            </button>
            <button className="tool" onClick={() => setPanel('stats')} title="Statistics">
              <IconStats size={17} />
            </button>
            <button className="tool" onClick={skip} title="Skip phase">
              <IconSkip size={17} />
            </button>
            <button className="tool" onClick={() => window.pomodoro.showMini()} title="Mini widget">
              <IconMini size={17} />
            </button>
            <button className="tool" onClick={() => setPanel('settings')} title="Settings">
              <IconSettings size={17} />
            </button>
            <span className="tool-divider" />
            <button className="tool" onClick={() => window.pomodoro.hideMain()} title="Close">
              <IconClose size={16} />
            </button>
          </div>
        </div>

        <div className="device">
          <LcdScreen state={state} petBox={104} />
          <Controls status={state.status} onToggle={toggle} onReset={reset} />
          <SpeakerBar
            muted={state.settings.muted}
            onToggleMute={() => updateSettings({ muted: !state.settings.muted })}
          />
        </div>

        <div className="active-task" onClick={() => setPanel('tasks')}>
          {activeTask ? (
            <>
              <span className="dot" /> {activeTask.title}
              <span className="pomos">
                <IconPomodoro size={12} /> {activeTask.donePomodoros}/{activeTask.estPomodoros}
              </span>
            </>
          ) : (
            <span className="muted">＋ Pick a task to focus on</span>
          )}
        </div>
      </div>

      {panel === 'tasks' && <TasksPanel onClose={() => setPanel('none')} />}
      {panel === 'stats' && (
        <StatsPanel stats={stats} sessionGoal={state.settings.sessionGoal} onClose={() => setPanel('none')} />
      )}
      {panel === 'settings' && (
        <SettingsPanel
          settings={state.settings}
          onApply={(next) => updateSettings(next)}
          onClose={() => setPanel('none')}
        />
      )}
    </div>
  )
}
