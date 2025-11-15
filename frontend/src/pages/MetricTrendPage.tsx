import clsx from 'classnames'
import dayjs from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import { FaExclamationTriangle, FaInfoCircle, FaPlus } from 'react-icons/fa'
import { Line } from 'react-chartjs-2'
import { useNavigate, useOutletContext } from 'react-router-dom'
import type { AppShellContextValue } from '../components/layout/AppShell'
import { useAppState } from '../context/AppStateContext'
import { baseLineOptions } from '../lib/chartConfig'
import type { MetricSeries, MetricType } from '../types'
import { metricLabels } from '../data/mockMetrics'

type TimeRange = 'day' | 'week' | 'month' | 'year'

const metricTabs: { value: MetricType; label: string }[] = [
  { value: 'weight', label: '体重' },
  { value: 'blood-pressure', label: '血压' },
  { value: 'blood-sugar', label: '血糖' },
  { value: 'heart-rate', label: '心率' },
  { value: 'temperature', label: '体温' },
]

const rangeOptions: { value: TimeRange; label: string }[] = [
  { value: 'day', label: '日' },
  { value: 'week', label: '周' },
  { value: 'month', label: '月' },
  { value: 'year', label: '年' },
]

const getSummary = (series?: MetricSeries) => {
  if (!series || series.data.length === 0) {
    return {
      current: '—',
      unit: series?.unit ?? '',
      min: '—',
      max: '—',
      avg: '—',
    }
  }
  const values = series.data.map((point) => point.value)
  const currentValue = series.data[series.data.length - 1]?.value
  const min = Math.min(...values)
  const max = Math.max(...values)
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length
  return {
    current: currentValue.toFixed(1),
    unit: series.unit,
    min: min.toFixed(1),
    max: max.toFixed(1),
    avg: avg.toFixed(1),
  }
}

export const MetricTrendPage: React.FC = () => {
  const { metricSeries } = useAppState()
  const { setHeaderConfig } = useOutletContext<AppShellContextValue>()
  const navigate = useNavigate()
  const [activeMetric, setActiveMetric] = useState<MetricType>('weight')
  const [range, setRange] = useState<TimeRange>('week')

  useEffect(() => {
    setHeaderConfig({
      accent: 'light',
    })
  }, [setHeaderConfig])

  const seriesMap = useMemo(() => {
    const map = new Map<MetricType, MetricSeries>()
    metricSeries.forEach((series) => map.set(series.metricType, series))
    return map
  }, [metricSeries])

  const activeSeries = seriesMap.get(activeMetric)
  const summary = getSummary(activeSeries)

  const lineData = useMemo(() => {
    if (!activeSeries) return undefined
    return {
      labels: activeSeries.data.map((point) => dayjs(point.recordedAt).format('MM-DD')),
      datasets: [
        {
          label: metricLabels[activeSeries.metricType]?.label ?? '指标',
          data: activeSeries.data.map((point) => point.value),
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.15)',
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointHoverRadius: 6,
        },
      ],
    }
  }, [activeSeries])

  const bloodPressureSeries = seriesMap.get('blood-pressure')
  const bloodSugarSeries = seriesMap.get('blood-sugar')

  const bloodPressureChart = useMemo(() => {
    if (!bloodPressureSeries) return undefined
    return {
      labels: bloodPressureSeries.data.map((point) => dayjs(point.recordedAt).format('MM-DD')),
      datasets: [
        {
          label: '收缩压',
          data: bloodPressureSeries.data.map((point) => point.value),
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 3,
        },
        {
          label: '舒张压',
          data: bloodPressureSeries.data.map((point) => point.secondaryValue ?? point.value - 40),
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 3,
        },
      ],
    }
  }, [bloodPressureSeries])

  const bloodSugarChart = useMemo(() => {
    if (!bloodSugarSeries) return undefined
    return {
      labels: bloodSugarSeries.data.map((point) => dayjs(point.recordedAt).format('MM-DD')),
      datasets: [
        {
          label: '血糖',
          data: bloodSugarSeries.data.map((point) => point.value),
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245, 158, 11, 0.12)',
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointHoverRadius: 6,
        },
      ],
    }
  }, [bloodSugarSeries])

  return (
    <div className="space-y-6 bg-white px-4 pb-14 pt-6 md:px-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">我的指标</h1>
        <button
          onClick={() => navigate('/metrics/new')}
          className="flex items-center gap-2 rounded-xl bg-secondary px-4 py-2 text-sm font-semibold text-white shadow-card transition hover:bg-emerald-600"
        >
          <FaPlus />
          录入
        </button>
      </div>

      <div className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
        <FaInfoCircle className="text-primary" />
        <span>
          持续记录体征数据，系统会自动标记异常波动并生成趋势洞察。
        </span>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {metricTabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveMetric(tab.value)}
            className={clsx(
              'whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition',
              activeMetric === tab.value
                ? 'bg-primary text-white shadow-card'
                : 'bg-slate-100 text-slate-500 hover:bg-primary/10 hover:text-primary',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        {rangeOptions.map((option) => (
          <button
            key={option.value}
            onClick={() => setRange(option.value)}
            className={clsx(
              'flex-1 rounded-xl border px-3 py-2 text-sm font-semibold transition',
              range === option.value
                ? 'border-primary bg-primary text-white'
                : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-primary hover:text-primary',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <section className="space-y-4 rounded-2xl bg-slate-50 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">
              当前值
            </p>
            <p className="mt-2 text-3xl font-semibold text-primary">
              {summary.current}
              <span className="ml-1 text-base text-slate-400">{summary.unit}</span>
            </p>
            <p className="mt-2 text-xs text-slate-400">
              {metricLabels[activeMetric]?.description}
            </p>
          </div>
          <div className="rounded-xl bg-white px-4 py-3 text-xs text-slate-500 shadow-inner">
            <p>
              最低值 <span className="ml-2 text-sm font-semibold text-slate-900">{summary.min}</span>
            </p>
            <p className="mt-2">
              最高值 <span className="ml-2 text-sm font-semibold text-slate-900">{summary.max}</span>
            </p>
            <p className="mt-2">
              平均值{' '}
              <span className="ml-2 text-sm font-semibold text-slate-900">{summary.avg}</span>
            </p>
          </div>
        </div>
        <div className="h-64 overflow-hidden rounded-2xl bg-white p-2 shadow-card">
          {lineData ? <Line data={lineData} options={baseLineOptions} /> : null}
        </div>
      </section>

      <section className="space-y-4 rounded-2xl bg-slate-50 p-4">
        <h2 className="text-sm font-semibold text-slate-600">血压趋势</h2>
        <div className="h-60 overflow-hidden rounded-2xl bg-white p-4 shadow-card">
          {bloodPressureChart ? (
            <Line
              data={bloodPressureChart}
              options={{
                ...baseLineOptions,
                plugins: { ...baseLineOptions.plugins, legend: { display: true, position: 'bottom' } },
              }}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              暂无血压数据
            </div>
          )}
        </div>
      </section>

      <section className="space-y-4 rounded-2xl bg-slate-50 p-4">
        <h2 className="text-sm font-semibold text-slate-600">血糖趋势</h2>
        <div className="h-60 overflow-hidden rounded-2xl bg-white p-4 shadow-card">
          {bloodSugarChart ? (
            <Line data={bloodSugarChart} options={baseLineOptions} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              暂无血糖数据
            </div>
          )}
        </div>
        <div className="flex items-start gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <FaExclamationTriangle className="mt-1" />
          <div>
            <p className="font-semibold">检测到 3 次异常值，建议咨询医生</p>
            <p className="mt-1 text-xs">
              若连续出现高于 7.0 mmol/L 的情况，请记录饮食并与内分泌科医生联系。
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}

