import { addRecord } from './engine/storage.js'
import { state } from './state.js'

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function persistRecord({ kind, score, metrics, advice, settingsOverride, profileName }) {
  const record = {
    id: uid(),
    date: new Date().toISOString(),
    kind,
    score,
    metrics,
    advice,
    profileName: profileName || null,
    settings: {
      dpi: (settingsOverride || state.settings).dpi,
      sensitivity: (settingsOverride || state.settings).sensitivity,
      fov: (settingsOverride || state.settings).fov,
      aspect: (settingsOverride || state.settings).aspect,
      duration: (settingsOverride || state.settings).duration,
      targetSize: (settingsOverride || state.settings).targetSize,
      targetSpeed: (settingsOverride || state.settings).targetSpeed,
      difficulty: (settingsOverride || state.settings).difficulty
    }
  }
  const res = addRecord(record)
  state.records = res.records
  state.lastResult = record
  return record
}
