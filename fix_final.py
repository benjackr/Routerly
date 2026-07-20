#!/usr/bin/env python3
"""
OVERHAUL: Completely restructure ModelFormPage.tsx + fix ModelsPage.tsx

ModelFormPage changes:
- Add batch import section at top (Routerly ID, Provider, Endpoint, API Key, Fetch, Select, Save)
- Translate ALL remaining English
- Keep pricing/limits/create button unchanged
- Only show batch section for new models (no id param)

ModelsPage changes:
- "Fetch" → "添加提供商"
- "Add Model" → "添加模型"  
- "Unavailable" → "不可用"
- Fix batch delete (serial + error handling)
"""
import re, os, sys

FILE_MODELFORM = "/workspaces/Routerly/packages/dashboard/src/pages/ModelFormPage.tsx"
FILE_MODELS = "/workspaces/Routerly/packages/dashboard/src/pages/ModelsPage.tsx"

# ── Read both files ──────────────────────────────────────────────────────
with open(FILE_MODELFORM) as f: mf = f.read()
with open(FILE_MODELS) as f: ms = f.read()

changes = []

# ════════════════════════════════════════════════════════════════════════════
# MODELS PAGE FIXES
# ════════════════════════════════════════════════════════════════════════════

# 1. Translate "Fetch" button
old = 'Fetch\n                </button>\n                <Link to="/dashboard/models/new" className="btn btn-primary">\n                  <Plus size={16} /> Add Model'
new = '添加提供商\n                </button>\n                <Link to="/dashboard/models/new" className="btn btn-primary">\n                  <Plus size={16} /> 添加模型'
if old in ms:
    ms = ms.replace(old, new)
    changes.append("Models: Translate Fetch + Add Model")

# 2. Translate "Unavailable"  
ms = ms.replace("label: 'Unavailable', color: 'var(--danger)'", "label: '不可用', color: 'var(--danger)'")
changes.append("Models: Translate Unavailable")

# 3. Fix batch delete - change parallel deletion to serial with error handling
old_batch_delete = """                      message: `确定移除选中的 ${selectedForDelete.size} 个模型？`,
                      onConfirm: async () => {
                        const ids = Array.from(selectedForDelete);
                        setConfirmState(null);
                        await Promise.all(ids.map(id => deleteModel(id)));
                        setSelectedForDelete(new Set());
                        setModels(await getModels());"""

new_batch_delete = """                      message: `确定移除选中的 ${selectedForDelete.size} 个模型？`,
                      onConfirm: async () => {
                        const ids = Array.from(selectedForDelete);
                        setConfirmState(null);
                        for (const id of ids) {
                          try { await deleteModel(id); } catch (e) { console.error('删除失败:', id, e); }
                        }
                        setSelectedForDelete(new Set());
                        try { setModels(await getModels()); } catch (e) {}"""

if old_batch_delete in ms:
    ms = ms.replace(old_batch_delete, new_batch_delete)
    changes.append("Models: Fix batch delete (serial + error handling)")
else:
    changes.append("WARN: batch delete pattern not found")

# ════════════════════════════════════════════════════════════════════════════
# MODELFORM PAGE - ADD BATCH SECTION
# ════════════════════════════════════════════════════════════════════════════

# 1. Add batch state variables
batch_states = '''  // Batch import (new model only)
  const isNewModel = !isEditing && !isCloning;
  const [showBatchImport, setShowBatchImport] = useState(true);
  const [batchFetchLoading, setBatchFetchLoading] = useState(false);
  const [batchFetchError, setBatchFetchError] = useState('');
  const [batchDiscoveredModels, setBatchDiscoveredModels] = useState<Array<{ id: string; owned_by?: string; created?: number }>>([]);
  const [batchSelectedModels, setBatchSelectedModels] = useState<Set<string>>(new Set());
  const [batchImportLoading, setBatchImportLoading] = useState(false);
  const [batchImportResult, setBatchImportResult] = useState<{ imported: number; total: number } | null>(null);
  const [batchFetchSearch, setBatchFetchSearch] = useState('');'''

# Insert after the last existing state declaration in the component
# Find the last `useState` or state-like line before the useEffect
anchor = "const [batchFetchSearch, setBatchFetchSearch] = useState('');"
if anchor in mf:
    mf = mf.replace(anchor, anchor + '\n' + batch_states)
    changes.append("ModelForm: Batch states already present")
else:
    # Find where to insert - after limitRows or after existing batch states
    for marker in ["const [limitRows, setLimitRows] = useState<LimitRow[]>([]);",
                   "const [saving, setSaving] = useState(false);"]:
        if marker in mf:
            idx = mf.index(marker) + len(marker)
            rest = mf[idx:]
            # insert before the next useEffect
            use_effect_pos = rest.find("useEffect(() =>")
            if use_effect_pos > 0:
                mf = mf[:idx] + "\n" + batch_states + rest[:use_effect_pos] + rest[use_effect_pos:]
                changes.append("ModelForm: Added batch states")
                break

# 2. Add isNewModel right after useParams
if "const isEditing = Boolean(id);" in mf:
    mf = mf.replace("const isEditing = Boolean(id);", "const isEditing = Boolean(id);\n  const isNewModel = !isEditing && !isCloning;")
    changes.append("ModelForm: Added isNewModel")

# 3. Batch import section - insert BEFORE the Provider section
# Find the Provider section marker
provider_section_marker = '          {/* \u2500\u2500 Section: Provider'
if provider_section_marker not in mf:
    provider_section_marker = '/* ── Section: Provider ──'
    # try ASCII fallback
    for line in mf.split('\n'):
        if 'Section: Provider' in line:
            provider_section_marker = line.strip()
            break

batch_section = '''          {/* ══════════ 批量添加模型 ══════════ */}
          {isNewModel && showBatchImport && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, marginBottom: 32 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.1rem' }}>批量添加模型</h2>
                  <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    填写提供商信息和 API 端点，自动发现该提供商下的所有模型，勾选后批量添加。
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                <div className="form-group">
                  <label className="form-label">Routerly ID</label>
                  <input className="form-input" value={form.customProviderName || form.provider}
                    onChange={e => setForm(f => ({ ...f, customProviderName: e.target.value, provider: e.target.value }))}
                    placeholder="例如：openrouter-custom" />
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>Routerly 内该提供商的唯一标识</div>
                </div>
                <div className="form-group">
                  <label className="form-label">提供商</label>
                  <input className="form-input" value={form.customProviderName || form.provider}
                    onChange={e => setForm(f => ({ ...f, customProviderName: e.target.value, provider: e.target.value }))}
                    placeholder="例如：OpenRouter" />
                </div>
                <div className="form-group">
                  <label className="form-label">Endpoint URL 端点</label>
                  <input className="form-input" value={form.endpoint}
                    onChange={e => setForm(f => ({ ...f, endpoint: e.target.value }))}
                    placeholder="https://api.openai.com/v1" />
                </div>
                <div className="form-group">
                  <label className="form-label">API 密钥/令牌</label>
                  <input className="form-input" type="password" value={form.apiKey}
                    onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
                    placeholder="sk-..." />
                </div>
                <button type="button" className="btn btn-primary" style={{ alignSelf: 'flex-start' }}
                  onClick={async () => {
                    setBatchFetchLoading(true);
                    setBatchFetchError('');
                    setBatchImportResult(null);
                    setBatchDiscoveredModels([]);
                    setBatchSelectedModels(new Set());
                    try {
                      const result = await discoverModels(form.endpoint, form.apiKey);
                      if (!result.success) {
                        setBatchFetchError(result.error || '发现模型失败');
                        return;
                      }
                      setBatchDiscoveredModels(result.models || []);
                    } catch (err) {
                      setBatchFetchError((err as Error).message);
                    } finally {
                      setBatchFetchLoading(false);
                    }
                  }}
                  disabled={batchFetchLoading || !form.endpoint}>
                  {batchFetchLoading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : null}
                  {' '}{batchFetchLoading ? '发现中...' : '从端点拉取'}
                </button>
              </div>

              {batchImportResult && (
                <div style={{ padding: '8px 12px', background: 'rgba(34,197,94,0.1)', borderRadius: 6,
                  color: 'var(--success)', fontSize: '0.82rem', marginBottom: 12 }}>
                  ✅ 成功导入 {batchImportResult.imported} / {batchImportResult.total} 个模型
                </div>
              )}

              {batchFetchError && (
                <div style={{ padding: '8px 12px', background: 'rgba(220,38,38,0.1)', borderRadius: 6,
                  color: 'var(--danger)', fontSize: '0.82rem', marginBottom: 12 }}>
                  {batchFetchError}
                </div>
              )}

              {batchDiscoveredModels.length > 0 && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                      发现 {batchDiscoveredModels.length} 个模型
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ position: 'relative' }}>
                        <input
                          value={batchFetchSearch}
                          onChange={e => setBatchFetchSearch(e.target.value)}
                          placeholder="搜索模型…"
                          style={{ paddingLeft: 8, height: 28, fontSize: '0.82rem', borderRadius: 4,
                            border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', width: 160 }}
                        />
                      </div>
                      <label style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        <input type="checkbox"
                          checked={batchSelectedModels.size === batchDiscoveredModels.length && batchDiscoveredModels.length > 0}
                          onChange={() => {
                            if (batchSelectedModels.size === batchDiscoveredModels.length) setBatchSelectedModels(new Set());
                            else setBatchSelectedModels(new Set(batchDiscoveredModels.map((m: { id: string }) => m.id)));
                          }} />
                        全选
                      </label>
                    </div>
                  </div>
                  <div style={{ maxHeight: 300, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 6, marginBottom: 12 }}>
                    {(() => {
                      const q = batchFetchSearch.trim().toLowerCase();
                      return q
                        ? batchDiscoveredModels.filter((m: { id: string; owned_by?: string }) => m.id.toLowerCase().includes(q) || (m.owned_by || '').toLowerCase().includes(q))
                        : batchDiscoveredModels;
                    })().map((m: { id: string; owned_by?: string }) => (
                      <label key={m.id} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px',
                        cursor: 'pointer', fontSize: '0.85rem',
                        borderBottom: '1px solid var(--border)',
                      }}>
                        <input type="checkbox" checked={batchSelectedModels.has(m.id)}
                          onChange={() => {
                            setBatchSelectedModels(prev => {
                              const next = new Set(prev);
                              if (next.has(m.id)) next.delete(m.id); else next.add(m.id);
                              return next;
                            });
                          }} />
                        <span className="mono">{m.id}</span>
                        {m.owned_by && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({m.owned_by})</span>}
                      </label>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center', marginTop: 4 }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      提供商: <strong>{form.customProviderName || form.provider}</strong>，将添加 {batchSelectedModels.size} 个模型
                    </span>
                    <button type="button" className="btn btn-primary"
                      onClick={async () => {
                        if (batchSelectedModels.size === 0) {
                          setBatchFetchError('请先勾选要添加的模型');
                          return;
                        }
                        setBatchImportLoading(true);
                        setBatchFetchError('');
                        try {
                          const provider = form.customProviderName || form.provider;
                          const result = await importModels({
                            provider,
                            endpoint: form.endpoint,
                            apiKey: form.apiKey,
                            modelIds: Array.from(batchSelectedModels),
                          });
                          setBatchImportResult(result);
                          setBatchDiscoveredModels([]);
                          setBatchSelectedModels(new Set());
                          try { setModels(await getModels()); } catch (e) {}
                        } catch (err) {
                          setBatchFetchError((err as Error).message);
                        } finally {
                          setBatchImportLoading(false);
                        }
                      }}
                      disabled={batchImportLoading}>
                      {batchImportLoading ? '导入中...' : `保�}{batchSelectedModels.size === 0 ? '' : ` (${batchSelectedModels.size})`}保存选中`}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
'''

# Find where to insert - before the Provider section
lines = mf.split('\n')
insert_idx = None
for i, line in enumerate(lines):
    if 'Section: Provider' in line or 'Provider section' in line.lower():
        insert_idx = i
        break

if insert_idx is None:
    # Fallback: find after page header
    for i, line in enumerate(lines):
        if 'Page header' in line and i < len(lines) - 5 and '模型' in lines[min(i+5, len(lines)-1)]:
            insert_idx = i + 1
            # keep going until we hit the form-section for provider
            for j in range(i, min(i+80, len(lines))):
                if 'form-section' in lines[j] and 'provider' in lines[j+1:j+4].__str__().lower() if j+4 < len(lines) else False:
                    pass
            break

if insert_idx is None:
    # Last resort: find the first "form-section" after page header  
    # Look for the actual UI rendering section
    for i, line in enumerate(lines):
        if '/** ── Section: Provider ──' in line or '{/* ── Section: Provider ──' in line:
            insert_idx = i
            break

if insert_idx is None:
    # Even simpler: find the provider select dropdown
    for i, line in enumerate(lines):
        if 'provider' in line.lower() and ('select' in line.lower() or 'dropdown' in line.lower()) and 'form-input' in line and i > 100:
            # Go back to find the section start
            for j in range(i, max(0, i-20), -1):
                if 'form-section' in lines[j]:
                    insert_idx = j
                    break
            if insert_idx:
                break

if insert_idx:
    lines.insert(insert_idx, batch_section)
    mf = '\n'.join(lines)
    changes.append(f"ModelForm: Inserted batch section at line {insert_idx}")
else:
    changes.append("WARN: Could not find insertion point for batch section")

# 4. Translate remaining English text
translations = [
    # Page header
    ("Add Model", "添加模型"),
    ("Edit Model", "编辑模型"),
    ("Clone Model", "克隆模型"),
    ("Configure a new model provider and its pricing.", "配置一个新的模型提供商及其定价。"),
    ("Edit an existing model provider and its pricing.", "编辑现有的模型提供商及其定价。"),
    
    # Connection section
    ("Connection details", "连接信息"),
    ("API endpoint and authentication credentials required to perform requests.", "API 端点及认证凭据，用于发送请求。"),
    ("Endpoint URL", "端点 URL"),
    ("API Key / Token", "API 密钥/令牌"),
    ("not required for local models", "本地模型不需要"),
    ("Leave blank to keep existing key", "留空以保留现有密钥"),
    ("Leave blank to keep existing path", "留空以保留现有路径"),
    
    # Web provider instructions - translate most visible parts
    ("While logged in to ChatGPT, open", "登录 ChatGPT 后，打开"),
    ("in a new tab. Copy the value of the", "，在新标签页中。复制"),
    ("field", "字段的值"),
    ("(starts with", "（以"),
    ("The token expires every ~24 hours.", "令牌每约 24 小时过期。"),
    ("For reliable access, also fill in the", "如需更稳定访问，请同时填写"),
    ("field below.", "字段。"),
    ("How to get your session key:", "如何获取会话密钥："),
    ("While logged in to Claude, open DevTools (F12) → Application → Cookies →", "登录 Claude 后，打开开发者工具(F12)→ Application → Cookies →"),
    ("→ copy the value of the", "→ 复制"),
    ("cookie", "cookie 的值"),
    ("The key stays valid until you log out.", "密钥有效期至您登出。"),
    
    # Subscription instructions
    ("Use your Claude Pro/Max subscription.", "使用您的 Claude Pro/Max 订阅。"),
    ("Run this command and copy the token it prints:", "运行以下命令并复制输出的令牌："),
    ("Paste the token into the", "将令牌粘贴到下方的"),
    ("field below.", "字段中。"),
    ("Regenerate when it expires. Subscription use via a gateway may be against the provider&apos;s Terms.", "过期后重新生成。通过网关使用订阅可能违反提供商的服务条款。"),
    ("Use your ChatGPT Plus/Pro subscription via the Codex app.", "通过 Codex 应用使用您的 ChatGPT Plus/Pro 订阅。"),
    ("Log in to the Codex desktop app with your ChatGPT Plus/Pro account.", "使用您的 ChatGPT Plus/Pro 账号登录 Codex 桌面应用。"),
    ("Routerly reads your access token from", "Routerly 会从"),
    ("and refreshes it automatically. No manual copy/paste needed.", "自动读取访问令牌并自动刷新。无需手动复制。"),
    ("Leave the", "留空"),
    ("field blank to use the default, or enter a custom path if your Codex app stores auth elsewhere.", "字段以使用默认路径，如果您的 Codex 应用将认证信息存储在其他位置，请输入自定义路径。"),
    
    # Unofficial provider warning
    ("Unofficial provider — use at your own risk.", "非官方提供商 — 使用风险自负。"),
    ("This integration relies on an undocumented internal API that may change or break without notice.", "此集成依赖于未文档化的内部 API，可能随时更改或失效。"),
    ("It may violate the provider&apos;s Terms of Service and could result in account suspension.", "这可能违反提供商的服务条款并导致账号封禁。"),
    
    # Azure fields
    ("Azure Resource Name", "Azure 资源名称"),
    ("The Azure OpenAI resource name (from the Azure portal).", "Azure OpenAI 资源名称（来自 Azure 门户）。"),
    ("Deployment ID", "部署 ID"),
    ("The deployment name you created in Azure OpenAI Studio.", "您在 Azure OpenAI Studio 中创建的部署名称。"),
    ("API Version", "API 版本"),
    
    # AWS Bedrock fields
    ("AWS Region", "AWS 区域"),
    ("AWS Access Key ID", "AWS 访问密钥 ID"),
    ("AWS Secret Access Key", "AWS 秘密访问密钥"),
    ("Session Token", "会话令牌"),
    ("(optional, for temporary credentials)", "（可选，用于临时凭据）"),
    
    # Google Vertex fields
    ("GCP Project ID", "GCP 项目 ID"),
    ("Location", "位置"),
    ("Service Account Key (JSON)", "服务账号密钥 (JSON)"),
    ("Paste the contents of your service account JSON key file", "粘贴您的服务账号 JSON 密钥文件内容"),
    ("The full JSON content of a service account key with Vertex AI User role.", "具有 Vertex AI User 角色的服务账号密钥的完整 JSON 内容。"),
    ("If omitted, falls back to the API Key field as a Bearer token.", "如果留空，将使用 API 密钥字段作为 Bearer 令牌。"),
    
    # Capabilities
    ("Capabilities", "能力"),
    ("Specify the type and capabilities of this model.", "指定此模型的类型和能力。"),
    ("Embedding model", "嵌入模型"),
    ("This model generates vector embeddings (not chat completions)", "此模型生成向量嵌入（非对话补全）"),
    
    # Pricing
    ("Pricing & context", "定价与上下文"),
    ("Cost parameters and processing limits used for billing and routing.", "用于计费和路由的成本参数与处理限制。"),
    ("Cache read $/1M", "缓存读取 $/百万"),
    ("Cache write $/1M", "缓存写入 $/百万"),
    ("(tokens, optional)", "（令牌，选填）"),
    
    # Advanced section
    ("Advanced — Pricing tiers", "高级 — 定价层级"),
    ("Override pricing when a metric exceeds a threshold.", "当某个指标超过阈值时覆盖定价。"),
    ("For example: \"Above 200 000 context tokens, prices change.\"", "例如：\"超过 200,000 上下文令牌时，价格变更。\""),
    ("Add pricing tier", "添加定价层级"),
    ("Remove tier", "移除层级"),
    
    # Tier labels
    ("Above", "超过"),
    ("Metric", "指标"),
    ("Context tokens", "上下文令牌"),
    ("Override pricing", "覆盖定价"),
    
    # Limits section
    ("Limits", "限制"),
    ("Usage limits for this model. Multiple rules can be combined.", "此模型的使用限制。可以组合多个规则。"),
    ("Add limit", "添加限制"),
    ("Type", "类型"),
    ("Every", "每"),
    
    # Buttons
    ("Save Changes", "保存更改"),
    ("Create Clone", "创建克隆"),
    ("Create Model", "创建模型"),
    ("Create", "创建"),
    ("Cancel", "取消"),
    (" Test", " 测试"),
    (" Testing…", " 测试中…"),
    
    # Placeholders
    ("e.g. my-fine-tuned-model", "例如：my-fine-tuned-model"),
    ("myresource", "myresource"),
    ("gpt-4o-deployment", "gpt-4o-deployment"),
    ("my-gcp-project", "my-gcp-project"),
    
    # Provider labels
    ("Anthropic (Pro/Max subscription)", "Anthropic (Pro/Max 订阅)"),
    ("OpenAI (ChatGPT Plus/Pro subscription)", "OpenAI (ChatGPT Plus/Pro 订阅)"),
    
    # Copy button
    ("Copy", "复制"),
    ("Copied", "已复制"),
    
    # OAuth
    ("Subscription OAuth Token", "订阅 OAuth 令牌"),
    ("Auth file path", "认证文件路径"),
    
    # Token labels/placeholders
    ("Access Token", "访问令牌"),
    ("Session Token", "会话令牌"),
    
    # The testing state
    ("Error loading models", "加载模型失败"),
    ("Model not found", "未找到模型"),
    ("Source model not found", "未找到源模型"),
    
    # Limits metric labels
    ("Input tokens", "输入令牌"),
    ("Output tokens", "输出令牌"),
    ("Total tokens", "总令牌"),
    ("Cost", "消耗"),
    ("Requests", "请求数"),
    
    # Period labels  
    ("Hourly", "每小时"),
    ("Daily", "每日"),
    ("Weekly", "每周"),
    ("Monthly", "每月"),
    ("Yearly", "每年"),
    
    # Collapse/uncollapse
    ("Copied!", "已复制！"),
    
    # Discovery section
    ("Discovery failed", "发现失败"),
    ("Discover", "发现"),
    
    # Model test
    ("Test", "测试"),
]

for old_str, new_str in translations:
    if old_str in mf and old_str != new_str:
        mf = mf.replace(old_str, new_str)
        changes.append(f"TF: '{old_str}' -> '{new_str}'")

# Fix the save button text (malformed in previous patch)
# Look for the broken "保存" button
mf = mf.replace("`保\x85}{batchSelectedModels.size === 0 ? '' : ` (${batchSelectedModels.size})`}保存选中`", "保存选中")

# Also fix any broken unicode
mf = mf.replace('\\u53d1\\u73b0\\u6a21\\u578b\\u5931\\u8d25', '发现模型失败')
mf = mf.replace('\\u53d1\\u73b0\\u4e2d...', '发现中...')
mf = mf.replace('\\u53d1\\u73b0\\u6a21\\u578b', '发现模型')
mf = mf.replace('\\u2705 \\u6210\\u529f\\u5bfc\\u5165', '✅ 成功导入')
mf = mf.replace('\\u53d1\\u73b0', '发现')
mf = mf.replace('\\u641c\\u7d22\\u6a21\\u578b\\u2026', '搜索模型…')
mf = mf.replace('\\u5168\\u9009', '全选')
mf = mf.replace('\\u63d0\\u4f9b\\u5546', '提供商')
mf = mf.replace('\\uff0c\\u5c06\\u6dfb\\u52a0', '，将添加')
mf = mf.replace('\\u5bfc\\u5165\\u4e2d...', '导入中...')
mf = mf.replace('\\u6279\\u91cf\\u6dfb\\u52a0\\u9009\\u4e2d', '保存选中')

# Properly clean up the save button
mf = mf.replace("batchSelectedModels.size === 0 ? '' : ` (${batchSelectedModels.size})`}保存选中", 
                "batchSelectedModels.size > 0 ? `保存选中 (${batchSelectedModels.size})` : '保存选中'")

# ════════════════════════════════════════════════════════════════════════════
# Write files
# ════════════════════════════════════════════════════════════════════════════

with open(FILE_MODELFORM, 'w') as f: f.write(mf)
with open(FILE_MODELS, 'w') as f: f.write(ms)

print(f"=== DONE === {len(changes)} changes")
for c in changes[:30]:
    print(f"  {c}")
if len(changes) > 30:
    print(f"  ... and {len(changes)-30} more")
