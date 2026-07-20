#!/usr/bin/env python3
"""Patch ModelsPage.tsx directly in codespace"""
import re

with open('/workspaces/Routerly/packages/dashboard/src/pages/ModelsPage.tsx', 'r') as f:
    code = f.read()

original = code

# Fix 1: Darker overlay
code = code.replace(
    "background: 'rgba(0,0,0,0.5)',",
    "background: 'rgba(0,0,0,0.85)',\n          backdropFilter: 'blur(4px)',"
)

# Fix 2: Add states
code = code.replace(
    "const [importLoading, setImportLoading] = useState(false);",
    "const [importLoading, setImportLoading] = useState(false);\n  const [fetchSearch, setFetchSearch] = useState('');\n  const [providerName, setProviderName] = useState('');\n  const [importResult, setImportResult] = useState(null);"
)

# Fix 3: filteredFetch
code = code.replace(
    "const filtered = useMemo(() => {",
    "const filteredFetch = useMemo(() => {\n    const q = fetchSearch.trim().toLowerCase();\n    if (!q) return discoveredModels;\n    return discoveredModels.filter(m => m.id.toLowerCase().includes(q) || (m.owned_by || '').toLowerCase().includes(q));\n  }, [discoveredModels, fetchSearch]);\n\n  const filtered = useMemo(() => {",
)

# Fix 4: Reset importResult, auto provider
code = code.replace(
    "    setFetchError('');\n    setDiscoveredModels([]);\n    setSelectedModels(new Set());",
    "    setFetchError('');\n    setImportResult(null);\n    setDiscoveredModels([]);\n    setSelectedModels(new Set());\n    try { setProviderName(new URL(fetchEndpoint).hostname.replace('api.', '').replace('.com', '')); } catch (e) {}"
)

# Fix 5: Replace alert
code = code.replace(
    'alert(`\u5bfc\u5165ed ${result.imported} of ${result.total} models`);',
    'setImportResult(result);'
)

# Fix 6: Import result display
code = code.replace(
    """            {fetchError && (
              <div style={{ padding: '8px 12px', background: 'rgba(220,38,38,0.1)', borderRadius: 6,
                color: 'var(--danger)', fontSize: '0.82rem', marginBottom: 12 }}>
                {fetchError}
              </div>
            )}""",
    """            {importResult && (
              <div style={{ padding: '8px 12px', background: 'rgba(34,197,94,0.1)', borderRadius: 6,
                color: 'var(--success)', fontSize: '0.82rem', marginBottom: 12 }}>
                \u2705 \u6210\u529f\u5bfc\u5165 {importResult.imported} / {importResult.total} \u4e2a\u6a21\u578b
              </div>
            )}
            {fetchError && (
              <div style={{ padding: '8px 12px', background: 'rgba(220,38,38,0.1)', borderRadius: 6,
                color: 'var(--danger)', fontSize: '0.82rem', marginBottom: 12 }}>
                {fetchError}
              </div>
            )}"""
)

# Fix 7: Count + select-all block
code = code.replace(
    """                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                    {discoveredModels.length} model{discoveredModels.length !== 1 ? 's' : ''} found
                  </span>
                  <label style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <input type=\"checkbox\" checked={selectedModels.size === discoveredModels.length && discoveredModels.length > 0}
                      onChange={toggleAllModels} />
                    Select all
                  </label>""",
    """                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                    \u53d1\u73b0 {discoveredModels.length} \u4e2a\u6a21\u578b
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ position: 'relative' }}>
                      <input
                        value={fetchSearch}
                        onChange={e => setFetchSearch(e.target.value)}
                        placeholder="\u641c\u7d22\u6a21\u578b\u2026"
                        style={{ paddingLeft: 8, height: 28, fontSize: '0.82rem', borderRadius: 4,
                          border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', width: 160 }}
                      />
                    </div>
                    <label style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      <input type=\"checkbox\" checked={selectedModels.size === discoveredModels.length && discoveredModels.length > 0}
                        onChange={toggleAllModels} />
                      \u5168\u9009
                    </label>
                  </div>"""
)

# Fix 8: filteredFetch.map
code = code.replace(
    "{discoveredModels.map(m => (",
    "{filteredFetch.map(m => (",
)

# Fix 9: provider state
code = code.replace(
    "const provider = new URL(fetchEndpoint).hostname.replace('api.', '').replace('.com', '');",
    "const provider = providerName || new URL(fetchEndpoint).hostname.replace('api.', '').replace('.com', '');",
)

# Fix 10: Add provider name input
code = code.replace(
    """              <input
                value={fetchApiKey}
                onChange={e => setFetchApiKey(e.target.value)}
                placeholder=\"API Key (optional)\"
                type=\"password\"
                disabled={fetchLoading}
                style={{ height: 36, padding: '0 12px', fontSize: '0.85rem', borderRadius: 6,
                  border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none' }}
              />""",
    """              <input
                value={fetchApiKey}
                onChange={e => setFetchApiKey(e.target.value)}
                placeholder=\"API Key (\u9009\u586b)\"
                type=\"password\"
                disabled={fetchLoading}
                style={{ height: 36, padding: '0 12px', fontSize: '0.85rem', borderRadius: 6,
                  border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none' }}
              />
              <input
                value={providerName}
                onChange={e => setProviderName(e.target.value)}
                placeholder=\"\u63d0\u4f9b\u5546\u540d\u79f0 (\u81ea\u52a8\u4ece URL \u751f\u6210)\"
                disabled={fetchLoading}
                style={{ height: 36, padding: '0 12px', fontSize: '0.85rem', borderRadius: 6,
                  border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none' }}
              />"""
)

# Fix 11: Buttons section
code = code.replace(
    """                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                  <button className=\"btn\" onClick={() => setShowFetchModal(false)} disabled={importLoading}>
                    Cancel
                  </button>
                  <button className=\"btn btn-primary\" onClick={handleImport}
                    disabled={selectedModels.size === 0 || importLoading}>
                    {importLoading ? 'Importing...' : `Import Selected (${selectedModels.size})`}
                  </button>
                </div>""",
    """                <div style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 8 }}>
                  \u5c06\u521b\u5efa <strong>{selectedModels.size}</strong> \u4e2a\u6a21\u578b\uff0c
                  \u63d0\u4f9b\u5546: <strong>{providerName || '\u2026'}</strong>
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                  <button className=\"btn\" onClick={() => setShowFetchModal(false)} disabled={importLoading}>
                    \u53d6\u6d88
                  </button>
                  <button className=\"btn btn-primary\" onClick={handleImport}
                    disabled={selectedModels.size === 0 || importLoading}>
                    {importLoading ? '\u5bfc\u5165\u4e2d...' : `\u5bfc\u5165\u9009\u4e2d (${selectedModels.size})`}
                  </button>
                </div>"""
)

# Fix 12: Other translations
code = code.replace("<option value=\"\">All providers</option>", "<option value=\"\">\u6240\u6709\u63d0\u4f9b\u5546</option>")
code = code.replace("\u2190 Previous", "\u2190 \u4e0a\u4e00\u9875")
code = code.replace("Next \u2192", "\u4e0b\u4e00\u9875 \u2192")
code = code.replace("Page {page} of {totalPages}", "\u7b2c {page} \u9875 / \u5171 {totalPages} \u9875")
code = code.replace("Page {hPage} of {hTotalPages}", "\u7b2c {hPage} \u9875 / \u5171 {hTotalPages} \u9875")
code = code.replace("{sorted.length} models", "{sorted.length} \u4e2a\u6a21\u578b")
code = code.replace("{hSorted.length} models", "{hSorted.length} \u4e2a\u6a21\u578b")

# Fix 13: Template literal model counts
code = code.replace(
    "? `${filtered.length} of ${models.length} model${models.length !== 1 ? 's' : ''}`\n                  : `${models.length} model${models.length !== 1 ? 's' : ''}`",
    "? `${filtered.length} / ${models.length} \u4e2a\u6a21\u578b`\n                  : `${models.length} \u4e2a\u6a21\u578b`"
)
code = code.replace(
    "? `${hFiltered.length} of ${models.length} model${models.length !== 1 ? 's' : ''}`\n                    : `${models.length} model${models.length !== 1 ? 's' : ''}`",
    "? `${hFiltered.length} / ${models.length} \u4e2a\u6a21\u578b`\n                    : `${models.length} \u4e2a\u6a21\u578b`"
)

if code != original:
    with open('/workspaces/Routerly/packages/dashboard/src/pages/ModelsPage.tsx', 'w') as f:
        f.write(code)
    import os
    lines_changed = sum(1 for a,b in zip(original.splitlines(), code.splitlines()) if a!=b)
    print(f"OK {lines_changed}")
else:
    print("NONE")
