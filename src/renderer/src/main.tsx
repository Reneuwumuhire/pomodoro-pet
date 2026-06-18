import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/global.css'
import './styles/device.css'

// Stop the window from navigating to a file when something is dropped outside a
// designated dropzone (the music-folder zone calls preventDefault itself).
window.addEventListener('dragover', (e) => e.preventDefault())
window.addEventListener('drop', (e) => e.preventDefault())

// Detect from the HTML entry filename first (robust in dev + packaged), then
// fall back to the inline global set in each HTML file.
const path = window.location.pathname
const fromPath = path.includes('mini')
  ? 'mini'
  : path.includes('strict')
    ? 'strict'
    : path.includes('blocked')
      ? 'blocked'
      : undefined
const mode =
  fromPath ??
  (window as unknown as { __MODE__?: 'full' | 'mini' | 'strict' | 'blocked' }).__MODE__ ??
  'full'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App mode={mode} />
  </React.StrictMode>
)
