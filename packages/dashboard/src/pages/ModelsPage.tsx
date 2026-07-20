import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Trash2, Server, Edit2, Copy, ChevronUp, ChevronDown, ChevronsUpDown, Search, X, Telescope, FlaskConical, DownloadCloud } from 'lucide-react';
import { getModels, deleteModel, testModel, getProviderHealth, discoverModels, importModels, type Model, type ProviderHealth, type DiscoverResult } from '../api';
import { ConfirmDialog } from '../components/ConfirmDialog';

type SortKey = 'id' | 'provider' | 'endpoint' | 'input' | 'output' | 'cache' | 'context';
type HealthSortKey = 'id' | 'provider' | 'status' | 'errorRate' | 'p95Latency' | 'requests' | 'lastSuccess' | 'cooldown';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 20;
const HEALTH_REFRESH_MS = 30_000;

function numOrInfinity(v: number | null | undefined) { return v ?? Infinity; }

function SortIcon({ col, sortKey, sortDir }: { col: string; sortKey: string; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown size={13} style={{ opacity: 0.35, marginLeft: 4, flexShrink: 0 }} />;
  return sortDir === 'asc'
    ? <ChevronUp size={13} style={{ marginLeft: 4, flexShrink: 0, color: 'var(--accent)' }} />
    : <ChevronDown size={13} style={{ marginLeft: 4, flexShrink: 0, color: 'var(--accent)' }} />;
}

// ── Health helpers ─────────────────────────────────────────────────────────────

// ponytail: 'nodata' is a local extension; ProviderHealth['status'] covers the real statuses
type ExtendedStatus = ProviderHealth['status'] | 'nodata';

// Sort order: lower = worse (sorts last when desc, i.e. always "best first" for status col)
// nodata sentinel ensures no-data rows sink to bottom regardless of direction
const STATUS_SEVERITY: Record<ExtendedStatus, number> = {
  unavailable: 0,
  degraded:    1,
  cooldown:    2,
  healthy:     3,
  nodata:      999, // always last
};

const STATUS_META: Record<ExtendedStatus, { label: string; color: string }> = {
  healthy:     { label: '健康',     color: 'var(--success)' },
  degraded:    { label: '降级',    color: 'var(--warning)' },
  unavailable: { label: 'Unavailable', color: 'var(--danger)' },
  cooldown:    { label: '冷却',    color: 'var(--text-muted)' },
  nodata:      { label: '无数据',     color: 'var(--text-muted)' },
};

function StatusBadge({ status }: { status: ExtendedStatus }) {
  const meta = STATUS_META[status];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontSize: '0.8rem', fontWeight: 600, color: meta.color,
    }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: meta.color }} />
      {meta.label}
    </span>
  );
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'never';
  const diffMs = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diffMs / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function cooldownTimer(iso: string | null): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return null;
  const s = Math.ceil(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.ceil(s / 60)}m`;
}

// ── Models page ────────────────────────────────────────────────────────────────

export function ModelsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') === 'health' ? 'health' : 'models';
  function setTab(t: 'models' | 'health') {
    setSearchParams(t === 'health' ? { tab: 'health' } : {}, { replace: true });
  }

  const [models, setModels] = useState<Model[]>([]);
  const [healthMap, setHealthMap] = useState<Map<string, ProviderHealth>>(new Map());
  const [loading, setLoading] = useState(true);
  const [healthUpdatedAt, setHealthUpdatedAt] = useState<Date | null>(null);
  const [search, setSearch] = useState('');
  const [providerFilter, setProviderFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('id');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);
  const [confirmState, setConfirmState] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [testResults, setTestResults] = useState<Record<string, 'loading' | { ok: boolean; latencyMs: number; error?: string }>>({});
  const [showFetchModal, setShowFetchModal] = useState(false);
  const [fetchEndpoint, setFetchEndpoint] = useState('');
  const [fetchApiKey, setFetchApiKey] = useState('');
  const [fetchLoading, setFetchLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [discoveredModels, setDiscoveredModels] = useState<Array<{ id: string; owned_by?: string; created?: number }>>([]);
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [importLoading, setImportLoading] = useState(false);
  const healthActive = useRef(true);

  // Health tab state
  const [hSearch, setHSearch] = useState('');
  const [hSortKey, setHSortKey] = useState<HealthSortKey>('status');
  const [hSortDir, setHSortDir] = useState<SortDir>('asc');
  const [hPage, setHPage] = useState(1);

  // Load models once
  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try { setModels(await getModels()); } finally { setLoading(false); }
  }

  // Load health + poll every 30s
  useEffect(() => {
    healthActive.current = true;
    async function fetchHealth() {
      try {
        const { providers } = await getProviderHealth();
        if (!healthActive.current) return;
        setHealthMap(new Map(providers.map(p => [p.modelId, p])));
        setHealthUpdatedAt(new Date());
      } catch {
        // health is best-effort; model list still shows
      }
    }
    fetchHealth();
    const id = setInterval(fetchHealth, HEALTH_REFRESH_MS);
    return () => { healthActive.current = false; clearInterval(id); };
  }, []);

  async function handleFetchDiscover() {
    if (!fetchEndpoint) return;
    setFetchLoading(true);
    setFetchError('');
    setDiscoveredModels([]);
    setSelectedModels(new Set());
    try {
      const result = await discoverModels(fetchEndpoint, fetchApiKey);
      if (!result.success) {
        setFetchError(result.error || 'Discovery failed');
        return;
      }
      setDiscoveredModels(result.models || []);
    } catch (err) {
      setFetchError((err as Error).message);
    } finally {
      setFetchLoading(false);
    }
  }

  function toggleModel(id: string) {
    setSelectedModels(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllModels() {
    setSelectedModels(prev => {
      if (prev.size === discoveredModels.length) return new Set();
      return new Set(discoveredModels.map(m => m.id));
    });
  }

  async function handleImport() {
    if (selectedModels.size === 0) return;
    setImportLoading(true);
    try {
      const provider = new URL(fetchEndpoint).hostname.replace('api.', '').replace('.com', '');
      const result = await importModels({
        provider,
        endpoint: fetchEndpoint,
        apiKey: fetchApiKey,
        modelIds: Array.from(selectedModels),
      });
      alert(`导入ed ${result.imported} of ${result.total} models`);
      setShowFetchModal(false);
      setFetchEndpoint('');
      setFetchApiKey('');
      setDiscoveredModels([]);
      setSelectedModels(new Set());
      // Reload the model list
      setModels(await getModels());
    } catch (err) {
      setFetchError((err as Error).message);
    } finally {
      setImportLoading(false);
    }
  }

  async function handleTest(id: string) {
    setTestResults(r => ({ ...r, [id]: 'loading' }));
    const result = await testModel(id);
    setTestResults(r => ({ ...r, [id]: result }));
  }

  function handleDelete(id: string) {
    setConfirmState({
      message: `移除 model "${id}"?`,
      onConfirm: async () => {
        setConfirmState(null);
        await deleteModel(id);
        setModels(m => m.filter(x => x.id !== id));
      },
    });
  }

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [search, providerFilter]);

  const providerOptions = useMemo(
    () => Array.from(new Set(models.map(m => m.provider))).sort(),
    [models],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return models.filter(m => {
      if (providerFilter && m.provider !== providerFilter) return false;
      if (!q) return true;
      return m.id.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q) || m.endpoint.toLowerCase().includes(q);
    });
  }, [models, search, providerFilter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'id':       cmp = a.id.localeCompare(b.id); break;
        case 'provider': cmp = a.provider.localeCompare(b.provider); break;
        case 'endpoint': cmp = a.endpoint.localeCompare(b.endpoint); break;
        case 'input':    cmp = a.cost.inputPerMillion - b.cost.inputPerMillion; break;
        case 'output':   cmp = a.cost.outputPerMillion - b.cost.outputPerMillion; break;
        case 'cache':    cmp = numOrInfinity(a.cost.cachePerMillion) - numOrInfinity(b.cost.cachePerMillion); break;
        case 'context':  cmp = numOrInfinity(a.contextWindow) - numOrInfinity(b.contextWindow); break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  useEffect(() => { if (page > totalPages) setPage(Math.max(1, totalPages)); }, [page, totalPages]);
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── Health tab computed ────────────────────────────────────────────────────
  const hFiltered = useMemo(() => {
    const q = hSearch.trim().toLowerCase();
    if (!q) return models;
    return models.filter(m => m.id.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q));
  }, [models, hSearch]);

  const hSorted = useMemo(() => [...hFiltered].sort((a, b) => {
    const ha = healthMap.get(a.id);
    const hb = healthMap.get(b.id);
    if (!ha && !hb) return 0;
    if (!ha) return 1;
    if (!hb) return -1;
    const sa: ExtendedStatus = cooldownTimer(ha.cooldownUntil) ? 'cooldown' : ha.status;
    const sb: ExtendedStatus = cooldownTimer(hb.cooldownUntil) ? 'cooldown' : hb.status;
    let cmp = 0;
    switch (hSortKey) {
      case 'id':          cmp = a.id.localeCompare(b.id); break;
      case 'provider':    cmp = a.provider.localeCompare(b.provider); break;
      case 'status':      cmp = STATUS_SEVERITY[sb] - STATUS_SEVERITY[sa]; break;
      case 'errorRate':   cmp = ha.errorRate - hb.errorRate; break;
      case 'p95Latency':  cmp = (ha.p95LatencyMs ?? Infinity) - (hb.p95LatencyMs ?? Infinity); break;
      case 'requests':    cmp = ha.requestsLastHour - hb.requestsLastHour; break;
      case 'lastSuccess': cmp = (ha.lastSuccessAt ? new Date(ha.lastSuccessAt).getTime() : -Infinity)
                              - (hb.lastSuccessAt ? new Date(hb.lastSuccessAt).getTime() : -Infinity); break;
      case 'cooldown':    cmp = (ha.cooldownUntil ? new Date(ha.cooldownUntil).getTime() : 0)
                              - (hb.cooldownUntil ? new Date(hb.cooldownUntil).getTime() : 0); break;
    }
    return hSortDir === 'asc' ? cmp : -cmp;
  }), [hFiltered, hSortKey, hSortDir, healthMap]);

  const hTotalPages = Math.max(1, Math.ceil(hSorted.length / PAGE_SIZE));
  useEffect(() => { if (hPage > hTotalPages) setHPage(Math.max(1, hTotalPages)); }, [hPage, hTotalPages]);
  useEffect(() => { setHPage(1); }, [hSearch]);
  const hPaginated = hSorted.slice((hPage - 1) * PAGE_SIZE, hPage * PAGE_SIZE);

  function handleHSort(key: HealthSortKey) {
    if (key === hSortKey) setHSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setHSortKey(key); setHSortDir('asc'); }
  }
  const hTh = (label: string, key: HealthSortKey, align?: 'right') => (
    <th style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', textAlign: align }} onClick={() => handleHSort(key)}>
      <span style={{ display: 'inline-flex', alignItems: 'center' }}>
        {label}<SortIcon col={key} sortKey={hSortKey} sortDir={hSortDir} />
      </span>
    </th>
  );

  const thStyle: React.CSSProperties = { cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' };
  const thInner = (label: string, key: SortKey) => (
    <span style={{ display: 'inline-flex', alignItems: 'center' }} onClick={() => handleSort(key)}>
      {label}<SortIcon col={key} sortKey={sortKey} sortDir={sortDir} />
    </span>
  );

  const tabStyle = (t: 'models' | 'health'): React.CSSProperties => ({
    padding: '0 4px 12px',
    fontSize: '0.9rem', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer',
    color: tab === t ? 'var(--primary)' : 'var(--text-secondary)',
    borderBottom: tab === t ? '2px solid var(--primary)' : '2px solid transparent',
    transition: 'color 0.15s',
    marginBottom: -1,
  });

  return (
    <>
      <div className="page-header" style={{ paddingBottom: 0 }}>
        <h1>模型</h1>
        <p>LLM providers registered with Routerly</p>
        <div style={{ display: 'flex', gap: 24, borderBottom: '1px solid var(--border)', marginTop: 12 }}>
          <button style={tabStyle('models')} onClick={() => setTab('models')}>模型</button>
          <button style={tabStyle('health')} onClick={() => setTab('health')}>健康</button>
        </div>
      </div>
      <div className="page-body" style={{ paddingTop: 24 }}>
        {tab === 'models' && (
          <>
            <div className="toolbar">
              <span className="toolbar-title">
                {filtered.length !== models.length
                  ? `${filtered.length} of ${models.length} model${models.length !== 1 ? 's' : ''}`
                  : `${models.length} model${models.length !== 1 ? 's' : ''}`}
              </span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select
                  value={providerFilter}
                  onChange={e => setProviderFilter(e.target.value)}
                  style={{
                    height: 32, padding: '0 10px', fontSize: '0.85rem', borderRadius: 6,
                    border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)',
                    outline: 'none',
                  }}
                >
                  <option value="">All providers</option>
                  {providerOptions.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="筛选模型…"
                    style={{ paddingLeft: 28, paddingRight: search ? 28 : 10, height: 32, fontSize: '0.85rem', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', outline: 'none', width: 200 }}
                  />
                  {search && (
                    <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex', alignItems: 'center' }}>
                      <X size={13} />
                    </button>
                  )}
                </div>
                <Link to="/dashboard/models/discover" className="btn">
                  <Telescope size={16} /> Discover
                </Link>
                <button className="btn" onClick={() => setShowFetchModal(true)}>
                  <DownloadCloud size={16} /> Fetch
                </button>
                <Link to="/dashboard/models/new" className="btn btn-primary">
                  <Plus size={16} /> Add Model
                </Link>
              </div>
            </div>
            {loading ? (
              <div className="loading-center"><div className="spinner" /></div>
            ) : models.length === 0 ? (
              <div className="empty-state"><Server size={40} /><p>暂无模型，添加一个开始使用。</p></div>
            ) : sorted.length === 0 ? (
              <div className="empty-state"><Search size={40} /><p>没有符合筛选条件的模型。</p></div>
            ) : (
              <>
                <div className="table-wrap" style={{ overflowX: 'auto' }}>
                  <table style={{ minWidth: 700 }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>{thInner('ID', 'id')}</th>
                        <th style={thStyle}>{thInner('提供商', 'provider')}</th>
                        <th style={thStyle}>{thInner('端点', 'endpoint')}</th>
                        <th style={thStyle}>{thInner('输入 $/百万', 'input')}</th>
                        <th style={thStyle}>{thInner('输出 $/百万', 'output')}</th>
                        <th style={thStyle}>{thInner('缓存 $/百万', 'cache')}</th>
                        <th style={thStyle}>{thInner('上下文大小', 'context')}</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginated.map(m => (
                          <tr key={m.id}>
                            <td><span className="mono">{m.id}</span></td>
                            <td><span className={`badge badge-${m.provider}`}>{m.provider}</span></td>
                            <td><span className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{m.endpoint}</span></td>
                            <td>${m.cost.inputPerMillion}</td>
                            <td>${m.cost.outputPerMillion}</td>
                            <td>{m.cost.cachePerMillion != null ? `$${m.cost.cachePerMillion}` : <span className="text-muted">—</span>}</td>
                            <td>{m.contextWindow != null ? `${(m.contextWindow / 1000).toFixed(0)}k` : <span className="text-muted">—</span>}</td>
                            <td style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                              {(() => {
                                const tr = testResults[m.id];
                                if (tr === 'loading') return <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>…</span>;
                                if (tr) return (
                                  <span style={{ fontSize: '0.7rem', color: tr.ok ? 'var(--success)' : 'var(--danger)', whiteSpace: 'nowrap' }} title={tr.error}>
                                    {tr.ok ? `✓ ${tr.latencyMs}ms` : `✗ ${tr.error?.slice(0, 30)}`}
                                  </span>
                                );
                                return null;
                              })()}
                              <button className="btn-icon" onClick={() => handleTest(m.id)} title="测试">
                                <FlaskConical size={15} />
                              </button>
                              <Link to={`/dashboard/models/new?clone=${encodeURIComponent(m.id)}`} className="btn-icon" title="克隆">
                                <Copy size={15} />
                              </Link>
                              <Link to={`/dashboard/models/${encodeURIComponent(m.id)}`} className="btn-icon" title="编辑">
                                <Edit2 size={15} />
                              </Link>
                              <button className="btn-icon danger" onClick={() => handleDelete(m.id)} title="移除">
                                <Trash2 size={15} />
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                {totalPages > 1 && (
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
                    marginTop: 16, padding: '10px 0',
                  }}>
                    <button className="btn btn-sm btn-secondary" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                      ← Previous
                    </button>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                      Page {page} of {totalPages}
                      <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>({sorted.length} models)</span>
                    </span>
                    <button className="btn btn-sm btn-secondary" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                      Next →
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {tab === 'health' && (
          loading ? (
            <div className="loading-center"><div className="spinner" /></div>
          ) : models.length === 0 ? (
            <div className="empty-state"><Server size={40} /><p>尚未配置任何模型。</p></div>
          ) : (
            <>
              <div className="toolbar">
                <span className="toolbar-title">
                  {hFiltered.length !== models.length
                    ? `${hFiltered.length} of ${models.length} model${models.length !== 1 ? 's' : ''}`
                    : `${models.length} model${models.length !== 1 ? 's' : ''}`}
                </span>
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                  <input
                    value={hSearch}
                    onChange={e => setHSearch(e.target.value)}
                    placeholder="筛选模型…"
                    style={{ paddingLeft: 28, paddingRight: hSearch ? 28 : 10, height: 32, fontSize: '0.85rem', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', outline: 'none', width: 200 }}
                  />
                  {hSearch && (
                    <button onClick={() => setHSearch('')} style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex', alignItems: 'center' }}>
                      <X size={13} />
                    </button>
                  )}
                </div>
              </div>
              {hSorted.length === 0 ? (
                <div className="empty-state"><Search size={40} /><p>没有符合筛选条件的模型。</p></div>
              ) : (
                <>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          {hTh('模型', 'id')}
                          {hTh('提供商', 'provider')}
                          {hTh('状态', 'status')}
                          {hTh('错误率(5分钟)', 'errorRate', 'right')}
                          {hTh('P95 延迟(1小时)', 'p95Latency', 'right')}
                          {hTh('请求数(1小时)', 'requests', 'right')}
                          {hTh('最近成功', 'lastSuccess', 'right')}
                          {hTh('冷却', 'cooldown', 'right')}
                        </tr>
                      </thead>
                      <tbody>
                        {hPaginated.map(m => {
                          const h = healthMap.get(m.id);
                          const cd = h ? cooldownTimer(h.cooldownUntil) : null;
                          const status: ExtendedStatus = h ? (cd ? 'cooldown' : h.status) : 'nodata';
                          return (
                            <tr key={m.id}>
                              <td><span className="mono">{m.id}</span></td>
                              <td><span className={`badge badge-${m.provider}`}>{m.provider}</span></td>
                              <td><StatusBadge status={status} /></td>
                              <td style={{ textAlign: 'right' }}>
                                {h ? `${(h.errorRate * 100).toFixed(1)}%` : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                {h ? (h.p95LatencyMs == null ? '—' : `${Math.round(h.p95LatencyMs)} ms`) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                {h ? h.requestsLastHour : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                              </td>
                              <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>
                                {h ? relativeTime(h.lastSuccessAt) : '—'}
                              </td>
                              <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>
                                {h ? (cd ?? '—') : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {hTotalPages > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 16, padding: '10px 0' }}>
                      <button className="btn btn-sm btn-secondary" disabled={hPage <= 1} onClick={() => setHPage(p => Math.max(1, p - 1))}>
                        ← Previous
                      </button>
                      <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                        Page {hPage} of {hTotalPages}
                        <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>({hSorted.length} models)</span>
                      </span>
                      <button className="btn btn-sm btn-secondary" disabled={hPage >= hTotalPages} onClick={() => setHPage(p => p + 1)}>
                        Next →
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )
        )}
      </div>
      {confirmState && (
        <ConfirmDialog
          message={confirmState.message}
          onConfirm={confirmState.onConfirm}
          onCancel={() => setConfirmState(null)}
        />
      )}
      {showFetchModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.5)',
        }} onClick={() => !fetchLoading && setShowFetchModal(false)}>
          <div style={{
            background: 'var(--surface)', borderRadius: 12, padding: 24,
            minWidth: 500, maxWidth: 700, maxHeight: '80vh', overflow: 'auto',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          }} onClick={e => e.stopPropagation()}>
            <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>从端点拉取模型</h2>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 16 }}>
              输入 OpenAI 兼容的端点地址，自动发现可用模型。
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
              <input
                value={fetchEndpoint}
                onChange={e => setFetchEndpoint(e.target.value)}
                placeholder="https://api.openai.com/v1"
                disabled={fetchLoading}
                style={{ height: 36, padding: '0 12px', fontSize: '0.85rem', borderRadius: 6,
                  border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none' }}
              />
              <input
                value={fetchApiKey}
                onChange={e => setFetchApiKey(e.target.value)}
                placeholder="API Key (optional)"
                type="password"
                disabled={fetchLoading}
                style={{ height: 36, padding: '0 12px', fontSize: '0.85rem', borderRadius: 6,
                  border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none' }}
              />
              <button
                className="btn btn-primary"
                onClick={handleFetchDiscover}
                disabled={fetchLoading || !fetchEndpoint}
                style={{ alignSelf: 'flex-start' }}
              >
                {fetchLoading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <DownloadCloud size={16} />}
                {' '}{fetchLoading ? '发现中...' : '发现'}
              </button>
            </div>
            {fetchError && (
              <div style={{ padding: '8px 12px', background: 'rgba(220,38,38,0.1)', borderRadius: 6,
                color: 'var(--danger)', fontSize: '0.82rem', marginBottom: 12 }}>
                {fetchError}
              </div>
            )}
            {discoveredModels.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                    {discoveredModels.length} model{discoveredModels.length !== 1 ? 's' : ''} found
                  </span>
                  <label style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <input type="checkbox" checked={selectedModels.size === discoveredModels.length && discoveredModels.length > 0}
                      onChange={toggleAllModels} />
                    Select all
                  </label>
                </div>
                <div style={{ maxHeight: 300, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
                  {discoveredModels.map(m => (
                    <label key={m.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px',
                      cursor: 'pointer', fontSize: '0.85rem',
                      borderBottom: '1px solid var(--border)',
                    }}>
                      <input type="checkbox" checked={selectedModels.has(m.id)}
                        onChange={() => toggleModel(m.id)} />
                      <span className="mono">{m.id}</span>
                      {m.owned_by && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({m.owned_by})</span>}
                    </label>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                  <button className="btn" onClick={() => setShowFetchModal(false)} disabled={importLoading}>
                    Cancel
                  </button>
                  <button className="btn btn-primary" onClick={handleImport}
                    disabled={selectedModels.size === 0 || importLoading}>
                    {importLoading ? '导入中...' : `导入选中模型 (${selectedModels.size})`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
