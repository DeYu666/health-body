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
  FaMicroscope,
  FaPills,
  FaPlus,
  FaRedo,
  FaSave,
  FaTimes,
  FaTrash,
  FaUndo,
} from 'react-icons/fa'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import type { AppShellContextValue } from '../components/layout/AppShell'
import { useAppState } from '../context/AppStateContext'
import { api } from '../lib/api'
import type { ParsedDocumentMedication, ParsedDocumentObservation, ParsedHealthDocument } from '../types'

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

type MedicationForm = ParsedDocumentMedication

interface ReviewForm {
  title: string
  category: string
  categories: string[]
  organization: string
  department: string
  subjectName: string
  reportType: string
  documentDate: string
  summary: string
  aiConclusion: string
  confidence: string
  status: string
  observations: ObservationForm[]
  medications: MedicationForm[]
}

const buildReviewForm = (document: ParsedHealthDocument): ReviewForm => ({
  title: document.title || '',
  category: document.category || '其他',
  categories: document.categories?.length ? document.categories : [document.category || '其他'],
  organization: document.organization || '',
  department: document.department || '',
  subjectName: document.subjectName || '',
  reportType: document.reportType || '',
  documentDate: document.documentDate?.slice(0, 10) || '',
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
  medications: document.medications ?? [],
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
  const { reports, deleteReport, refreshReports } = useAppState()
  const [parsedDocument, setParsedDocument] = useState<ParsedHealthDocument | null>(null)
  const [parseStatus, setParseStatus] = useState<'idle' | 'loading' | 'loaded' | 'empty' | 'error'>('idle')
  const [parseError, setParseError] = useState<string | null>(null)
  const [isEditingReview, setIsEditingReview] = useState(false)
  const [reviewForm, setReviewForm] = useState<ReviewForm | null>(null)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving'>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [titleSaveStatus, setTitleSaveStatus] = useState<'idle' | 'saving'>('idle')
  const [titleSaveError, setTitleSaveError] = useState<string | null>(null)
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({})
  const [previewErrors, setPreviewErrors] = useState<Record<string, string>>({})
  const [fileRotations, setFileRotations] = useState<Record<string, number>>({})
  const [rotationSaving, setRotationSaving] = useState<Record<string, boolean>>({})
  const [structuredAnalysis, setStructuredAnalysis] = useState<'medications' | 'observations' | null>(null)

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

  useEffect(() => {
    if (!report?.files?.length) return
    let active = true
    const objectUrls: string[] = []
    report.files.filter((file) => file.fileType !== 'pdf' && !file.fileType?.includes('pdf')).forEach((file) => {
      api.getReportFileBlob(report.id, file.id).then((blob) => {
        if (!active) return
        const objectUrl = URL.createObjectURL(blob)
        objectUrls.push(objectUrl)
        setPreviewUrls((current) => ({ ...current, [file.id]: objectUrl }))
      }).catch((err) => {
        if (!active) return
        setPreviewErrors((current) => ({ ...current, [file.id]: err instanceof Error ? err.message : '预览加载失败' }))
      })
    })
    return () => {
      active = false
      objectUrls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [report])

  useEffect(() => {
    if (!report?.files) return
    setFileRotations(Object.fromEntries(report.files.map((file) => [file.id, file.rotation ?? 0])))
  }, [report])

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
          className="rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-white transition hover:bg-primary-dark"
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

  const handleOpenFile = async (fileId: string) => {
    try {
      const blob = await api.getReportFileBlob(report.id, fileId)
      const objectUrl = URL.createObjectURL(blob)
      window.open(objectUrl, '_blank', 'noopener,noreferrer')
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
    } catch (err) {
      alert(err instanceof Error ? err.message : '打开文件失败')
    }
  }

  const handleRotateFile = async (fileId: string, delta: number) => {
    const current = fileRotations[fileId] ?? 0
    const next = ((current + delta) % 360 + 360) % 360
    setFileRotations((rotations) => ({ ...rotations, [fileId]: next }))
    setRotationSaving((saving) => ({ ...saving, [fileId]: true }))
    try {
      await api.updateReportFileRotation(report.id, fileId, next)
    } catch (err) {
      setFileRotations((rotations) => ({ ...rotations, [fileId]: current }))
      alert(err instanceof Error ? err.message : '保存旋转角度失败')
    } finally {
      setRotationSaving((saving) => ({ ...saving, [fileId]: false }))
    }
  }

  const handleStartEditTitle = () => {
    setTitleDraft(report.title)
    setTitleSaveError(null)
    setIsEditingTitle(true)
  }

  const handleSaveTitle = async () => {
    const title = titleDraft.trim()
    if (!title) {
      setTitleSaveError('标题不能为空')
      return
    }

    setTitleSaveStatus('saving')
    setTitleSaveError(null)
    try {
      await api.updateReport(report.id, { title })
      await refreshReports()
      setIsEditingTitle(false)
    } catch (err) {
      setTitleSaveError(err instanceof Error ? err.message : '修改标题失败，请稍后重试')
    } finally {
      setTitleSaveStatus('idle')
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

  const addObservationForm = () => {
    setReviewForm((prev) => {
      if (!prev) return prev
      const newObservation: ObservationForm = {
        id: `new-${Date.now()}`,
        name: '',
        normalizedName: '',
        code: '',
        valueText: '',
        valueInput: '',
        unit: '',
        referenceText: '',
        abnormalFlag: 'normal',
        reviewStatus: 'pending',
        confidence: parsedDocument?.confidence,
      }
      return {
        ...prev,
        observations: [...prev.observations, newObservation],
      }
    })
  }

  const addMedicationForm = () => {
    setReviewForm((prev) => prev ? {
      ...prev,
      medications: [...prev.medications, {
        id: `new-medication-${Date.now()}`,
        name: '', genericName: '', specification: '', dose: '', frequency: '', route: '',
        duration: '', quantity: '', instructions: '', reviewStatus: 'pending',
        confidence: parsedDocument?.confidence,
      }],
    } : prev)
  }

  const updateMedicationForm = (index: number, field: keyof MedicationForm, value: string) => {
    setReviewForm((prev) => prev ? {
      ...prev,
      medications: prev.medications.map((medication, currentIndex) =>
        currentIndex === index ? { ...medication, [field]: value } : medication,
      ),
    } : prev)
  }

  const handleStructuredAnalysis = async (kind: 'medications' | 'observations') => {
    if (!parsedDocument) return
    setStructuredAnalysis(kind)
    setSaveError(null)
    try {
      const result = await api.analyzeDocumentStructured(parsedDocument.id, kind)
      setReviewForm((prev) => {
        if (!prev) return prev
        if (kind === 'medications') {
          return { ...prev, medications: result.medications ?? [] }
        }
        return {
          ...prev,
          observations: (result.observations ?? []).map((observation) => ({
            ...observation,
            valueInput: typeof observation.valueNumber === 'number' ? String(observation.valueNumber) : observation.valueText,
          })),
        }
      })
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'AI 结构化解析失败')
    } finally {
      setStructuredAnalysis(null)
    }
  }

  const handleSaveReview = async () => {
    if (!parsedDocument || !reviewForm) return
    setSaveStatus('saving')
    setSaveError(null)
    try {
      const updated = await api.updateDocumentReview(parsedDocument.id, {
        title: reviewForm.title,
        category: reviewForm.category,
        categories: reviewForm.categories,
        organization: reviewForm.organization,
        department: reviewForm.department,
        subjectName: reviewForm.subjectName,
        reportType: reviewForm.reportType,
        documentDate: reviewForm.documentDate ? dayjs(reviewForm.documentDate).toISOString() : undefined,
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
        medications: reviewForm.medications.map((medication) => ({
          name: medication.name,
          genericName: medication.genericName,
          specification: medication.specification,
          dose: medication.dose,
          frequency: medication.frequency,
          route: medication.route,
          duration: medication.duration,
          quantity: medication.quantity,
          instructions: medication.instructions,
          confidence: medication.confidence,
          reviewStatus: medication.reviewStatus,
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
  const medications = parsedDocument?.medications ?? []

  return (
    <div className="mx-auto max-w-7xl space-y-6 bg-slate-50 px-4 pb-14 pt-5 md:px-6 lg:px-8">
      <section className="rounded-lg bg-slate-50 p-4 shadow-inner">
        <div className="flex items-start gap-2">
          {isEditingTitle ? (
            <div className="min-w-0 flex-1 space-y-2">
              <input
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xl font-semibold text-slate-900 outline-none focus:border-primary"
                aria-label="报告标题"
              />
              {titleSaveError ? <p className="text-xs text-red-600">{titleSaveError}</p> : null}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSaveTitle}
                  disabled={titleSaveStatus === 'saving'}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                >
                  {titleSaveStatus === 'saving' ? '保存中' : '保存'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingTitle(false)}
                  className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-600"
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <>
              <h1 className="min-w-0 flex-1 text-xl font-semibold text-slate-900">{report.title}</h1>
              <button
                type="button"
                onClick={handleStartEditTitle}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-slate-500 transition hover:bg-primary hover:text-white"
                aria-label="修改报告标题"
              >
                <FaEdit />
              </button>
            </>
          )}
        </div>
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
          <div className="mt-4 rounded-lg bg-white px-4 py-3 text-sm text-slate-600">
            <strong className="text-slate-800">备注：</strong>
            {report.notes}
          </div>
        ) : null}
      </section>

      <section className="space-y-4 rounded-lg bg-slate-50 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
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
          <div className="rounded-lg bg-white px-4 py-3 text-sm text-slate-500">
            正在读取 OCR/AI 解析结果...
          </div>
        ) : null}

        {parseStatus === 'empty' ? (
          <div className="rounded-lg bg-white px-4 py-3 text-sm text-slate-500">
            暂无 OCR/AI 解析结果，可回到档案页点击“解析历史”生成。
          </div>
        ) : null}

        {parseStatus === 'error' ? (
          <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
            {parseError}
          </div>
        ) : null}

        {parsedDocument && reviewForm && isEditingReview ? (
          <div className="space-y-3">
            <div className="rounded-lg bg-white p-4">
              <div className="grid gap-3 md:grid-cols-2">
                {([
                  ['title', '报告标题'],
                  ['subjectName', '姓名（OCR 候选）'],
                  ['reportType', '报告类型'],
                  ['organization', '医院 / 机构'],
                  ['department', '科室'],
                ] as const).map(([field, label]) => (
                  <label key={field} className="text-xs font-semibold text-slate-500">
                    {label}
                    <input value={reviewForm[field]} onChange={(event) => setReviewForm((prev) => prev ? { ...prev, [field]: event.target.value } : prev)} className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800" />
                  </label>
                ))}
                <label className="text-xs font-semibold text-slate-500">
                  报告日期
                  <input type="date" value={reviewForm.documentDate} onChange={(event) => setReviewForm((prev) => prev ? { ...prev, documentDate: event.target.value } : prev)} className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800" />
                </label>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <fieldset className="text-xs font-semibold text-slate-500 md:col-span-3">
                  <legend>分类（可多选）</legend>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {categoryOptions.map((category) => {
                      const checked = reviewForm.categories.includes(category)
                      return (
                        <label key={category} className={`cursor-pointer rounded-lg border px-3 py-2 text-sm transition ${checked ? 'border-primary bg-primary/10 text-primary' : 'border-slate-200 bg-white text-slate-600'}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => setReviewForm((prev) => {
                              if (!prev) return prev
                              let categories = checked ? prev.categories.filter((item) => item !== category) : [...prev.categories.filter((item) => item !== '其他'), category]
                              if (category === '其他' && !checked) categories = ['其他']
                              if (categories.length === 0) categories = ['其他']
                              return { ...prev, categories, category: categories[0] }
                            })}
                            className="sr-only"
                          />
                          {category}
                        </label>
                      )
                    })}
                  </div>
                </fieldset>
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

            <div className="rounded-lg bg-white p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <FaMicroscope className="text-primary" />
                    校验结构化指标
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={structuredAnalysis !== null} onClick={() => handleStructuredAnalysis('observations')} className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white transition hover:bg-primary-dark disabled:opacity-60">
                      <FaBrain /> {structuredAnalysis === 'observations' ? '解析中…' : 'AI 解析'}
                    </button>
                    <button type="button" onClick={addObservationForm} className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary hover:text-white">
                      <FaPlus /> 增加指标
                    </button>
                  </div>
                </div>
                {reviewForm.observations.length > 0 ? (
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
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                    暂无结构化指标，可点击“增加指标”手动补充。
                  </div>
                )}
            </div>

            {(reviewForm.categories.includes('用药') || reviewForm.medications.length > 0) ? (
              <div className="rounded-lg bg-white p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <FaPills className="text-primary" />
                    校验处方用药
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={structuredAnalysis !== null} onClick={() => handleStructuredAnalysis('medications')} className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white transition hover:bg-primary-dark disabled:opacity-60">
                      <FaBrain /> {structuredAnalysis === 'medications' ? '解析中…' : 'AI 解析'}
                    </button>
                    <button type="button" onClick={addMedicationForm} className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary hover:text-white">
                      <FaPlus /> 增加药品
                    </button>
                  </div>
                </div>
                {reviewForm.medications.length > 0 ? (
                  <div className="space-y-3">
                    {reviewForm.medications.map((medication, index) => (
                      <div key={`${medication.id}-${index}`} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                        <div className="grid gap-3 md:grid-cols-3">
                          {([['name', '药品名称'], ['genericName', '通用名'], ['specification', '规格'], ['dose', '单次剂量'], ['frequency', '频次'], ['route', '用法'], ['duration', '疗程'], ['quantity', '数量'], ['instructions', '补充说明']] as const).map(([field, label]) => (
                            <label key={field} className="text-xs font-semibold text-slate-500">
                              {label}
                              <input value={medication[field]} onChange={(event) => updateMedicationForm(index, field, event.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800" />
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">未识别出药品，可手动增加。</div>
                )}
              </div>
            ) : null}

            {saveError ? (
              <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                {saveError}
              </div>
            ) : null}

            <button
              type="button"
              onClick={handleSaveReview}
              disabled={saveStatus === 'saving'}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              <FaSave />
              {saveStatus === 'saving' ? '保存中...' : '保存人工校验'}
            </button>
          </div>
        ) : parsedDocument ? (
          <div className="space-y-3">
            <div className="rounded-lg bg-white px-4 py-3 text-sm text-slate-600">
              <div className="flex flex-wrap gap-2">
                {(parsedDocument.categories?.length ? parsedDocument.categories : [parsedDocument.category || '未分类']).map((category) => (
                  <span key={category} className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">{category}</span>
                ))}
                <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                  {parsedDocument.status === 'ready' ? '已就绪' : '待复核'}
                </span>
                {latestOCR ? (
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                    OCR {formatConfidence(latestOCR.confidence)}
                  </span>
                ) : null}
              </div>
              <dl className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ['姓名', parsedDocument.subjectName || '未识别'],
                  ['报告类型', parsedDocument.reportType || parsedDocument.category || '未识别'],
                  ['机构', parsedDocument.organization || '未识别'],
                  ['科室', parsedDocument.department || '未识别'],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-slate-400">{label}</dt>
                    <dd className="mt-1 text-sm font-semibold text-slate-800">{value}</dd>
                  </div>
                ))}
              </dl>
              {parsedDocument.summary ? (
                <p className="mt-3 leading-6">{parsedDocument.summary}</p>
              ) : null}
              {parsedDocument.aiConclusion ? (
                <p className="mt-2 leading-6 text-slate-500">{parsedDocument.aiConclusion}</p>
              ) : null}
            </div>

            {observations.length > 0 ? (
              <div className="rounded-lg bg-white p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <FaMicroscope className="text-primary" />
                  结构化指标
                </div>
                {parsedDocument.categories?.includes('检验') || parsedDocument.categories?.includes('体检') || parsedDocument.category === '检验' || parsedDocument.category === '体检' ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[620px] border-collapse text-left text-sm">
                      <thead><tr className="border-b border-slate-200 text-xs text-slate-500"><th className="px-3 py-2">项目</th><th className="px-3 py-2">结果</th><th className="px-3 py-2">参考范围</th><th className="px-3 py-2">状态</th></tr></thead>
                      <tbody>{observations.map((observation) => (
                        <tr key={observation.id} className="border-b border-slate-100 last:border-0">
                          <td className="px-3 py-3 font-semibold text-slate-800">{observation.name}</td>
                          <td className="px-3 py-3 text-slate-900">{formatObservationValue(observation)}</td>
                          <td className="px-3 py-3 text-slate-500">{observation.referenceText || '—'}</td>
                          <td className="px-3 py-3"><span className={observation.abnormalFlag === 'high' || observation.abnormalFlag === 'low' ? 'rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700' : 'rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700'}>{abnormalFlagLabel[observation.abnormalFlag] ?? '待复核'}</span></td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                ) : (
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
                )}
              </div>
            ) : null}

            {medications.length > 0 ? (
              <div className="rounded-lg bg-white p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <FaPills className="text-primary" />
                  处方用药
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {medications.map((medication) => (
                    <article key={medication.id} className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                      <h3 className="font-semibold text-slate-900">{medication.name}</h3>
                      {medication.genericName ? <p className="mt-1 text-xs text-slate-500">通用名：{medication.genericName}</p> : null}
                      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        {([['规格', medication.specification], ['剂量', medication.dose], ['频次', medication.frequency], ['用法', medication.route], ['疗程', medication.duration], ['数量', medication.quantity]] as const).filter(([, value]) => value).map(([label, value]) => (
                          <div key={label}><dt className="text-xs text-slate-400">{label}</dt><dd className="mt-0.5 text-slate-700">{value}</dd></div>
                        ))}
                      </dl>
                      {medication.instructions ? <p className="mt-3 rounded-md bg-white px-3 py-2 text-sm text-slate-600">{medication.instructions}</p> : null}
                    </article>
                  ))}
                </div>
              </div>
            ) : null}

            {latestOCR ? (
              <details className="rounded-lg bg-white p-4">
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

      <section className="space-y-4 rounded-lg bg-slate-50 p-4">
        <h2 className="text-sm font-semibold text-slate-600">
          报告预览 {report.files && report.files.length > 1 ? `(${report.files.length} 个文件)` : ''}
        </h2>
        {report.files && report.files.length > 0 ? (
          <div className="space-y-3">
            {report.files.map((file, index) => {
              const FileIconForFile = file.fileType === 'pdf' || file.fileType?.includes('pdf') ? FaFilePdf : FaFileAlt
              return (
                <div key={file.id || index} className="overflow-hidden rounded-lg bg-white shadow-sm">
                  {file.previewUrl || file.fileUrl ? (
                    file.fileType === 'pdf' || file.fileType?.includes('pdf') ? (
                      <div className="flex h-72 items-center justify-center bg-slate-100">
                        <div className="text-center">
                          <FaFilePdf className="mx-auto text-6xl text-red-500" />
                          <p className="mt-4 text-sm font-semibold text-slate-700">PDF 文档</p>
                          <p className="mt-1 text-xs text-slate-500">{file.fileSizeMb.toFixed(1)} MB</p>
                        </div>
                      </div>
                    ) : previewUrls[file.id] ? (
                      <div className="flex h-[min(70vh,36rem)] items-center justify-center overflow-hidden bg-slate-100">
                        <img
                          src={previewUrls[file.id]}
                          alt={`${report.title} 预览 ${index + 1}`}
                          className="h-full w-full object-contain transition-transform duration-200"
                          style={{ transform: `rotate(${fileRotations[file.id] ?? file.rotation ?? 0}deg)` }}
                        />
                      </div>
                    ) : (
                      <div className="flex h-72 items-center justify-center bg-slate-100 px-6 text-center text-sm text-slate-500">
                        {previewErrors[file.id] || '正在安全加载预览…'}
                      </div>
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
                    <div className="flex items-center gap-1.5">
                      {file.fileType !== 'pdf' && !file.fileType?.includes('pdf') ? (
                        <>
                          <button
                            type="button"
                            aria-label="向左旋转图片"
                            title="向左旋转"
                            disabled={rotationSaving[file.id]}
                            onClick={() => handleRotateFile(file.id, -90)}
                            className="rounded-full bg-slate-100 p-2 text-slate-600 transition hover:bg-slate-200 disabled:cursor-wait disabled:opacity-50"
                          >
                            <FaUndo />
                          </button>
                          <span className="min-w-8 text-center tabular-nums text-slate-400">
                            {fileRotations[file.id] ?? file.rotation ?? 0}°
                          </span>
                          <button
                            type="button"
                            aria-label="向右旋转图片"
                            title="向右旋转"
                            disabled={rotationSaving[file.id]}
                            onClick={() => handleRotateFile(file.id, 90)}
                            className="rounded-full bg-slate-100 p-2 text-slate-600 transition hover:bg-slate-200 disabled:cursor-wait disabled:opacity-50"
                          >
                            <FaRedo />
                          </button>
                        </>
                      ) : null}
                      <button
                        onClick={() => handleOpenFile(file.id)}
                        className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-200"
                      >
                        查看
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">该报告没有关联文件。</div>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <button
          onClick={handleDownload}
          className="flex items-center justify-center gap-2 rounded-lg bg-primary py-3 text-sm font-semibold text-white transition hover:bg-primary-dark"
        >
          <FaDownload />
          下载
        </button>
        <button
          onClick={handleDelete}
          className="flex items-center justify-center gap-2 rounded-lg bg-danger/10 py-3 text-sm font-semibold text-danger transition hover:bg-danger/20"
        >
          <FaTrash />
          删除报告
        </button>
      </section>

    </div>
  )
}
