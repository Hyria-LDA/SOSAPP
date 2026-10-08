import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadCompanyMaterialCounts } from '../src/lib/admin-company-material-counts.ts';

function fixture(rows, cap = 500, failAt = -1) {
  let calls = 0;
  return { from(table) {
    assert.equal(table, 'materiais');
    let cursor = '', limit;
    const q = {
      select(columns) { assert.equal(columns, 'id,empresa_id,status'); return q; },
      order(column) { assert.equal(column, 'id'); return q; },
      limit(n) { limit = n; return q; },
      gt(column, value) { assert.equal(column, 'id'); cursor = value; return q; },
      abortSignal() { return q; },
      then(resolve, reject) {
        const result = calls++ === failAt ? { data: null, error: new Error('Database unavailable') } : {
          data: rows.filter(row => row.id > cursor).slice(0, Math.min(cap, limit)), error: null,
        };
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return q;
  } };
}
const row = (i, company, status = 'ativo') => ({ id: String(i).padStart(8, '0'), empresa_id: company, status });
test('counts companies beyond the first 1000 materials, including 10 later ads', async () => {
  const rows = Array.from({length: 1010}, (_, i) => row(i, i < 1000 ? 'earlier' : 'dplanejados'));
  const counts = await loadCompanyMaterialCounts(fixture(rows));
  assert.deepEqual(counts.dplanejados, { ativos: 10, total: 10 });
  assert.deepEqual(counts.earlier, { ativos: 1000, total: 1000 });
});
test('continues when server cap is smaller, separating active from other statuses', async () => {
  const rows = ['ativo', 'vendido', 'pausado', 'expirado', 'em_revisao', 'suspenso', 'arquivado', 'ativo'].map((status,i) => row(i,'company',status));
  assert.deepEqual(await loadCompanyMaterialCounts(fixture(rows, 3)), {company: {ativos: 2, total: 8}});
});
test('does not return incomplete counts after a later page fails', async () => {
  await assert.rejects(loadCompanyMaterialCounts(fixture([row(0,'company'),row(1,'company')],1,1)), /Database unavailable/);
});
test('handles an empty inventory', async () => {
  assert.deepEqual(await loadCompanyMaterialCounts(fixture([])), {});
});
