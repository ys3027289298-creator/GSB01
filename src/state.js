import { makeStorage } from './engine/storage.js';
import { clampSettings, DEFAULT_SETTINGS } from './engine/settings.js';

export function makeStore() {
  const storage = makeStorage(localStorage);
  const listeners = new Set();
  const state = {
    ready: false,
    settings: { ...DEFAULT_SETTINGS },
    records: [],
    profiles: [],
    activeProfile: null,
    compareMode: false,
    dataError: null
  };

  function emit() {
    for (const fn of listeners) fn(state);
  }

  return {
    state,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    async init() {
      try {
        const savedSettings = storage.loadSettings();
        if (savedSettings) state.settings = clampSettings(savedSettings);
        state.records = storage.loadRecords();
        state.profiles = storage.loadProfiles();
      } catch (err) {
        state.dataError = err.message;
      }
      state.ready = true;
      emit();
    },
    storage,
    updateSettings(patch) {
      state.settings = clampSettings({ ...state.settings, ...patch });
      storage.saveSettings(state.settings);
      emit();
    },
    resetSettings() {
      state.settings = { ...DEFAULT_SETTINGS };
      storage.saveSettings(state.settings);
      emit();
    },
    addRecord(record) {
      state.records.unshift(record);
      if (state.records.length > 100) state.records.length = 100;
      storage.saveRecords(state.records);
      emit();
    },
    deleteRecord(id) {
      state.records = state.records.filter((r) => r.id !== id);
      storage.saveRecords(state.records);
      emit();
    },
    clearRecords() {
      state.records = [];
      storage.saveRecords(state.records);
      emit();
    },
    saveProfile(name) {
      const profile = {
        id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: name || `方案 ${state.profiles.length + 1}`,
        createdAt: new Date().toISOString(),
        settings: { ...state.settings }
      };
      state.profiles.push(profile);
      storage.saveProfiles(state.profiles);
      emit();
      return profile;
    },
    deleteProfile(id) {
      state.profiles = state.profiles.filter((p) => p.id !== id);
      storage.saveProfiles(state.profiles);
      emit();
    },
    setActiveProfile(id) {
      state.activeProfile = id;
      const profile = state.profiles.find((p) => p.id === id);
      if (profile) this.updateSettings(profile.settings);
      else emit();
    },
    setCompareMode(on) {
      state.compareMode = on;
      emit();
    },
    clearAllData() {
      storage.clearAll();
      state.settings = { ...DEFAULT_SETTINGS };
      state.records = [];
      state.profiles = [];
      state.dataError = null;
      emit();
    },
    dismissError() {
      state.dataError = null;
      emit();
    }
  };
}
