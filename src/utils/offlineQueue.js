const KEY          = 'catastro_offline_queue'
const CONFLICT_KEY = 'catastro_conflicts'

export function getQueue() {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') }
  catch { return [] }
}

export function enqueue(record) {
  const queue = getQueue()
  const item  = { ...record, _qid: Date.now(), _at: new Date().toISOString() }
  localStorage.setItem(KEY, JSON.stringify([...queue, item]))
  return item._qid
}

export function dequeue(qid) {
  const updated = getQueue().filter(r => r._qid !== qid)
  localStorage.setItem(KEY, JSON.stringify(updated))
}

export function queueSize() {
  return getQueue().length
}

/* ── Conflictos (duplicados rechazados por el servidor) ── */
export function getConflicts() {
  try { return JSON.parse(localStorage.getItem(CONFLICT_KEY) ?? '[]') }
  catch { return [] }
}

export function addConflict(record) {
  const conflicts = getConflicts()
  localStorage.setItem(CONFLICT_KEY, JSON.stringify([
    ...conflicts,
    { ...record, _conflictAt: new Date().toISOString() },
  ]))
}

export function clearConflicts() {
  localStorage.removeItem(CONFLICT_KEY)
}

export function conflictCount() {
  return getConflicts().length
}
