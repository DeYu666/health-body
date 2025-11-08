import dayjs from 'dayjs'
import type { Report } from '../types'

const now = dayjs()

export const mockReports: Report[] = [
  {
    id: 'rpt-001',
    title: '血常规检查报告',
    hospital: '北京协和医院',
    reportDate: dayjs('2024-01-15T09:30:00').toISOString(),
    fileSizeMb: 2.3,
    fileType: 'pdf',
    tags: ['血常规', '体检', '年度检查'],
    notes: '本次检查各项指标正常，建议继续保持良好的生活习惯。',
    previewImageUrl: 'https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=1200',
    createdAt: now.subtract(25, 'day').toISOString(),
    updatedAt: now.subtract(20, 'day').toISOString(),
  },
  {
    id: 'rpt-002',
    title: 'CT 扫描结果',
    hospital: '解放军总医院（301医院）',
    reportDate: dayjs('2024-01-10T10:00:00').toISOString(),
    fileSizeMb: 1.8,
    fileType: 'image',
    tags: ['CT', '胸部'],
    notes: '肺部阴影减小，继续复诊随访。',
    previewImageUrl: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=1200',
    createdAt: now.subtract(30, 'day').toISOString(),
    updatedAt: now.subtract(28, 'day').toISOString(),
  },
  {
    id: 'rpt-003',
    title: '心电图检查',
    hospital: '北京医院',
    reportDate: dayjs('2023-12-20T08:00:00').toISOString(),
    fileSizeMb: 0.9,
    fileType: 'pdf',
    tags: ['心电图', '复查'],
    notes: '心率稍快，建议注意休息与睡眠时长。',
    previewImageUrl: 'https://images.unsplash.com/photo-1580281780460-82d277b0c456?w=1200',
    createdAt: now.subtract(55, 'day').toISOString(),
    updatedAt: now.subtract(54, 'day').toISOString(),
  },
  {
    id: 'rpt-004',
    title: '腹部彩超报告',
    hospital: '北京大学第一医院',
    reportDate: dayjs('2023-11-02T15:30:00').toISOString(),
    fileSizeMb: 3.6,
    fileType: 'image',
    tags: ['彩超', '肝胆'],
    notes: '未见明显异常，建议半年后复筛。',
    previewImageUrl: 'https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=1200',
    createdAt: now.subtract(90, 'day').toISOString(),
    updatedAt: now.subtract(85, 'day').toISOString(),
  },
]
