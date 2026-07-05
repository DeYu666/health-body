import dayjs from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import {
  FaBrain,
  FaCalendarAlt,
  FaDownload,
  FaEdit,
  FaFileAlt,
  FaFilePdf,
  FaHospital,
  FaLink,
  FaMicroscope,
  FaSave,
  FaShareAlt,
  FaShieldAlt,
  FaTimes,
  FaTrash,
} from 'react-icons/fa'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import type { AppShellContextValue } from '../components/layout/AppShell'
import { useAppState } from '../context/AppStateContext'
import { api } from '../lib/api'
import type { ParsedDocumentObservation, ParsedHealthDocument } from '../types'

const formatConfidence = (confidence?: number) => {
  if (typeof confidence !== 'number') return '未评估'
  return `${Math.round(confidence * 100)}%`
}

const formatObservationValue = (observation: ParsedDocumentObservation) => {
  const value =
    typeof observation.valueNumber === 'number'
      ? observation.valueNumber < 1
        ? observation.valueNumber.toFixed(3)
        : observation.valueNumber.toString()
      : observation.valueText
  return `${value}${observation.unit ? ` ${observation.unit}` : ''}`
}

const abnormalFlagLabel: Record<string, string> = {
  high: '偏高',
  low: '偏低',
  normal: '正常',
}

const categoryOptions = ['体检', '检验', '影像', '病历', '用药', '其他']
const statusOptions = [
  { value: 'ready', label: '已确认' },
  { value: 'needs_review', label: '待复核' },
]
const reviewStatusOptions = [
  { value: 'confirmed', label: '已确认' },
  { value: 'pending', label: '待复核' },
  { value: 'rejected', label: '已驳回' },
]
const abnormalOptions = [
  { value: 'normal', label: '正常' },
  { value: 'high', label: '偏高' },
  { value: 'low', label: '偏低' },
]

type ObservationForm = ParsedDocumentObservation & {
  valueInput: string
}

interface ReviewForm {
  category: string
  summary: string
  aiConclusion: string
  confidence: string
  status: string
  observations: ObservationForm[]
}

const buildReviewForm = (document: ParsedHealthDocument): ReviewForm => ({
  category: document.category || '其他',
  summary: document.summary || '',
  aiConclusion: document.aiConclusion || '',
  confidence: typeof document.confidence === 'number' ? String(document.confidence) : '',
  status: document.status || 'needs_review',
  observations: (document.observations ?? []).map((observation) => ({
    ...observation,
    valueInput:
      typeof observation.valueNumber === 'number'
        ? String(observation.valueNumber)
        : observation.valueText,
  })),
})

const parseOptionalNumber = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : undefined
}

export const ReportDetailPage: React.FC = () => {
  const { reportId } = useParams<{ reportId: string }>()
  const navigate = useNavigate()
  const { setHeaderConfig } = useOutletContext<AppShellContextValue>()
  const { reports, deleteReport } = useAppState()
  const [parsedDocument, setParsedDocument] = useState<ParsedHealthDocument | null>(null)
  const [parseStatus, setParseStatus] = useState<'idle' | 'loading' | 'loaded' | 'empty' | 'error'>('idle')
  const [parseError, setParseError] = useState<string | null>(null)
  const [isEditingReview, setIsEditingReview] = useState(false)
  const [reviewForm, setReviewForm] = useState<ReviewForm | null>(null)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving'>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)

  const report = useMemo(
    () => reports.find((item) => item.id === reportId),
    [reports, reportId],
  )

  useEffect(() => {
    setHeaderConfig({
      title: '报告详情',
      showBackButton: true,
    })
  }, [setHeaderConfig])

  useEffect(() => {
    if (!reportId || !report) return

    let active = true
    setParseStatus('loading')
    setParseError(null)
    api
      .getDocumentByLegacyReport(reportId)
      .then((document) => {
        if (!active) return
        setParsedDocument(document)
        setReviewForm(buildReviewForm(document))
        setIsEditingReview(false)
        setParseStatus('loaded')
      })
      .catch((err) => {
        if (!active) return
        setParsedDocument(null)
        setReviewForm(null)
        setIsEditingReview(false)
        const message = err instanceof Error ? err.message : '加载 OCR/AI 解析失败'
        if (message.includes('资料不存在')) {
          setParseStatus('empty')
        } else {
          setParseStatus('error')
          setParseError(message)
        }
      })

    return () => {
      active = false
    }
  }, [reportId, report])

  if (!report) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-white px-8 py-12 text-center">
        <FaFileAlt className="text-4xl text-slate-200" />
        <div>
          <h2 className="text-lg font-semibold text-slate-900">找不到报告</h2>
          <p className="mt-1 text-sm text-slate-500">该报告可能已被删除或链接已失效。</p>
        </div>
        <button
          onClick={() => navigate('/archive')}
          className="rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-white transition hover:bg-primary-dark"
        >
          返回档案
        </button>
      </div>
    )
  }

  const handleDelete = async () => {
    const confirmed = window.confirm('确定要删除这份报告吗？此操作无法撤销。')
    if (confirmed) {
      try {
        await deleteReport(report.id)
        navigate('/archive', { replace: true })
      } catch (err) {
        alert(err instanceof Error ? err.message : '删除失败，请稍后重试')
      }
    }
  }

  const handleDownload = async () => {
    try {
      await api.downloadReport(report.id)
    } catch (err) {
      alert(err instanceof Error ? err.message : '下载失败，请稍后重试')
    }
  }

  const handleShare = async () => {
    try {
      const shareUrl = await api.shareReport(report.id)
      await navigator.clipboard.writeText(shareUrl)
      alert('分享链接已复制到剪贴板')
    } catch (err) {
      alert(err instanceof Error ? err.message : '无法复制分享链接，请稍后重试')
    }
  }

  const handleStartEditReview = () => {
    if (!parsedDocument) return
    setReviewForm(buildReviewForm(parsedDocument))
    setSaveError(null)
    setIsEditingReview(true)
  }

  const handleCancelEditReview = () => {
    if (parsedDocument) {
      setReviewForm(buildReviewForm(parsedDocument))
    }
    setSaveError(null)
    setIsEditingReview(false)
  }

  const updateObservationForm = (
    index: number,
    field: keyof ObservationForm,
    value: string,
  ) => {
    setReviewForm((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        observations: prev.observations.map((observation, currentIndex) =>
          currentIndex === index ? { ...observation, [field]: value } : observation,
        ),
      }
    })
  }

  const handleSaveReview = async () => {
    if (!parsedDocument || !reviewForm) return
    setSaveStatus('saving')
    setSaveError(null)
    try {
      const updated = await api.updateDocumentReview(parsedDocument.id, {
        category: reviewForm.category,
        summary: reviewForm.summary,
        aiConclusion: reviewForm.aiConclusion,
        confidence: parseOptionalNumber(reviewForm.confidence),
        status: reviewForm.status,
        observations: reviewForm.observations.map((observation) => ({
          name: observation.name,
          normalizedName: observation.normalizedName,
          code: observation.code,
          valueNumber: parseOptionalNumber(observation.valueInput),
          valueText: observation.valueInput,
          unit: observation.unit,
          referenceLow: observation.referenceLow,
          referenceHigh: observation.referenceHigh,
          referenceText: observation.referenceText,
          abnormalFlag: observation.abnormalFlag,
          observedAt: observation.observedAt,
          confidence: observation.confidence,
          reviewStatus: observation.reviewStatus,
        })),
      })
      setParsedDocument(updated)
      setReviewForm(buildReviewForm(updated))
      setIsEditingReview(false)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '保存失败，请稍后重试')
    } finally {
      setSaveStatus('idle')
    }
  }

  const PreviewIcon = report.fileType === 'pdf' ? FaFilePdf : FaFileAlt
  const latestOCR = parsedDocument?.ocrResults?.[0]
  const observations = parsedDocument?.observations ?? []

  return (
    <div className="space-y-6 bg-white px-4 pb-14 pt-6 md:px-8">
      <section className="rounded-2xl bg-slate-50 p-4 shadow-inner">
        <h1 className="text-xl font-semibold text-slate-900">{report.title}</h1>
        <div className="mt-3 space-y-2 text-sm text-slate-600">
          <p className="flex items-center gap-2">
            <FaHospital className="text-primary" />
            {report.hospital}
          </p>
          <p className="flex items-center gap-2">
            <FaCalendarAlt className="text-primary" />
            {dayjs(report.reportDate).format('YYYY年MM月DD日')}
          </p>
          <p className="flex items-center gap-2">
            <PreviewIcon className="text-primary" />
            {report.fileSizeMb.toFixed(1)} MB ·{' '}
            {report.fileType === 'pdf' ? 'PDF 文档' : '图片文件'}
          </p>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {report.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"
            >
              {tag}
            </span>
          ))}
        </div>
        {report.notes ? (
          <div className="mt-4 rounded-2xl bg-white px-4 py-3 text-sm text-slate-600">
            <strong className="text-slate-800">备注：</strong>
            {report.notes}
          </div>
        ) : null}
      </section>

      <section className="space-y-4 rounded-2xl bg-slate-50 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FaBrain />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-800">AI/OCR 解析</h2>
              <p className="mt-1 text-xs text-slate-400">OCR 原文、AI 摘要和趋势抽取来源。</p>
            </div>
          </div>
          {parsedDocument ? (
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500">
                置信度 {formatConfidence(parsedDocument.confidence)}
              </span>
              {isEditingReview ? (
                <button
                  type="button"
                  onClick={handleCancelEditReview}
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-slate-500 transition hover:bg-slate-100"
                  aria-label="取消编辑"
                >
                  <FaTimes />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStartEditReview}
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-slate-500 transition hover:bg-primary hover:text-white"
                  aria-label="编辑解析结果"
                >
                  <FaEdit />
                </button>
              )}
            </div>
          ) : null}
        </div>

        {parseStatus === 'loading' ? (
          <div className="rounded-xl bg-white px-4 py-3 text-sm text-slate-500">
            正在读取 OCR/AI 解析结果...
          </div>
        ) : null}

        {parseStatus === 'empty' ? (
          <div className="rounded-xl bg-white px-4 py-3 text-sm text-slate-500">
            暂无 OCR/AI 解析结果，可回到档案页点击“解析历史”生成。
          </div>
        ) : null}

        {parseStatus === 'error' ? (
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
            {parseError}
          </div>
        ) : null}

        {parsedDocument && reviewForm && isEditingReview ? (
          <div className="space-y-3">
            <div className="rounded-xl bg-white p-4">
              <div className="grid gap-3 md:grid-cols-3">
                <label className="text-xs font-semibold text-slate-500">
                  分类
                  <select
                    value={reviewForm.category}
                    onChange={(event) =>
                      setReviewForm((prev) =>
                        prev ? { ...prev, category: event.target.value } : prev,
                      )
                    }
                    className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                  >
                    {categoryOptions.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-500">
                  状态
                  <select
                    value={reviewForm.status}
                    onChange={(event) =>
                      setReviewForm((prev) =>
                        prev ? { ...prev, status: event.target.value } : prev,
                      )
                    }
                    className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                  >
                    {statusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-500">
                  置信度
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    value={reviewForm.confidence}
                    onChange={(event) =>
                      setReviewForm((prev) =>
                        prev ? { ...prev, confidence: event.target.value } : prev,
                      )
                    }
                    className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                  />
                </label>
              </div>
              <label className="mt-4 block text-xs font-semibold text-slate-500">
                摘要
                <textarea
                  value={reviewForm.summary}
                  onChange={(event) =>
                    setReviewForm((prev) =>
                      prev ? { ...prev, summary: event.target.value } : prev,
                    )
                  }
                  rows={4}
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-800"
                />
              </label>
              <label className="mt-4 block text-xs font-semibold text-slate-500">
                结论
                <textarea
                  value={reviewForm.aiConclusion}
                  onChange={(event) =>
                    setReviewForm((prev) =>
                      prev ? { ...prev, aiConclusion: event.target.value } : prev,
                    )
                  }
                  rows={3}
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-800"
                />
              </label>
            </div>

            {reviewForm.observations.length > 0 ? (
              <div className="rounded-xl bg-white p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <FaMicroscope className="text-primary" />
                  校验结构化指标
                </div>
                <div className="space-y-3">
                  {reviewForm.observations.map((observation, index) => (
                    <div key={`${observation.id}-${index}`} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                      <div className="grid gap-3 md:grid-cols-[1.2fr_1fr_0.8fr]">
                        <label className="text-xs font-semibold text-slate-500">
                          项目
                          <input
                            value={observation.name}
                            onChange={(event) => updateObservationForm(index, 'name', event.target.value)}
                            className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                          />
                        </label>
                        <label className="text-xs font-semibold text-slate-500">
                          数值
                          <input
                            value={observation.valueInput}
                            onChange={(event) => updateObservationForm(index, 'valueInput', event.target.value)}
                            className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                          />
                        </label>
                        <label className="text-xs font-semibold text-slate-500">
                          单位
                          <input
                            value={observation.unit}
                            onChange={(event) => updateObservationForm(index, 'unit', event.target.value)}
                            className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                          />
                        </label>
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-3">
                        <label className="text-xs font-semibold text-slate-500">
                          异常标记
                          <select
                            value={observation.abnormalFlag}
                            onChange={(event) => updateObservationForm(index, 'abnormalFlag', event.target.value)}
                            className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                          >
                            {abnormalOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="text-xs font-semibold text-slate-500">
                          复核状态
                          <select
                            value={observation.reviewStatus}
                            onChange={(event) => updateObservationForm(index, 'reviewStatus', event.target.value)}
                            className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                          >
                            {reviewStatusOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="text-xs font-semibold text-slate-500">
                          参考范围
                          <input
                            value={observation.referenceText}
                            onChange={(event) => updateObservationForm(index, 'referenceText', event.target.value)}
                            className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {saveError ? (
              <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                {saveError}
              </div>
            ) : null}

            <button
              type="button"
              onClick={handleSaveReview}
              disabled={saveStatus === 'saving'}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              <FaSave />
              {saveStatus === 'saving' ? '保存中...' : '保存人工校验'}
            </button>
          </div>
        ) : parsedDocument ? (
          <div className="space-y-3">
            <div className="rounded-xl bg-white px-4 py-3 text-sm text-slate-600">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                  {parsedDocument.category || '未分类'}
                </span>
                <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                  {parsedDocument.status === 'ready' ? '已就绪' : '待复核'}
                </span>
                {latestOCR ? (
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                    OCR {formatConfidence(latestOCR.confidence)}
                  </span>
                ) : null}
              </div>
              {parsedDocument.summary ? (
                <p className="mt-3 leading-6">{parsedDocument.summary}</p>
              ) : null}
              {parsedDocument.aiConclusion ? (
                <p className="mt-2 leading-6 text-slate-500">{parsedDocument.aiConclusion}</p>
              ) : null}
            </div>

            {observations.length > 0 ? (
              <div className="rounded-xl bg-white p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <FaMicroscope className="text-primary" />
                  结构化指标
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  {observations.map((observation) => (
                    <div
                      key={observation.id}
                      className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{observation.name}</p>
                          <p className="mt-1 text-xs text-slate-400">{observation.referenceText}</p>
                        </div>
                        <span
                          className={`shrink-0 rounded-md px-2 py-1 text-xs font-semibold ${
                            observation.abnormalFlag === 'high' || observation.abnormalFlag === 'low'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-emerald-50 text-emerald-700'
                          }`}
                        >
                          {abnormalFlagLabel[observation.abnormalFlag] ?? '待复核'}
                        </span>
                      </div>
                      <p className="mt-2 text-lg font-semibold text-slate-900">
                        {formatObservationValue(observation)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {latestOCR ? (
              <details className="rounded-xl bg-white p-4">
                <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                  查看 OCR 原文（{latestOCR.rawText.length} 字）
                </summary>
                <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-3 text-xs leading-5 text-slate-100">
                  {latestOCR.rawText || '无 OCR 文本'}
                </pre>
              </details>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="space-y-4 rounded-2xl bg-slate-50 p-4">
        <h2 className="text-sm font-semibold text-slate-600">
          报告预览 {report.files && report.files.length > 1 ? `(${report.files.length} 个文件)` : ''}
        </h2>
        {report.files && report.files.length > 0 ? (
          <div className="space-y-3">
            {report.files.map((file, index) => {
              const FileIconForFile = file.fileType === 'pdf' || file.fileType?.includes('pdf') ? FaFilePdf : FaFileAlt
              return (
                <div key={file.id || index} className="overflow-hidden rounded-2xl bg-white shadow-card">
                  {file.previewUrl || file.fileUrl ? (
                    file.fileType === 'pdf' || file.fileType?.includes('pdf') ? (
                      <div className="flex h-72 items-center justify-center bg-slate-100">
                        <div className="text-center">
                          <FaFilePdf className="mx-auto text-6xl text-red-500" />
                          <p className="mt-4 text-sm font-semibold text-slate-700">PDF 文档</p>
                          <p className="mt-1 text-xs text-slate-500">{file.fileSizeMb.toFixed(1)} MB</p>
                        </div>
                      </div>
                    ) : (
                      <img
                        src={file.previewUrl || file.fileUrl}
                        alt={`${report.title} 预览 ${index + 1}`}
                        className="h-72 w-full object-cover"
                        onError={(e) => {
                          // Fallback to icon if image fails to load
                          const target = e.target as HTMLImageElement
                          target.style.display = 'none'
                          const parent = target.parentElement
                          if (parent) {
                            parent.innerHTML = `
                              <div class="flex h-72 items-center justify-center bg-slate-100">
                                <div class="text-center">
                                  <svg class="mx-auto h-16 w-16 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path>
                                  </svg>
                                  <p class="mt-2 text-sm font-semibold text-slate-700">文件预览</p>
                                </div>
                              </div>
                            `
                          }
                        }}
                      />
                    )
                  ) : (
                    <div className="flex h-72 items-center justify-center bg-slate-100">
                      <FileIconForFile className="text-4xl text-slate-400" />
                    </div>
                  )}
                  <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
                    <span>
                      {report.files && report.files.length > 1 ? `文件 ${index + 1} · ` : ''}
                      {file.fileSizeMb.toFixed(1)} MB · {file.fileType || '未知类型'}
                    </span>
                    <button
                      onClick={() => {
                        const url = file.fileUrl || file.previewUrl
                        if (url) {
                          window.open(url, '_blank')
                        }
                      }}
                      className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-200"
                    >
                      查看
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-white shadow-card">
            <img
              src={report.previewImageUrl}
              alt={`${report.title} 预览`}
              className="h-72 w-full object-cover"
            />
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
              <span>在线预览仅供参考，原始文件保存在云端。</span>
              <button className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-200">
                放大查看
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="grid grid-cols-2 gap-3">
        <button
          onClick={handleDownload}
          className="flex items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-semibold text-white shadow-card transition hover:bg-primary-dark"
        >
          <FaDownload />
          下载
        </button>
        <button
          onClick={handleShare}
          className="flex items-center justify-center gap-2 rounded-2xl bg-slate-100 py-3 text-sm font-semibold text-slate-600 transition hover:bg-primary/10 hover:text-primary"
        >
          <FaShareAlt />
          分享
        </button>
        <button
          onClick={handleDelete}
          className="col-span-2 flex items-center justify-center gap-2 rounded-2xl bg-danger/10 py-3 text-sm font-semibold text-danger transition hover:bg-danger/20"
        >
          <FaTrash />
          删除报告
        </button>
      </section>

      <section className="space-y-3 rounded-2xl bg-slate-50 p-4">
        <div className="flex items-start gap-3 rounded-2xl bg-white px-4 py-3 text-sm text-slate-600 shadow-card">
          <FaLink className="mt-1 text-primary" />
          <div>
            <p className="font-semibold text-slate-800">分享链接（30 天内有效）</p>
            <p className="mt-1 break-all text-xs text-slate-500">
              https://phr.app/share/{report.id}
            </p>
            <p className="mt-2 text-xs text-slate-400">
              分享链接采用访问密码加密，您可在分享后随时撤回权限。
            </p>
          </div>
        </div>
        <div className="flex items-center justify-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-700">
          <FaShieldAlt />
          此报告已加密存储，仅您可访问
        </div>
      </section>
    </div>
  )
}
