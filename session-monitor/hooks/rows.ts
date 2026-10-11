import type { SessionRow, Status } from '../types'

// Claude Code's own registry entry, one per running session in ~/.claude/sessions/<pid>.json.
type Entry = {
  pid?: number
  sessionId?: string
  cwd?: string
  name?: string
  nameSource?: string
  status?: string
  waitingFor?: string
  statusUpdatedAt?: number
  updatedAt?: number
}

const STATUS: Record<string, Status> = { busy: 'working', waiting: 'waiting', idle: 'done' }
const ORDER: Record<Status, number> = { waiting: 0, working: 1, done: 2 }

export const toRow = (text: string): SessionRow | null => {
  const e: Entry = JSON.parse(text)
  if (typeof e.pid !== 'number' || !e.sessionId) return null
  const cwd = e.cwd ?? ''
  return {
    pid: e.pid,
    id: e.sessionId,
    name: e.name ?? '',
    // A /rename or auto name is a real title; a derived one is just folder + suffix.
    title: e.nameSource === 'derived' ? '' : (e.name ?? ''),
    cwd,
    project: cwd.split('/').filter(Boolean).pop() ?? cwd,
    status: STATUS[e.status ?? ''] ?? 'done',
    waitingFor: e.waitingFor ?? '',
    since: e.statusUpdatedAt ?? e.updatedAt ?? 0,
  }
}

// Lines of `<id>\t<last ai-title record>` → id → title.
export const parseTitles = (stdout: string): Map<string, string> => {
  const titles = new Map<string, string>()
  for (const line of stdout.split('\n')) {
    const [id, json] = line.split('\t')
    if (!id || !json) continue
    try {
      const title = JSON.parse(json).aiTitle
      if (typeof title === 'string' && title) titles.set(id, title)
    } catch {}
  }
  return titles
}

export const sorted = (rows: SessionRow[]): SessionRow[] =>
  [...rows].sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.since - a.since)

// Single-quote a path for sh unless it is plainly safe.
const quote = (s: string) => (/^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`)

// What to paste in a terminal to pick the session up in its own folder.
export const resumeCommand = (row: Pick<SessionRow, 'cwd' | 'id'>): string =>
  `${row.cwd ? `cd ${quote(row.cwd)} && ` : ''}claude --resume ${row.id}`

// Elapsed time in Korean: 5초 전, 2분 전, 2시간 전, 2일 전.
export const ago = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 5) return '방금'
  if (s < 60) return `${s}초 전`
  if (s < 3600) return `${Math.floor(s / 60)}분 전`
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`
  return `${Math.floor(s / 86400)}일 전`
}

// What the engine says a waiting session is held on (its registry `waitingFor`), in Korean.
// Unknown values pass through as written.
const WAITING: Record<string, string> = {
  'dialog open': '선택 대기',
  'input needed': '입력 필요',
  'sandbox request': '샌드박스 허용 대기',
  'worker request': '작업자 요청 대기',
  'goal proposal': '목표 제안 확인',
}
export const waitingText = (waitingFor: string): string => {
  const raw = waitingFor.trim()
  if (!raw) return ''
  return WAITING[raw.toLowerCase()] ?? raw
}
