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

export type MetricType = string

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

export interface ParsedDocumentOCRResult {
  id: string
  provider: string
  rawText: string
  confidence?: number
  createdAt: string
}

export interface ParsedDocumentObservation {
  id: string
  name: string
  normalizedName: string
  code: string
  valueNumber?: number
  valueText: string
  unit: string
  referenceText: string
  abnormalFlag: string
  observedAt?: string
  confidence?: number
  reviewStatus: string
}

export interface ParsedHealthDocument {
  id: string
  title: string
  category: string
  subcategory?: string
  sourceType: string
  status: string
  organization: string
  department: string
  documentDate?: string
  summary: string
  aiConclusion: string
  confidence?: number
  reviewTaskCount: number
  ocrResults?: ParsedDocumentOCRResult[]
  observations?: ParsedDocumentObservation[]
  createdAt: string
  updatedAt: string
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
