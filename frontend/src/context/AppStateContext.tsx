import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { api } from '../lib/api'
import type { MetricEntry, MetricSeries, Report, UploadPayload } from '../types'
import { useAuth } from './AuthContext'

interface AppStateContextValue {
  reports: Report[]
  metricSeries: MetricSeries[]
  loading: boolean
  error: string | null
  addReport: (
    payload: UploadPayload,
    onProgress?: (progress: number) => void,
  ) => Promise<Report>
  deleteReport: (reportId: string) => Promise<void>
  addMetricEntry: (entry: Omit<MetricEntry, 'id'>) => Promise<MetricEntry>
  refreshReports: () => Promise<void>
  refreshMetrics: () => Promise<void>
}

const AppStateContext = createContext<AppStateContextValue | undefined>(
  undefined,
)

export const AppStateProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { isAuthenticated } = useAuth()
  const [reports, setReports] = useState<Report[]>([])
  const [metrics, setMetrics] = useState<MetricSeries[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  const loadReports = async () => {
    if (!isAuthenticated) return

    try {
      setLoading(true)
      setError(null)
      const response = await api.listReports({ limit: 100 })
      // Convert API response to frontend Report type
      const reports: Report[] = response.items.map((item) => ({
        id: item.id,
        title: item.title,
        hospital: item.hospital,
        reportDate: item.reportDate,
        fileSizeMb: item.fileSizeMb,
        fileType: (item.fileType as Report['fileType']) || 'pdf',
        tags: item.tags || [],
        notes: item.notes,
        previewImageUrl: item.previewUrl || item.fileUrl || '',
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }))
      setReports(reports)
    } catch (err) {
      const message = err instanceof Error ? err.message : '加载报告失败'
      setError(message)
      console.error('Failed to load reports:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadMetrics = async () => {
    if (!isAuthenticated) return

    try {
      setLoading(true)
      setError(null)
      const entries = await api.listMetrics({ limit: 1000 })
      const series = api.convertEntriesToSeries(entries)
      setMetrics(series)
    } catch (err) {
      const message = err instanceof Error ? err.message : '加载指标失败'
      setError(message)
      console.error('Failed to load metrics:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isAuthenticated) {
      loadReports()
      loadMetrics()
    } else {
      setReports([])
      setMetrics([])
    }
  }, [isAuthenticated])

  const addReport = async (
    payload: UploadPayload,
    onProgress?: (progress: number) => void,
  ): Promise<Report> => {
    console.log('[AppStateContext] addReport 被调用', {
      hasFile: !!payload.file,
      fileName: payload.file?.name,
      hasProgressCallback: typeof onProgress === 'function',
    })
    
    try {
      setError(null)
      console.log('[AppStateContext] 调用 api.createReport')
      const newReport = await api.createReport(payload, onProgress)
      console.log('[AppStateContext] api.createReport 成功', newReport)
      setReports((prev) => [newReport, ...prev])
      return newReport
    } catch (err) {
      console.error('[AppStateContext] addReport 失败:', err)
      const message = err instanceof Error ? err.message : '创建报告失败'
      setError(message)
      throw new Error(message)
    }
  }

  const deleteReport = async (reportId: string) => {
    try {
      setError(null)
      await api.deleteReport(reportId)
      setReports((prev) => prev.filter((report) => report.id !== reportId))
    } catch (err) {
      const message = err instanceof Error ? err.message : '删除报告失败'
      setError(message)
      throw new Error(message)
    }
  }

  const addMetricEntry = async (
    entry: Omit<MetricEntry, 'id'>,
  ): Promise<MetricEntry> => {
    try {
      setError(null)
      const newEntry = await api.createMetric(entry)
      
      // Update local state
      setMetrics((prev) => {
        const existingSeries = prev.find(
          (s) => s.metricType === entry.metricType,
        )
        if (existingSeries) {
          return prev.map((series) =>
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
                    (a, b) =>
                      new Date(a.recordedAt).getTime() -
                      new Date(b.recordedAt).getTime(),
                  ),
                }
              : series,
          )
        } else {
          return [
            ...prev,
            {
              metricType: entry.metricType as MetricSeries['metricType'],
              unit: entry.unit,
              data: [
                {
                  recordedAt: entry.recordedAt,
                  value: entry.primaryValue,
                  secondaryValue: entry.secondaryValue,
                },
              ],
            },
          ]
        }
      })
      
      return newEntry
    } catch (err) {
      const message = err instanceof Error ? err.message : '创建指标失败'
      setError(message)
      throw new Error(message)
    }
  }

  const refreshReports = async () => {
    await loadReports()
  }

  const refreshMetrics = async () => {
    await loadMetrics()
  }

  const value = useMemo<AppStateContextValue>(
    () => ({
      reports,
      metricSeries: metrics,
      loading,
      error,
      addReport,
      deleteReport,
      addMetricEntry,
      refreshReports,
      refreshMetrics,
    }),
    [reports, metrics, loading, error],
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

