import { STORAGE_KEYS, DEFAULT_SETTINGS } from './defaults.js'
import { normalizeSettings } from './sensitivity.js'

function hasStorage() {
  try {
    const k = '__fpslab_test__'
    localStorage.setItem(k, '1')
    localStorage.removeItem(k)
    return true
  } catch {
    return false
  }
}

export const storageAvailable = hasStorage()

function readJson(key) {
  if (!storageAvailable) return { ok: false, error: '当前浏览器不支持 localStorage，刷新后数据将无法保留。', data: null }
  const raw = localStorage.getItem(key)
  if (raw === null) return { ok: true, data: null, corrupted: false }
  try {
    return { ok: true, data: JSON.parse(raw), corrupted: false }
  } catch (err) {
    return { ok: false, error: `本地数据损坏（${key}）：${err.message}。可在记录页清空数据后重试。`, data: null, corrupted: true, raw }
  }
}

function writeJson(key, value) {
  if (!storageAvailable) return { ok: false, error: 'localStorage 不可用，无法保存。' }
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `写入失败：${err.message}` }
  }
}

export function loadSettings() {
  const res = readJson(STORAGE_KEYS.settings)
  if (!res.ok) return { settings: { ...DEFAULT_SETTINGS }, error: res.error }
  return { settings: normalizeSettings(res.data), error: null }
}

export function saveSettings(settings) {
  return writeJson(STORAGE_KEYS.settings, normalizeSettings(settings))
}

export function loadRecords() {
  const res = readJson(STORAGE_KEYS.records)
  if (!res.ok) return { records: [], error: res.error }
  const list = Array.isArray(res.data) ? res.data : []
  return { records: list, error: null }
}

export function saveRecords(records) {
  return writeJson(STORAGE_KEYS.records, records)
}

export function addRecord(record) {
  const { records } = loadRecords()
  const next = [record, ...records].slice(0, 100)
  const w = saveRecords(next)
  return { ...w, records: next }
}

export function deleteRecord(id) {
  const { records } = loadRecords()
  const next = records.filter((r) => r.id !== id)
  const w = saveRecords(next)
  return { ...w, records: next }
}

export function clearRecords() {
  return saveRecords([])
}

export function clearAllData() {
  Object.values(STORAGE_KEYS).forEach((k) => storageAvailable && localStorage.removeItem(k))
}

export function loadCalibration() {
  const res = readJson(STORAGE_KEYS.calibration)
  if (!res.ok) return { calibration: null, error: res.error }
  return { calibration: res.data, error: null }
}

export function saveCalibration(calibration) {
  return writeJson(STORAGE_KEYS.calibration, calibration)
}

export function loadProfiles() {
  const res = readJson(STORAGE_KEYS.profiles)
  if (!res.ok) return { profiles: [], error: res.error }
  return { profiles: Array.isArray(res.data) ? res.data : [], error: null }
}

export function saveProfiles(profiles) {
  return writeJson(STORAGE_KEYS.profiles, profiles)
}
