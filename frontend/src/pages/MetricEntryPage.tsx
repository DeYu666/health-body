import clsx from 'classnames'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import { FaBrain, FaInfoCircle, FaMagic, FaSave } from 'react-icons/fa'
import { useNavigate, useOutletContext } from 'react-router-dom'
import type { ChangeEvent, FormEvent } from 'react'
import type { AppShellContextValue } from '../components/layout/AppShell'
import { useAppState } from '../context/AppStateContext'
import type { MetricType } from '../types'

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
  const { addMetricEntry } = useAppState()
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
      title: 'AI 记录指标',
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
    const numberPattern = /(\d+(?:\.\d+)?)/
    const bloodPressureMatch = normalized.match(/(?:血压|bp)[^\d]*(\d{2,3})\s*[/／]\s*(\d{2,3})/i)

    if (bloodPressureMatch) {
      setType('blood-pressure')
      setPrimaryValue(bloodPressureMatch[1])
      setSecondaryValue(bloodPressureMatch[2])
    } else if (/血糖|葡萄糖|glucose|glu/i.test(normalized)) {
      setType('blood-sugar')
      setPrimaryValue(normalized.match(numberPattern)?.[1] ?? '')
      setSecondaryValue('')
    } else if (/体重|weight/i.test(normalized)) {
      setType('weight')
      setPrimaryValue(normalized.match(numberPattern)?.[1] ?? '')
      setSecondaryValue('')
    } else if (/心率|脉搏|heart/i.test(normalized)) {
      setType('heart-rate')
      setPrimaryValue(normalized.match(numberPattern)?.[1] ?? '')
      setSecondaryValue('')
    } else if (/体温|temperature/i.test(normalized)) {
      setType('temperature')
      setPrimaryValue(normalized.match(numberPattern)?.[1] ?? '')
      setSecondaryValue('')
    } else if (/bmi/i.test(normalized)) {
      setType('bmi')
      setPrimaryValue(normalized.match(numberPattern)?.[1] ?? '')
      setSecondaryValue('')
    } else {
      setError('暂时无法识别指标类型，请手动选择后保存')
      setNotes((prev) => (prev ? `${prev}\n${text}` : text))
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
    if (!primaryValue) {
      setError('请录入指标数值')
      return
    }
    setError(null)
    setStatus('saving')
    try {
      await addMetricEntry({
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
    <div className="space-y-6 bg-white px-4 pb-14 pt-6 md:px-8">
      <div className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
        <FaInfoCircle className="text-primary" />
        <div>
          <p className="font-semibold text-slate-800">数据将加密保存，仅用于您的个人健康管理</p>
          <p className="mt-1 text-xs text-slate-400">
            若同步至医院或家庭医生账户，将额外确认授权。
          </p>
        </div>
      </div>

      <section className="space-y-3 rounded-2xl bg-slate-50 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FaBrain />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-800">一句话记录</h2>
            <p className="mt-1 text-xs text-slate-400">
              先让系统预填，确认后再保存。后续可替换为 AI 解析接口。
            </p>
          </div>
        </div>
        <textarea
          value={smartText}
          onChange={(event) => setSmartText(event.target.value)}
          rows={3}
          placeholder="例如：今天早上血压 125/82；昨天饭后血糖 7.2；体重 72.4"
          className="w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-sm font-medium transition focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        <button
          type="button"
          onClick={applySmartText}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm font-semibold text-primary transition hover:bg-primary hover:text-white"
        >
          <FaMagic />
          智能预填
        </button>
      </section>

      <form onSubmit={handleSubmit} className="space-y-5">
        <section className="space-y-4 rounded-2xl bg-slate-50 p-4">
          <h2 className="text-sm font-semibold text-slate-600">选择指标类型</h2>
          <select
            value={type}
            onChange={handleTypeChange}
            className="w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-sm font-medium transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          >
            {metricOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </section>

        <section className="space-y-4 rounded-2xl bg-slate-50 p-4">
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
                  className="w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-sm font-medium transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                <span className="text-sm font-semibold text-slate-400">/</span>
                <input
                  type="number"
                  step="1"
                  value={secondaryValue}
                  onChange={(event) => setSecondaryValue(event.target.value)}
                  placeholder="舒张压"
                  className="w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-sm font-medium transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
            ) : (
              <input
                type="number"
                step={type === 'weight' || type === 'bmi' || type === 'blood-sugar' ? '0.1' : '1'}
                value={primaryValue}
                onChange={(event) => setPrimaryValue(event.target.value)}
                placeholder={currentOption.placeholder}
                className="w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-sm font-medium transition focus:border-primary focus:ring-2 focus:ring-primary/20"
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
              className="mt-2 w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-sm font-medium transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </section>

        <section className="space-y-3 rounded-2xl bg-slate-50 p-4">
          <h2 className="text-sm font-semibold text-slate-600">备注（可选）</h2>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={4}
            placeholder="例如：饭后 2 小时测量血糖、运动后心率等。"
            className="w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-sm font-medium transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </section>

        {error ? (
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={status === 'saving'}
          className={clsx(
            'flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-base font-semibold text-white shadow-lg shadow-primary/30 transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:bg-primary/60',
          )}
        >
          <FaSave className="text-lg" />
          {status === 'saving' ? '正在保存...' : '保存记录'}
        </button>

        {status === 'success' ? (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
            已保存，您可在“我的指标”中查看趋势图表。
          </div>
        ) : null}
      </form>
    </div>
  )
}
