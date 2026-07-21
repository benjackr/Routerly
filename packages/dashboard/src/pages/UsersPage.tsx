import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Users, Pencil, ShieldOff } from 'lucide-react';
import { getUsers, createUser, deleteUser, reset2faForUser, type User } from '../api';
import { ConfirmDialog } from '../components/ConfirmDialog';

type AddForm = { email: string; password: string; roleId: string };

export function UsersPage() {
  const [users, setUsers]         = useState<User[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showAdd, setShowAdd]     = useState(false);
  const [addForm, setAddForm]     = useState<AddForm>({ email: '', password: '', roleId: 'viewer' });
  const [addErr, setAddErr]       = useState('');
  const [addSaving, setAddSaving] = useState(false);
  const [confirmState, setConfirmState] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const navigate = useNavigate();

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try { setUsers(await getUsers()); } finally { setLoading(false); }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddErr(''); setAddSaving(true);
    try {
      await createUser(addForm);
      setShowAdd(false);
      setAddForm({ email: '', password: '', roleId: 'viewer' });
      await load();
    } catch (e) { setAddErr(e instanceof Error ? e.message : '错误'); }
    finally { setAddSaving(false); }
  }

  function handleDelete(id: string) {
    setConfirmState({
      message: '确定删除此用户？',
      onConfirm: async () => {
        setConfirmState(null);
        await deleteUser(id);
        setUsers(u => u.filter(x => x.id !== id));
      },
    });
  }

  function handleReset2fa(id: string, email: string) {
    setConfirmState({
      message: `重置 2FA for ${email}? They will need to re-enroll.`,
      onConfirm: async () => {
        setConfirmState(null);
        await reset2faForUser(id);
        setUsers(u => u.map(x => x.id === id ? { ...x, totpEnabled: false } : x));
      },
    });
  }

  return (
    <>
      <div className="toolbar">
        <span className="toolbar-title">{users.length} user{users.length !== 1 ? 's' : ''}</span>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
          <Plus size={16} /> Add User
        </button>
      </div>

      {loading ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : users.length === 0 ? (
        <div className="empty-state"><Users size={40} /><p>暂无用户。</p></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>邮箱</th><th>角色</th><th>项目</th><th></th></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td><strong style={{ color: 'var(--text-primary)' }}>{u.email}</strong></td>
                  <td><span className={`badge ${u.roleId === 'admin' ? 'badge-success' : 'badge-ollama'}`}>{u.roleId}</span></td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    {u.projectIds.length === 0 ? '全部' : u.projectIds.join(', ')}
                  </td>
                  <td style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                    {u.totpEnabled && (
                      <button className="btn-icon" title="Reset 2FA" onClick={() => handleReset2fa(u.id, u.email)}>
                        <ShieldOff size={14} />
                      </button>
                    )}
                    <button className="btn-icon" onClick={() => navigate(`/dashboard/settings/users/${u.id}`)}>
                      <Pencil size={14} />
                    </button>
                    <button className="btn-icon danger" onClick={() => handleDelete(u.id)}>
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Add modal ── */}
      {showAdd && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div className="modal">
            <h2 className="modal-title">添加用户</h2>
            <form onSubmit={handleAdd}>
              {addErr && <div className="form-error">{addErr}</div>}
              <div className="form-group">
                <label className="form-label">邮箱</label>
                <input className="form-input" type="email" value={addForm.email}
                  onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} placeholder="user@example.com" required />
              </div>
              <div className="form-group">
                <label className="form-label">密码</label>
                <input className="form-input" type="password" value={addForm.password}
                  onChange={e => setAddForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" required />
              </div>
              <div className="form-group">
                <label className="form-label">角色</label>
                <select className="form-input" value={addForm.roleId} onChange={e => setAddForm(f => ({ ...f, roleId: e.target.value }))}>
                  <option value="admin">管理员</option>
                  <option value="viewer">查看者</option>
                </select>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAdd(false)}>取消</button>
                <button type="submit" className="btn btn-primary" disabled={addSaving}>
                  {addSaving ? <span className="spinner" /> : '添加用户'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
