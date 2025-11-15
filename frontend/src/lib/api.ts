import type {
  MetricEntry,
  MetricSeries,
  Report,
  UploadPayload,
} from '../types'

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api/v1'

interface ApiError {
  error: string
}

interface AuthToken {
  accessToken: string
  expiresIn: number
  refreshToken?: string
  user: {
    id: string
    email: string
    displayName: string
    pinEnabled: boolean
  }
}

interface ListMetricsResponse {
  items: Array<{
    id: string
    metricType: string
    primaryValue: number
    secondaryValue?: number
    unit: string
    recordedAt: string
    notes: string
    createdAt: string
  }>
  count: number
}

interface MetricTrendSummary {
  metricType: string
  unit: string
  min: number
  max: number
  average: number
  data: Array<{
    timestamp: string
    value: number
  }>
}

interface PaginatedReports {
  items: Array<{
    id: string
    title: string
    hospital: string
    reportDate: string
    fileType: string
    fileSizeMb: number
    fileUrl: string
    previewUrl: string
    tags: string[]
    notes: string
    files?: Array<{
      id: string
      fileType: string
      fileSizeMb: number
      fileUrl: string
      previewUrl?: string
      displayOrder: number
    }>
    createdAt: string
    updatedAt: string
  }>
  total: number
  limit: number
  offset: number
}

class ApiClient {
  private getAuthToken(): string | null {
    if (typeof window === 'undefined') return null
    return localStorage.getItem('auth_token')
  }

  private getUserID(): string | null {
    if (typeof window === 'undefined') return null
    const stored = localStorage.getItem('phr_auth_state')
    if (stored) {
      try {
        const data = JSON.parse(stored)
        return data.user?.id || null
      } catch {
        return null
      }
    }
    return null
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const token = this.getAuthToken()
    const userID = this.getUserID()
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    // 合并已有的 headers
    if (options.headers) {
      if (options.headers instanceof Headers) {
        options.headers.forEach((value, key) => {
          headers[key] = value
        })
      } else if (Array.isArray(options.headers)) {
        options.headers.forEach(([key, value]) => {
          headers[key] = value
        })
      } else {
        Object.assign(headers, options.headers)
      }
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    // 后端需要 X-User-ID header 来识别用户
    if (userID) {
      headers['X-User-ID'] = userID
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    })

    if (!response.ok) {
      const error: ApiError = await response.json().catch(() => ({
        error: `请求失败: ${response.status} ${response.statusText}`,
      }))
      throw new Error(error.error || `请求失败: ${response.status}`)
    }

    // Handle 204 No Content responses
    if (response.status === 204 || response.statusText === 'No Content') {
      return undefined as T
    }

    // Try to parse JSON, but handle empty responses
    const text = await response.text()
    if (!text) {
      return undefined as T
    }

    try {
      return JSON.parse(text) as T
    } catch {
      return undefined as T
    }
  }

  // Auth APIs
  async register(
    email: string,
    password: string,
    displayName: string,
  ): Promise<AuthToken> {
    return this.request<AuthToken>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, displayName }),
    })
  }

  async login(email: string, password: string): Promise<AuthToken> {
    return this.request<AuthToken>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
  }

  async pinLogin(email: string, pin: string): Promise<AuthToken> {
    return this.request<AuthToken>('/auth/pin', {
      method: 'POST',
      body: JSON.stringify({ email, pin }),
    })
  }

  // Report APIs
  async listReports(params?: {
    search?: string
    tag?: string
    hospital?: string
    startDate?: string
    endDate?: string
    limit?: number
    offset?: number
  }): Promise<PaginatedReports> {
    const queryParams = new URLSearchParams()
    if (params?.search) queryParams.append('search', params.search)
    if (params?.tag) queryParams.append('tag', params.tag)
    if (params?.hospital) queryParams.append('hospital', params.hospital)
    if (params?.startDate) queryParams.append('startDate', params.startDate)
    if (params?.endDate) queryParams.append('endDate', params.endDate)
    if (params?.limit) queryParams.append('limit', params.limit.toString())
    if (params?.offset) queryParams.append('offset', params.offset.toString())

    const query = queryParams.toString()
    return this.request<PaginatedReports>(
      `/reports${query ? `?${query}` : ''}`,
    )
  }

  async getReport(id: string): Promise<Report> {
    const data = await this.request<{
      id: string
      title: string
      hospital: string
      reportDate: string
      fileType: string
      fileSizeMb: number
      fileUrl: string
      previewUrl: string
      tags: string[]
      notes: string
      createdAt: string
      updatedAt: string
    }>(`/reports/${id}`)

    return this.mapReportFromApi(data)
  }

  async uploadFile(
    file: File,
    onProgress?: (progress: number) => void,
  ): Promise<{
    key: string
    url: string
    fileType: string
    fileSize: number
  }> {
    console.log('[API] uploadFile 被调用', {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
    })

    const token = this.getAuthToken()
    const userID = this.getUserID()

    console.log('[API] 认证信息', {
      hasToken: !!token,
      hasUserID: !!userID,
      userID,
    })

    if (!token) {
      throw new Error('未登录，请先登录')
    }

    if (!userID) {
      throw new Error('无法获取用户 ID')
    }

    const formData = new FormData()
    formData.append('file', file)

    const uploadUrl = `${API_BASE_URL}/upload/file`
    console.log('[API] 准备上传到:', uploadUrl)

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()

      // 监听上传进度
      if (onProgress) {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const progress = Math.round((e.loaded / e.total) * 100)
            onProgress(progress)
          } else {
            // 如果无法计算总大小，至少显示已上传的字节数
            if (e.loaded > 0) {
              onProgress(Math.min(50, Math.round((e.loaded / file.size) * 100)))
            }
          }
        })
      }

      xhr.addEventListener('loadstart', () => {
        if (onProgress) {
          onProgress(1) // 开始上传
        }
      })

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText)
            if (onProgress) {
              onProgress(100) // 完成
            }
            resolve(response)
          } catch (err) {
            console.error('解析响应失败:', err, xhr.responseText)
            reject(new Error('解析响应失败'))
          }
        } else {
          try {
            const error = JSON.parse(xhr.responseText)
            reject(new Error(error.error || `上传失败: ${xhr.status}`))
          } catch {
            reject(new Error(`上传失败: ${xhr.status} ${xhr.statusText}`))
          }
        }
      })

      xhr.addEventListener('error', (e) => {
        console.error('上传网络错误:', e)
        reject(new Error('网络错误，上传失败'))
      })

      xhr.addEventListener('abort', () => {
        reject(new Error('上传已取消'))
      })

      xhr.open('POST', uploadUrl)
      console.log('[API] XHR 请求已打开')

      // 设置认证 headers（注意：不要设置 Content-Type，让浏览器自动设置）
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`)
        console.log('[API] 已设置 Authorization header')
      }
      if (userID) {
        xhr.setRequestHeader('X-User-ID', userID)
        console.log('[API] 已设置 X-User-ID header:', userID)
      }

      console.log('[API] 开始发送请求...')
      xhr.send(formData)
      console.log('[API] 请求已发送')
    })
  }

  async createReport(
    payload: UploadPayload,
    onProgress?: (progress: number) => void,
  ): Promise<Report> {
    console.log('[API] createReport 被调用', {
      hasFile: !!payload.file,
      hasFiles: !!payload.files,
      fileCount: payload.files?.length || 0,
      fileName: payload.file?.name,
      fileSize: payload.file?.size,
    })

    // Determine which files to upload
    const filesToUpload = payload.files && payload.files.length > 0 
      ? payload.files 
      : (payload.file ? [payload.file] : [])

    let fileUrl = ''
    let previewUrl = ''
    let fileType = 'pdf'
    let fileSizeMb = 0

    // Upload all files
    const uploadedFiles: Array<{
      fileType: string
      fileSizeMb: number
      fileUrl: string
      previewUrl: string
      displayOrder: number
    }> = []

    if (filesToUpload.length > 0) {
      console.log('[API] 开始上传文件，共', filesToUpload.length, '个文件')
      
      // Upload all files
      for (let i = 0; i < filesToUpload.length; i++) {
        const file = filesToUpload[i]
        try {
          // Calculate progress for this file
          const fileProgress = (progress: number) => {
            if (onProgress) {
              // Overall progress = (current file progress / total files) + (completed files / total files)
              const overallProgress = Math.round(
                ((progress / 100) / filesToUpload.length) * 100 +
                (i / filesToUpload.length) * 100
              )
              onProgress(Math.min(overallProgress, 99))
            }
          }

          const uploadResult = await this.uploadFile(file, fileProgress)
          console.log('[API] 文件', i + 1, '上传成功:', uploadResult)
          
          uploadedFiles.push({
            fileType: uploadResult.fileType,
            fileSizeMb: Number((uploadResult.fileSize / (1024 * 1024)).toFixed(2)),
            fileUrl: uploadResult.url,
            previewUrl: uploadResult.url,
            displayOrder: i,
          })
        } catch (err) {
          console.error('[API] 文件', i + 1, '上传失败:', err)
          throw new Error(
            err instanceof Error ? err.message : `文件 ${i + 1} 上传失败`,
          )
        }
      }

      // Set main file info from first file (for backward compatibility)
      if (uploadedFiles.length > 0) {
        fileUrl = uploadedFiles[0].fileUrl
        previewUrl = uploadedFiles[0].previewUrl
        fileType = uploadedFiles[0].fileType
        fileSizeMb = uploadedFiles[0].fileSizeMb
      }

      if (onProgress) {
        onProgress(100)
      }
    } else {
      console.log('[API] 没有文件，跳过上传')
      // 如果没有文件，使用默认预览图
      previewUrl =
        'https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=1200'
    }

    // 创建报告记录
    const requestBody: any = {
      title: payload.title,
      hospital: payload.hospital,
      reportDate: payload.reportDate,
      tags: payload.tags || [],
      notes: payload.notes || '',
      isEncrypted: false,
    }

    // If we have files array, use it; otherwise use single file fields
    if (uploadedFiles.length > 0) {
      requestBody.files = uploadedFiles
      // For backward compatibility, also set main file fields from first file
      requestBody.fileType = uploadedFiles[0].fileType
      requestBody.fileSizeMb = uploadedFiles[0].fileSizeMb
      requestBody.fileUrl = uploadedFiles[0].fileUrl
      requestBody.previewUrl = uploadedFiles[0].previewUrl
    } else if (fileUrl) {
      // Only set single file fields if no files array
      requestBody.fileType = fileType
      requestBody.fileSizeMb = fileSizeMb
      requestBody.fileUrl = fileUrl
      requestBody.previewUrl = previewUrl
    }

    const data = await this.request<{
      id: string
      title: string
      hospital: string
      reportDate: string
      fileType: string
      fileSizeMb: number
      fileUrl: string
      previewUrl: string
      tags: string[]
      notes: string
      files?: Array<{
        id: string
        fileType: string
        fileSizeMb: number
        fileUrl: string
        previewUrl?: string
        displayOrder: number
      }>
      createdAt: string
      updatedAt: string
    }>('/reports', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    })

    return this.mapReportFromApi(data)
  }

  async updateReport(
    id: string,
    updates: {
      title?: string
      hospital?: string
      reportDate?: string
      tags?: string[]
      notes?: string
    },
  ): Promise<Report> {
    const data = await this.request<{
      id: string
      title: string
      hospital: string
      reportDate: string
      fileType: string
      fileSizeMb: number
      fileUrl: string
      previewUrl: string
      tags: string[]
      notes: string
      createdAt: string
      updatedAt: string
    }>(`/reports/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    })

    return this.mapReportFromApi(data)
  }

  async deleteReport(id: string): Promise<void> {
    await this.request(`/reports/${id}`, {
      method: 'DELETE',
    })
  }

  async downloadReport(id: string): Promise<void> {
    const report = await this.getReport(id)
    // Use fileUrl if available, otherwise use previewUrl
    const fileUrl = report.previewImageUrl || (report as any).fileUrl
    if (fileUrl) {
      // Create a temporary anchor element to trigger download
      const link = document.createElement('a')
      link.href = fileUrl
      link.target = '_blank'
      link.download = `${report.title || 'report'}.${report.fileType === 'pdf' ? 'pdf' : 'jpg'}`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } else {
      throw new Error('报告文件不存在')
    }
  }

  async shareReport(id: string): Promise<string> {
    // For now, return a shareable link
    // In the future, this could create a share token via API
    const baseUrl = window.location.origin
    return `${baseUrl}/share/${id}`
  }

  async listHospitals(): Promise<string[]> {
    const response = await this.request<{ hospitals: string[] }>(
      '/reports/hospitals',
    )
    return response.hospitals
  }

  // Metric APIs
  async listMetrics(params?: {
    metricType?: string
    startDate?: string
    endDate?: string
    limit?: number
  }): Promise<MetricEntry[]> {
    const queryParams = new URLSearchParams()
    if (params?.metricType)
      queryParams.append('metricType', params.metricType)
    if (params?.startDate) queryParams.append('startDate', params.startDate)
    if (params?.endDate) queryParams.append('endDate', params.endDate)
    if (params?.limit) queryParams.append('limit', params.limit.toString())

    const query = queryParams.toString()
    const response = await this.request<ListMetricsResponse>(
      `/metrics${query ? `?${query}` : ''}`,
    )

    return response.items.map((item) => ({
      id: item.id,
      metricType: item.metricType as MetricEntry['metricType'],
      primaryValue: item.primaryValue,
      secondaryValue: item.secondaryValue,
      unit: item.unit,
      recordedAt: item.recordedAt,
      notes: item.notes,
    }))
  }

  async createMetric(entry: Omit<MetricEntry, 'id'>): Promise<MetricEntry> {
    const data = await this.request<{
      id: string
      metricType: string
      primaryValue: number
      secondaryValue?: number
      unit: string
      recordedAt: string
      notes: string
      createdAt: string
    }>('/metrics', {
      method: 'POST',
      body: JSON.stringify({
        metricType: entry.metricType,
        primaryValue: entry.primaryValue,
        secondaryValue: entry.secondaryValue,
        unit: entry.unit,
        recordedAt: entry.recordedAt,
        notes: entry.notes || '',
      }),
    })

    return {
      id: data.id,
      metricType: data.metricType as MetricEntry['metricType'],
      primaryValue: data.primaryValue,
      secondaryValue: data.secondaryValue,
      unit: data.unit,
      recordedAt: data.recordedAt,
      notes: data.notes,
    }
  }

  async getMetricTrend(
    metricType: string,
    startDate?: string,
    endDate?: string,
  ): Promise<MetricSeries> {
    const queryParams = new URLSearchParams()
    queryParams.append('metricType', metricType)
    if (startDate) queryParams.append('startDate', startDate)
    if (endDate) queryParams.append('endDate', endDate)

    const summary = await this.request<MetricTrendSummary>(
      `/metrics/trend?${queryParams.toString()}`,
    )

    return {
      metricType: summary.metricType as MetricSeries['metricType'],
      unit: summary.unit,
      data: summary.data.map((point) => ({
        recordedAt: point.timestamp,
        value: point.value,
      })),
    }
  }

  // Helper methods
  private mapReportFromApi(data: {
    id: string
    title: string
    hospital: string
    reportDate: string
    fileType: string
    fileSizeMb: number
    fileUrl: string
    previewUrl: string
    tags: string[]
    notes: string
    createdAt: string
    updatedAt: string
    files?: Array<{
      id: string
      fileType: string
      fileSizeMb: number
      fileUrl: string
      previewUrl?: string
      displayOrder: number
    }>
  }): Report {
    // Convert single file to files array if files array doesn't exist
    const files: ReportFile[] = data.files && data.files.length > 0
      ? data.files.map((f) => ({
          id: f.id,
          fileType: f.fileType,
          fileSizeMb: f.fileSizeMb,
          fileUrl: f.fileUrl,
          previewUrl: f.previewUrl,
          displayOrder: f.displayOrder,
        }))
      : (data.fileUrl || data.previewUrl
          ? [
              {
                id: data.id + '-file-0',
                fileType: data.fileType || 'pdf',
                fileSizeMb: data.fileSizeMb || 0,
                fileUrl: data.fileUrl || '',
                previewUrl: data.previewUrl || data.fileUrl || '',
                displayOrder: 0,
              },
            ]
          : [])

    return {
      id: data.id,
      title: data.title,
      hospital: data.hospital,
      reportDate: data.reportDate,
      fileSizeMb: data.fileSizeMb,
      fileType: (data.fileType as Report['fileType']) || 'pdf',
      tags: data.tags || [],
      notes: data.notes,
      previewImageUrl: data.previewUrl || data.fileUrl || '',
      files: files.length > 0 ? files : undefined,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    }
  }

  // Convert metric entries to metric series
  convertEntriesToSeries(entries: MetricEntry[]): MetricSeries[] {
    const seriesMap = new Map<string, MetricSeries>()

    entries.forEach((entry) => {
      const existing = seriesMap.get(entry.metricType)
      if (existing) {
        existing.data.push({
          recordedAt: entry.recordedAt,
          value: entry.primaryValue,
          secondaryValue: entry.secondaryValue,
        })
      } else {
        seriesMap.set(entry.metricType, {
          metricType: entry.metricType as MetricSeries['metricType'],
          unit: entry.unit,
          data: [
            {
              recordedAt: entry.recordedAt,
              value: entry.primaryValue,
              secondaryValue: entry.secondaryValue,
            },
          ],
        })
      }
    })

    // Sort data points by recordedAt
    seriesMap.forEach((series) => {
      series.data.sort(
        (a, b) =>
          new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime(),
      )
    })

    return Array.from(seriesMap.values())
  }
}

export const api = new ApiClient()
export type { AuthToken }

