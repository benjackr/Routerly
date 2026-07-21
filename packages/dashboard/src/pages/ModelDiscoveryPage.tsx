import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, Globe, HardDrive, ArrowLeft, ChevronLeft, ChevronRight, Check, ChevronsUpDown, ChevronUp, ChevronDown } from 'lucide-react';
import { get模型Catalog, type CatalogEntry } from '../api';
import { MultiSelect } from '../components/MultiSelect';

const PAGE_SIZE = 25;

type CtxFilter = 'all' | 'small' | 'medium' | 'large' | 'xl';
type PriceFilter = 'all' | 'free' | 'low' | 'mid' | 'high';
type SortCol = 'model' | 'provider' | 'context' | 'input' | 'output';
type SortDir = 'asc' | 'desc';

function FilterLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
      {children}
    </span>
  );
}

function fmtPricePer1M(per1kTokens: number): string {
  if (per1kTokens === 0) return 'free';
  const p = per1kTokens * 1000;
  if (p >= 10) return `$${p.toFixed(0)}`;
  if (p >= 1)  return `$${p.toFixed(2).replace(/\.?0+$/, '')}`;
  return `$${p.toFixed(4).replace(/\.?0+$/, '')}`;
}

function fmtCtx(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  return `${Math.round(n / 1000)}k`;
}

function matchCtx(e: CatalogEntry, f: CtxFilter): boolean {
  const c = e.contextWindow;
  if (f === 'small')  return c < 32_000;
  if (f === 'medium') return c >= 32_000 && c <= 200_000;
  if (f === 'large')  return c > 200_000 && c <= 1_000_000;
  if (f === 'xl')     return c > 1_000_000;
  return true;
}

function matchPrice(e: CatalogEntry, f: PriceFilter): boolean {
  if (f === 'free') return !!e.local;
  const inp = e.pricing.inputPer1kTokens * 1000;
  if (f === 'low')  return !e.local && inp < 1;
  if (f === 'mid')  return !e.local && inp >= 1 && inp <= 5;
  if (f === 'high') return !e.local && inp > 5;
  return true;
}

export function 模型DiscoveryPage() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<CatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected提供商s, setSelected提供商s] = useState<string[]>([]);
  const [ctxFilter, setCtxFilter] = useState<CtxFilter>('all');
  const [priceFilter, setPriceFilter] = useState<PriceFilter>('all');
  const [only已配置, setOnly已配置] = useState(false);
  const [only嵌入模型, setOnly嵌入模型] = useState(false);
  const [page, setPage] = useState(1);
  const [sortCol, setSortCol] = useState<SortCol>('model');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  useEffect(() => {
    get模型Catalog()
      .then(setEntries)
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const providerOptions = useMemo(() =>
    Array.from(new Set(entries.map(e => e.provider))).sort().map(p => ({ value: p, label: p })),
    [entries]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter(e =>
      (selected提供商s.length === 0 || selected提供商s.includes(e.provider)) &&
      matchCtx(e, ctxFilter) &&
      matchPrice(e, priceFilter) &&
      (!only已配置 || e.is已配置) &&
      (!only嵌入模型 || e.embedding) &&
      (!q || e.id.toLowerCase().includes(q) || e.name?.toLowerCase().includes(q))
    );
  }, [entries, search, selected提供商s, ctxFilter, priceFilter, only已配置, only嵌入模型]);

  useEffect(() => { setPage(1); }, [search, selected提供商s, ctxFilter, priceFilter, only已配置, only嵌入模型]);

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
    setPage(1);
  }

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sortCol) {
        case 'model':    return dir * a.id.localeCompare(b.id);
        case 'provider': return dir * a.provider.localeCompare(b.provider);
        case 'context':  return dir * (a.contextWindow - b.contextWindow);
        case 'input':    return dir * (a.pricing.inputPer1kTokens - b.pricing.inputPer1kTokens);
        case 'output':   return dir * (a.pricing.outputPer1kTokens - b.pricing.outputPer1kTokens);
      }
    });
  }, [filtered, sortCol, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const startIdx = (page - 1) * PAGE_SIZE + 1;
  const endIdx = Math.min(page * PAGE_SIZE, sorted.length);

  const hasReset = selected提供商s.length > 0 || ctxFilter !== 'all' || priceFilter !== 'all' || only已配置 || only嵌入模型 || search.trim();
  function resetFilters() {
    setSelected提供商s([]); setCtxFilter('all'); setPriceFilter('all');
    setOnly已配置(false); setOnly嵌入模型(false); setSearch('');
  }

  return (
    <>
      <div className="page-header">
        <button
          className="btn-icon"
          onClick={() => navigate('/dashboard/models')}
          style={{ marginBottom: 16, display: 'inline-flex', padding: 4, width: 'fit-content' }}
        >
          <ArrowLeft size={16} />
          <span style={{ marginLeft: 6, fontSize: '0.8rem', fontWeight: 500 }}>Back to 模型s</span>
        </button>
        <h1>模型发现</h1>
        <p>浏览可用模型并添加到你的路由配置中</p>
      </div>
      <div className="page-body">

        {/* Filters */}
        <div className="card" style={{ padding: '16px 24px', marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Row 1: search + provider */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, maxWidth: 300 }}>
              <FilterLabel>搜索</FilterLabel>
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="模型 ID 或名称…"
                  className="form-input"
                  style={{ paddingLeft: 28, paddingRight: search ? 28 : 10, width: '100%', boxSizing: 'border-box' }}
                />
                {search && (
                  <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex' }}>
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, maxWidth: 320 }}>
              <FilterLabel>提供商</FilterLabel>
              <MultiSelect
                options={providerOptions}
                value={selected提供商s}
                onChange={setSelected提供商s}
                placeholder="All providers"
              />
            </div>

            {!loading && !error && (
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', marginLeft: 'auto', paddingBottom: 8 }}>
                {filtered.length === entries.length ? `${entries.length} models` : `${filtered.length} of ${entries.length}`}
              </span>
            )}
          </div>

          {/* Divider */}
          <div style={{ borderTop: '1px solid var(--border)' }} />

          {/* Row 2: toggle filters */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <FilterLabel>上下文</FilterLabel>
              <div style={{ display: 'flex', gap: 5 }}>
                {(['all', 'small', 'medium', 'large', 'xl'] as CtxFilter[]).map(f => (
                  <button key={f} className={`btn btn-sm ${ctxFilter === f ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setCtxFilter(f)}>
                    {{ all: '全部', small: '< 32k', medium: '32k–200k', large: '200k–1M', xl: '> 1M' }[f]}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <FilterLabel>价格/百万</FilterLabel>
              <div style={{ display: 'flex', gap: 5 }}>
                {(['all', 'free', 'low', 'mid', 'high'] as PriceFilter[]).map(f => (
                  <button key={f} className={`btn btn-sm ${priceFilter === f ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPriceFilter(f)}>
                    {{ all: '全部', free: 'Free', low: '< $1', mid: '$1–$5', high: '> $5' }[f]}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <FilterLabel>显示</FilterLabel>
              <div style={{ display: 'flex', gap: 5 }}>
                <button className={`btn btn-sm ${only已配置 ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setOnly已配置(v => !v)}>
                  已配置
                </button>
                <button className={`btn btn-sm ${only嵌入模型 ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setOnly嵌入模型(v => !v)}>
                  嵌入模型
                </button>
              </div>
            </div>

            {hasReset && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <FilterLabel>&nbsp;</FilterLabel>
                <button className="btn btn-sm btn-secondary" onClick={resetFilters}>重置筛选</button>
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div className="loading-center"><div className="spinner" /></div>
        ) : error ? (
          <div className="empty-state"><p style={{ color: 'var(--error)' }}>Failed to load catalog: {error}</p></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <Search size={36} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
            <p>没有符合筛选条件的模型。</p>
            <button type="button" className="btn btn-secondary" onClick={resetFilters} style={{ marginTop: 8 }}>重置筛选</button>
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {([
                      { col: 'model' as SortCol, label: '模型' },
                      { col: 'provider' as SortCol, label: '提供商' },
                      { col: 'context' as SortCol, label: '上下文' },
                      { col: 'input' as SortCol, label: '输入/百万' },
                      { col: 'output' as SortCol, label: '输出/百万' },
                    ]).map(({ col, label }) => {
                      const active = sortCol === col;
                      const Icon = active ? (sortDir === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;
                      return (
                        <th key={col} onClick={() => toggleSort(col)} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            {label}
                            <Icon size={13} style={{ opacity: active ? 1 : 0.4, color: active ? 'var(--accent)' : undefined }} />
                          </span>
                        </th>
                      );
                    })}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(e => (
                    <tr key={`${e.provider}/${e.id}`}>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span className="mono" style={{ fontSize: '0.85rem', fontWeight: 500 }}>{e.id}</span>
                            {e.is已配置 && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.68rem', fontWeight: 600, padding: '1px 6px', borderRadius: 8, background: 'rgba(34,197,94,0.1)', color: '#22c55e', whiteSpace: 'nowrap' }}>
                                <Check size={9} strokeWidth={3} /> 已配置
                              </span>
                            )}
                            {e.embedding && (
                              <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: 8, background: 'rgba(99,102,241,0.12)', color: '#818cf8', whiteSpace: 'nowrap' }}>embedding</span>
                            )}
                            {e.local && (
                              <span title="Runs locally" style={{ color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center' }}>
                                <HardDrive size={11} />
                              </span>
                            )}
                          </div>
                          {e.name && e.name !== e.id && (
                            <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 380 }} title={e.name}>
                              {e.name}
                            </span>
                          )}
                        </div>
                      </td>
                      <td><span className={`badge badge-${e.provider}`}>{e.provider}</span></td>
                      <td style={{ whiteSpace: 'nowrap' }}>{e.contextWindow > 0 ? fmtCtx(e.contextWindow) : '—'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {e.local ? <span style={{ color: 'var(--success, #22c55e)', fontWeight: 600, fontSize: '0.82rem' }}>free</span> : fmtPricePer1M(e.pricing.inputPer1kTokens)}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {e.local ? <span style={{ color: 'var(--success, #22c55e)', fontWeight: 600, fontSize: '0.82rem' }}>free</span> : fmtPricePer1M(e.pricing.outputPer1kTokens)}
                      </td>
                      <td>
                        <button
                          className={`btn btn-sm${e.is已配置 ? ' btn-secondary' : ''}`}
                          onClick={() => navigate(`/dashboard/models/new?provider=${encodeURIComponent(e.provider)}&modelId=${encodeURIComponent(e.id)}`, { state: { catalogEntry: e } })}
                          style={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          <Globe size={12} /> {e.is已配置 ? '重新添加' : 'Add'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 16 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem' }}
                  disabled={page === 1}
                  onClick={() => setPage(p => p - 1)}
                >
                  <ChevronLeft size={14} /> Prev
                </button>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {startIdx}–{endIdx} of {filtered.length}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem' }}
                  disabled={page === totalPages}
                  onClick={() => setPage(p => p + 1)}
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
