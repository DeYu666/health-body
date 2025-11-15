import { useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { HiMiniChartBar, HiMiniFolder, HiMiniHome, HiMiniPlusCircle } from 'react-icons/hi2'
import { useAppState } from '../../context/AppStateContext'
import { BottomNav } from './BottomNav'
import { DesktopSidebar } from './DesktopSidebar'
import { StatusBar } from './StatusBar'
import type { StatusBarConfig } from './StatusBar'

export interface AppShellContextValue {
  setHeaderConfig: (config: StatusBarConfig) => void
}

export const navItems = [
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
    label: '上传',
    subLabel: '拍照或拖拽导入',
    path: '/upload',
    icon: HiMiniPlusCircle,
  },
]

export const AppShell: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { reports } = useAppState()
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
    <div className="min-h-screen bg-gradient-hero px-4 py-6 md:flex md:justify-center md:pt-10 md:pb-12">
      <div className="flex w-full max-w-6xl flex-col gap-6 md:grid md:grid-cols-[280px_minmax(0,1fr)]">
        <DesktopSidebar
          stats={sidebarStats}
          onNavigate={(path) => navigate(path)}
          activePath={location.pathname}
          navItems={navItems}
        />

        <div className="relative mx-auto flex h-full w-full max-w-md flex-col overflow-hidden rounded-[22px] bg-white shadow-card md:mx-0 md:max-w-none">
          <StatusBar
            {...headerConfig}
            onBack={
              headerConfig.showBackButton
                ? headerConfig.onBack ?? (() => navigate(-1))
                : undefined
            }
          />
          <div className="flex-1 overflow-y-auto bg-white pb-24 md:pb-10">
            <Outlet context={{ setHeaderConfig }} />
          </div>
          <BottomNav items={navItems} className="md:hidden" />
        </div>
      </div>
    </div>
  )
}

