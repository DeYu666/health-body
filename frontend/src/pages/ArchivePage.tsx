import clsx from 'classnames'
import dayjs from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import { FaChevronRight, FaFilter, FaSearch } from 'react-icons/fa'
import { useNavigate, useOutletContext } from 'react-router-dom'
import type { AppShellContextValue } from '../components/layout/AppShell'
import { useAppState } from '../context/AppStateContext'
import type { Report } from '../types'

const filterChips = ['全部', '血常规', 'CT', 'B超', '体检', '协和医院', '2024年'] as const
type FilterChip = (typeof filterChips)[number]

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
  const [activeFilter, setActiveFilter] = useState<FilterChip>('全部')
  const [searchTerm, setSearchTerm] = useState('')
  const [view, setView] = useState<'timeline' | 'grid'>('timeline')

  useEffect(() => {
    setHeaderConfig({
      accent: 'light',
    })
  }, [setHeaderConfig])

  const filteredReports = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase()
    return reports.filter((report) => {
      const matchFilter =
        activeFilter === '全部' ||
        report.tags.includes(activeFilter) ||
        report.hospital.includes(activeFilter.replace('医院', '医院')) ||
        dayjs(report.reportDate).format('YYYY年') === activeFilter

      const matchSearch =
        keyword.length === 0 ||
        report.title.toLowerCase().includes(keyword) ||
        report.hospital.toLowerCase().includes(keyword) ||
        report.tags.some((tag) => tag.toLowerCase().includes(keyword))

      return matchFilter && matchSearch
    })
  }, [reports, activeFilter, searchTerm])

  const groupedReports = useMemo(() => groupByMonth(filteredReports), [filteredReports])

  return (
    <div className="space-y-6 bg-white px-4 pb-12 pt-6 md:px-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">我的档案</h1>
        <div className="flex gap-2">
          <button className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition hover:bg-primary/10 hover:text-primary">
            <FaSearch />
          </button>
          <button className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition hover:bg-primary/10 hover:text-primary">
            <FaFilter />
          </button>
        </div>
      </div>

      <div>
        <label className="sr-only">搜索报告</label>
        <div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
          <FaSearch className="mr-3" />
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="搜索报告标题、医院、标签..."
            className="flex-1 bg-transparent outline-none"
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center rounded-full bg-slate-100 p-1">
          <button
            onClick={() => setView('timeline')}
            className={clsx(
              'rounded-full px-4 py-2 text-sm font-semibold transition',
              view === 'timeline' ? 'bg-white text-primary shadow-sm' : 'text-slate-500',
            )}
          >
            时间线
          </button>
          <button
            onClick={() => setView('grid')}
            className={clsx(
              'rounded-full px-4 py-2 text-sm font-semibold transition',
              view === 'grid' ? 'bg-white text-primary shadow-sm' : 'text-slate-500',
            )}
          >
            卡片
          </button>
        </div>
        <span className="text-xs font-semibold text-slate-400">
          共 {filteredReports.length} 份报告
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {filterChips.map((chip) => (
          <button
            key={chip}
            onClick={() => setActiveFilter(chip)}
            className={clsx(
              'rounded-full px-4 py-2 text-sm font-semibold transition',
              activeFilter === chip
                ? 'bg-primary text-white shadow-card'
                : 'bg-slate-100 text-slate-500 hover:bg-primary/10 hover:text-primary',
            )}
          >
            {chip}
          </button>
        ))}
      </div>

      {view === 'timeline' ? (
        <div className="space-y-4">
          {groupedReports.map(([month, monthReports]) => (
            <div key={month} className="space-y-3 border-l-2 border-slate-100 pl-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                {month}
              </div>
              {monthReports.map((report) => (
                <button
                  key={report.id}
                  onClick={() => navigate(`/reports/${report.id}`)}
                  className="flex w-full items-center gap-3 rounded-2xl bg-slate-50 p-4 text-left shadow-sm transition hover:-translate-y-[1px] hover:bg-slate-100"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    {report.fileType === 'pdf' ? 'PDF' : 'IMG'}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-900">{report.title}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {dayjs(report.reportDate).format('YYYY-MM-DD')} · {report.hospital} ·{' '}
                      {report.fileSizeMb.toFixed(1)} MB
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {report.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold text-primary"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <FaChevronRight className="text-slate-300" />
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredReports.map((report) => (
            <button
              key={report.id}
              onClick={() => navigate(`/reports/${report.id}`)}
              className="flex flex-col gap-3 rounded-2xl bg-slate-50 p-4 text-left shadow-card transition hover:-translate-y-[1px] hover:shadow-card-hover"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="rounded-lg bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                    {report.fileType === 'pdf' ? 'PDF' : '图像'}
                  </span>
                  <span className="text-xs text-slate-400">
                    {dayjs(report.reportDate).format('YYYY-MM-DD')}
                  </span>
                </div>
                <span className="text-xs font-semibold text-slate-400">
                  {report.fileSizeMb.toFixed(1)} MB
                </span>
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">{report.title}</h3>
                <p className="mt-1 text-sm text-slate-500">{report.hospital}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {report.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold text-primary"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

