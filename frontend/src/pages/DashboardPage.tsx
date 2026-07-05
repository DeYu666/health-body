import dayjs from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import {
  FaArrowRight,
  FaBell,
  FaBrain,
  FaCheckCircle,
  FaClipboardCheck,
  FaExclamationTriangle,
  FaFileMedical,
  FaPaperPlane,
} from 'react-icons/fa'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { useAppState } from '../context/AppStateContext'
import { useAuth } from '../context/AuthContext'
import { getMetricLabel } from '../data/mockMetrics'
import type { AppShellContextValue } from '../components/layout/AppShell'
import type { MetricSeries } from '../types'

const getLatestValue = (series?: MetricSeries) => series?.data[series.data.length - 1]

const formatNumber = (value: number, metricType?: string) => {
  if (metricType === 'weight') return value.toFixed(1)
  if (Math.abs(value) < 1) return value.toFixed(3)
  if (Math.abs(value) < 10) return value.toFixed(1)
  return value.toFixed(0)
}

const formatMetricValue = (series?: MetricSeries) => {
  const latest = getLatestValue(series)
  if (!latest) return null
  if (series?.metricType === 'blood-pressure') {
    return `${latest.value}/${latest.secondaryValue ?? '--'} ${series.unit}`
  }
  return `${formatNumber(Number(latest.value), series?.metricType)} ${series?.unit ?? ''}`.trim()
}

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { reports, metricSeries } = useAppState()
  const { setHeaderConfig } = useOutletContext<AppShellContextValue>()
  const [aiInput, setAiInput] = useState('')

  const pendingReports = useMemo(
    () =>
      reports.filter(
        (report) =>
          report.tags.includes('AI待处理') ||
          report.hospital === 'AI 待识别' ||
          report.title.startsWith('待识别健康资料'),
      ),
    [reports],
  )

  const latestReports = useMemo(
    () =>
      [...reports]
        .sort((a, b) => dayjs(b.reportDate).valueOf() - dayjs(a.reportDate).valueOf())
        .slice(0, 4),
    [reports],
  )

  const quickMetrics = useMemo(() => {
    return metricSeries
      .map((series) => ({
        id: series.metricType,
        label: getMetricLabel(series.metricType),
        value: formatMetricValue(series),
      }))
      .filter((metric) => metric.value)
      .slice(0, 4)
  }, [metricSeries])

  const insights = useMemo(() => {
    const items = []
    if (pendingReports.length > 0) {
      items.push({
        id: 'pending',
        tone: 'warning' as const,
        title: `${pendingReports.length} 份资料等待 AI 整理`,
        detail: '可在档案页触发 OCR/AI 解析，低置信度字段再确认。',
        action: '去档案查看',
        path: '/archive',
      })
    }
    if (reports.length > 0) {
      const latest = latestReports[0]
      items.push({
        id: 'latest',
        tone: 'normal' as const,
        title: `最近资料：${latest.title}`,
        detail: `${dayjs(latest.reportDate).format('YYYY-MM-DD')} · ${latest.hospital}`,
        action: '查看来源',
        path: `/reports/${latest.id}`,
      })
    }
    if (quickMetrics.length > 0) {
      items.push({
        id: 'metrics',
        tone: 'good' as const,
        title: `${quickMetrics.length} 项指标已有趋势数据`,
        detail: '趋势页会逐步合并报告抽取、设备读数和手动补录。',
        action: '看趋势',
        path: '/metrics/trends',
      })
    }
    if (items.length === 0) {
      items.push({
        id: 'empty',
        tone: 'normal' as const,
        title: '先导入第一份健康资料',
        detail: '上传体检报告、化验单或用一句话记录血压、体重等数据。',
        action: '开始导入',
        path: '/import',
      })
    }
    return items.slice(0, 3)
  }, [pendingReports.length, reports.length, latestReports, quickMetrics.length])

  useEffect(() => {
    setHeaderConfig({
      accent: 'light',
    })
  }, [setHeaderConfig])

  const handleAIAction = () => {
    if (aiInput.trim()) {
      navigate('/import', { state: { note: aiInput.trim() } })
      return
    }
    navigate('/import')
  }

  return (
    <div className="space-y-5 bg-slate-50 px-4 pb-10 pt-5 md:px-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {user?.displayName ? `${user.displayName}的健康态势` : '健康态势'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {dayjs().format('YYYY-MM-DD')} · 重点关注资料、指标和待确认事项。
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/archive', { state: { category: '待处理' } })}
          className="relative flex h-10 w-10 items-center justify-center rounded-lg bg-white text-slate-500 shadow-sm transition hover:bg-primary hover:text-white"
          aria-label="查看待处理资料"
          title="查看待处理资料"
        >
          <FaBell />
          {pendingReports.length > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
              {pendingReports.length > 9 ? '9+' : pendingReports.length}
            </span>
          ) : null}
        </button>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FaBrain />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-slate-900">AI 健康入口</h2>
            <p className="mt-1 text-xs text-slate-500">上传、拍照或直接记录一句话。</p>
          </div>
        </div>
        <div className="mt-4 flex items-end gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 focus-within:border-primary focus-within:bg-white focus-within:ring-2 focus-within:ring-primary/10">
          <textarea
            value={aiInput}
            onChange={(event) => setAiInput(event.target.value)}
            rows={2}
            placeholder="例如：今天早上血压 125/82，或帮我整理这份体检报告"
            className="min-h-[56px] flex-1 resize-none border-0 bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:ring-0"
          />
          <button
            type="button"
            onClick={handleAIAction}
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-white transition hover:bg-primary-dark"
            aria-label="发送到导入页"
          >
            <FaPaperPlane />
          </button>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">今日重点</h2>
          <span className="text-xs text-slate-400">可追溯到来源</span>
        </div>
        <div className="space-y-3">
          {insights.map((insight) => {
            const icon =
              insight.tone === 'warning'
                ? FaExclamationTriangle
                : insight.tone === 'good'
                  ? FaCheckCircle
                  : FaClipboardCheck
            const Icon = icon
            return (
              <button
                key={insight.id}
                onClick={() => navigate(insight.path)}
                className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 text-left transition hover:border-primary hover:shadow-sm"
              >
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                    insight.tone === 'warning'
                      ? 'bg-amber-50 text-amber-600'
                      : insight.tone === 'good'
                        ? 'bg-emerald-50 text-emerald-600'
                        : 'bg-blue-50 text-blue-600'
                  }`}
                >
                  <Icon />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">{insight.title}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{insight.detail}</p>
                </div>
                <div className="flex items-center gap-1 text-xs font-semibold text-primary">
                  {insight.action}
                  <FaArrowRight />
                </div>
              </button>
            )
          })}
        </div>
      </section>

      {quickMetrics.length > 0 ? (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">已有趋势</h2>
            <button
              onClick={() => navigate('/metrics/trends')}
              className="text-xs font-semibold text-primary"
            >
              全部指标
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {quickMetrics.map((metric) => (
              <div key={metric.id} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="text-xs font-semibold text-slate-400">{metric.label}</div>
                <div className="mt-2 text-xl font-semibold text-slate-900">{metric.value}</div>
                <div className="mt-2 text-xs text-slate-500">来源逐步接入报告和设备</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">健康时间线</h2>
          <button
            onClick={() => navigate('/archive')}
            className="text-xs font-semibold text-primary"
          >
            查看档案
          </button>
        </div>
        <div className="space-y-3">
          {latestReports.length > 0 ? (
            latestReports.map((report) => (
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
                  {report.tags[0] ?? '资料'}
                </span>
              </button>
            ))
          ) : (
            <button
              onClick={() => navigate('/import')}
              className="w-full rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm font-semibold text-slate-500 transition hover:border-primary hover:text-primary"
            >
              导入第一份报告或健康记录
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
