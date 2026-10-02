import { useEffect, useMemo, useRef, useState } from 'react'
import dayjs from 'dayjs'
import { Line } from 'react-chartjs-2'
import { Link, useOutletContext } from 'react-router-dom'
import { FaHeartbeat, FaFileImport } from 'react-icons/fa'
import type { AppShellContextValue } from '../components/layout/AppShell'
import { useAppState } from '../context/AppStateContext'
import { api } from '../lib/api'
import { baseLineOptions } from '../lib/chartConfig'
import type { WearableDay, WearableImportResult } from '../types'

const labels: Record<string, string> = {
  'heart-rate': '心率', 'resting-heart-rate': '静息心率', 'walking-heart-rate': '步行平均心率',
  'heart-rate-variability': '心率变异性 SDNN', weight: '体重', 'body-fat': '体脂率',
  'oxygen-saturation': '血氧饱和度', steps: '步数', 'active-energy': '活动能量',
}
const seriesKey = (point: WearableDay) => JSON.stringify([point.metricType, point.source, point.device, point.unit])
const format = (value: number) => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value)

export function HealthDataPage() {
  const { selectedMemberId, activeMember } = useAppState()
  const { setHeaderConfig } = useOutletContext<AppShellContextValue>()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<WearableImportResult | null>(null)
  const [receipt, setReceipt] = useState<WearableImportResult | null>(null)
  const [busy, setBusy] = useState<'preview' | 'import' | null>(null)
  const [error, setError] = useState('')
  const [dataError, setDataError] = useState('')
  const [loading, setLoading] = useState(false)
  const [days, setDays] = useState<WearableDay[]>([])
  const [start, setStart] = useState(dayjs().subtract(30, 'day').format('YYYY-MM-DD'))
  const [end, setEnd] = useState(dayjs().format('YYYY-MM-DD'))
  const [selectedSeries, setSelectedSeries] = useState('')
  const [revision, setRevision] = useState(0)
  const generation = useRef(0)

  useEffect(() => { setHeaderConfig({ title: '日常身体数据', showBackButton: true }) }, [setHeaderConfig])
  useEffect(() => {
    generation.current++
    setPreview(null)
    setReceipt(null)
    setBusy(null)
    setError('')
  }, [selectedMemberId])

  useEffect(() => {
    let current = true
    setDays([])
    setLoading(false)
    setDataError('')
    if (!selectedMemberId) return
    if (!dayjs(start).isValid() || !dayjs(end).isValid() || end < start || dayjs(end).diff(dayjs(start), 'day') > 366) {
      setDataError('请选择一年以内的有效日期范围')
      return
    }
    setLoading(true)
    api.listWearableDays(selectedMemberId, start, end)
      .then((items) => { if (current) setDays(items) })
      .catch((err) => { if (current) setDataError(err instanceof Error ? err.message : '读取失败') })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [selectedMemberId, start, end, revision])

  const groups = useMemo(() => {
    const result = new Map<string, WearableDay[]>()
    days.forEach((point) => {
      const key = seriesKey(point)
      result.set(key, [...(result.get(key) ?? []), point])
    })
    return result
  }, [days])
  const key = groups.has(selectedSeries) ? selectedSeries : groups.keys().next().value ?? ''
  const points = groups.get(key) ?? []
  const latest = points.at(-1)
  const cumulative = latest?.metricType === 'steps' || latest?.metricType === 'active-energy'
  const chart = {
    labels: points.map((point) => point.date),
    datasets: [{ label: latest ? `${labels[latest.metricType]} · ${latest.unit}` : '', data: points.map((point) => point.value),
      borderColor: '#0891b2', backgroundColor: 'rgba(8,145,178,0.08)', fill: true, tension: 0, pointRadius: 3 }],
  }

  const receive = async (mode: 'preview' | 'import') => {
    if (!file || !selectedMemberId || busy) return
    if (mode === 'import' && !preview) return
    const version = generation.current
    setBusy(mode)
    setError('')
    try {
      const result = await api.importAppleHealth(file, selectedMemberId, mode)
      if (generation.current !== version) return
      if (mode === 'preview') {
        setPreview(result)
      } else {
        setReceipt(result)
        setPreview(null)
        if (result.endDate) {
          setEnd(result.endDate)
          setStart(dayjs(result.endDate).subtract(30, 'day').format('YYYY-MM-DD'))
        }
        setRevision((value) => value + 1)
      }
    } catch (err) {
      if (generation.current === version) setError(err instanceof Error ? err.message : '读取失败，请重试')
    } finally {
      if (generation.current === version) setBusy(null)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-5 md:px-6">
      <section className="rounded-lg border border-cyan-200 bg-cyan-50 p-5">
        <div className="flex items-center gap-3"><FaHeartbeat className="text-2xl text-cyan-700" /><h1 className="text-xl font-semibold text-slate-900">报告之外，看看日常身体变化</h1></div>
        <p className="mt-3 text-sm leading-6 text-slate-600">为{activeMember?.name ?? '当前成员'}导入 Apple 健康记录。心率、身体测量和活动按来源分别查看，保留记录日期。</p>
        <p className="mt-2 text-xs text-slate-500">当前支持手动导入历史快照；浏览器不会直接读取手表，也不会自动同步。</p>
      </section>

      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="flex items-center gap-2 font-semibold text-slate-900"><FaFileImport />导入 Apple 健康导出文件</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm leading-6 text-slate-600">
          <li>iPhone 打开“健康”，进入头像，选择“导出所有健康数据”。</li>
          <li>存入“文件”，在这里选择导出的 ZIP 或解压后的 XML。</li>
          <li>核对归属成员和数据范围，再确认保存。</li>
        </ol>
        <a href="https://support.apple.com/guide/iphone/share-your-health-data-iph5ede58c3d/ios" target="_blank" rel="noreferrer" className="inline-block text-xs font-semibold text-primary">Apple 官方导出说明 ↗</a>
        <label className="block rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm">
          <span className="mb-2 block font-semibold text-slate-700">归属：{activeMember?.name ?? '请先选择成员'}</span>
          <input type="file" accept=".xml,.zip" disabled={busy !== null} className="block w-full text-sm" onChange={(event) => {
            const next = event.target.files?.[0] ?? null
            generation.current++
            setPreview(null); setReceipt(null); setError('')
            if (next && next.size > 256 * 1024 * 1024) { setFile(null); setError('文件不能超过 256 MB'); return }
            setFile(next)
          }} />
        </label>
        <p className="text-xs leading-5 text-slate-500">文件只发送到医疗本后端解析，不进入报告存储或 AI 分析。支持文件最多 256 MB、解压 XML 最多 1 GB、50 万条有效样本；超限整次拒绝。</p>
        <button type="button" disabled={!file || !selectedMemberId || busy !== null} onClick={() => receive('preview')} className="rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy === 'preview' ? '正在读取文件，请稍候…' : '预览数据范围'}</button>

        {preview ? <div className="space-y-3 rounded-lg border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-900">将保存至 {activeMember?.name}</h3>
          <p className="text-sm text-slate-600">{preview.supported.toLocaleString()} 条有效样本 · {preview.startDate || '无日期'} 至 {preview.endDate || '无日期'}</p>
          <p className="text-sm text-slate-600">指标：{preview.metrics.map((metric) => labels[metric] ?? metric).join('、') || '没有支持的指标'}</p>
          <p className="break-words text-sm text-slate-600">来源：{preview.sources.join('、') || '无'}</p>
          <p className="text-xs leading-5 text-slate-500">跳过不支持的记录 {preview.unsupported} 条、无效数值或单位 {preview.invalid} 条；文件内重复 {preview.duplicates} 条。睡眠、运动详情、路线和心电图暂不导入。</p>
          <button type="button" disabled={!preview.supported || busy !== null} onClick={() => receive('import')} className="rounded-lg bg-emerald-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy === 'import' ? '正在保存，请勿重复提交…' : `确认导入 ${preview.supported.toLocaleString()} 条`}</button>
        </div> : null}
        {receipt ? <div role="status" className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900">已新增 {receipt.imported.toLocaleString()} 条，跳过精确重复 {receipt.duplicates.toLocaleString()} 条。下方已切换至这批数据最近的日期。</div> : null}
        {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      </section>

      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="font-semibold text-slate-900">{activeMember?.name ?? '当前成员'}的日常趋势</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-semibold text-slate-500">开始日期<input type="date" value={start} onChange={(event) => setStart(event.target.value)} className="mt-1 block w-full rounded-lg border-slate-200 text-sm" /></label>
          <label className="text-xs font-semibold text-slate-500">结束日期<input type="date" value={end} onChange={(event) => setEnd(event.target.value)} className="mt-1 block w-full rounded-lg border-slate-200 text-sm" /></label>
        </div>
        {dataError ? <p role="alert" className="text-sm text-red-700">{dataError}</p> : null}
        {loading ? <p role="status" className="py-8 text-center text-sm text-slate-500">正在读取身体数据…</p> : latest ? <>
          <label className="block text-xs font-semibold text-slate-500">选择指标与来源<select value={key} onChange={(event) => setSelectedSeries(event.target.value)} className="mt-1 block w-full rounded-lg border-slate-200 text-sm">
            {[...groups].map(([groupKey, values], index) => <option key={groupKey} value={groupKey}>{labels[values[0].metricType] ?? values[0].metricType} · {values[0].source} · 来源组 {index + 1}</option>)}
          </select></label>
          <div className="rounded-lg bg-slate-50 p-4">
            <p className="text-xs text-slate-500">{latest.date} · {cumulative ? '该来源样本合计' : '当日样本平均值'}</p>
            <p className="mt-2 text-3xl font-semibold text-cyan-800">{format(latest.value)} <span className="text-sm">{latest.unit}</span></p>
            <p className="mt-2 text-xs text-slate-500">{latest.count} 条样本 · 单条范围 {format(latest.min)}–{format(latest.max)} {latest.unit}</p>
          </div>
          <div className="h-64"><Line data={chart} options={baseLineOptions} /></div>
          <p className="text-xs leading-5 text-slate-500">按样本开始时间所在日期归组。步数与活动能量仅合计所选来源样本，可能含时间重叠，不等同 Apple 健康去重后的总量。不同来源与设备不相加。</p>
          {latest.device ? <details className="text-xs text-slate-500"><summary className="cursor-pointer">查看设备来源</summary><p className="mt-2 break-all">{latest.device}</p></details> : null}
        </> : !dataError ? <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">这个日期范围内还没有数据。导入后会自动显示这批记录最近的日期，也可以调整日期查找历史记录。</div> : null}
        <p className="text-xs leading-5 text-slate-500">重复导入会跳过相同样本；此入口不对账 Apple 健康中的删除与修订，也不生成诊断结论。</p>
      </section>
      <Link to="/metrics/trends" className="inline-block text-sm font-semibold text-primary">查看报告与手动记录的指标 →</Link>
    </div>
  )
}
