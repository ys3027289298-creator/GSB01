import { h, mount, toast, downloadFile } from '../dom.js';
import { ASPECTS, DEFAULT_SETTINGS } from '../engine/settings.js';
import { parseBackup, computePreview, applyImport } from '../engine/backup.js';

const MODE_LABELS = { replace: '替换全部', merge: '合并新增' };

export function backupSection({ store, reload = () => location.reload() }) {
  let parsed = null;
  let importing = false;

  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', id: 'backup-file' });
  const modeSelect = h('select', { id: 'backup-mode' }, [
    h('option', { value: 'merge', selected: true }, '合并新增（保留当前设置，只加入新记录与方案）'),
    h('option', { value: 'replace' }, '替换全部（用备份覆盖当前设置、记录和方案）')
  ]);
  const previewBox = h('div', { id: 'backup-preview', style: { marginTop: '12px' } });
  const errorBox = h('div', { id: 'backup-error', style: { marginTop: '12px' } });

  function resetPreview() {
    parsed = null;
    mount(previewBox);
    mount(errorBox);
  }

  function showError(message) {
    mount(previewBox);
    mount(errorBox, h('div', { class: 'danger-banner' }, message));
  }

  function renderPreview() {
    if (!parsed) return;
    const mode = modeSelect.value;
    const preview = computePreview(parsed.backup, store.state, mode);
    const rows = [
      ['文件版本', `v${preview.version}${parsed.migrated ? `（已从旧版本 v${parsed.fromVersion} 迁移）` : ''}`],
      ['导出时间', preview.exportedAt ? new Date(preview.exportedAt).toLocaleString('zh-CN') : '未知'],
      ['设置是否变化', preview.settingsChanged ? '有变化' : '无变化'],
      ['导入记录总数', String(preview.totalRecords)],
      ['有效记录数', String(preview.validRecords)],
      ['无效记录数', String(preview.invalidRecords)],
      ['将新增的记录数', String(preview.newRecords)],
      ['重复 ID 数', `${preview.duplicateIds}（将被跳过）`],
      ['方案数量', `${preview.profileCount}（新增 ${preview.newProfiles}）`],
      ['将执行的模式', MODE_LABELS[mode]]
    ];
    const confirmBtn = h('button', {
      id: 'backup-confirm',
      onclick: () => confirmImport()
    }, '确认导入');
    const cancelBtn = h('button', {
      id: 'backup-cancel',
      class: 'ghost',
      onclick: () => {
        resetPreview();
        fileInput.value = '';
      }
    }, '取消');
    mount(previewBox, h('div', { class: 'card', style: { background: 'var(--panel2)' } }, [
      h('h3', {}, '导入预览'),
      ...(preview.errors.length ? [h('div', { class: 'danger-banner' }, preview.errors.join(' '))] : []),
      h('dl', { class: 'preview-list' }, rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
      h('div', { class: 'btnrow' }, [confirmBtn, cancelBtn])
    ]));
  }

  function confirmImport() {
    if (importing || !parsed) return;
    importing = true;
    try {
      const snapshot = applyImport(parsed.backup, store.state, modeSelect.value);
      store.importSnapshot(snapshot);
      toast('备份导入成功，正在重新加载应用。');
      setTimeout(() => reload(), 400);
    } catch (err) {
      importing = false;
      showError(err.message || '导入失败，当前数据未被修改。');
    }
  }

  function handleFile() {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => showError('文件读取失败，请重试。');
    reader.onload = () => {
      const result = parseBackup(String(reader.result));
      if (!result.ok) {
        parsed = null;
        showError(result.error);
        return;
      }
      parsed = result;
      mount(errorBox);
      renderPreview();
    };
    reader.readAsText(file);
  }

  fileInput.addEventListener('change', handleFile);
  modeSelect.addEventListener('change', () => renderPreview());

  const exportBtn = h('button', {
    id: 'backup-export',
    class: 'ghost',
    onclick: () => {
      const backup = store.exportBackup();
      downloadFile(`fps-sensitivity-backup-${Date.now()}.json`, JSON.stringify(backup, null, 2));
      toast('完整备份已导出（设置 + 记录 + 方案）。');
    }
  }, '导出完整备份');

  return h('div', { id: 'backup-section' }, [
    h('h3', {}, '备份与恢复'),
    h('p', { class: 'muted' }, '备份包含当前设置、全部测试记录和灵敏度方案。导入前会显示差异预览，确认后才会写入，失败会自动回滚。'),
    h('div', { class: 'btnrow' }, [exportBtn, fileInput, modeSelect]),
    errorBox,
    previewBox
  ]);
}

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
      backupSection({ store }),
      h('div', { class: 'btnrow' }, [saveBtn, resetBtn, clearBtn])
    ])
  ]);
}
