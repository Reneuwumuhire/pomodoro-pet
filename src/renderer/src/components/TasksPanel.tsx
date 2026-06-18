import { useState } from 'react'
import { Tag, TAGS } from '@shared/types'
import { usePomodoro } from '@/state/usePomodoro'
import { IconUncheck, IconChecked, IconStart, IconUp, IconDown, IconTrash, IconClock, IconClose, IconPomodoro } from '@/icons'

interface Props {
  onClose: () => void
}

const TIME_OPTS = [10, 15, 25, 45, 60]

export default function TasksPanel({ onClose }: Props): JSX.Element {
  const tasks = usePomodoro((s) => s.tasks)
  const activeId = usePomodoro((s) => s.state?.activeTaskId ?? null)
  const addTask = usePomodoro((s) => s.addTask)
  const updateTask = usePomodoro((s) => s.updateTask)
  const deleteTask = usePomodoro((s) => s.deleteTask)
  const reorderTasks = usePomodoro((s) => s.reorderTasks)
  const setActiveTask = usePomodoro((s) => s.setActiveTask)
  const startTaskSession = usePomodoro((s) => s.startTaskSession)

  const [title, setTitle] = useState('')
  const [tag, setTag] = useState<Tag>('Coding')
  const [est, setEst] = useState(1)
  const [minutes, setMinutes] = useState(25)

  const submit = (): void => {
    if (!title.trim()) return
    addTask(title.trim(), tag, est, minutes)
    setTitle('')
    setEst(1)
  }

  const move = (id: string, dir: -1 | 1): void => {
    const ids = tasks.map((t) => t.id)
    const i = ids.indexOf(id)
    const j = i + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    reorderTasks(ids)
  }

  const start = async (taskId: string): Promise<void> => {
    const t = tasks.find((x) => x.id === taskId)
    if (!t) return
    await startTaskSession(t)
    onClose() // back to the timer so you can watch the session run
  }

  return (
    <div className="panel-backdrop" onClick={onClose}>
      <div className="panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <span>Tasks</span>
          <button className="panel-x" onClick={onClose}>
            <IconClose size={15} />
          </button>
        </div>

        <div className="task-add">
          <input
            className="task-input"
            placeholder="Add a task…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          <div className="task-add-row">
            <select className="select" value={tag} onChange={(e) => setTag(e.target.value as Tag)}>
              {TAGS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select
              className="select"
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
              title="Focus time for this task"
            >
              {TIME_OPTS.map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
            <div className="est-step">
              <button onClick={() => setEst((e) => Math.max(1, e - 1))}>−</button>
              <span><IconPomodoro size={13} /> {est}</span>
              <button onClick={() => setEst((e) => e + 1)}>+</button>
            </div>
          </div>
          <button className="text-btn primary add-btn" onClick={submit}>
            ADD TASK
          </button>
        </div>

        <div className="task-list">
          {tasks.length === 0 && <div className="empty">No tasks yet. Add one above.</div>}
          {tasks.map((t) => (
            <div
              key={t.id}
              className={`task ${t.completed ? 'done' : ''} ${activeId === t.id ? 'active' : ''}`}
            >
              <button
                className="check"
                onClick={() => updateTask(t.id, { completed: !t.completed })}
                title="Complete"
              >
                {t.completed ? <IconChecked size={17} /> : <IconUncheck size={17} />}
              </button>
              <div
                className="task-main"
                onClick={() => setActiveTask(activeId === t.id ? null : t.id)}
              >
                <div className="task-title">{t.title}</div>
                <div className="task-meta">
                  <span className="tag">{t.tag}</span>
                  <span className="pomos">
                    <IconPomodoro size={11} /> {t.donePomodoros}/{t.estPomodoros}
                  </span>
                  <span className="mins">
                    <IconClock size={11} /> {t.minutes ?? 25}m
                  </span>
                  {activeId === t.id && <span className="now">● active</span>}
                </div>
              </div>
              <div className="task-ops">
                <button
                  className="start-task"
                  onClick={() => start(t.id)}
                  title="Start a focus session"
                >
                  <IconStart size={16} />
                </button>
                <div className="reorder">
                  <button onClick={() => move(t.id, -1)} title="Move up">
                    <IconUp size={11} />
                  </button>
                  <button onClick={() => move(t.id, 1)} title="Move down">
                    <IconDown size={11} />
                  </button>
                </div>
                <button className="op-del" onClick={() => deleteTask(t.id)} title="Delete">
                  <IconTrash size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="hint">The green play button starts a focus session, timed to the task’s minutes.</div>
      </div>
    </div>
  )
}
