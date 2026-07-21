import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import { Plus, X, ChevronDown, EyeOff, Eye, ArrowLeft, Copy, Check, FlaskConical } from 'lucide-react';
import { getModels, createModel, updateModel, testOpenAIOAuth, testModel, getProviders, discoverModels, importModels, type Model, type ModelCapabilities, type PricingTier, type Limit, type LimitMetric, type LimitPeriod, type RollingUnit, type CatalogEntry, type ProviderCatalog } from '../api';

type Provider = string;
type ProviderModel = {
  id: string;
  input: number;
  output: number;
  cache?: number;
  cacheWrite?: number;
  contextWindow?: number;
  notes?: string;
  pricingTiers?: Array<{
    metric: string;
    above: number;
    input: number;
    output: number;
    cache?: number;
  }>;
  capabilities?: ModelCapabilities;
};

// ── Constants ──────────────────────────────────────────────────────────────────
const PROVIDER_LABELS: Partial<Record<string, string>> = {
  'anthropic-oauth': 'Anthropic (Pro/Max 订阅)',
  'openai-oauth': 'OpenAI (ChatGPT Plus/Pro 订阅)',
};

const WEB_PROVIDERS = ['openai-web', 'anthropic-web'] as const;
type WebProvider = typeof WEB_PROVIDERS[number];
const isWebProvider = (p: string): p is WebProvider => (WEB_PROVIDERS as readonly string[]).includes(p);

const WEB_PROVIDER_TOKEN_LABEL: Record<WebProvider, string> = {
  'openai-web': '访问令牌',
  'anthropic-web': '会话令牌',
};

const WEB_PROVIDER_TOKEN_PLACEHOLDER: Record<WebProvider, string> = {
  'openai-web': 'eyJ…',
  'anthropic-web': 'Paste sessionKey cookie value (sk-ant-sid01-…)',
};

const WEB_PROVIDER_INSTRUCTIONS: Record<WebProvider, React.ReactNode> = {
  'openai-web': (
    <>
      While logged in to ChatGPT, open{' '}
      <code style={{ fontSize: '0.78rem' }}>https://chatgpt.com/api/auth/session</code> in a new
      tab. Copy the value of the <code style={{ fontSize: '0.78rem' }}>accessToken</code> field
      (starts with <code style={{ fontSize: '0.78rem' }}>eyJ</code>).
      The token expires every ~24 hours.
      For reliable access, also fill in the <strong>cf_clearance</strong> field below.
    </>
  ),
  'anthropic-web': (
    <>
      <strong>How to get your session key:</strong> While logged in to Claude, open DevTools
      (F12) → Application → Cookies → <code style={{ fontSize: '0.78rem' }}>claude.ai</code>{' '}
      → copy the value of the{' '}
      <code style={{ fontSize: '0.78rem' }}>sessionKey</code> cookie
      (starts with <code style={{ fontSize: '0.78rem' }}>sk-ant-sid01-</code>).
      The key stays valid until you log out.
    </>
  ),
};

// Subscription providers store a long-lived OAuth token (Flow A) instead of an
// API key. The token is used verbatim as the upstream credential; the calling
// client must be a first-party-compatible client (e.g. Claude Code).
const SUBSCRIPTION_PROVIDERS = ['anthropic-oauth', 'openai-oauth'] as const;
type SubscriptionProvider = typeof SUBSCRIPTION_PROVIDERS[number];
const isSubscriptionProvider = (p: string): p is SubscriptionProvider =>
  (SUBSCRIPTION_PROVIDERS as readonly string[]).includes(p);

const SUBSCRIPTION_TOKEN_LABEL: Record<SubscriptionProvider, string> = {
  'anthropic-oauth': '订阅 OAuth 令牌',
  'openai-oauth': '认证文件路径',
};

const SUBSCRIPTION_TOKEN_PLACEHOLDER: Record<SubscriptionProvider, string> = {
  'anthropic-oauth': 'sk-ant-oat01-…',
  'openai-oauth': '~/.codex/auth.json (default)',
};

function CopyCode({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '0.5rem',
      background: 'rgba(0,0,0,0.35)',
      border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: '6px',
      padding: '0.3rem 0.5rem 0.3rem 0.75rem',
      width: '100%',
    }}>
      <code style={{ fontSize: '0.88rem', letterSpacing: '0.01em', color: '#e2e8f0' }}>{text}</code>
      <button
        type="button"
        onClick={handleCopy}
        title={copied ? '已复制!' : '复制到剪贴板'}
        style={{
          background: copied ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.08)',
          border: '1px solid ' + (copied ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.18)'),
          borderRadius: '4px',
          color: copied ? '#4ade80' : '#cbd5e1',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '0.25rem',
          flexShrink: 0,
          fontSize: '0.72rem',
          padding: '3px 8px',
          transition: 'all 0.15s',
        }}
      >
        {copied
          ? <><Check size={12} /> 已复制</>
          : <><Copy size={12} /> 复制</>
        }
      </button>
    </span>
  );
}

const SUBSCRIPTION_INSTRUCTIONS: Record<SubscriptionProvider, React.ReactNode> = {
  'anthropic-oauth': (
    <>
      <strong>Use your Claude Pro/Max subscription.</strong>
      <ol style={{ margin: '0.5rem 0 0.25rem 1.2rem', padding: 0, lineHeight: 1.8 }}>
        <li>
          Run this command and copy the token it prints:
          <div style={{ margin: '0.3rem 0 0.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CopyCode text="claude setup-token" />
          </div>
        </li>
        <li>Paste the token into the <em>订阅 OAuth 令牌</em> field below.</li>
      </ol>
      <span style={{ opacity: 0.7, fontSize: '0.8rem' }}>
        Regenerate when it expires. Subscription use via a gateway may be against the provider&apos;s Terms.
      </span>
    </>
  ),
  'openai-oauth': (
    <>
      <strong>Use your ChatGPT Plus/Pro subscription via the Codex app.</strong>
      <ol style={{ margin: '0.5rem 0 0.25rem 1.2rem', padding: 0, lineHeight: 1.8 }}>
        <li>Log in to the Codex desktop app with your ChatGPT Plus/Pro account.</li>
        <li>
          Routerly reads your access token from <code style={{ fontSize: '0.8rem' }}>~/.codex/auth.json</code>{' '}
          and refreshes it automatically. No manual copy/paste needed.
        </li>
        <li>
          Leave the <em>认证文件路径</em> field blank to use the default, or enter a custom path
          if your Codex app stores auth elsewhere.
        </li>
      </ol>
      <span style={{ opacity: 0.7, fontSize: '0.8rem' }}>
        Subscription use via a gateway may be against the provider&apos;s Terms.
      </span>
    </>
  ),
};

const METRIC_OPTIONS = [
  { value: 'context_tokens', label: '上下文令牌' },
];

// ── Limit types ────────────────────────────────────────────────────────────────
type LimitRow = {
  metric: LimitMetric;
  windowType: 'period' | 'rolling';
  period: LimitPeriod;
  rollingAmount: string;
  rollingUnit: RollingUnit;
  value: string;
};

const LIMIT_METRIC_OPTIONS: { value: LimitMetric; label: string }[] = [
  { value: 'cost',          label: '消耗(美元)'      },
  { value: 'calls',         label: 'Requests'        },
  { value: 'input_tokens',  label: '输入令牌'    },
  { value: 'output_tokens', label: '输出令牌'   },
  { value: 'total_tokens',  label: '令牌总数'    },
];

const PERIOD_OPTIONS: { value: LimitPeriod; label: string }[] = [
  { value: 'hourly',   label: '每小时'   },
  { value: 'daily',    label: '每日'    },
  { value: 'weekly',   label: '每周'   },
  { value: 'monthly',  label: '每月'  },
  { value: 'yearly',   label: '每年'   },
];

const ROLLING_UNIT_OPTIONS: { value: RollingUnit; label: string }[] = [
  { value: 'second', label: '秒' },
  { value: 'minute', label: '分钟' },
  { value: 'hour',   label: '小时'   },
  { value: 'day',    label: '天'    },
  { value: 'week',   label: '周'   },
  { value: 'month',  label: '月'  },
];

const EMPTY_LIMIT_ROW: LimitRow = {
  metric: 'cost', windowType: 'period', period: 'monthly',
  rollingAmount: '24', rollingUnit: 'hour', value: '',
};

/** Convert a row to the API Limit object */
function rowToLimit(r: LimitRow): Limit {
  if (r.windowType === 'rolling') {
    return { metric: r.metric, windowType: 'rolling', rollingAmount: parseInt(r.rollingAmount) || 1, rollingUnit: r.rollingUnit, value: parseFloat(r.value) };
  }
  return { metric: r.metric, windowType: 'period', period: r.period, value: parseFloat(r.value) };
}

/** Convert a saved Limit back to a row (handles old `window` field for backward compat) */
function limitToRow(l: Limit): LimitRow {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const legacyWindow = (l as any).window as string | undefined;
  const legacyPeriodMap: Record<string, LimitPeriod> = {
    minute: 'hourly', hour: 'hourly', day: 'daily', week: 'weekly', month: 'monthly', year: 'yearly',
  };
  if (l.windowType === 'rolling') {
    return { metric: l.metric, windowType: 'rolling', period: 'daily', rollingAmount: String(l.rollingAmount ?? 24), rollingUnit: l.rollingUnit ?? 'hour', value: String(l.value) };
  }
  return { metric: l.metric, windowType: 'period', period: l.period ?? (legacyWindow ? legacyPeriodMap[legacyWindow] : undefined) ?? 'monthly', rollingAmount: '24', rollingUnit: 'hour', value: String(l.value) };
}

// ── Types ──────────────────────────────────────────────────────────────────────
type TierRow = {
  metric: string;
  above: string;
  input: string;
  output: string;
  cache: string;
};

const EMPTY_TIER: TierRow = {
  metric: 'context_tokens',
  above: '',
  input: '',
  output: '',
  cache: '',
};

const EMPTY_FORM = {
  customId: '',
  customProviderName: '',
  id: '',
  provider: 'openai' as Provider,
  endpoint: '',
  apiKey: '',
  cfClearance: '',
  inputPerMillion: '',
  outputPerMillion: '',
  cachePerMillion: '',
  cacheWritePerMillion: '',
  contextWindow: '',
  // Azure OpenAI
  azureResourceName: '',
  azureDeploymentId: '',
  azureApiVersion: '',
  // AWS Bedrock
  awsRegion: '',
  awsAccessKeyId: '',
  awsSecretAccessKey: '',
  awsSessionToken: '',
  // Google Vertex AI
  vertexProjectId: '',
  vertexLocation: '',
  vertexServiceAccountKey: '',
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function generateId(provider: string, modelId: string, existingIds: string[]): string {
  if (!modelId || modelId === '__custom__') return '';
  const base = `${provider}/${modelId}`;
  if (!existingIds.includes(base)) return base;
  let n = 1;
  while (existingIds.includes(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

// ── Component ──────────────────────────────────────────────────────────────────
export function ModelFormPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const [searchParams] = useSearchParams();
  const { state: locationState } = useLocation();
  const catalogEntry = (locationState as { catalogEntry?: CatalogEntry } | null)?.catalogEntry ?? null;
  const cloneSourceId = searchParams.get('clone') ? decodeURIComponent(searchParams.get('clone')!) : null;
  const prefillProvider = searchParams.get('provider');
  const prefillModelId = searchParams.get('modelId');
  const isEditing = Boolean(id);
  const isCloning = Boolean(cloneSourceId);
  const isNewModel = !isEditing && !isCloning;
  const editingModelId = isEditing ? decodeURIComponent(id!) : null;

  const [catalog, setCatalog] = useState<ProviderCatalog>({});
  const PROVIDERS = Object.keys(catalog);
  const ENDPOINT_DEFAULTS: Record<string, string> = Object.fromEntries(
    /* v8 ignore next */ PROVIDERS.map(p => [p, catalog[p]?.endpoint ?? ''])
  );
  const PROVIDER_MODELS: Record<string, ProviderModel[]> = Object.fromEntries(
    /* v8 ignore next */ PROVIDERS.map(p => [p, (catalog[p]?.models ?? []) as ProviderModel[]])
  );

  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(isEditing);
  const [testState, setTestState] = useState<null | 'loading' | { ok: boolean; latencyMs: number; error?: string }>(null);

  const [form, setForm] = useState(EMPTY_FORM);
  const [tierRows, setTierRows] = useState<TierRow[]>([]);
  const [limitRows, setLimitRows] = useState<LimitRow[]>([]);
  // Batch import
  
  
  
  
  
  
  
  
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [show限制, setShow限制] = useState(false);
  const [saving, setSaving] = useState(false);
  const [oauthTest, setOauthTest] = useState<{ status: 'idle' | 'testing' | 'ok' | 'error'; msg?: string }>({ status: 'idle' });
  const [err, setErr] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [showCfClearance, setShowCfClearance] = useState(false);
  const [isCustomModel, setIsCustomModel] = useState(false);
  const [isEmbeddingModel, setIsEmbeddingModel] = useState(false);
  const [fieldOverrides, setFieldOverrides] = useState<Record<string, boolean>>({});
  const [catalogDefaults, setCatalogDefaults] = useState<Model['catalogDefaults']>(undefined);
  
  const [showBatchImport, setShowBatchImport] = useState(true);

const [discoveredModels, setDiscoveredModels] = useState<Array<{ id: string; object: string; created: number; owned_by: string }>>([]);
const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(new Set());
const [discoverQuery, setDiscoverQuery] = useState('');
const [discovering, setDiscovering] = useState(false);
const [importing, setImporting] = useState(false);
const [discoverError, setDiscoverError] = useState('');

const filteredModels = useMemo(() => {
  if (!discoverQuery.trim()) return discoveredModels;
  const q = discoverQuery.toLowerCase();
  return discoveredModels.filter(m => m.id.toLowerCase().includes(q) || (m.owned_by && m.owned_by.toLowerCase().includes(q)));
}, [discoveredModels, discoverQuery]);


  useEffect(() => {
    async function init() {
      try {
        // Fetch catalog and models in parallel; use cat directly to avoid state timing issues
        const [cat, allModels] = await Promise.all([
          getProviders().catch(() => ({} as ProviderCatalog)),
          getModels(),
        ]);
        setCatalog(cat);
        setModels(allModels);

        const catProviders = Object.keys(cat);
        /* v8 ignore next */ const catEndpoints: Record<string, string> = Object.fromEntries(catProviders.map(p => [p, cat[p]?.endpoint ?? '']));
        /* v8 ignore next */ const catModels: Record<string, ProviderModel[]> = Object.fromEntries(catProviders.map(p => [p, (cat[p]?.models ?? []) as ProviderModel[]]));

        if (isEditing && editingModelId) {
          const model = allModels.find(m => m.id === editingModelId);
          if (model) {
            editModel(model, catModels);
          } else {
            setErr('未找到模型');
          }
        } else if (isCloning && cloneSourceId) {
          const source = allModels.find(m => m.id === cloneSourceId);
          if (source) {
            editModel(source, catModels);
            // Clear the ID so the user must choose a new one
            setForm(f => ({ ...f, customId: '' }));
          } else {
            setErr('未找到源模型');
          }
        } else {
          // Initialize new — honour ?provider=&modelId= from discovery, fall back to openai default
          // ponytail: reuse handleProviderChange logic inline to avoid calling a function that also resets form state mid-init
          const provider: Provider = (prefillProvider && catProviders.includes(prefillProvider))
            ? prefillProvider
            : 'openai';

          if (catalogEntry) {
            const isPreset = Boolean(catModels[provider]?.find(m => m.id === catalogEntry.id));
            setIsCustomModel(!isPreset);
            /* v8 ignore next */
            setForm({ ...EMPTY_FORM, provider, endpoint: catEndpoints[provider] ?? '', id: catalogEntry.id });
            if (isPreset) {
              // Curated preset pricing/tiers/context wins over catalog — keeps both entry paths consistent
              applyPreset(provider, catalogEntry.id, catModels);
            } else {
              // Non-preset: seed from catalog; pricing is per-1k tokens → ×1000 for per-million form fields
              setIsEmbeddingModel(catalogEntry.embedding === true);
              setForm(f => ({
                ...f,
                inputPerMillion: catalogEntry.local ? '0' : String(catalogEntry.pricing.inputPer1kTokens * 1000),
                outputPerMillion: catalogEntry.local ? '0' : String(catalogEntry.pricing.outputPer1kTokens * 1000),
                contextWindow: catalogEntry.contextWindow > 0 ? String(catalogEntry.contextWindow) : '',
              }));
            }
          } else {
            const firstModel = catModels[provider]?.[0];
            const seedId = prefillModelId ?? firstModel?.id ?? '';
            // ponytail: if prefillModelId is not a known preset, show custom input so the id is visible/editable
            const isPreset = Boolean(seedId && catModels[provider]?.find(m => m.id === seedId));
            setIsCustomModel(provider === 'custom' || (Boolean(prefillModelId) && !isPreset));
            setForm({ ...EMPTY_FORM, provider, endpoint: catEndpoints[provider] ?? '', id: seedId });
            if (seedId) applyPreset(provider, seedId, catModels);
          }
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : '加载模型失败');
      } finally {
        setLoading(false);
      }
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isEditing, editingModelId]);

  // ── Catalog override helpers ───────────────────────────────────────────────
  function setOverride(field: string, on: boolean) {
    setFieldOverrides(prev => on
      ? { ...prev, [field]: true }
      : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== field)));
  }

  function FieldBadge({ field }: { field: string }) {
    const overridden = !!fieldOverrides[field];
    const defVal = catalogDefaults?.[field as keyof typeof catalogDefaults];
    const hasCatalog = defVal !== undefined && defVal !== null;
    // Only show a badge when the catalog has data for this field
    if (!hasCatalog && !overridden) return null;

    const fmtDefault = () => {
      if (typeof defVal === 'number') return String(defVal);
      /* v8 ignore next */ if (typeof defVal === 'boolean') return defVal ? 'yes' : 'no';
      /* v8 ignore else */ if (typeof defVal === 'object') return JSON.stringify(defVal);
      /* v8 ignore next */ return String(defVal);
    };

    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
        {overridden ? (
          <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: 9999, background: 'rgba(245,158,11,0.12)', color: '#f59e0b', fontWeight: 600 }}>
            Override
          </span>
        ) : (
          <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: 9999, background: 'rgba(34,197,94,0.12)', color: '#22c55e', fontWeight: 600 }}>
            Auto
          </span>
        )}
        {hasCatalog && (
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            Default: {fmtDefault()}
          </span>
        )}
        {overridden && hasCatalog && (
          <button
            type="button"
            onClick={() => {
              setOverride(field, false);
              // Reset the form field to the catalog default
              /* v8 ignore start */
              if (field === 'inputPerMillion' || field === 'outputPerMillion' || field === 'cachePerMillion' || field === 'cacheWritePerMillion' || field === 'contextWindow') {
                setForm(f => ({ ...f, [field]: typeof defVal === 'number' ? String(defVal) : '' }));
              /* v8 ignore stop */
              } else if (field === 'pricingTiers' && Array.isArray(defVal)) {
                setTierRows((defVal as PricingTier[]).map(t => ({
                  metric: t.metric,
                  above: String(t.above),
                  input: String(t.inputPerMillion),
                  output: String(t.outputPerMillion),
                  cache: t.cachePerMillion != null ? String(t.cachePerMillion) : '',
                })));
              } else if (field === 'capabilities' && typeof defVal === 'object' && defVal !== null) {
                const caps = defVal as ModelCapabilities;
                /* v8 ignore next */
                setIsEmbeddingModel(caps.embedding === true);
              }
            }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.72rem', padding: 0, textDecoration: 'underline' }}
          >
            Reset
          </button>
        )}
      </span>
    );
  }

  function applyPreset(provider: Provider, modelId: string, pm: Record<string, ProviderModel[]> = PROVIDER_MODELS) {
    const preset = pm[provider]?.find(m => m.id === modelId);
    if (!preset) {
      setForm(f => ({ ...f, id: modelId, inputPerMillion: '', outputPerMillion: '', cachePerMillion: '', cacheWritePerMillion: '', contextWindow: '' }));
      setTierRows([]); setShowAdvanced(false);
      setIsEmbeddingModel(false);
      return;
    }
    setIsEmbeddingModel(preset.capabilities?.embedding === true);
    setForm(f => ({
      ...f,
      id: modelId,
      inputPerMillion: String(preset.input),
      outputPerMillion: String(preset.output),
      cachePerMillion: preset.cache != null ? String(preset.cache) : '',
      cacheWritePerMillion: preset.cacheWrite != null ? String(preset.cacheWrite) : '',
      contextWindow: preset.contextWindow != null ? String(preset.contextWindow) : '',
    }));
    if (preset.pricingTiers?.length) {
      setTierRows(preset.pricingTiers.map(t => ({
        metric: t.metric,
        above: String(t.above),
        input: String(t.input),
        output: String(t.output),
        cache: t.cache != null ? String(t.cache) : '',
      })));
      setShowAdvanced(true);
    } else {
      setTierRows([]); setShowAdvanced(false);
    }
  }

  function handleProviderChange(provider: Provider) {
    const firstModel = PROVIDER_MODELS[provider]?.[0];
    setIsCustomModel(provider === 'custom');
    /* v8 ignore next */
    setForm({ ...EMPTY_FORM, provider, endpoint: ENDPOINT_DEFAULTS[provider] ?? '', id: firstModel?.id ?? '' });
    setTierRows([]); setShowAdvanced(false);
    if (firstModel) applyPreset(provider, firstModel.id);
  }

  function handleModelChange(modelId: string) {
    if (modelId === '__custom__') {
      setIsCustomModel(true);
      setForm(f => ({ ...f, id: '', inputPerMillion: '', outputPerMillion: '', cachePerMillion: '', cacheWritePerMillion: '', contextWindow: '', customId: '' }));
      setTierRows([]); setShowAdvanced(false);
      return;
    }
    setIsCustomModel(false);
    setForm(f => ({ ...f, customId: '' }));
    applyPreset(form.provider, modelId);
  }

  function editModel(model: Model, pm: Record<string, ProviderModel[]> = PROVIDER_MODELS) {
    const provider = model.provider as Provider;
    /* v8 ignore next */
    const providerPresets = pm[provider] ?? [];

    const prefix = `${provider}/`;
    let formId = '';
    let customId = '';
    let customModel = true;
    let customProviderName = '';

    if (provider === 'custom') {
      // For custom provider, the ID is stored as "{upstreamProvider}/{modelName}"
      // or just "{modelName}" if no prefix was set.
      if (model.id.includes('/')) {
        const slashIdx = model.id.indexOf('/');
        customProviderName = model.id.slice(0, slashIdx);
        // Prefer the explicit upstreamModelId field; fall back to the part after the slash.
        formId = model.upstreamModelId ?? model.id.slice(slashIdx + 1);
      } else {
        formId = model.upstreamModelId ?? model.id;
      }
      customModel = true;
    } else if (model.id.startsWith(prefix)) {
      formId = model.id.slice(prefix.length);
      if (providerPresets.some(m => m.id === formId)) {
        customModel = false;
      }
    } else {
      customId = model.id;
    }

    // If prices are 0 (model was created without specifying them), fall back to preset values
    const preset = providerPresets.find(m => m.id === formId);
    /* v8 ignore next */
    const presetInput = preset?.input ?? 0;
    /* v8 ignore next */
    const presetOutput = preset?.output ?? 0;
    const inputPrice  = model.cost.inputPerMillion  > 0 ? model.cost.inputPerMillion  : presetInput;
    const outputPrice = model.cost.outputPerMillion > 0 ? model.cost.outputPerMillion : presetOutput;
    const cachePrice  = model.cost.cachePerMillion  != null ? model.cost.cachePerMillion : (preset?.cache ?? null);
    const cacheWritePrice = model.cost.cacheWritePerMillion != null ? model.cost.cacheWritePerMillion : (preset?.cacheWrite ?? null);
    const ctxWindow   = model.contextWindow != null ? model.contextWindow : (preset?.contextWindow ?? null);

    setIsCustomModel(customModel);
    setIsEmbeddingModel(model.capabilities?.embedding === true);
    setFieldOverrides(model.fieldOverrides ? { ...model.fieldOverrides } as Record<string, boolean> : {});
    setCatalogDefaults(model.catalogDefaults);
    setErr(''); setShowToken(false);

    const m = model as Model & {
      azureResourceName?: string; azureDeploymentId?: string; azureApiVersion?: string;
      awsRegion?: string; awsAccessKeyId?: string; awsSessionToken?: string;
      vertexProjectId?: string; vertexLocation?: string; vertexServiceAccountKey?: string;
    };

    setForm(f => ({
      ...f,
      id: formId,
      customId: customId,
      customProviderName,
      provider,
      endpoint: model.endpoint,
      apiKey: '',
      cfClearance: '',
      inputPerMillion: String(inputPrice),
      outputPerMillion: String(outputPrice),
      cachePerMillion: cachePrice != null ? String(cachePrice) : '',
      cacheWritePerMillion: cacheWritePrice != null ? String(cacheWritePrice) : '',
      contextWindow: ctxWindow != null ? String(ctxWindow) : '',
      azureResourceName: m.azureResourceName ?? '',
      azureDeploymentId: m.azureDeploymentId ?? '',
      azureApiVersion: m.azureApiVersion ?? '',
      awsRegion: m.awsRegion ?? '',
      awsAccessKeyId: m.awsAccessKeyId ?? '',
      awsSecretAccessKey: '',
      awsSessionToken: m.awsSessionToken ?? '',
      vertexProjectId: m.vertexProjectId ?? '',
      vertexLocation: m.vertexLocation ?? '',
      vertexServiceAccountKey: '',
    }));

    // Resolve limits: prefer new `limits`, fall back to legacy `globalThresholds`
    const resolved限制: LimitRow[] = model.limits?.length
      ? model.limits.map(limitToRow)
      : [
          ...(model.globalThresholds?.daily   != null ? [limitToRow({ metric: 'cost', windowType: 'period', period: 'daily',   value: model.globalThresholds.daily   })] : []),
          ...(model.globalThresholds?.weekly  != null ? [limitToRow({ metric: 'cost', windowType: 'period', period: 'weekly',  value: model.globalThresholds.weekly  })] : []),
          ...(model.globalThresholds?.monthly != null ? [limitToRow({ metric: 'cost', windowType: 'period', period: 'monthly', value: model.globalThresholds.monthly })] : []),
        ];

    setLimitRows(resolved限制);
    setShow限制(resolved限制.length > 0);

    if (model.cost.pricingTiers?.length) {
      setTierRows(model.cost.pricingTiers.map(t => ({
        metric: t.metric,
        above: String(t.above),
        input: String(t.inputPerMillion),
        output: String(t.outputPerMillion),
        cache: t.cachePerMillion != null ? String(t.cachePerMillion) : '',
      })));
      setShowAdvanced(true);
    } else {
      setTierRows([]); setShowAdvanced(false);
    }
  }

  function addTier() {
    setTierRows(rows => [...rows, { ...EMPTY_TIER }]);
    setShowAdvanced(true);
    setOverride('pricingTiers', true);
  }

  function removeTier(idx: number) {
    setTierRows(rows => rows.filter((_, i) => i !== idx));
    setOverride('pricingTiers', true);
  }

  function updateTier(idx: number, field: keyof TierRow, value: string) {
    setTierRows(rows => rows.map((r, i) => i === idx ? { ...r, [field]: value } : r));
    setOverride('pricingTiers', true);
  }

  /* v8 ignore next 7 */
  function effectiveId(): string {
    if (form.customId.trim()) return form.customId.trim();
    const prefix = form.provider === 'custom' && form.customProviderName.trim()
      ? form.customProviderName.trim()
      : form.provider;
    return generateId(prefix, form.id, models.filter(m => m.id !== editingModelId).map(m => m.id));
  }

  async function handleTestOAuth() {
    setOauthTest({ status: 'testing' });
    try {
      const res = await testOpenAIOAuth(form.apiKey || undefined);
      if (res.ok) {
        const expStr = res.expiresAt ? new Date(res.expiresAt).toLocaleString() : 'unknown';
        setOauthTest({ status: 'ok', msg: `至ccount: ${res.accountId} — expires ${expStr}` });
      } else {
        setOauthTest({ status: 'error', msg: res.error ?? '未知错误' });
      }
    } catch (e) {
      setOauthTest({ status: 'error', msg: e instanceof Error ? e.message : String(e) });
    }
  }


  // 拉取模型
  async function handleDiscover() {
    setDiscoverError('');
    setDiscoveredModels([]);
    setSelectedModelIds(new Set());
    setDiscovering(true);
    try {
      const endpoint = form.endpoint || form.provider + '.provider';
      const result = await discoverModels(endpoint, form.apiKey);
      if (result.success) {
        setDiscoveredModels(result.models);
      } else {
        setDiscoverError(result.error || '拉取失败');
      }
    } catch (e) {
      setDiscoverError(e instanceof Error ? e.message : '请求失败');
    } finally {
      setDiscovering(false);
    }
  }

  // 批量导入选中模型
  async function handleImportSelected() {
    if (selectedModelIds.size === 0) return;
    setImporting(true);
    setDiscoverError('');
    try {
      const result = await importModels({
        provider: form.customId.trim() || form.provider,
        endpoint: form.endpoint,
        apiKey: form.apiKey,
        modelIds: Array.from(selectedModelIds),
      });
      // 重新加载模型列表（通知用户结果）
      setDiscoveredModels([]);
      setSelectedModelIds(new Set());
      if (result.imported > 0) {
        // 刷新模型列表
        const updated = await getModels();
        setModels(updated);
      }
    } catch (e) {
      setDiscoverError(e instanceof Error ? e.message : '导入失败');
    } finally {
      setImporting(false);
    }
  }
  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setErr(''); setSaving(true);
    const idPrefix = form.customId.trim() || form.provider;


    const finalId = form.customId.trim() || generateId(idPrefix, form.id, models.filter(m => m.id !== editingModelId).map(m => m.id));
    if (!finalId) { setErr('模型 ID 必填'); setSaving(false); return; }
    if (isCloning && models.some(m => m.id === finalId)) { setErr(`模型 "${finalId}" 已存在 — 请设置不同的自定义 ID`); setSaving(false); return; }

    const pricingTiersPayload: PricingTier[] = tierRows
      .filter(t => t.above && t.input && t.output)
      .map(t => ({
        metric: t.metric,
        above: parseFloat(t.above),
        inputPerMillion: parseFloat(t.input),
        outputPerMillion: parseFloat(t.output),
        ...(t.cache ? { cachePerMillion: parseFloat(t.cache) } : {}),
      }));

    try {
      const payload = {
        id: finalId,
        provider: form.provider,
        endpoint: form.endpoint,
        ...(form.apiKey ? { apiKey: form.apiKey } : {}),
        /* v8 ignore next */ ...(form.cfClearance ? { cfClearance: form.cfClearance } : {}),
        ...(isCloning && cloneSourceId && !form.apiKey ? { cloneFrom: cloneSourceId } : {}),
        // For custom provider, save the exact upstream model ID separately from the Routerly ID.
        ...(form.provider === 'custom' && form.id.trim() ? { upstreamModelId: form.id.trim() } : {}),
        inputPerMillion: parseFloat(form.inputPerMillion) || 0,
        outputPerMillion: parseFloat(form.outputPerMillion) || 0,
        ...(form.cachePerMillion ? { cachePerMillion: parseFloat(form.cachePerMillion) } : {}),
        ...(form.cacheWritePerMillion ? { cacheWritePerMillion: parseFloat(form.cacheWritePerMillion) } : {}),
        ...(form.contextWindow ? { contextWindow: parseInt(form.contextWindow, 10) } : {}),
        ...(pricingTiersPayload.length ? { pricingTiers: pricingTiersPayload } : {}),
        ...(Object.keys(fieldOverrides).length ? { fieldOverrides } : {}),
        limits: limitRows
          .filter(l => l.value !== '' && !isNaN(parseFloat(l.value)))
          .map(rowToLimit),
        ...(isEmbeddingModel ? { capabilities: { embedding: true } } : {}),
        // Azure OpenAI
        ...(form.azureResourceName ? { azureResourceName: form.azureResourceName } : {}),
        ...(form.azureDeploymentId ? { azureDeploymentId: form.azureDeploymentId } : {}),
        ...(form.azureApiVersion   ? { azureApiVersion: form.azureApiVersion }     : {}),
        // AWS Bedrock
        ...(form.awsRegion         ? { awsRegion: form.awsRegion }                 : {}),
        ...(form.awsAccessKeyId    ? { awsAccessKeyId: form.awsAccessKeyId }       : {}),
        ...(form.awsSecretAccessKey ? { awsSecretAccessKey: form.awsSecretAccessKey } : {}),
        ...(form.awsSessionToken   ? { awsSessionToken: form.awsSessionToken }     : {}),
        // Google Vertex AI
        ...(form.vertexProjectId   ? { vertexProjectId: form.vertexProjectId }     : {}),
        ...(form.vertexLocation    ? { vertexLocation: form.vertexLocation }       : {}),
        ...(form.vertexServiceAccountKey ? { vertexServiceAccountKey: form.vertexServiceAccountKey } : {}),
      };

      if (editingModelId) {
        await updateModel(editingModelId, payload);
      } else {
        await createModel(payload);
      }
      navigate('/dashboard/models');
    } catch (e) {
      setErr(e instanceof Error ? e.message : '错误');
      setSaving(false);
    }
  }

  const goBack = () => navigate('/dashboard/models');

  const providerModels = PROVIDER_MODELS[form.provider] ?? [];
  const selectedPreset = providerModels.find(m => m.id === form.id);
  const autoIdPrefix = form.provider === 'custom' && form.customProviderName.trim()
    ? form.customProviderName.trim()
    : form.provider;
  const autoId = form.id ? generateId(autoIdPrefix, form.id, models.filter(m => m.id !== editingModelId).map(m => m.id)) : '';

  if (loading) {
    return (
      <div className="page-body">
        <div className="loading-center"><div className="spinner" /></div>
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <button className="btn-icon" onClick={goBack} style={{ marginBottom: 16, display: 'inline-flex', padding: 4, width: 'fit-content' }}>
          <ArrowLeft size={16} /><span style={{ marginLeft: 6, fontSize: '0.8rem', fontWeight: 500 }}>返回模型列表</span>
        </button>
        <h1>{editingModelId ? '编辑模型' : isCloning ? '克隆模型' : '添加模型'}</h1>
        <p>{editingModelId ? `Modifying configuration for ${editingModelId}` : isCloning ? `从 ${cloneSourceId} 克隆 — 设置新 ID 后保存` : '注册一个新的 LLM 提供商模型'}</p>
      </div>

      <div className="page-body">
        <form onSubmit={handleSave} autoComplete="关闭" style={{ maxWidth: 800 }}>
          {err && <div className="form-error">{err}</div>}

{/* ── Section: Model Information ────────────────────── */}

           <div className="form-section">
            <h3 className="section-title">模型标识</h3>
            <p className="section-desc">此模型的唯一标识符和提供商设置。</p>

            <div className="form-group">
              <label className="form-label">
                Routerly ID <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(可选 — 默认: <code style={{ fontSize: '0.78rem' }}>{autoId || `${autoIdPrefix}/model`}</code>)</span>
              </label>
              <input className="form-input" value={form.customId} name="modelId" autoComplete="关闭"
                onChange={e => setForm(f => ({ ...f, customId: e.target.value }))}
                placeholder={autoId || `${autoIdPrefix}/model`} />
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>在 Routerly API 调用中引用此模型时使用的标识符。也作为模型列表中"提供商"列显示的名称。</div>
            </div>

            <div className="form-group">
              <label className="form-label">提供商</label>
              <select className="form-input" value={form.provider}
                onChange={e => handleProviderChange(e.target.value as Provider)}>
                {PROVIDERS.map(p => <option key={p} value={p}>{PROVIDER_LABELS[p] ?? p}</option>)}
              </select>
            </div>

            {form.provider === 'custom' ? (
              <>
                <div className="form-group">
                  <label className="form-label">提供商 <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>（上游提供商名称）</span></label>
                  <input className="form-input"
                    value={form.customProviderName}
                    onChange={e => setForm(f => ({ ...f, customProviderName: e.target.value }))}
                    placeholder="例如 deepseek、mistral、groq"
                    required />
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>用作 Routerly ID 的前缀（例如 <code style={{ fontSize: '0.72rem' }}>deepseek/deepseek-r1</code>）。</div>
                </div>
                <div className="form-group">
                  <label className="form-label">模型 <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>（上游模型 ID）</span></label>
                  <input className="form-input"
                    value={form.id}
                    onChange={e => setForm(f => ({ ...f, id: e.target.value }))}
                    placeholder="例如 deepseek-r1、mistral-large-latest"
                    required />
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>发送给上游 API 端点的模型标识符。</div>
                </div>
              </>
            ) : (
              <div className="form-group">
                <label className="form-label">模型预设</label>
                {providerModels.length > 0 ? (
                  <select className="form-input" value={isCustomModel ? '__custom__' : form.id}
                    onChange={e => handleModelChange(e.target.value)}>
                    {providerModels.map(m => <option key={m.id} value={m.id}>{m.id}</option>)}
                    <option value="__custom__">— 自定义模型名称 —</option>
                  </select>
                ) : null}
                {(isCustomModel || providerModels.length === 0) && (
                  <input className="form-input" style={{ marginTop: providerModels.length > 0 ? 6 : 0 }}
                    value={form.id} onChange={e => setForm(f => ({ ...f, id: e.target.value }))}
                    placeholder="例如 my-fine-tuned-model" required autoFocus />
                )}
                {!isCustomModel && selectedPreset?.notes && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>{selectedPreset.notes}</div>
                )}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">端点 URL</label>
              <input className="form-input" value={form.endpoint}
                onChange={e => setForm(f => ({ ...f, endpoint: e.target.value }))} required />
            </div>

            <div className="form-group">
              <label className="form-label">
                {isWebProvider(form.provider)
                  ? WEB_PROVIDER_TOKEN_LABEL[form.provider as WebProvider]
                  : isSubscriptionProvider(form.provider)
                  ? SUBSCRIPTION_TOKEN_LABEL[form.provider as SubscriptionProvider]
                  : 'API 密钥/令牌'}
              </label>
              {form.provider === 'openai-oauth' ? (
                <>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input className="form-input" type="text"
                      name="apiKey" autoComplete="off"
                      value={form.apiKey} onChange={e => { setForm(f => ({ ...f, apiKey: e.target.value })); setOauthTest({ status: 'idle' }); }}
                      placeholder={(editingModelId || isCloning) ? '留空以保留现有路径' : '~/.codex/auth.json (default)'}
                      style={{ flex: 1 }} />
                    <button type="button"
                      onClick={handleTestOAuth}
                      disabled={oauthTest.status === 'testing'}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, padding: '0 14px', height: 38, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 500, whiteSpace: 'nowrap' }}>
                      {oauthTest.status === 'testing' ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <FlaskConical size={14} />}
                      测试
                    </button>
                  </div>
                  {oauthTest.status === 'ok' && (
                    <div style={{ marginTop: 6, fontSize: '0.78rem', color: '#4ade80' }}>
                      {oauthTest.msg}
                    </div>
                  )}
                  {oauthTest.status === 'error' && (
                    <div style={{ marginTop: 6, fontSize: '0.78rem', color: '#f87171' }}>
                      {oauthTest.msg}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ position: 'relative' }}>
                  <input className="form-input" type={showToken ? 'text' : 'password'}
                    name="apiKey" autoComplete="new-password"
                    value={form.apiKey} onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
                    placeholder={editingModelId ? '留空以保留现有密钥' : isCloning ? '留空以保留现有密钥' : isWebProvider(form.provider) ? WEB_PROVIDER_TOKEN_PLACEHOLDER[form.provider as WebProvider] : isSubscriptionProvider(form.provider) ? SUBSCRIPTION_TOKEN_PLACEHOLDER[form.provider as SubscriptionProvider] : form.provider === 'ollama' ? '本地模型不需要' : 'sk-…'}
                    style={{ paddingRight: 40 }} />
                  <button type="button" onClick={() => setShowToken(v => !v)}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex', alignItems: 'center' }}>
                    {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              )}
            </div>

            {/* --- 拉取模型 --- */}
            <div className="form-group">
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button type="button"
                  onClick={handleDiscover}
                  disabled={discovering}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: 'color-mix(in srgb, var(--color-primary, #6366f1) 15%, transparent)', border: '1px solid color-mix(in srgb, var(--color-primary, #6366f1) 40%, transparent)', borderRadius: 6, cursor: 'pointer', color: 'var(--text-primary)', fontSize: '0.82rem', fontWeight: 500 }}>
                  {discovering ? <span className="spinner" style={{ width: 13, height: 13 }} /> : "\uD83D\uDD0D"}
                  拉取模型
                </button>

                <input className="form-input" type="text"
                  value={discoverQuery}
                  onChange={e => setDiscoverQuery(e.target.value)}
                  placeholder='搜索模型…'
                  style={{ flex: 1, minWidth: 160, maxWidth: 260, height: 34, fontSize: '0.82rem' }} />

                {selectedModelIds.size > 0 && (
                  <button type="button"
                    onClick={handleImportSelected}
                    disabled={importing}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: 'color-mix(in srgb, var(--color-primary, #6366f1) 25%, transparent)', border: '1px solid color-mix(in srgb, var(--color-primary, #6366f1) 60%, transparent)', borderRadius: 6, cursor: 'pointer', color: 'var(--text-primary)', fontSize: '0.82rem', fontWeight: 500 }}>
                    {importing ? <span className="spinner" style={{ width: 13, height: 13 }} /> : "\u2713"}
                    添加选中 ({selectedModelIds.size})
                  </button>
                )}
              </div>

              {discoverError && (
                <div style={{ padding: '6px 10px', borderRadius: 6, marginTop: 8, background: 'color-mix(in srgb, #ef4444 10%, transparent)', border: '1px solid color-mix(in srgb, #ef4444 30%, transparent)', color: '#f87171', fontSize: '0.82rem' }}>
                  {discoverError}
                </div>
              )}

              {discoveredModels.length > 0 && (
                <>
                  <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 8, marginBottom: 6, fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                      <input type="checkbox"
                        checked={filteredModels.length > 0 && filteredModels.every(m => selectedModelIds.has(m.id))}
                        onChange={e => {
                          if (e.target.checked) { setSelectedModelIds(new Set(filteredModels.map(m => m.id))); }
                          else { setSelectedModelIds(new Set()); }
                        }}
                        style={{ accentColor: 'var(--color-primary, #6366f1)' }} />
                      全选 ({filteredModels.length})
                    </label>
                    <span style={{ fontSize: '0.76rem' }}>共 {discoveredModels.length} 个模型</span>
                  </div>

                  <div style={{ maxHeight: 240, overflowY: 'auto', borderRadius: 6, border: '1px solid var(--border)' }}>
                    {filteredModels.length === 0 ? (
                      <div style={{ padding: '14px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>没有匹配的模型</div>
                    ) : (
                      filteredModels.map(m => (
                        <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', cursor: 'pointer', borderBottom: '1px solid color-mix(in srgb, var(--border) 50%, transparent)', fontSize: '0.82rem' }}>
                          <input type="checkbox"
                            checked={selectedModelIds.has(m.id)}
                            onChange={e => {
                              const next = new Set(selectedModelIds);
                              if (e.target.checked) next.add(m.id); else next.delete(m.id);
                              setSelectedModelIds(next);
                            }}
                            style={{ accentColor: 'var(--color-primary, #6366f1)', flexShrink: 0 }} />
                          <span style={{ flex: 1 }}>{m.id}</span>
                          {m.owned_by && <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>{m.owned_by}</span>}
                        </label>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
          {/* ── Section: Connection ───────────────────────────── */}
          <div className="form-section">
            <h3 className="section-title">连接信息</h3>
            <p className="section-desc">API 端点及认证凭据，用于发送请求。</p>

            {isWebProvider(form.provider) && (
              <div style={{
                display: 'flex', gap: 10, padding: '12px 14px', marginBottom: 16,
                background: 'color-mix(in srgb, var(--color-warning, #f59e0b) 10%, transparent)',
                border: '1px solid color-mix(in srgb, var(--color-warning, #f59e0b) 40%, transparent)',
                borderRadius: 8,
              }}>
                <span style={{ fontSize: '1rem', flexShrink: 0 }}>⚠️</span>
                <div style={{ fontSize: '0.82rem', lineHeight: 1.6, color: 'var(--text-primary)' }}>
                  <p style={{ margin: '0 0 6px' }}>
                    <strong>非官方提供商 — 使用风险自负。</strong>{' '}
                    此集成依赖于未文档化的内部 API，可能随时更改或失效。
                    这可能违反提供商的服务条款并导致账号封禁。
                  </p>
                  <p style={{ margin: 0 }}>{WEB_PROVIDER_INSTRUCTIONS[form.provider as WebProvider]}</p>
                </div>
              </div>
            )}

            {isSubscriptionProvider(form.provider) && (
              <div style={{
                display: 'flex', gap: 10, padding: '12px 14px', marginBottom: 16,
                background: 'color-mix(in srgb, var(--color-warning, #f59e0b) 10%, transparent)',
                border: '1px solid color-mix(in srgb, var(--color-warning, #f59e0b) 40%, transparent)',
                borderRadius: 8,
              }}>
                <span style={{ fontSize: '1rem', flexShrink: 0 }}>ℹ️</span>
                <div style={{ fontSize: '0.82rem', lineHeight: 1.6, color: 'var(--text-primary)' }}>
                  <p style={{ margin: 0 }}>{SUBSCRIPTION_INSTRUCTIONS[form.provider as SubscriptionProvider]}</p>
                </div>
              </div>

            )}

            {form.provider === 'azure-openai' && (
              <>
                <div className="form-group">
                  <label className="form-label">Azure 资源名称</label>
                  <input className="form-input" value={form.azureResourceName}
                    onChange={e => setForm(f => ({ ...f, azureResourceName: e.target.value }))}
                    placeholder="myresource" required />
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>Azure OpenAI 资源名称（来自 Azure 门户）。</div>
                </div>
                <div className="form-group">
                  <label className="form-label">部署 ID</label>
                  <input className="form-input" value={form.azureDeploymentId}
                    onChange={e => setForm(f => ({ ...f, azureDeploymentId: e.target.value }))}
                    placeholder="gpt-4o-deployment" required />
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>你在 Azure OpenAI Studio 中创建的部署名称。</div>
                </div>
                <div className="form-group">
                  <label className="form-label">API Version <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(default: 2024-02-01)</span></label>
                  <input className="form-input" value={form.azureApiVersion}
                    onChange={e => setForm(f => ({ ...f, azureApiVersion: e.target.value }))}
                    placeholder="2024-02-01" />
                </div>
              </>
            )}

            {/* AWS Bedrock specific fields */}
            {form.provider === 'bedrock' && (
              <>
                <div className="form-group">
                  <label className="form-label">AWS 区域</label>
                  <input className="form-input" value={form.awsRegion}
                    onChange={e => setForm(f => ({ ...f, awsRegion: e.target.value }))}
                    placeholder="us-east-1" required />
                </div>
                <div className="form-group">
                  <label className="form-label">AWS Access Key ID</label>
                  <input className="form-input" value={form.awsAccessKeyId}
                    onChange={e => setForm(f => ({ ...f, awsAccessKeyId: e.target.value }))}
                    placeholder="AKIAIOSFODNN7EXAMPLE" required />
                </div>
                <div className="form-group">
                  <label className="form-label">AWS Secret Access Key</label>
                  <input className="form-input" type="password" autoComplete="new-password"
                    value={form.awsSecretAccessKey}
                    onChange={e => setForm(f => ({ ...f, awsSecretAccessKey: e.target.value }))}
                    placeholder={editingModelId ? '留空以保留现有密钥' : 'wJalrXUtnFEMI/K7MDENG/…'} />
                </div>
                <div className="form-group">
                  <label className="form-label">会话令牌 <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional, for temporary credentials)</span></label>
                  <input className="form-input" type="password" autoComplete="new-password"
                    value={form.awsSessionToken}
                    onChange={e => setForm(f => ({ ...f, awsSessionToken: e.target.value }))}
                    placeholder="AQoDYXdz…" />
                </div>
              </>
            )}

            {/* Google Vertex AI specific fields */}
            {form.provider === 'vertex' && (
              <>
                <div className="form-group">
                  <label className="form-label">GCP 项目 ID</label>
                  <input className="form-input" value={form.vertexProjectId}
                    onChange={e => setForm(f => ({ ...f, vertexProjectId: e.target.value }))}
                    placeholder="my-gcp-project" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Location <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(default: us-central1)</span></label>
                  <input className="form-input" value={form.vertexLocation}
                    onChange={e => setForm(f => ({ ...f, vertexLocation: e.target.value }))}
                    placeholder="us-central1" />
                </div>
                <div className="form-group">
                  <label className="form-label">服务账号密钥 <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>（JSON）</span></label>
                  <textarea className="form-input" rows={6}
                    value={form.vertexServiceAccountKey}
                    onChange={e => setForm(f => ({ ...f, vertexServiceAccountKey: e.target.value }))}
                    placeholder={editingModelId ? '留空以保留现有密钥' : '粘贴你的服务账号 JSON 密钥文件内容'}
                    style={{ fontFamily: 'monospace', fontSize: '0.78rem', resize: 'vertical' }} />
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    具有 Vertex AI User 角色的服务账号密钥的完整 JSON 内容。
                    如果留空，则回退到使用 API Key 字段作为 Bearer 令牌。
                  </div>
                </div>
              </>
            )}

          </div>

          {/* ── Section: 能力 ─────────────────────────── */}
          <div className="form-section">
            <h3 className="section-title">能力</h3>
            <p className="section-desc">指定此模型的类型和能力。</p>
            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="checkbox"
                id="cap-embedding"
                checked={isEmbeddingModel}
                onChange={e => { setIsEmbeddingModel(e.target.checked); setOverride('capabilities', true); }}
                style={{ width: 16, height: 16, cursor: 'pointer' }}
              />
              <label htmlFor="cap-embedding" style={{ cursor: 'pointer', marginBottom: 0 }}>
                嵌入模型
                <span style={{ marginLeft: 8, fontSize: '0.75rem', color: 'var(--text-muted)' }}>此模型生成向量嵌入（非对话补全）</span>
                <FieldBadge field="capabilities" />
              </label>
            </div>
          </div>

          {/* ── Section: Pricing ─────────────────────────────── */}
          <div className="form-section">
            <h3 className="section-title">定价与上下文</h3>
            <p className="section-desc">用于计费和路由的成本参数与处理限制。</p>

            <div className="grid-3">
              <div className="form-group">
                <label className="form-label">输入 $/百万<FieldBadge field="inputPerMillion" /></label>
                <input className="form-input" type="number" step="any" value={form.inputPerMillion}
                  onChange={e => { setForm(f => ({ ...f, inputPerMillion: e.target.value })); setOverride('inputPerMillion', true); }} placeholder="5.00" required />
              </div>
              <div className="form-group">
                <label className="form-label">输出 $/百万<FieldBadge field="outputPerMillion" /></label>
                <input className="form-input" type="number" step="any" value={form.outputPerMillion}
                  onChange={e => { setForm(f => ({ ...f, outputPerMillion: e.target.value })); setOverride('outputPerMillion', true); }} placeholder="15.00" required />
              </div>
              <div className="form-group">
                <label className="form-label">Cache read $/1M <span style={{ color: 'var(--text-muted)' }}>（可选）</span><FieldBadge field="cachePerMillion" /></label>
                <input className="form-input" type="number" step="any" value={form.cachePerMillion}
                  onChange={e => { setForm(f => ({ ...f, cachePerMillion: e.target.value })); setOverride('cachePerMillion', true); }} placeholder="—" />
              </div>
            </div>

            <div className="grid-3">
              <div className="form-group">
                <label className="form-label">Cache write $/1M <span style={{ color: 'var(--text-muted)' }}>（可选）</span><FieldBadge field="cacheWritePerMillion" /></label>
                <input className="form-input" type="number" step="any" value={form.cacheWritePerMillion}
                  onChange={e => { setForm(f => ({ ...f, cacheWritePerMillion: e.target.value })); setOverride('cacheWritePerMillion', true); }} placeholder="—" />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Context Window <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>（令牌，可选）</span><FieldBadge field="contextWindow" /></label>
              <input className="form-input" type="number" step="1000" value={form.contextWindow}
                onChange={e => { setForm(f => ({ ...f, contextWindow: e.target.value })); setOverride('contextWindow', true); }} placeholder="128000" />
            </div>
          </div>

          {/* ── Advanced: Pricing Tiers ─────────────────────────── */}
          <div style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <button type="button" onClick={() => setShowAdvanced(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 500, padding: '4px 0', userSelect: 'none' }}>
              <ChevronDown size={18} style={{ transform: showAdvanced ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }} />
              高级 — 定价层级
              {tierRows.length > 0 && (
                <span style={{ marginLeft: 6, background: 'var(--accent)', color: '#fff', fontSize: '0.75rem', borderRadius: 12, padding: '2px 8px' }}>{tierRows.length}</span>
              )}
              <FieldBadge field="pricingTiers" />
            </button>
            <p className="section-desc" style={{ marginTop: 8 }}>
              当某个指标超过阈值时覆盖定价。例如："超过 200,000 上下文令牌时，价格变更。"
            </p>

            {showAdvanced && (
              <div style={{ marginTop: 16 }}>

                {tierRows.map((tier, idx) => (
                  <div key={idx} style={{ background: 'var(--surface-2, rgba(255,255,255,0.04))', border: '1px solid var(--border)', borderRadius: 8, padding: '16px', marginBottom: 12, position: 'relative' }}>
                    <button type="button" onClick={() => removeTier(idx)} title="删除层级"
                      style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, display: 'flex', alignItems: 'center', borderRadius: 6 }}>
                      <X size={16} />
                    </button>

                    {/* Condition: 超过 X [metric] */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16, paddingRight: 24 }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>超过</label>
                        <input className="form-input" type="number" step="1" value={tier.above}
                          onChange={e => updateTier(idx, 'above', e.target.value)}
                          placeholder="200000" />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>指标</label>
                        <select className="form-input" value={tier.metric}
                          onChange={e => updateTier(idx, 'metric', e.target.value)}>
                          {METRIC_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                    </div>

                    {/* Tier pricing */}
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>层级定价</div>
                    <div className="form-group">
                      <label className="form-label" style={{ fontSize: '0.75rem' }}>输入 $/百万</label>
                      <input className="form-input" type="number" step="any" value={tier.input}
                        onChange={e => updateTier(idx, 'input', e.target.value)} placeholder="10.00" />
                    </div>
                    <div className="form-group">
                      <label className="form-label" style={{ fontSize: '0.75rem' }}>输出 $/百万</label>
                      <input className="form-input" type="number" step="any" value={tier.output}
                        onChange={e => updateTier(idx, 'output', e.target.value)} placeholder="37.50" />
                    </div>
                    <div className="form-group">
                      <label className="form-label" style={{ fontSize: '0.75rem' }}>Cache $/1M <span style={{ color: 'var(--text-muted)' }}>（可选）</span></label>
                      <input className="form-input" type="number" step="any" value={tier.cache}
                        onChange={e => updateTier(idx, 'cache', e.target.value)} placeholder="—" />
                    </div>
                  </div>
                ))}

                <button type="button" onClick={addTier}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1.5px dashed var(--border)', borderRadius: 8, cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.85rem', padding: '10px 16px', width: '100%', justifyContent: 'center', transition: 'all 0.15s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(74, 144, 226, 0.05)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}>
                  <Plus size={16} /> 添加定价层级
                </button>
              </div>
            )}
          </div>

          {/* ── Section: 限制 ───────────────────────────────── */}
          <div style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <button type="button" onClick={() => setShow限制(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 500, padding: '4px 0', userSelect: 'none' }}>
              <ChevronDown size={18} style={{ transform: show限制 ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }} />
              限制
              {limitRows.filter(l => l.value !== '').length > 0 && (
                <span style={{ marginLeft: 6, background: 'var(--accent)', color: '#fff', fontSize: '0.75rem', borderRadius: 12, padding: '2px 8px' }}>
                  {limitRows.filter(l => l.value !== '').length}
                </span>
              )}
            </button>
            <p className="section-desc" style={{ marginTop: 8 }}>此模型的使用限制。可以组合多个规则。</p>

            {show限制 && (
              <div style={{ marginTop: 16 }}>
                {limitRows.map((lim, idx) => {
                  const upd = (patch: Partial<LimitRow>) =>
                    setLimitRows(rows => rows.map((r, i) => i === idx ? { ...r, ...patch } : r));
                  return (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '130px 110px 1fr 100px auto', gap: 10, alignItems: 'flex-end', marginBottom: 12, background: 'var(--surface-2, rgba(255,255,255,0.04))', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
                      {/* 指标 */}
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>指标</label>
                        <select className="form-input" value={lim.metric}
                          onChange={e => upd({ metric: e.target.value as LimitMetric })}>
                          {LIMIT_METRIC_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      {/* Window type */}
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>类型</label>
                        <select className="form-input" value={lim.windowType}
                          onChange={e => upd({ windowType: e.target.value as 'period' | 'rolling' })}>
                          <option value="period">时间段</option>
                          <option value="rolling">Rolling</option>
                        </select>
                      </div>
                      {/* Period selector OR rolling amount+unit */}
                      {lim.windowType === 'period' ? (
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontSize: '0.75rem' }}>时间段</label>
                          <select className="form-input" value={lim.period}
                            onChange={e => upd({ period: e.target.value as LimitPeriod })}>
                            {PERIOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </div>
                      ) : (
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontSize: '0.75rem' }}>每</label>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <input className="form-input" type="number" min="1" step="1" value={lim.rollingAmount}
                              onChange={e => upd({ rollingAmount: e.target.value })}
                              style={{ width: 64 }} placeholder="24" />
                            <select className="form-input" value={lim.rollingUnit}
                              onChange={e => upd({ rollingUnit: e.target.value as RollingUnit })}>
                              {ROLLING_UNIT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                          </div>
                        </div>
                      )}
                      {/* Max value */}
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>
                        {lim.metric === 'cost' ? '上限（美元）' : lim.metric === 'calls' ? '上限（次）' : '上限（令牌）'}
                        </label>
                        <input className="form-input" type="number" step="any" min="0" value={lim.value}
                          onChange={e => upd({ value: e.target.value })}
                          placeholder={lim.metric === 'cost' ? '10.00' : lim.metric === 'calls' ? '100' : '100000'} />
                      </div>
                      <button type="button" onClick={() => setLimitRows(rows => rows.filter((_, i) => i !== idx))}
                        style={{ padding: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', alignSelf: 'flex-end', display: 'flex', alignItems: 'center', borderRadius: 6 }}>
                        <X size={16} />
                      </button>
                    </div>
                  );
                })}

                <button type="button"
                  onClick={() => { setLimitRows(rows => [...rows, { ...EMPTY_LIMIT_ROW }]); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1.5px dashed var(--border)', borderRadius: 8, cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.85rem', padding: '10px 16px', width: '100%', justifyContent: 'center', transition: 'all 0.15s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(74, 144, 226, 0.05)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}>
                  <Plus size={16} /> 添加限制
                </button>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-start', marginTop: 32, paddingTop: 16, borderTop: '1px solid var(--border)', alignItems: 'center' }}>
            <button type="button" className="btn btn-secondary" onClick={goBack} disabled={saving}>取消</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <span className="spinner" /> : (editingModelId ? '保存更改' : isCloning ? '创建克隆' : '创建模型')}
            </button>
            {editingModelId && (
              <button type="button" className="btn btn-secondary" disabled={testState === 'loading'}
                onClick={async () => { setTestState('loading'); setTestState(await testModel(editingModelId)); }}>
                {testState === 'loading' ? <span className="spinner" /> : <FlaskConical size={14} />}
                {testState === 'loading' ? ' 测试中…' : ' 测试'}
              </button>
            )}
            {testState && testState !== 'loading' && (
              <span style={{ fontSize: '0.82rem', color: testState.ok ? 'var(--success)' : 'var(--danger)' }}>
                {testState.ok ? `✓ ${testState.latencyMs}ms` : `✗ ${testState.error?.slice(0, 60)}`}
              </span>
            )}
          </div>
        </form>
      </div>
    </>
  );
}
