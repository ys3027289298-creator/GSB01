import { describe, it, expect } from 'vitest';
import { recordsToCsv } from '../src/pages/records.js';
import { compareProfiles } from '../src/engine/scoring.js';

describe('记录导出 CSV', () => {
  it('包含表头并转义引号', () => {
    const records = [{
      id: 'r1',
      createdAt: '2026-09-19T10:00:00.000Z',
      type: 'click',
      profileName: '方案"A"',
      summary: { score: 80 },
      stats: { accuracy: 0.9, avgReactionMs: 300, misses: 2, mouseDistancePx: 1200 },
      settings: { dpi: 800, sensitivity: 1, fov: 90 }
    }];
    const csv = recordsToCsv(records);
    const lines = csv.split('\n');
    expect(lines[0]).toContain('createdAt');
    expect(lines[1]).toContain('方案""A""');
    expect(lines[1]).toContain('800');
  });
});

describe('灵敏度方案对比', () => {
  it('按方案名聚合并按综合分排序', () => {
    const run = (name, type, score, extra) => ({
      profileName: name,
      summary: { type, score, ...extra }
    });
    const rows = compareProfiles([
      run('高灵敏度', 'click', 60, { hits: 6, attempts: 10, avgReactionMs: 400, misses: 4 }),
      run('低灵敏度', 'click', 90, { hits: 9, attempts: 10, avgReactionMs: 300, misses: 1 })
    ]);
    expect(rows[0].profileName).toBe('低灵敏度');
    expect(rows[0].accuracy).toBe(0.9);
    expect(rows[1].reactionMs).toBe(400);
  });
});
