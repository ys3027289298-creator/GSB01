import { h } from '../dom.js';
import { toast, downloadFile } from '../dom.js';
import { ASPECTS, DEFAULT_SETTINGS } from '../engine/settings.js';
import {
  createBackup,
  parseBackup,
  validateBackup,
  computePreview,
  applyImport
} from '../engine/backup.js';

export function settingsPage({ store }) {
  const s = store.state.settings;

  function field(labelText, inputEl, hint) {
    return h('label', { class: 'field' }, [labelText, inputEl, hint ? h('span', { class: 'muted', style: { fontSize: '12px' } }, hint) : null]);
  }

  const dpi = h('input', { type: 'number', min: '50', max: '64000', value: s.dpi, id: 'set-dpi' });
  const sens = h('input', { type: 'number', step: '0.01', min: '0.01', max: '100', value: s.sensitivity, id: 'set-sens' });
  const fov = h('input', { type: 'number', min: '40', max: '170', value: s.fov, id: 'set-fov' });
  const aspect = h('select', { id: 'set-aspect' }, ASPECTS.map((a) => h('option', { value: a, selected: a === s.aspect }, a)));
  const duration = h('select', { id: 'set-duration' }, [10, 15, 20, 30, 45, 60].map((n) => h('option', { value: n, selected: n === s.duration }, `${n} 秒`)));
  const size = h('select', { id: 'set-size' }, [['small', '小'], ['medium', '中'], ['large', '大']].map(([v, label]) => h('option', { value: v, selected: v === s.targetSize }, label)));
  const speed = h('select', { id: 'set-speed' }, [['slow', '慢'], ['medium', '中'], ['fast', '快']].map(([v, label]) => h('option', { value: v, selected: v === s.targetSpeed }, label)));
  const diff = h('select', { id: 'set-diff' }, [['easy', '简单'], ['normal', '普通'], ['hard', '困难']].map(([v, label]) => h('option', { value: v, selected: v === s.difficulty }, label)));

  function collect() {
    return {
      dpi: dpi.value,
      sensitivity: sens.value,
      fov: fov.value,
      aspect: aspect.value,
      duration: Number(duration.value),
      targetSize: size.value,
      targetSpeed: speed.value,
      difficulty: diff.value
    };
  }

  const saveBtn = h('button', {
    onclick: () => {
      store.updateSettings(collect());
      toast('设置已保存，刷新浏览器也不会丢失。');
    }
  }, '保存设置');

  const resetBtn = h('button', {
    class: 'ghost',
    onclick: () => {
      if (!confirm('恢复全部默认设置？当前设置会被覆盖（测试记录保留）。')) return;
      store.resetSettings();
      toast('已恢复默认设置。');
      setTimeout(() => location.reload(), 400);
    }
  }, '恢复默认设置');

  const clearBtn = h('button', {
    class: 'danger',
    onclick: () => {
      if (!confirm('将清空全部本地数据（设置、校准、测试记录、灵敏度方案），且不可恢复。确定吗？')) return;
      store.clearAllData();
      toast('本地数据已清空。');
      setTimeout(() => location.reload(), 500);
    }
  }, '清空本地数据');

  const errorBanner = store.state.dataError
    ? h('div', { class: 'danger-banner' }, [
        h('strong', {}, '本地数据读取失败：'),
        document.createTextNode(store.state.dataError),
        h('div', { class: 'btnrow' }, [
          h('button', { class: 'danger', onclick: () => { store.clearAllData(); setTimeout(() => location.reload(), 400); } }, '清空损坏数据并重置')
        ])
      ])
    : null;

  const backupSection = buildBackupSection({ store });

  return h('div', { class: 'wrap' }, [
    errorBanner,
    h('div', { class: 'card' }, [
      h('h2', {}, '基础设置'),
      h('p', { class: 'muted' }, '这些参数会影响所有测试，并在每次修改保存后写入浏览器本地存储。默认值：' +
        `DPI ${DEFAULT_SETTINGS.dpi}、灵敏度 ${DEFAULT_SETTINGS.sensitivity}、FOV ${DEFAULT_SETTINGS.fov}、${DEFAULT_SETTINGS.aspect}、${DEFAULT_SETTINGS.duration} 秒。`),
      h('h3', {}, '游戏参数'),
      h('div', { class: 'grid grid-4' }, [
        field('鼠标 DPI', dpi, '常见值 400 / 800 / 1600'),
        field('游戏内灵敏度', sens, '保留两位小数'),
        field('视野范围 FOV', fov, '40 - 170'),
        field('显示器比例', aspect)
      ]),
      h('h3', {}, '测试参数'),
      h('div', { class: 'grid grid-4' }, [
        field('测试时间', duration),
        field('目标大小', size),
        field('目标速度', speed),
        field('测试难度', diff, '难度影响目标生成频率、尺寸与速度')
      ]),
      h('div', { class: 'btnrow' }, [saveBtn, resetBtn, clearBtn])
    ]),
    backupSection
  ]);
}

function buildBackupSection({ store }) {
  let pending = null;
  let committing = false;

  const previewBox = h('div', { id: 'backup-preview', style: { marginTop: '12px' } }, [
    h('p', { class: 'muted' }, '选择备份文件后，这里会显示差异预览，确认前不会修改任何数据。')
  ]);

  const modeSelect = h('select', { id: 'backup-mode' }, [
    h('option', { value: 'replace' }, '替换全部（用备份覆盖当前设置、记录和方案）'),
    h('option', { value: 'merge' }, '合并新增（保留当前设置，只追加新记录和新方案）')
  ]);
  modeSelect.addEventListener('change', () => renderPreview());

  const exportBtn = h('button', {
    id: 'backup-export',
    onclick: () => {
      const backup = createBackup({
        settings: store.state.settings,
        records: store.state.records,
        profiles: store.state.profiles
      });
      downloadFile(`fps-sensitivity-backup-${Date.now()}.json`, JSON.stringify(backup, null, 2));
      toast('完整备份已导出（设置 + 记录 + 方案）。');
    }
  }, '导出完整备份');

  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', id: 'backup-file' });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    let text;
    try {
      text = await readFileText(file);
    } catch {
      showError('无法读取所选文件。');
      return;
    }
    const parsed = parseBackup(text);
    if (!parsed.ok) {
      pending = null;
      showError(parsed.error);
      return;
    }
    const validation = validateBackup(parsed.backup);
    if (!validation.ok) {
      pending = null;
      const first = validation.settings.error || validation.records.error || validation.profiles.error;
      showError(`备份校验失败：${first}`);
      return;
    }
    pending = { backup: parsed.backup, validation };
    renderPreview();
  });

  function showError(message) {
    previewBox.replaceChildren(h('p', { class: 'danger-banner', id: 'backup-error' }, message));
  }

  function renderPreview() {
    if (!pending) return;
    const mode = modeSelect.value;
    const preview = computePreview(pending.backup, pending.validation, store.state, mode);
    const rows = [
      ['文件版本', `v${preview.version}${preview.migrated ? '（已从旧版本迁移）' : ''}`],
      ['导出时间', preview.exportedAt ? new Date(preview.exportedAt).toLocaleString('zh-CN') : '未知'],
      ['执行模式', mode === 'replace' ? '替换全部' : '合并新增'],
      ['设置变化', preview.settingsChanged ? '有变化，导入后生效' : (mode === 'merge' ? '合并模式保留当前设置' : '无变化')],
      ['记录总数', String(preview.totalRecords)],
      ['有效记录', String(preview.validRecords)],
      ['无效记录（将被跳过）', String(preview.invalidRecords)],
      ['将新增记录', String(preview.newRecords)],
      ['重复 ID（将被跳过）', String(preview.duplicateRecordIds)],
      ['方案数量', `${preview.profileCount} 个（新增 ${preview.newProfiles}，重复 ${preview.duplicateProfileIds}）`]
    ];
    previewBox.replaceChildren(
      h('div', { class: 'card', style: { background: 'var(--panel2)', marginTop: '0' } }, [
        h('h3', {}, '导入预览（确认前不会修改数据）'),
        h('dl', { class: 'grid grid-2' }, rows.map(([k, v]) =>
          h('div', {}, [h('dt', { class: 'muted', style: { fontSize: '12px' } }, k), h('dd', { style: { margin: '2px 0 0' } }, v)])
        )),
        h('div', { class: 'btnrow' }, [
          h('button', {
            id: 'backup-confirm',
            onclick: () => confirmImport()
          }, '确认导入'),
          h('button', {
            class: 'ghost',
            id: 'backup-cancel',
            onclick: () => {
              pending = null;
              fileInput.value = '';
              previewBox.replaceChildren(h('p', { class: 'muted' }, '已取消导入，当前数据未改动。'));
            }
          }, '取消')
        ])
      ])
    );
  }

  function confirmImport() {
    if (!pending || committing) return;
    committing = true;
    const snapshot = applyImport(pending.validation, store.state, modeSelect.value);
    try {
      store.importSnapshot(snapshot);
    } catch (err) {
      committing = false;
      showError(err.message || '导入失败，已回滚到导入前的数据。');
      return;
    }
    toast('备份已导入，正在重新加载应用…');
    setTimeout(() => location.reload(), 500);
  }

  return h('div', { class: 'card' }, [
    h('h2', {}, '备份与恢复'),
    h('p', { class: 'muted' }, '导出包含设置、全部测试记录和灵敏度方案的完整备份；导入前会校验并预览差异，确认后才会写入，失败自动回滚。'),
    h('div', { class: 'btnrow' }, [exportBtn]),
    h('div', { class: 'grid grid-2', style: { marginTop: '12px' } }, [
      h('label', { class: 'field' }, ['选择备份文件', fileInput]),
      h('label', { class: 'field' }, ['导入模式', modeSelect])
    ]),
    previewBox
  ]);
}

function readFileText(file) {
  if (typeof file.text === 'function') {
    return Promise.resolve()
      .then(() => file.text())
      .catch(() => readWithFileReader(file));
  }
  return readWithFileReader(file);
}

function readWithFileReader(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('read failed'));
    reader.readAsText(file);
  });
}
