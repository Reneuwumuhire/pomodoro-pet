import { useEffect } from 'react'
import { usePomodoro } from '@/state/usePomodoro'
import { useChime } from '@/useChime'
import Device from '@/components/Device'
import MiniDevice from '@/components/MiniDevice'
import StrictBreak from '@/components/StrictBreak'
import Blocker from '@/components/Blocker'

interface Props {
  mode: 'full' | 'mini' | 'strict' | 'blocked'
}

export default function App({ mode }: Props): JSX.Element {
  const init = usePomodoro((s) => s.init)
  const theme = usePomodoro((s) => s.state?.settings.theme ?? 'lcd')
  useEffect(() => init(), [init])
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  if (mode === 'full') return <FullApp />
  if (mode === 'strict') return <StrictBreak />
  if (mode === 'blocked') return <Blocker />
  return <MiniDevice />
}

function FullApp(): JSX.Element {
  // The main window owns chime + music playback (it's only hidden, never closed).
  useChime()
  return <Device />
}
