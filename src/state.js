import { loadSettings, loadCalibration, loadRecords, loadProfiles } from './engine/storage.js'
import { normalizeSettings, summarizeSensitivity } from './engine/sensitivity.js'

export const state = {
  view: 'home',
  settings: normalizeSettings(),
  calibration: null,
  records: [],
  profiles: [],
  errors: [],
  lastResult: null
}

export function refreshState() {
  const s = loadSettings()
  state.settings = s.settings
  if (s.error) state.errors.push(s.error)
  const c = loadCalibration()
  state.calibration = c.calibration
  if (c.error) state.errors.push(c.error)
  const r = loadRecords()
  state.records = r.records
  if (r.error) state.errors.push(r.error)
  const p = loadProfiles()
  state.profiles = p.profiles
  if (p.error) state.errors.push(p.error)
}

export function sensitivityInfo() {
  return summarizeSensitivity(state.settings, state.calibration)
}

refreshState()
