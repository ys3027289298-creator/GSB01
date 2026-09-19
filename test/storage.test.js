import { describe, it, expect, beforeEach } from 'vitest'
import {
  saveSettings,
  loadSettings,
  addRecord,
  loadRecords,
  deleteRecord,
  clearRecords,
  clearAllData,
  saveCalibration,
  loadCalibration,
  saveProfiles,
  loadProfiles
} from '../src/engine/storage.js'
import { STORAGE_KEYS, DEFAULT_SETTINGS } from '../src/engine/defaults.js'

beforeEach(() => localStorage.clear())

describe('设置持久化', () => {
  it('保存后可读取并规范化', () => {
    saveSettings({ ...DEFAULT_SETTINGS, dpi: 1600, sensitivity: 1.5 })
    expect(loadSettings().settings.dpi).toBe(1600)
    expect(loadSettings().settings.sensitivity).toBe(1.5)
  })
})

describe('测试记录', () => {
  const rec = (id) => ({ id, date: new Date().toISOString(), kind: 'click', score: 80, metrics: {} })
  it('新增、单条删除、清空', () => {
    addRecord(rec('a'))
    addRecord(rec('b'))
    expect(loadRecords().records).toHaveLength(2)
    deleteRecord('a')
    expect(loadRecords().records.map((r) => r.id)).toEqual(['b'])
    clearRecords()
    expect(loadRecords().records).toHaveLength(0)
  })

  it('数据损坏时返回错误提示而非抛异常', () => {
    localStorage.setItem(STORAGE_KEYS.records, '{坏的数据')
    const res = loadRecords()
    expect(res.records).toEqual([])
    expect(res.error).toContain('损坏')
  })

  it('clearAllData 清除所有键', () => {
    addRecord(rec('x'))
    saveCalibration({ cmPer360: 30 })
    saveProfiles([{ id: 'p1' }])
    clearAllData()
    expect(loadRecords().records).toHaveLength(0)
    expect(loadCalibration().calibration).toBeNull()
    expect(loadProfiles().profiles).toHaveLength(0)
  })
})
