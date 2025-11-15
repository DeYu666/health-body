export type ReportFileType = 'pdf' | 'image' | 'other'

export interface Report {
  id: string
  title: string
  hospital: string
  reportDate: string
  fileSizeMb: number
  fileType: ReportFileType
  tags: string[]
  notes?: string
  previewImageUrl: string
  files?: ReportFile[] // Support multiple files
  createdAt: string
  updatedAt: string
}

export type MetricType =
  | 'weight'
  | 'blood-pressure'
  | 'blood-sugar'
  | 'heart-rate'
  | 'temperature'
  | 'bmi'

export interface MetricEntry {
  id: string
  metricType: MetricType
  primaryValue: number
  secondaryValue?: number
  unit: string
  recordedAt: string
  notes?: string
}

export interface MetricSeriesPoint {
  recordedAt: string
  value: number
  secondaryValue?: number
}

export interface MetricSeries {
  metricType: MetricType
  unit: string
  data: MetricSeriesPoint[]
}

export interface QuickMetric {
  id: string
  label: string
  value: string
  unitLabel?: string
  trendText?: string
  trendState?: 'up' | 'down' | 'stable' | 'warning'
}

export interface UploadPayload {
  title: string
  hospital: string
  reportDate: string
  tags: string[]
  notes?: string
  file?: File
  files?: File[] // Support multiple files
}

export interface ReportFile {
  id: string
  fileType: string
  fileSizeMb: number
  fileUrl: string
  previewUrl?: string
  displayOrder: number
}

