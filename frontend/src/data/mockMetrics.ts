import dayjs from 'dayjs'
import type { MetricSeries } from '../types'

const start = dayjs('2024-01-01')

const range = (length: number) => Array.from({ length }, (_, index) => index)

export const metricSeries: MetricSeries[] = [
  {
    metricType: 'weight',
    unit: 'kg',
    data: range(8).map((week) => ({
      recordedAt: start.add(week, 'week').toISOString(),
      value: 72.5 - week * 0.2 + (week % 2 === 0 ? 0.3 : -0.1),
    })),
  },
  {
    metricType: 'blood-pressure',
    unit: 'mmHg',
    data: range(8).map((week) => ({
      recordedAt: start.add(week, 'week').toISOString(),
      value: 118 + (week % 3) * 2,
      secondaryValue: 78 + (week % 4),
    })),
  },
  {
    metricType: 'blood-sugar',
    unit: 'mmol/L',
    data: range(8).map((week) => ({
      recordedAt: start.add(week, 'week').toISOString(),
      value: 5.3 + (week % 4 === 0 ? 0.6 : 0.1 * (week % 3) - 0.15),
    })),
  },
  {
    metricType: 'heart-rate',
    unit: '次/分',
    data: range(8).map((week) => ({
      recordedAt: start.add(week, 'week').toISOString(),
      value: 76 + (week % 2 === 0 ? -2 : 1),
    })),
  },
  {
    metricType: 'temperature',
    unit: '°C',
    data: range(8).map((week) => ({
      recordedAt: start.add(week, 'week').toISOString(),
      value: 36.6 + (week % 5 === 0 ? 0.2 : 0),
    })),
  },
]

export const metricLabels: Record<
  MetricSeries['metricType'],
  { label: string; description: string }
> = {
  weight: { label: '体重', description: '控制饮食与运动，保持理想体重区间。' },
  'blood-pressure': { label: '血压', description: '持续记录，关注收缩压与舒张压变化。' },
  'blood-sugar': { label: '血糖', description: '监测空腹与餐后血糖，防止波动过大。' },
  'heart-rate': { label: '心率', description: '配合运动记录，关注心率恢复速度。' },
  temperature: { label: '体温', description: '保持每日定时测量，及时发现异常波动。' },
  bmi: { label: 'BMI', description: 'BMI = 体重 / 身高²，目标 18.5 - 23.9。' },
}
