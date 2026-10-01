import { useState } from 'react'
import { FaPlus, FaUserGroup, FaXmark } from 'react-icons/fa6'
import { useAppState } from '../../context/AppStateContext'

export const FamilySwitcher: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { members, selectedMemberId, setSelectedMemberId, createMember } = useAppState()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [relationship, setRelationship] = useState('家人')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!name.trim()) {
      setError('请输入成员姓名')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await createMember({ name: name.trim(), relationship })
      setName('')
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : '添加成员失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        {!compact ? <FaUserGroup className="text-slate-400" /> : null}
        <select
          value={selectedMemberId}
          onChange={(event) => setSelectedMemberId(event.target.value)}
          className={`${compact ? 'w-[108px] sm:w-auto' : 'min-w-0'} rounded-md border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm font-semibold text-slate-700 focus:border-primary focus:ring-primary/20`}
          aria-label="选择家庭成员"
        >
          {members.map((member) => (
            <option key={member.id} value={member.id}>{member.name} · {member.relationship}</option>
          ))}
        </select>
        <button type="button" onClick={() => setOpen(true)} className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:border-primary hover:text-primary" aria-label="添加家庭成员">
          <FaPlus />
        </button>
      </div>

      {open ? (
        <div className="absolute right-0 top-12 z-50 w-72 rounded-lg border border-slate-200 bg-white p-4 shadow-xl">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">添加家庭成员</h3>
            <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700" aria-label="关闭"><FaXmark /></button>
          </div>
          <div className="mt-4 space-y-3">
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="姓名" className="w-full rounded-md border-slate-200 text-sm focus:border-primary focus:ring-primary/20" />
            <select value={relationship} onChange={(event) => setRelationship(event.target.value)} className="w-full rounded-md border-slate-200 text-sm focus:border-primary focus:ring-primary/20">
              {['配偶', '子女', '父母', '家人'].map((item) => <option key={item}>{item}</option>)}
            </select>
            {error ? <p className="text-xs text-red-600">{error}</p> : null}
            <button type="button" onClick={save} disabled={saving} className="w-full rounded-md bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? '添加中' : '添加成员'}</button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
