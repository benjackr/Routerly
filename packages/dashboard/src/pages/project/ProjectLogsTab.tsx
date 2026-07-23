import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getUsage, type UsageStats, type UsageRecord } from '../../api';
import { DateRangePicker, RECENT_PRESETS, type DateRange } from '../../components/DateRangePicker';
import { MultiSelect } from '../../components/MultiSelect';
import { useFilterState } from '../../hooks/useFilterState';

function FilterLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase',
      letterSpacing: '0.05em', color: 'var(--text-muted)',
    }}>
      {children}
    </span>
  );
}

export function ProjectLogsTab() {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [stats, setStats]         = useState<UsageStats | null>(null);
  const [loading, setLoading]     = useState(true);
  const [dateRange, setDateRange] = useFilterState<DateRange>({ key: `project-${projectId}-filters-dateRange`, defaultValue: { from: '', to: '', label: '本月' } });
  const [modelIds, setModelIds]   = useFilterState<string[]>({ key: `project-${projectId}-filters-modelIds`, defaultValue: [] });
  const [typeFilter, setCall类型Filter] = useFilterState<'all' | 'completion' | 'routing'>({ key: `project-${projectId}-filters-type`, defaultValue: 'all' });
  const [outcomeFilter, setOutcomeFilter]   = useFilterState<'all' | 'success' | 'error' | 'blocked'>({ key: `project-${projectId}-filters-outcome`, defaultValue: 'all' });
  const [lastUpdated, setLastUpdated]       = useState<Date | null>(null);
  const [pollInterval, setPollInterval]     = useFilterState<number>({ key: `project-${projectId}-filters-pollInterval`, defaultValue: 30_000 });
  const [refreshing, setRefreshing]         = useState(false);
  const [page, setPage]                     = useState(1);
  const [pageSize]                          = useState(100);

  const POLL_OPTIONS: { label: string; value: number }[] = [
    { label: '关闭',  value: 0 },
    { label: '5s',   value: 5_000 },
    { label: '15s',  value: 15_000 },
    { label: '30s',  value: 30_000 },
    { label: '1m',   value: 60_000 },
    { label: '5m',   value: 300_000 },
  ];

  // Initialize date range to "This month" if not already set
  useEffect(() => {
    if (!dateRange.from && !dateRange.to) {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      setDateRange({
        from: start.toISOString().slice(0, 10),
        to: now.toISOString().slice(0, 10),
        label: '本月',
      });
    }
  }, []);

  const fetchStats = useCallback(() => {
    /* v8 ignore next */
    if (!projectId) return Promise.resolve();
    // For recent (minutes/hours) presets, recalculate the range on every fetch
    let from = dateRange.from || undefined;
    let to = dateRange.to || undefined;
    const recentPreset = RECENT_PRESETS.find(p => p.label === dateRange.label);
    if (recentPreset) {
      const fresh = recentPreset.range();
      from = fresh.from;
      to = fresh.to;
    }
    const period = from || to ? 'custom' : 'all';
    return getUsage(period, projectId, from, to, page, pageSize)
      .then(data => { setStats(data); setLastUpdated(new Date()); })
      .catch(console.error);
  }, [projectId, dateRange, page, pageSize]);

  const handleRefreshNow = useCallback(() => {
    setRefreshing(true);
    fetchStats().finally(() => setRefreshing(false));
  }, [fetchStats]);

  useEffect(() => {
    setLoading(true);
    fetchStats().finally(() => setLoading(false));
    if (pollInterval === 0) return;
    const id = setInterval(fetchStats, pollInterval);
    return () => clearInterval(id);
  }, [fetchStats, pollInterval]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [dateRange, modelIds, typeFilter, outcomeFilter]);

  const modelOptions = useMemo(() => {
    if (!stats) return [];
    const ids = Array.from(new Set(stats.records.map(r => r.modelId))).sort();
    return ids.map(id => ({ value: id, label: id }));
  }, [stats]);

  const filteredRecords = useMemo<UsageRecord[]>(() => {
    if (!stats) return [];
    return stats.records.filter(r => {
      if (modelIds.length > 0 && !modelIds.includes(r.modelId)) return false;
      if (typeFilter !== 'all' && (r.type ?? 'completion') !== typeFilter) return false;
      if (outcomeFilter !== 'all' && r.outcome !== outcomeFilter) return false;
      return true;
    });
  }, [stats, modelIds, typeFilter, outcomeFilter]);

  const hasReset = modelIds.length > 0 || typeFilter !== 'all' || outcomeFilter !== 'all';

  return (
    <div style={{ padding: '24px 0', maxWidth: 1100 }}>

      {/* ── Filters ── */}
      <div className="card" style={{ padding: '14px 18px', marginBottom: 20, position: 'relative', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            {pollInterval === 0
              ? '自动刷新已关闭'
              : `自动刷新每 ${POLL_OPTIONS.find(o => o.value === pollInterval)?.label}`}
            {lastUpdated && <> &middot; ultimo aggiornamento: {lastUpdated.toLocale时间String()}</>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>刷新</span>
            {POLL_OPTIONS.map(o => (
              <button
                key={o.value}
                className={`btn btn-sm ${pollInterval === o.value ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setPollInterval(o.value)}
              >
                {o.label}
              </button>
            ))}
            <button
              className="btn btn-sm btn-secondary"
              onClick={handleRefreshNow}
              disabled={refreshing}
              title="立即刷新"
              style={{ marginLeft: 4 }}
            >
              {refreshing ? '…' : '↻ Now'}
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <FilterLabel>时间段</FilterLabel>
            <DateRangePicker value={dateRange} onChange={setDateRange} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 200 }}>
            <FilterLabel>模型</FilterLabel>
            <MultiSelect
              options={modelOptions}
              value={modelIds}
              onChange={setModelIds}
              placeholder="全部模型"
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <FilterLabel>类型</FilterLabel>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['all', 'completion', 'routing'] as const).map(f => (
                <button
                  key={f}
                  className={`btn btn-sm ${typeFilter === f ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setCall类型Filter(f)}
                >
                  {f === 'all' ? '全部' : f === 'completion' ? '补全' : '路由'}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <FilterLabel>状态</FilterLabel>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['all', 'success', 'blocked', 'error'] as const).map(f => (
                <button
                  key={f}
                  className={`btn btn-sm ${outcomeFilter === f ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setOutcomeFilter(f)}
                >
                  {f === 'all' ? '全部' : f === 'success' ? '操作成功' : f === 'blocked' ? '已拦截' : '错误'}
                </button>
              ))}
            </div>
          </div>

          {hasReset && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <FilterLabel>&nbsp;</FilterLabel>
              <button
                className="btn btn-sm btn-secondary"
                onClick={() => { setModelIds([]); setCall类型Filter('all'); setOutcomeFilter('all'); }}
              >
                Reset filters
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      {loading ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : !stats ? null : (
        <>
          {/* Summary strip */}
          <div className="stats-grid" style={{ marginBottom: 24 }}>
            <div className="stat-card">
              <div className="stat-label">总消耗</div>
              <div className="stat-value">${stats.summary.total费用.toFixed(4)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">总调用数</div>
              <div className="stat-value">{stats.summary.totalCalls}</div>
            </div>
            <div
              className="stat-card"
              style={{ cursor: 'pointer', outline: typeFilter === 'completion' ? '2px solid var(--primary)' : 'none', outlineOffset: 2 }}
              onClick={() => setCall类型Filter(f => f === 'completion' ? 'all' : 'completion')}
            >
              <div className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary)', display: 'inline-block' }} />
                Completion Calls
              </div>
              <div className="stat-value">{stats.summary.completionCalls ?? stats.summary.totalCalls}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>
                ${(stats.summary.completion费用 ?? stats.summary.total费用).toFixed(4)}
              </div>
            </div>
            <div
              className="stat-card"
              style={{ cursor: 'pointer', outline: typeFilter === 'routing' ? '2px solid var(--accent)' : 'none', outlineOffset: 2 }}
              onClick={() => setCall类型Filter(f => f === 'routing' ? 'all' : 'routing')}
            >
              <div className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />
                Router Calls
              </div>
              <div className="stat-value">{stats.summary.routingCalls ?? 0}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>
                ${(stats.summary.totalCost ?? 0).toFixed(4)}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">错误</div>
              <div className="stat-value" style={{ color: stats.summary.errorCalls > 0 ? 'var(--danger)' : 'var(--success)' }}>
                {stats.summary.errorCalls}
              </div>
            </div>
          </div>

          {/* Records table */}
          <h3 style={{
            fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)',
            textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 12px',
          }}>
            Request Logs
            <span style={{ fontWeight: 400, marginLeft: 8, color: 'var(--text-muted)' }}>
              ({stats.pagination ? `${filteredRecords.length} / ${stats.pagination.totalRecords}` : filteredRecords.length})
            </span>
          </h3>

          {filteredRecords.length === 0 ? (
            <div className="empty-state">
              <p>{stats.records.length === 0
                ? '所选时间段内无此项目的请求。'
                : '没有符合筛选条件的记录。'}
              </p>
            </div>
          ) : (
            <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>模型</th>
                    <th>类型</th>
                    <th>In</th>
                    <th>Out</th>
                    <th>费用</th>
                    <th>延迟</th>
                    <th>首字延迟</th>
                    <th>字/秒</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.map((r, i) => {
                    const isRouting = (r.type ?? 'completion') === 'routing';
                    return (
                      <tr
                        key={i}
                        style={{ cursor: 'pointer' }}
                        onClick={() => navigate(`/dashboard/usage/${r.id}`, { state: { record: r } })}
                      >
                        <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          {new Date(r.timestamp).toLocaleString()}
                        </td>
                        <td><span className="mono" style={{ fontSize: '0.78rem' }}>{r.modelId}</span></td>
                        <td>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            fontSize: '0.72rem', fontWeight: 600, padding: '2px 7px',
                            borderRadius: 99,
                            background: isRouting ? 'rgba(99,102,241,0.12)' : 'rgba(59,130,246,0.12)',
                            color: isRouting ? 'var(--accent)' : 'var(--primary)',
                          }}>
                            {isRouting ? 'router' : 'completion'}
                          </span>
                        </td>
                        <td>{r.inputTokens}</td>
                        <td>{r.outputTokens}</td>
                        <td className="mono" style={{ fontSize: '0.78rem' }}>${r.cost.toFixed(8)}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{r.latencyMs}ms</td>
                        <td style={{ color: 'var(--text-muted)' }}>{r.ttftMs != null ? `${r.ttftMs}ms` : '—'}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{r.tokensPerSec != null ? `${r.tokensPerSec}` : '—'}</td>
                        <td>
                          <span className={`badge ${r.outcome === 'success' ? 'badge-success' : r.outcome === 'blocked' ? 'badge-warning' : 'badge-错误'}`}>
                            {r.outcome}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination controls */}
            {stats.pagination && stats.pagination.totalPages > 1 && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
                marginTop: 16, padding: '10px 0',
              }}>
                <button
                  className="btn btn-sm btn-secondary"
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                >
                  ← Precedente
                </button>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  Pagina {stats.pagination.page} di {stats.pagination.totalPages}
                  <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>
                    ({stats.pagination.totalRecords} record totali)
                  </span>
                </span>
                <button
                  className="btn btn-sm btn-secondary"
                  disabled={page >= stats.pagination.totalPages}
                  onClick={() => setPage(p => p + 1)}
                >
                  Successiva →
                </button>
              </div>
            )}
            </>
          )}
        </>
      )}
    </div>
  );
}
