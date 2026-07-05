import clsx from 'classnames'
import dayjs from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import {
  FaChevronRight,
  FaClock,
  FaFileMedical,
  FaFolderOpen,
  FaSearch,
} from 'react-icons/fa'
import { useNavigate, useOutletContext } from 'react-router-dom'
import type { AppShellContextValue } from '../components/layout/AppShell'
import { useAppState } from '../context/AppStateContext'
import type { Report } from '../types'

const categoryTabs = ['全部', '待处理', '体检', '检验', '影像', '病历', '用药', '其他'] as const
type CategoryTab = (typeof categoryTabs)[number]

const categoryKeywords: Record<Exclude<CategoryTab, '全部' | '待处理' | '其他'>, string[]> = {
  体检: ['体检'],
  检验: ['检验', '血常规', '尿常规', '肝功能', '肾功能', '血脂', '血糖'],
  影像: ['影像', 'CT', 'MRI', 'B超', '超声', 'X光', '心电图'],
  病历: ['病历', '门诊', '住院', '出院'],
  用药: ['用药', '处方', '药'],
}

const inferCategory = (report: Report): CategoryTab => {
  if (
    report.tags.includes('AI待处理') ||
    report.hospital === 'AI 待识别' ||
    report.title.startsWith('待识别健康资料')
  ) {
    return '待处理'
  }

  const haystack = [report.title, report.hospital, ...report.tags].join(' ')
  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    if (keywords.some((keyword) => haystack.includes(keyword))) {
      return category as CategoryTab
    }
  }
  return '其他'
}

const groupByMonth = (reports: Report[]) => {
  const map = new Map<string, Report[]>()
  reports.forEach((report) => {
    const key = dayjs(report.reportDate).format('YYYY年MM月')
    if (!map.has(key)) map.set(key, [])
    map.get(key)?.push(report)
  })
  return Array.from(map.entries()).sort(
    ([monthA], [monthB]) => dayjs(monthB).valueOf() - dayjs(monthA).valueOf(),
  )
}

export const ArchivePage: React.FC = () => {
  const { reports } = useAppState()
  const navigate = useNavigate()
  const { setHeaderConfig } = useOutletContext<AppShellContextValue>()
  const [activeCategory, setActiveCategory] = useState<CategoryTab>('全部')
  const [searchTerm, setSearchTerm] = useState('')
  const [view, setView] = useState<'library' | 'timeline'>('library')

  useEffect(() => {
    setHeaderConfig({
      accent: 'light',
    })
  }, [setHeaderConfig])

  const reportsWithCategory = useMemo(
    () =>
      reports.map((report) => ({
        report,
        category: inferCategory(report),
      })),
    [reports],
  )

  const categoryCounts = useMemo(() => {
    const counts = new Map<CategoryTab, number>()
    categoryTabs.forEach((category) => counts.set(category, 0))
    reportsWithCategory.forEach(({ category }) => {
      counts.set(category, (counts.get(category) ?? 0) + 1)
      counts.set('全部', (counts.get('全部') ?? 0) + 1)
    })
    return counts
  }, [reportsWithCategory])

  const filteredReports = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase()
    return reportsWithCategory
      .filter(({ report, category }) => {
        const matchCategory = activeCategory === '全部' || category === activeCategory
        const matchSearch =
          keyword.length === 0 ||
          report.title.toLowerCase().includes(keyword) ||
          report.hospital.toLowerCase().includes(keyword) ||
          report.tags.some((tag) => tag.toLowerCase().includes(keyword))
        return matchCategory && matchSearch
      })
      .map(({ report }) => report)
      .sort((a, b) => dayjs(b.reportDate).valueOf() - dayjs(a.reportDate).valueOf())
  }, [reportsWithCategory, activeCategory, searchTerm])

  const groupedReports = useMemo(() => groupByMonth(filteredReports), [filteredReports])

  return (
    <div className="space-y-5 bg-slate-50 px-4 pb-12 pt-5 md:px-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">健康资料库</h1>
          <p className="mt-1 text-sm text-slate-500">按分类、来源和时间整理报告资料。</p>
        </div>
        <button
          onClick={() => navigate('/import')}
          className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white transition hover:bg-primary-dark"
        >
          导入
        </button>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 focus-within:border-primary focus-within:bg-white focus-within:ring-2 focus-within:ring-primary/10">
          <FaSearch className="mr-2" />
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="搜索标题、医院、标签..."
            className="flex-1 border-0 bg-transparent p-0 text-sm focus:ring-0"
          />
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="grid grid-cols-4 gap-2">
          {categoryTabs.map((category) => (
            <button
              key={category}
              onClick={() => setActiveCategory(category)}
              className={clsx(
                'rounded-lg border px-2 py-3 text-center transition',
                activeCategory === category
                  ? 'border-primary bg-primary text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-primary hover:text-primary',
              )}
            >
              <span className="block text-sm font-semibold">{category}</span>
              <span className="mt-1 block text-xs opacity-70">
                {categoryCounts.get(category) ?? 0}
              </span>
            </button>
          ))}
        </div>
      </section>

      <div className="flex items-center justify-between">
        <div className="flex rounded-lg bg-white p-1 shadow-sm">
          <button
            onClick={() => setView('library')}
            className={clsx(
              'rounded-md px-3 py-2 text-sm font-semibold transition',
              view === 'library' ? 'bg-slate-900 text-white' : 'text-slate-500',
            )}
          >
            分类库
          </button>
          <button
            onClick={() => setView('timeline')}
            className={clsx(
              'rounded-md px-3 py-2 text-sm font-semibold transition',
              view === 'timeline' ? 'bg-slate-900 text-white' : 'text-slate-500',
            )}
          >
            时间线
          </button>
        </div>
        <span className="text-xs font-semibold text-slate-400">
          {filteredReports.length} 份资料
        </span>
      </div>

      {view === 'library' ? (
        <div className="space-y-3">
          {filteredReports.length > 0 ? (
            filteredReports.map((report) => {
              const category = inferCategory(report)
              return (
                <button
                  key={report.id}
                  onClick={() => navigate(`/reports/${report.id}`)}
                  className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 text-left transition hover:border-primary hover:shadow-sm"
                >
                  <div
                    className={clsx(
                      'flex h-11 w-11 items-center justify-center rounded-lg',
                      category === '待处理'
                        ? 'bg-amber-50 text-amber-600'
                        : 'bg-blue-50 text-blue-600',
                    )}
                  >
                    {category === '待处理' ? <FaClock /> : <FaFileMedical />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
                        {category}
                      </span>
                      <span className="text-xs text-slate-400">
                        {dayjs(report.reportDate).format('YYYY-MM-DD')}
                      </span>
                    </div>
                    <p className="mt-2 truncate text-sm font-semibold text-slate-900">
                      {report.title}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{report.hospital}</p>
                  </div>
                  <FaChevronRight className="text-slate-300" />
                </button>
              )
            })
          ) : (
            <button
              onClick={() => navigate('/import')}
              className="flex w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500 transition hover:border-primary hover:text-primary"
            >
              <FaFolderOpen className="text-2xl" />
              <span className="text-sm font-semibold">当前分类还没有资料</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {groupedReports.map(([month, monthReports]) => (
            <div key={month} className="space-y-3 border-l-2 border-slate-200 pl-4">
              <div className="text-xs font-semibold text-slate-400">{month}</div>
              {monthReports.map((report) => (
                <button
                  key={report.id}
                  onClick={() => navigate(`/reports/${report.id}`)}
                  className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 text-left transition hover:border-primary hover:shadow-sm"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                    <FaFileMedical />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{report.title}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {dayjs(report.reportDate).format('YYYY-MM-DD')} · {report.hospital}
                    </p>
                  </div>
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-500">
                    {inferCategory(report)}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
