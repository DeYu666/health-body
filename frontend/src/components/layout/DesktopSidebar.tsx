import clsx from 'classnames'
import { useNavigate } from 'react-router-dom'
import type { IconType } from 'react-icons'
import { FaHeartbeat, FaSignOutAlt } from 'react-icons/fa'
import { useAuth } from '../../context/AuthContext'

interface DesktopSidebarProps {
  stats: {
    reportCount: number
    latestUpload?: string
  }
  onNavigate: (path: string) => void
  activePath: string
  navItems: {
    label: string
    subLabel?: string
    path: string
    icon: IconType
  }[]
}

export const DesktopSidebar: React.FC<DesktopSidebarProps> = ({
  stats,
  onNavigate,
  activePath,
  navItems,
}) => {
  const { logout, user } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <aside className="hidden h-full rounded-lg border border-slate-200 bg-white p-6 text-slate-900 md:flex md:flex-col md:shadow-sm">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
          <FaHeartbeat className="text-2xl text-primary" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Family Health</p>
          <h2 className="text-xl font-semibold">家庭医疗本</h2>
        </div>
      </div>

      <div className="mb-8 space-y-3 rounded-lg bg-slate-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">当前档案</p>
        <div>
          <p className="text-sm text-slate-500">已归档健康资料</p>
          <p className="text-2xl font-semibold">{stats.reportCount} 份</p>
        </div>
        {stats.latestUpload ? (
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm leading-relaxed text-slate-600">
            <p className="font-semibold text-slate-900">最近导入</p>
            <p className="truncate text-slate-600">{stats.latestUpload}</p>
            <p className="text-xs text-emerald-600">原始文件与解析结果均可查看</p>
          </div>
        ) : null}
      </div>

      <nav className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-slate-400">页面快捷入口</p>
        <ul className="space-y-2">
          {navItems.map(({ path, label, subLabel, icon: Icon }) => {
            const isActive = activePath.startsWith(path)
            return (
              <li key={path}>
                <button
                  onClick={() => onNavigate(path)}
                  className={clsx(
                    'flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition-all',
                    isActive
                      ? 'bg-primary text-white shadow-md'
                      : 'bg-white text-slate-600 hover:bg-slate-50 hover:text-primary',
                  )}
                >
                  <span
                    className={clsx(
                      'flex h-10 w-10 items-center justify-center rounded-lg',
                      isActive ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-500',
                    )}
                  >
                    <Icon className="text-xl" />
                  </span>
                  <span>
                    <p
                      className={clsx(
                        'text-sm font-semibold',
                        isActive ? 'text-white' : 'text-slate-800',
                      )}
                    >
                      {label}
                    </p>
                    {subLabel ? (
                      <p
                        className={clsx(
                          'text-xs',
                          isActive ? 'text-white/80' : 'text-slate-500',
                        )}
                      >
                        {subLabel}
                      </p>
                    ) : null}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="mt-auto space-y-3">
        {user && (
          <div className="rounded-lg bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">当前用户</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{user.displayName || user.email}</p>
            <button
              onClick={handleLogout}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              <FaSignOutAlt />
              登出
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
