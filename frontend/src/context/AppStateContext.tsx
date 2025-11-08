import { createContext, useContext, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { metricSeries as initialMetricSeries } from '../data/mockMetrics'
import { mockReports } from '../data/mockReports'
import type { MetricEntry, MetricSeries, Report, UploadPayload } from '../types'
import { nanoid } from '../lib/nanoid'

interface AppStateContextValue {
  reports: Report[]
  metricSeries: MetricSeries[]
  addReport: (payload: UploadPayload) => Report
  deleteReport: (reportId: string) => void
  addMetricEntry: (entry: Omit<MetricEntry, 'id'>) => MetricEntry
}

const AppStateContext = createContext<AppStateContextValue | undefined>(undefined)

export const AppStateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [reports, setReports] = useState<Report[]>(() => mockReports)
  const [metrics, setMetrics] = useState<MetricSeries[]>(() => initialMetricSeries)

  const addReport = (payload: UploadPayload): Report => {
    const now = dayjs()
    const newReport: Report = {
      id: nanoid(),
      title: payload.title,
      hospital: payload.hospital,
      reportDate: payload.reportDate,
      fileSizeMb: payload.file ? Number((payload.file.size / (1024 * 1024)).toFixed(2)) : 2.1,
      fileType: payload.file
        ? payload.file.type.includes('pdf')
          ? 'pdf'
          : payload.file.type.startsWith('image/')
            ? 'image'
            : 'other'
        : 'pdf',
      tags: payload.tags,
      notes: payload.notes,
      previewImageUrl:
        payload.file && payload.file.type.startsWith('image/')
          ? URL.createObjectURL(payload.file)
          : 'https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=1200',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }

    setReports((prev) => [newReport, ...prev])
    return newReport
  }

  const deleteReport = (reportId: string) => {
    setReports((prev) => prev.filter((report) => report.id !== reportId))
  }

  const addMetricEntry = (entry: Omit<MetricEntry, 'id'>): MetricEntry => {
    const newEntry: MetricEntry = { ...entry, id: nanoid() }
    setMetrics((prev) =>
      prev.map((series) =>
        series.metricType === entry.metricType
          ? {
              ...series,
              data: [
                ...series.data,
                {
                  recordedAt: entry.recordedAt,
                  value: entry.primaryValue,
                  secondaryValue: entry.secondaryValue,
                },
              ].sort(
                (a, b) => dayjs(a.recordedAt).valueOf() - dayjs(b.recordedAt).valueOf(),
              ),
            }
          : series,
      ),
    )
    return newEntry
  }

  const value = useMemo<AppStateContextValue>(
    () => ({
      reports,
      metricSeries: metrics,
      addReport,
      deleteReport,
      addMetricEntry,
    }),
    [reports, metrics],
  )

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}

export const useAppState = () => {
  const context = useContext(AppStateContext)
  if (!context) {
    throw new Error('useAppState 必须在 AppStateProvider 内部使用')
  }
  return context
}

