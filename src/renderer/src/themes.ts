import { ThemeId } from '@shared/types'

export interface ThemeMeta {
  id: ThemeId
  label: string
  /** ink color the pixel pet is drawn in for this theme */
  petInk: string
  /** three swatches for the picker chip (case, screen, accent) */
  swatch: [string, string, string]
}

export const THEMES: ThemeMeta[] = [
  { id: 'lcd', label: 'Game Boy', petInk: '#2f3a24', swatch: ['#d9d9d9', '#9aa97f', '#e8463a'] },
  { id: 'midnight', label: 'Midnight', petInk: '#aeb6c2', swatch: ['#1a1c22', '#0e1116', '#ff4d4d'] },
  { id: 'mono', label: 'Mono', petInk: '#2b2b2b', swatch: ['#ececec', '#e4e1d8', '#ff5a1f'] },
  { id: 'sunset', label: 'Sunset', petInk: '#7a3f23', swatch: ['#ff8a5b', '#ffe8d2', '#d6336c'] },
  { id: 'aurora', label: 'Aurora', petInk: '#cdfaff', swatch: ['#1b1040', '#0c1430', '#22d3ee'] },
  { id: 'neon', label: 'Neon', petInk: '#ff7ae0', swatch: ['#0a0a12', '#120a1f', '#22f5ff'] }
]

export function petInkFor(id: ThemeId): string {
  return (THEMES.find((t) => t.id === id) ?? THEMES[0]).petInk
}
