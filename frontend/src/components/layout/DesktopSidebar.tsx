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
    <aside className="hidden h-full rounded-3xl bg-white/20 p-6 text-white backdrop-blur-lg md:flex md:flex-col md:shadow-card">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
          <FaHeartbeat className="text-2xl text-white" />
        </div>
        <div>
          <p className="text-sm uppercase tracking-wide text-white/70">PHR</p>
          <h2 className="text-2xl font-semibold">健康档案</h2>
        </div>
      </div>

      <div className="mb-8 space-y-3 rounded-2xl bg-white/10 p-4">
        <p className="text-xs uppercase tracking-wide text-white/70">今日提示</p>
        <div>
          <p className="text-sm text-white/80">已加密存储的报告</p>
          <p className="text-2xl font-semibold">{stats.reportCount} 份</p>
        </div>
        {stats.latestUpload ? (
          <div className="rounded-xl bg-white/10 px-4 py-3 text-sm leading-relaxed text-white/80">
            <p className="font-semibold text-white">最近上传</p>
            <p className="truncate text-white/80">{stats.latestUpload}</p>
            <p className="text-xs text-emerald-200/90">可随时预览、分享、删除</p>
          </div>
        ) : null}
      </div>

      <nav className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-white/60">页面快捷入口</p>
        <ul className="space-y-2">
          {navItems.map(({ path, label, subLabel, icon: Icon }) => {
            const isActive = activePath.startsWith(path)
            return (
              <li key={path}>
                <button
                  onClick={() => onNavigate(path)}
                  className={clsx(
                    'flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all',
                    isActive
                      ? 'bg-white text-primary shadow-md'
                      : 'bg-white/0 text-white/80 hover:bg-white/10 hover:text-white',
                  )}
                >
                  <span
                    className={clsx(
                      'flex h-10 w-10 items-center justify-center rounded-xl',
                      isActive ? 'bg-primary/10 text-primary' : 'bg-white/10 text-white',
                    )}
                  >
                    <Icon className="text-xl" />
                  </span>
                  <span>
                    <p
                      className={clsx(
                        'text-sm font-semibold',
                        isActive ? 'text-primary' : 'text-white',
                      )}
                    >
                      {label}
                    </p>
                    {subLabel ? (
                      <p
                        className={clsx(
                          'text-xs',
                          isActive ? 'text-primary/70' : 'text-white/70',
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
        <div className="rounded-2xl bg-white/10 p-4 text-sm text-white/80">
          <p className="font-semibold text-white">隐私与安全提示</p>
          <p className="mt-2 leading-relaxed">
            所有报告与指标均采用端到端加密，未授权的设备无法查看。您可以在"设置"中管理 PIN
            码或生物识别登录。
          </p>
        </div>
        {user && (
          <div className="rounded-2xl bg-white/10 p-4">
            <p className="text-xs uppercase tracking-wide text-white/70">当前用户</p>
            <p className="mt-1 text-sm font-semibold text-white">{user.displayName || user.email}</p>
            <button
              onClick={handleLogout}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
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

