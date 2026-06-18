interface Props {
  label: string
  active: boolean
  onClick: () => void
}

export default function Pill({ label, active, onClick }: Props): JSX.Element {
  return (
    <button className={`pill ${active ? 'pill-active' : ''}`} onClick={onClick}>
      {label}
    </button>
  )
}
