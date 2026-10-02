import clsx from 'classnames'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import { FaInfoCircle, FaMagic, FaSave } from 'react-icons/fa'
import { useNavigate, useOutletContext } from 'react-router-dom'
import type { ChangeEvent, FormEvent } from 'react'
import type { AppShellContextValue } from '../components/layout/AppShell'
import { useAppState } from '../context/AppStateContext'
import type { MetricType } from '../types'
import { parseMetricText } from '../lib/metricText'

const metricOptions: { value: MetricType; label: string; placeholder: string; unit: string }[] = [
  { value: 'weight', label: '体重 (kg)', placeholder: '请输入体重', unit: 'kg' },
  {
    value: 'blood-pressure',
    label: '血压 (mmHg)',
    placeholder: '收缩压 / 舒张压',
    unit: 'mmHg',
  },
  { value: 'blood-sugar', label: '血糖 (mmol/L)', placeholder: '请输入血糖值', unit: 'mmol/L' },
  { value: 'heart-rate', label: '心率 (次/分)', placeholder: '请输入心率', unit: '次/分' },
  { value: 'temperature', label: '体温 (°C)', placeholder: '请输入体温', unit: '°C' },
  { value: 'bmi', label: 'BMI', placeholder: '请输入 BMI 值', unit: '' },
]

export const MetricEntryPage: React.FC = () => {
  const { addMetricEntry, selectedMemberId, activeMember } = useAppState()
  const navigate = useNavigate()
  const { setHeaderConfig } = useOutletContext<AppShellContextValue>()

  const [type, setType] = useState<MetricType>('weight')
  const [primaryValue, setPrimaryValue] = useState('')
  const [secondaryValue, setSecondaryValue] = useState('')
  const [recordTime, setRecordTime] = useState(dayjs().format('YYYY-MM-DDTHH:mm'))
  const [notes, setNotes] = useState('')
  const [smartText, setSmartText] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'success'>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setHeaderConfig({
      title: '记录身体指标',
      showBackButton: true,
    })
  }, [setHeaderConfig])

  const currentOption = metricOptions.find((option) => option.value === type)!

  const applySmartText = () => {
    const text = smartText.trim()
    if (!text) {
      setError('请先输入一句健康记录')
      return
    }

    const normalized = text.replace(/\s+/g, ' ')
    try {
      const parsed = parseMetricText(normalized)
      setType(parsed.type)
      setPrimaryValue(parsed.primary)
      setSecondaryValue(parsed.secondary)
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法预填，请手动填写')
      return
    }

    if (/昨天/.test(normalized)) {
      setRecordTime(dayjs().subtract(1, 'day').format('YYYY-MM-DDTHH:mm'))
    } else {
      setRecordTime(dayjs().format('YYYY-MM-DDTHH:mm'))
    }
    setNotes((prev) => (prev ? `${prev}\n${text}` : text))
    setError(null)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!primaryValue || !Number.isFinite(Number(primaryValue)) || !dayjs(recordTime).isValid()) {
      setError('请录入有效的指标数值和测量时间')
      return
    }
    setError(null)
    setStatus('saving')
    try {
      await addMetricEntry({
        memberId: selectedMemberId,
        metricType: type,
        primaryValue: Number(primaryValue),
        secondaryValue:
          type === 'blood-pressure' ? Number(secondaryValue || '0') || undefined : undefined,
        unit: currentOption.unit,
        recordedAt: dayjs(recordTime).toISOString(),
        notes,
      })
      setStatus('success')
      setTimeout(() => {
        navigate('/metrics/trends', { replace: true })
      }, 800)
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败，请稍后重试')
      setStatus('idle')
    }
  }

  const handleTypeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setType(event.target.value as MetricType)
    setPrimaryValue('')
    setSecondaryValue('')
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 bg-slate-50 px-4 pb-14 pt-5 md:px-6 lg:px-8">
      <div className="flex items-start gap-3 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
        <FaInfoCircle className="text-primary" />
        <div>
          <p className="font-semibold text-slate-800">记录对象：{activeMember?.name ?? '家庭成员'}</p>
          <p className="mt-1 text-xs text-slate-400">保存后会进入该成员的趋势图表。</p>
        </div>
      </div>

      <section className="space-y-3 rounded-lg bg-slate-50 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FaMagic />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-800">文本预填</h2>
            <p className="mt-1 text-xs text-slate-400">
              使用本地规则识别常见指标，确认后再保存。
            </p>
          </div>
        </div>
        <textarea
          value={smartText}
          onChange={(event) => setSmartText(event.target.value)}
          rows={3}
          placeholder="每次记录一项，例如：今天8点体重72.4"
          className="w-full rounded-lg border-2 border-slate-200 bg-white px-4 py-3 text-sm font-medium transition focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        <button
          type="button"
          onClick={applySmartText}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-primary/20 bg-primary/10 px-4 py-3 text-sm font-semibold text-primary transition hover:bg-primary hover:text-white"
        >
          <FaMagic />
          解析并预填
        </button>
      </section>

      <form onSubmit={handleSubmit} className="space-y-5">
        <section className="space-y-4 rounded-lg bg-slate-50 p-4">
          <h2 className="text-sm font-semibold text-slate-600">选择指标类型</h2>
          <select
            value={type}
            onChange={handleTypeChange}
            className="w-full rounded-lg border-2 border-slate-200 bg-white px-4 py-3 text-sm font-medium transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          >
            {metricOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </section>

        <section className="space-y-4 rounded-lg bg-slate-50 p-4">
          <h2 className="text-sm font-semibold text-slate-600">录入数值</h2>
          <div className="space-y-3">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
              {currentOption.label}
            </label>
            {type === 'blood-pressure' ? (
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <input
                  type="number"
                  step="1"
                  value={primaryValue}
                  onChange={(event) => setPrimaryValue(event.target.value)}
                  placeholder="收缩压"
                  className="w-full rounded-lg border-2 border-slate-200 bg-white px-4 py-3 text-sm font-medium transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                <span className="text-sm font-semibold text-slate-400">/</span>
                <input
                  type="number"
                  step="1"
                  value={secondaryValue}
                  onChange={(event) => setSecondaryValue(event.target.value)}
                  placeholder="舒张压"
                  className="w-full rounded-lg border-2 border-slate-200 bg-white px-4 py-3 text-sm font-medium transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
            ) : (
              <input
                type="number"
                step={type === 'weight' || type === 'bmi' || type === 'blood-sugar' ? '0.1' : '1'}
                value={primaryValue}
                onChange={(event) => setPrimaryValue(event.target.value)}
                placeholder={currentOption.placeholder}
                className="w-full rounded-lg border-2 border-slate-200 bg-white px-4 py-3 text-sm font-medium transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            )}
            <p className="text-xs text-slate-400">
              {type === 'blood-pressure'
                ? '建议使用电子血压计，测量两次取平均值。'
                : '建议与医生建议的测量时间保持一致，便于趋势分析。'}
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              测量时间
            </label>
            <input
              type="datetime-local"
              value={recordTime}
              onChange={(event) => setRecordTime(event.target.value)}
              className="mt-2 w-full rounded-lg border-2 border-slate-200 bg-white px-4 py-3 text-sm font-medium transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </section>

        <section className="space-y-3 rounded-lg bg-slate-50 p-4">
          <h2 className="text-sm font-semibold text-slate-600">备注（可选）</h2>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={4}
            placeholder="例如：饭后 2 小时测量血糖、运动后心率等。"
            className="w-full rounded-lg border-2 border-slate-200 bg-white px-4 py-3 text-sm font-medium transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </section>

        {error ? (
          <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={status === 'saving'}
          className={clsx(
            'flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-4 text-base font-semibold text-white shadow-lg shadow-primary/30 transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:bg-primary/60',
          )}
        >
          <FaSave className="text-lg" />
          {status === 'saving' ? '正在保存...' : '保存记录'}
        </button>

        {status === 'success' ? (
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
            已保存，您可在“我的指标”中查看趋势图表。
          </div>
        ) : null}
      </form>
    </div>
  )
}
