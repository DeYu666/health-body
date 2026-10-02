import { useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { HiMiniChartBar, HiMiniFolder, HiMiniHome, HiMiniPlusCircle } from 'react-icons/hi2'
import { useAppState } from '../../context/AppStateContext'
import { BottomNav } from './BottomNav'
import { DesktopSidebar } from './DesktopSidebar'
import { StatusBar } from './StatusBar'
import type { StatusBarConfig } from './StatusBar'
import { FamilySwitcher } from '../family/FamilySwitcher'

export interface AppShellContextValue {
  setHeaderConfig: (config: StatusBarConfig) => void
}

const navItems = [
  {
    label: '首页',
    subLabel: '个人健康仪表盘',
    path: '/dashboard',
    icon: HiMiniHome,
  },
  {
    label: '档案',
    subLabel: '报告归档与检索',
    path: '/archive',
    icon: HiMiniFolder,
  },
  {
    label: '指标',
    subLabel: '趋势与异常提示',
    path: '/metrics/trends',
    icon: HiMiniChartBar,
  },
  {
    label: '导入',
    subLabel: '拍照上传与 AI 整理',
    path: '/import',
    icon: HiMiniPlusCircle,
  },
]

export const AppShell: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { reports, error, loading, refreshReports, refreshMetrics } = useAppState()
  const [headerConfig, setHeaderConfig] = useState<StatusBarConfig>({})

  useEffect(() => {
    setHeaderConfig({})
  }, [location.pathname])

  const sidebarStats = useMemo(
    () => ({
      reportCount: reports.length,
      latestUpload: reports[0]?.title,
    }),
    [reports],
  )

  return (
    <div className="min-h-screen bg-slate-100 md:p-6">
      <div className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col md:min-h-[calc(100vh-3rem)] md:grid md:grid-cols-[260px_minmax(0,1fr)] md:gap-6">
        <DesktopSidebar
          stats={sidebarStats}
          onNavigate={(path) => navigate(path)}
          activePath={location.pathname}
          navItems={navItems}
        />

        <div className="relative flex min-w-0 flex-col overflow-hidden bg-white md:rounded-lg md:border md:border-slate-200 md:shadow-sm">
          <StatusBar
            {...headerConfig}
            onBack={
              headerConfig.showBackButton
                ? headerConfig.onBack ?? (() => navigate(-1))
                : undefined
            }
            rightContent={headerConfig.rightContent ?? <FamilySwitcher compact />}
          />
          <div className="flex-1 bg-slate-50 pb-24 md:pb-0">
            {error ? <div role="alert" className="m-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">资料暂时没有加载成功。<button type="button" disabled={loading} onClick={() => { void Promise.all([refreshReports(), refreshMetrics()]) }} className="ml-2 font-semibold underline">重试加载</button></div> : null}
            {loading ? <p role="status" className="px-4 pt-3 text-xs text-slate-500">正在加载当前成员的资料…</p> : null}
            <Outlet context={{ setHeaderConfig }} />
          </div>
          <BottomNav items={navItems} className="md:hidden" />
        </div>
      </div>
    </div>
  )
}
