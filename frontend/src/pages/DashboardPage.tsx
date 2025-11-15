import dayjs from 'dayjs'
import { useEffect, useMemo } from 'react'
import { FaBell, FaCamera, FaCheckCircle, FaCloudUploadAlt, FaInfoCircle } from 'react-icons/fa'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { useAppState } from '../context/AppStateContext'
import type { AppShellContextValue } from '../components/layout/AppShell'
import type { MetricSeries } from '../types'

const QuickMetricCard = ({
  label,
  value,
  unit,
  trendText,
  trendState,
}: {
  label: string
  value: string
  unit?: string
  trendText?: string
  trendState?: 'positive' | 'warning' | 'neutral'
}) => {
  const trendColor =
    trendState === 'positive'
      ? 'text-emerald-500'
      : trendState === 'warning'
        ? 'text-amber-500'
        : 'text-slate-400'
  return (
    <div className="rounded-2xl bg-white p-4 shadow-card transition hover:shadow-card-hover">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-3 flex items-baseline gap-1">
        <span className="text-3xl font-semibold text-primary">{value}</span>
        {unit ? <span className="text-sm text-slate-500">{unit}</span> : null}
      </div>
      {trendText ? (
        <div className={`mt-2 flex items-center gap-2 text-xs font-semibold ${trendColor}`}>
          <FaCheckCircle className="text-xs" />
          <span>{trendText}</span>
        </div>
      ) : null}
    </div>
  )
}

const getLatestValue = (series?: MetricSeries) => series?.data[series.data.length - 1]

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate()
  const { reports, metricSeries } = useAppState()
  const { setHeaderConfig } = useOutletContext<AppShellContextValue>()

  const weightSeries = metricSeries.find((series) => series.metricType === 'weight')
  const bpSeries = metricSeries.find((series) => series.metricType === 'blood-pressure')
  const sugarSeries = metricSeries.find((series) => series.metricType === 'blood-sugar')
  const heartRateSeries = metricSeries.find((series) => series.metricType === 'heart-rate')

  const quickMetrics = useMemo(
    () => [
      {
        id: 'weight',
        label: '体重',
        value: `${getLatestValue(weightSeries)?.value?.toFixed(1) ?? '—'}`,
        unit: 'kg',
        trendText: '较上周 -0.5 kg',
        trendState: 'positive' as const,
      },
      {
        id: 'blood-pressure',
        label: '血压',
        value: `${getLatestValue(bpSeries)?.value ?? '—'}/${getLatestValue(bpSeries)?.secondaryValue ?? '—'}`,
        unit: 'mmHg',
        trendText: '状态良好',
        trendState: 'positive' as const,
      },
      {
        id: 'blood-sugar',
        label: '血糖',
        value: `${getLatestValue(sugarSeries)?.value?.toFixed(1) ?? '—'}`,
        unit: 'mmol/L',
        trendText: '近 3 次偏高请关注',
        trendState: 'warning' as const,
      },
      {
        id: 'heart-rate',
        label: '心率',
        value: `${getLatestValue(heartRateSeries)?.value ?? '—'}`,
        unit: '次/分',
        trendText: '静息心率稳定',
        trendState: 'positive' as const,
      },
    ],
    [weightSeries, bpSeries, sugarSeries, heartRateSeries],
  )

  const recentReports = useMemo(
    () =>
      [...reports]
        .sort(
          (a, b) =>
            dayjs(b.reportDate).valueOf() - dayjs(a.reportDate).valueOf(),
        )
        .slice(0, 4),
    [reports],
  )

  useEffect(() => {
    setHeaderConfig({
      accent: 'light',
    })
  }, [setHeaderConfig])

  return (
    <div className="space-y-6 bg-white px-4 pb-10 pt-6 md:px-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">你好，张先生</h1>
          <p className="mt-1 text-sm text-slate-500">今天感觉如何？汇总已更新。</p>
        </div>
        <button className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-primary hover:text-white">
          <FaBell />
        </button>
      </div>

      <div className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
        <FaInfoCircle className="text-primary" />
        <span>您的数据已加密存储，仅您可访问。</span>
      </div>

      <section>
        <div className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          快捷操作
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <button
            onClick={() => navigate('/upload')}
            className="flex flex-col items-center gap-2 rounded-2xl bg-white p-5 text-primary shadow-card transition hover:-translate-y-[2px] hover:shadow-card-hover"
          >
            <FaCamera className="text-2xl" />
            <span className="text-xs font-semibold text-slate-700">拍照上传</span>
            <span className="text-[11px] text-slate-400">支持 jpg / png</span>
          </button>
          <button
            onClick={() => navigate('/upload')}
            className="flex flex-col items-center gap-2 rounded-2xl bg-white p-5 text-primary shadow-card transition hover:-translate-y-[2px] hover:shadow-card-hover"
          >
            <FaCloudUploadAlt className="text-2xl" />
            <span className="text-xs font-semibold text-slate-700">上传文件</span>
            <span className="text-[11px] text-slate-400">支持 pdf 最大 50 MB</span>
          </button>
          <button
            onClick={() => navigate('/metrics/new')}
            className="flex flex-col items-center gap-2 rounded-2xl bg-white p-5 text-primary shadow-card transition hover:-translate-y-[2px] hover:shadow-card-hover"
          >
            <span className="text-2xl font-bold">＋</span>
            <span className="text-xs font-semibold text-slate-700">录入指标</span>
            <span className="text-[11px] text-slate-400">体重 / 血压 / 血糖</span>
          </button>
        </div>
      </section>

      <section>
        <div className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          常用指标
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {quickMetrics.map((metric) => (
            <QuickMetricCard key={metric.id} {...metric} />
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            最近上传
          </div>
          <button
            onClick={() => navigate('/archive')}
            className="text-xs font-semibold text-primary transition hover:text-primary-dark"
          >
            查看全部
          </button>
        </div>
        <div className="mt-4 space-y-3">
          {recentReports.map((report) => (
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
                <div className="mt-2 flex flex-wrap gap-1">
                  {report.tags.slice(0, 2).map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

