import clsx from 'classnames'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import { FaInfoCircle, FaSave } from 'react-icons/fa'
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
  const [status, setStatus] = useState<'idle' | 'saving' | 'success'>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setHeaderConfig({
      title: '录入指标',
      showBackButton: true,
    })
  }, [setHeaderConfig])

  const currentOption = metricOptions.find((option) => option.value === type)!

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!primaryValue) {
      setError('请录入指标数值')
      return
    }
    setError(null)
    setStatus('saving')
    await new Promise((resolve) => setTimeout(resolve, 500))
    addMetricEntry({
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

