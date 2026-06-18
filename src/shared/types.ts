// Shared types used by main, preload and renderer.

export type Phase = 'focus' | 'short' | 'long'
export type Status = 'idle' | 'running' | 'paused'

export type PetKind = 'cat' | 'dog' | 'panda' | 'bunny' | 'wolf' | 'bear'

export type MusicTrack = 'none' | 'focus_music' | 'break_music'
export type AmbientTrack = 'none' | 'rain' | 'whitenoise' | 'brown' | 'cafe'

export type Tag = 'Coding' | 'Writing' | 'Admin' | 'Study' | 'Design' | 'Other'
export const TAGS: Tag[] = ['Coding', 'Writing', 'Admin', 'Study', 'Design', 'Other']

export type ThemeId = 'lcd' | 'midnight' | 'mono' | 'sunset' | 'aurora' | 'neon'

export interface Settings {
  focusMin: number
  shortMin: number
  longMin: number
  /** Take a long break after this many completed focus sessions. */
  longBreakAfter: number
  /** Daily target of focus sessions; also drives pet growth. */
  sessionGoal: number
  pet: PetKind
  /** visual skin of the widget */
  theme: ThemeId
  /** master volume 0..1 (chime + music) */
  volume: number
  muted: boolean
  /** Automatically start the next break when a focus session ends. */
  autoStartBreak: boolean
  /** Automatically start the next focus session when a break ends. */
  autoStartWork: boolean
  /** Strict mode: breaks take over the whole screen to force rest. */
  strictMode: boolean
  /** Suppress our own notifications while a focus session is running. */
  muteNotificationsDuringFocus: boolean
  /** Music that plays during focus / break phases. */
  focusMusic: MusicTrack
  breakMusic: MusicTrack
  musicVolume: number
  /** Ambient soundscape that plays continuously while running. */
  ambient: AmbientTrack
  ambientVolume: number
  /** Best-effort distraction blocklist (apps / domains) for strict mode. */
  blockList: string[]
  /** Custom music folder (absolute path). Empty = the built-in app folder. */
  musicFolder: string
}

export interface Task {
  id: string
  title: string
  tag: Tag
  /** Focus length in minutes to use when starting a session for this task. */
  minutes: number
  estPomodoros: number
  donePomodoros: number
  completed: boolean
  order: number
}

export interface Stats {
  /** YYYY-MM-DD -> completed focus sessions that day. */
  history: Record<string, number>
  /** YYYY-MM-DD -> focus minutes that day. */
  minutes: Record<string, number>
  /** tag -> total focus sessions with that tag. */
  byTag: Record<string, number>
  /** Consecutive days meeting the daily goal. */
  streak: number
  /** Total focus sessions ever completed. */
  totalFocus: number
}

/** Live timer snapshot broadcast from main to all renderers. */
export interface TimerState {
  phase: Phase
  status: Status
  remainingMs: number
  totalMs: number
  sessionIndex: number
  completedToday: number
  settings: Settings
  activeTaskId: string | null
}

export interface ChimeRequest {
  volume: number
}

export const DEFAULT_SETTINGS: Settings = {
  focusMin: 25,
  shortMin: 5,
  longMin: 15,
  longBreakAfter: 4,
  sessionGoal: 4,
  pet: 'cat',
  theme: 'lcd',
  volume: 0.7,
  muted: false,
  autoStartBreak: true,
  autoStartWork: false,
  strictMode: false,
  muteNotificationsDuringFocus: false,
  focusMusic: 'focus_music',
  breakMusic: 'break_music',
  musicVolume: 0.5,
  ambient: 'none',
  ambientVolume: 0.5,
  blockList: [],
  musicFolder: ''
}

export const DEFAULT_STATS: Stats = {
  history: {},
  minutes: {},
  byTag: {},
  streak: 0,
  totalFocus: 0
}

/** Pomodoro length presets shown in settings (minutes). */
export const FOCUS_PRESETS = [10, 25, 60, 90, 120]
export const BREAK_PRESETS = [5, 10, 15, 30, 60]

/** The API exposed to the renderer via the preload contextBridge. */
export interface PomodoroApi {
  start(): void
  pause(): void
  reset(): void
  skip(): void
  /** Force a fresh focus session (used when starting a task). */
  focusNow(): void
  getState(): Promise<TimerState>
  updateSettings(partial: Partial<Settings>): Promise<TimerState>
  getStats(): Promise<Stats>
  // tasks
  getTasks(): Promise<Task[]>
  addTask(title: string, tag: Tag, estPomodoros: number, minutes: number): Promise<Task[]>
  updateTask(id: string, patch: Partial<Task>): Promise<Task[]>
  deleteTask(id: string): Promise<Task[]>
  reorderTasks(ids: string[]): Promise<Task[]>
  setActiveTask(id: string | null): Promise<TimerState>
  // windows
  showMini(): void
  showMain(): void
  toggleMini(): void
  hideMain(): void
  // custom music folder (drop-in mp3s override bundled loops)
  getAudioSlots(): Promise<Record<string, boolean>>
  /** Songs in the active music folder (the playlist), in order. */
  getMusicLibrary(): Promise<string[]>
  /** Active music folder path + whether it's a user-chosen one. */
  getMusicFolderInfo(): Promise<{ path: string; isCustom: boolean; count: number }>
  /** Open a native folder picker; sets the music folder. Returns the new state (or null if cancelled). */
  pickMusicFolder(): Promise<TimerState | null>
  /** Set the music folder to a path (e.g. a dropped folder); '' reverts to the built-in folder. */
  setMusicFolder(path: string): Promise<TimerState>
  /** Resolve the absolute path of a dragged File/folder (Electron webUtils). */
  getPathForFile(file: File): string
  openMusicFolder(): void
  // distraction blocker overlay
  snoozeBlocker(): void
  onBlockerSite(cb: (site: string) => void): () => void
  testBlocker(): Promise<{ app: string; title: string; url: string; error: string; blocked: string | null }>
  // subscriptions
  onState(cb: (state: TimerState) => void): () => void
  onChime(cb: (req: ChimeRequest) => void): () => void
  onTasks(cb: (tasks: Task[]) => void): () => void
}
