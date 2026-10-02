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
import { getMetricLabel, metricLabels } from '../data/mockMetrics'

type TimeRange = 'day' | 'week' | 'month' | 'year' | 'all'

const defaultMetricTabs: { value: MetricType; label: string }[] = [
  { value: 'weight', label: '体重' },
  { value: 'blood-pressure', label: '血压' },
  { value: 'blood-sugar', label: '血糖' },
  { value: 'heart-rate', label: '心率' },
  { value: 'temperature', label: '体温' },
]

const rangeOptions: { value: TimeRange; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'day', label: '日' },
  { value: 'week', label: '周' },
  { value: 'month', label: '月' },
  { value: 'year', label: '年' },
]

const formatTrendValue = (value: number, metricType?: string) => {
  if (metricType === 'weight') return value.toFixed(1)
  if (Math.abs(value) < 1) return value.toFixed(3)
  if (Math.abs(value) < 10) return value.toFixed(1)
  return value.toFixed(0)
}

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
    current: formatTrendValue(currentValue, series.metricType),
    unit: series.unit,
    min: formatTrendValue(min, series.metricType),
    max: formatTrendValue(max, series.metricType),
    avg: formatTrendValue(avg, series.metricType),
  }
}

export const MetricTrendPage: React.FC = () => {
  const { metricSeries } = useAppState()
  const { setHeaderConfig } = useOutletContext<AppShellContextValue>()
  const navigate = useNavigate()
  const [activeMetric, setActiveMetric] = useState<MetricType>('weight')
  const [range, setRange] = useState<TimeRange>('all')

  useEffect(() => {
    setHeaderConfig({
      accent: 'light',
    })
  }, [setHeaderConfig])

  const seriesMap = useMemo(() => {
    const amount = range === 'day' ? 1 : range === 'week' ? 7 : range === 'month' ? 30 : 365
    const start = dayjs().subtract(amount, 'day')
    const map = new Map<MetricType, MetricSeries>()
    metricSeries.forEach((series) => map.set(series.metricType, {
      ...series,
      data: range === 'all' ? series.data : series.data.filter((point) => dayjs(point.recordedAt).isAfter(start)),
    }))
    return map
  }, [metricSeries, range])

  const metricTabs = useMemo(() => {
    const defaultTypes = new Set(defaultMetricTabs.map((tab) => tab.value))
    const dynamicTabs = metricSeries
      .filter((series) => series.data.length > 0 && !defaultTypes.has(series.metricType))
      .map((series) => ({
        value: series.metricType,
        label: getMetricLabel(series.metricType),
      }))
    return [...defaultMetricTabs.filter((tab) => metricSeries.some((series) => series.metricType === tab.value && series.data.length > 0)), ...dynamicTabs]
  }, [metricSeries])

  useEffect(() => {
    if (metricSeries.length > 0 && !seriesMap.has(activeMetric)) {
      setActiveMetric(metricSeries[0].metricType)
    }
  }, [activeMetric, metricSeries, seriesMap])

  const activeSeries = seriesMap.get(activeMetric)
  const summary = getSummary(activeSeries)

  const lineData = useMemo(() => {
    if (!activeSeries?.data.length) return undefined
    return {
      labels: activeSeries.data.map((point) => dayjs(point.recordedAt).format('MM-DD')),
      datasets: [
        {
          label: getMetricLabel(activeSeries.metricType),
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
    if (!bloodPressureSeries?.data.length) return undefined
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
          data: bloodPressureSeries.data.map((point) => point.secondaryValue ?? null),
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 3,
        },
      ],
    }
  }, [bloodPressureSeries])

  const hasHighBloodSugar = useMemo(
    () => bloodSugarSeries?.data.some((point) => point.value > 7) ?? false,
    [bloodSugarSeries],
  )

  const bloodSugarChart = useMemo(() => {
    if (!bloodSugarSeries?.data.length) return undefined
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
    <div className="mx-auto max-w-7xl space-y-6 bg-slate-50 px-4 pb-14 pt-5 md:px-6 lg:px-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">我的指标</h1>
        <button
          onClick={() => navigate('/metrics/new')}
          className="flex items-center gap-2 rounded-lg bg-secondary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-600"
        >
          <FaPlus />
          记录指标
        </button>
      </div>

      <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
        <FaInfoCircle className="text-primary" />
        <span>
          当前展示 OCR 报告抽取与手动记录的数据，并按所选时间范围过滤。
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
                ? 'bg-primary text-white shadow-sm'
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
              'flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition',
              range === option.value
                ? 'border-primary bg-primary text-white'
                : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-primary hover:text-primary',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <section className="space-y-4 rounded-lg bg-slate-50 p-4">
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
              {metricLabels[activeMetric]?.description ?? '来自报告抽取、设备同步或手动补录的趋势数据。'}
            </p>
          </div>
          <div className="rounded-lg bg-white px-4 py-3 text-xs text-slate-500 shadow-inner">
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
        <div className="h-64 overflow-hidden rounded-lg bg-white p-2 shadow-sm">
          {lineData ? <Line data={lineData} options={baseLineOptions} /> : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-slate-500">
              <p>{metricSeries.length ? '这个时间范围内没有记录' : '还没有身体指标记录'}</p>
              <button type="button" onClick={() => range !== 'all' ? setRange('all') : navigate('/import')} className="font-semibold text-primary">
                {range !== 'all' ? '查看全部时间' : '导入报告或健康数据'}
              </button>
            </div>
          )}
        </div>
      </section>

      {bloodPressureChart ? <section className="space-y-4 rounded-lg bg-slate-50 p-4">
        <h2 className="text-sm font-semibold text-slate-600">血压趋势</h2>
        <p className="text-xs text-slate-500">未记录的舒张压留空，不推算缺失值。</p>
        <div className="h-60 overflow-hidden rounded-lg bg-white p-4 shadow-sm">
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
      </section> : null}

      {bloodSugarChart ? <section className="space-y-4 rounded-lg bg-slate-50 p-4">
        <h2 className="text-sm font-semibold text-slate-600">血糖趋势</h2>
        <div className="h-60 overflow-hidden rounded-lg bg-white p-4 shadow-sm">
          {bloodSugarChart ? (
            <Line data={bloodSugarChart} options={baseLineOptions} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              暂无血糖数据
            </div>
          )}
        </div>
        {hasHighBloodSugar ? (
          <div className="flex items-start gap-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
            <FaExclamationTriangle className="mt-1" />
            <div>
              <p className="font-semibold">检测到高于 7.0 mmol/L 的血糖记录</p>
              <p className="mt-1 text-xs">
                请结合测量时间、饮食和医生建议判断，系统提示仅用于资料整理。
              </p>
            </div>
          </div>
        ) : null}
      </section> : null}
    </div>
  )
}
