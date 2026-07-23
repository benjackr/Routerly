import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, FolderOpen, Pencil } from 'lucide-react';
import { getProjects, deleteProject, type Project } from '../api';
import { ConfirmDialog } from '../components/ConfirmDialog';

export function ProjectsPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [confirmState, setConfirmState] = useState<{ message: string; onConfirm: () => void } | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      setProjects(await getProjects());
    } finally { setLoading(false); }
  }

  function handleDelete(id: string) {
    setConfirmState({
      message: '确定删除此项目？',
      onConfirm: async () => {
        setConfirmState(null);
        try {
          await deleteProject(id);
          setProjects(p => p.filter(x => x.id !== id));
        } catch (error) {
          setErr(error instanceof Error ? error.message : '删除项目失败');
        }
      },
    });
  }

  return (
    <>
      <div className="page-header">
        <h1>项目</h1>
        <p>访问 Routerly 的客户端应用</p>
      </div>
      {err && <div className="form-error" style={{ margin: '0 20px' }}>{err}</div>}
      <div className="page-body">
        <div className="toolbar">
          <span className="toolbar-title">{projects.length} project{projects.length !== 1 ? 's' : ''}</span>
          <button className="btn btn-primary" onClick={() => navigate('/dashboard/projects/new')}>
            <Plus size={16} /> New Project
          </button>
        </div>

        {loading ? (
          <div className="loading-center"><div className="spinner" /></div>
        ) : projects.length === 0 ? (
          <div className="empty-state"><FolderOpen size={40} /><p>暂无项目。</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>名称</th><th>令牌</th><th>策略</th><th>模型</th><th></th></tr>
              </thead>
              <tbody>
                {projects.map(p => (
                  <tr key={p.id}>
                    <td><strong style={{ color: 'var(--text-primary)' }}>{p.name}</strong></td>
                    <td>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {p.tokens?.length || 0} token{p.tokens?.length !== 1 ? 's' : ''}
                      </span>
                    </td>
                    <td>
                      {p.policies && p.policies.filter(pol => pol.enabled).length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {p.policies.filter(pol => pol.enabled).map(pol => (
                            <span key={pol.type} style={{ fontSize: '0.72rem', fontWeight: 500, padding: '2px 7px', borderRadius: 4, background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                              {pol.type}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                      {p.models.map(m => m.modelId).join(', ')}
                    </td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      <button className="btn-icon" onClick={() => navigate(`/dashboard/projects/${p.id}`)} title="编辑项目">
                        <Pencil size={15} />
                      </button>
                      <button className="btn-icon danger" onClick={() => handleDelete(p.id)} title="删除项目">
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {confirmState && (
        <ConfirmDialog
          message={confirmState.message}
          onConfirm={confirmState.onConfirm}
          onCancel={() => setConfirmState(null)}
        />
      )}
    </>
  );
}
