import clsx from 'classnames'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import {
  FaBrain,
  FaCamera,
  FaCheckCircle,
  FaCloudUploadAlt,
  FaFileAlt,
  FaFileImage,
  FaFilePdf,
  FaMagic,
  FaRegClock,
  FaTimes,
} from 'react-icons/fa'
import type { ChangeEvent, DragEvent as ReactDragEvent } from 'react'
import type { AppShellContextValue } from '../components/layout/AppShell'
import { useAppState } from '../context/AppStateContext'
import { api } from '../lib/api'

const categoryOptions = [
  { label: 'AI 自动分类', value: 'AI待分类' },
  { label: '体检', value: '体检' },
  { label: '检验', value: '检验' },
  { label: '影像', value: '影像' },
  { label: '病历', value: '病历' },
  { label: '用药', value: '用药' },
]

const pipelineSteps = [
  { label: '文件导入', detail: '保存原始资料' },
  { label: 'OCR 识别', detail: '抽取文字与表格' },
  { label: 'AI 分类', detail: '判断报告类型' },
  { label: '待你确认', detail: '只处理低置信度字段' },
]

const getFileIcon = (file: File) => {
  if (file.type.includes('pdf')) return FaFilePdf
  if (file.type.startsWith('image/')) return FaFileImage
  return FaFileAlt
}

const fileBaseName = (file: File) => file.name.replace(/\.[^/.]+$/, '')

export const UploadPage: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { setHeaderConfig } = useOutletContext<AppShellContextValue>()
  const { refreshReports } = useAppState()

  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [category, setCategory] = useState(categoryOptions[0].value)
  const [quickNote, setQuickNote] = useState(
    () => (location.state as { note?: string } | null)?.note ?? '',
  )
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState<'idle' | 'uploading' | 'success'>('idle')
  const [error, setError] = useState<string | null>(null)

  const firstFile = selectedFiles[0]
  const canImport = selectedFiles.length > 0 || quickNote.trim().length > 0

  const estimatedTitle = useMemo(() => {
    if (firstFile) return `待识别健康资料 · ${fileBaseName(firstFile)}`
    if (quickNote.trim()) return '自然语言健康记录'
    return '待识别健康资料'
  }, [firstFile, quickNote])

  useEffect(() => {
    setHeaderConfig({
      title: '导入健康资料',
      showBackButton: true,
    })
  }, [setHeaderConfig])

  const appendFiles = (files: FileList | File[]) => {
    const fileArray = Array.from(files)
    setSelectedFiles((prev) => {
      const existingKeys = new Set(prev.map((file) => `${file.name}-${file.size}`))
      const uniqueFiles = fileArray.filter((file) => {
        const key = `${file.name}-${file.size}`
        if (existingKeys.has(key)) return false
        existingKeys.add(key)
        return true
      })
      return [...prev, ...uniqueFiles]
    })
    setProgress(0)
    setError(null)
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      appendFiles(event.target.files)
    }
    event.target.value = ''
  }

  const handleDrop = (event: ReactDragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      appendFiles(event.dataTransfer.files)
    }
  }

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, fileIndex) => fileIndex !== index))
    setProgress(0)
  }

  const handleImport = async () => {
    if (!canImport) {
      setError('请先上传报告图片/PDF，或输入一句健康记录')
      return
    }

    setError(null)
    setStatus('uploading')
    setProgress(0)

    try {
      const uploadedFiles = []
      if (selectedFiles.length > 0) {
        for (let index = 0; index < selectedFiles.length; index += 1) {
          const file = selectedFiles[index]
          const uploadResult = await api.uploadFile(file, (fileProgress) => {
            const uploadProgress = Math.round(
              (index / selectedFiles.length) * 80 +
                (fileProgress / 100) * (80 / selectedFiles.length),
            )
            setProgress(Math.min(uploadProgress, 84))
          })

          uploadedFiles.push({
            fileUrl: uploadResult.url,
            previewUrl: uploadResult.url,
            mimeType: file.type,
            fileType: uploadResult.fileType,
            fileSize: uploadResult.fileSize,
            displayOrder: index,
          })
        }
      } else {
        setProgress(24)
      }

      setProgress((current) => Math.max(current, 88))
      await api.importDocument({
        title: estimatedTitle,
        category,
        sourceType: selectedFiles.length > 0 ? 'upload' : 'text',
        note: quickNote.trim(),
        files: uploadedFiles,
      })
      setProgress(100)
      await refreshReports()
      setStatus('success')
      setTimeout(() => {
        navigate('/archive', { replace: true })
      }, 900)
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败，请稍后重试')
      setStatus('idle')
      setProgress(0)
    }
  }

  return (
    <div className="space-y-5 bg-slate-50 px-4 pb-14 pt-5 md:px-8">
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FaBrain />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-900">把资料交给 AI 整理</h1>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              上传体检报告、化验单、影像结论或直接记录一句话。系统会先保存原始资料，再进入 OCR 和 AI 分类流程。
            </p>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <label
          htmlFor="report-camera"
          className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 text-left transition hover:border-primary hover:bg-primary/5"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-50 text-cyan-600">
            <FaCamera />
          </span>
          <span>
            <span className="block text-sm font-semibold text-slate-900">拍照导入</span>
            <span className="text-xs text-slate-500">报告、仪表屏幕</span>
          </span>
          <input
            id="report-camera"
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={handleFileChange}
            className="hidden"
          />
        </label>

        <label
          htmlFor="report-file"
          className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 text-left transition hover:border-primary hover:bg-primary/5"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <FaCloudUploadAlt />
          </span>
          <span>
            <span className="block text-sm font-semibold text-slate-900">上传文件</span>
            <span className="text-xs text-slate-500">PDF、JPG、PNG</span>
          </span>
          <input
            id="report-file"
            type="file"
            onChange={handleFileChange}
            accept=".pdf,.jpg,.jpeg,.png"
            multiple
            className="hidden"
          />
        </label>
      </section>

      <section className="rounded-lg border border-dashed border-slate-300 bg-white p-4">
        <label
          htmlFor="report-drop-file"
          onDrop={handleDrop}
          onDragOver={(event) => event.preventDefault()}
          className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg bg-slate-50 px-4 py-8 text-center transition hover:bg-primary/5"
        >
          <FaMagic className="text-3xl text-primary" />
          <div>
            <div className="text-sm font-semibold text-slate-900">拖拽资料到这里</div>
            <div className="mt-1 text-xs text-slate-500">
              可多选。后续 OCR 会按文件顺序处理并保留来源。
            </div>
          </div>
          <input
            id="report-drop-file"
            type="file"
            onChange={handleFileChange}
            accept=".pdf,.jpg,.jpeg,.png"
            multiple
            className="hidden"
          />
        </label>

        {selectedFiles.length > 0 ? (
          <div className="mt-4 space-y-2">
            {selectedFiles.map((file, index) => {
              const FileIcon = getFileIcon(file)
              return (
                <div
                  key={`${file.name}-${file.size}`}
                  className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                    <FileIcon />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{file.name}</p>
                    <p className="text-xs text-slate-500">
                      {(file.size / (1024 * 1024)).toFixed(2)} MB
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFile(index)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-danger"
                    aria-label="移除文件"
                  >
                    <FaTimes />
                  </button>
                </div>
              )
            })}
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <label className="text-sm font-semibold text-slate-900">一句话记录</label>
        <textarea
          value={quickNote}
          onChange={(event) => setQuickNote(event.target.value)}
          rows={3}
          placeholder="例如：今天早上血压 125/82，体重 72.4；或者这份报告是上周体检。"
          className="mt-3 w-full rounded-lg border-slate-200 bg-slate-50 px-3 py-3 text-sm transition focus:border-primary focus:bg-white focus:ring-primary/20"
        />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">分类提示</h2>
          <span className="text-xs text-slate-400">AI 会自动修正</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {categoryOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setCategory(option.value)}
              className={clsx(
                'rounded-lg border px-3 py-2 text-sm font-semibold transition',
                category === option.value
                  ? 'border-primary bg-primary text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-primary hover:text-primary',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">处理流程</h2>
        <div className="mt-4 space-y-3">
          {pipelineSteps.map((step, index) => {
            const isActive =
              status === 'success' || (status === 'uploading' && index === 0)
            const isPending = status === 'idle' || (status === 'uploading' && index > 0)
            return (
              <div key={step.label} className="flex items-center gap-3">
                <div
                  className={clsx(
                    'flex h-8 w-8 items-center justify-center rounded-lg text-xs font-semibold',
                    isActive
                      ? 'bg-emerald-50 text-emerald-600'
                      : isPending
                        ? 'bg-slate-100 text-slate-400'
                        : 'bg-primary/10 text-primary',
                  )}
                >
                  {isActive ? <FaCheckCircle /> : index + 1}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-900">{step.label}</p>
                  <p className="text-xs text-slate-500">{step.detail}</p>
                </div>
                {index > 0 ? (
                  <span className="flex items-center gap-1 text-xs text-slate-400">
                    <FaRegClock />
                    待接入
                  </span>
                ) : null}
              </div>
            )
          })}
        </div>

        {status !== 'idle' ? (
          <div className="mt-4">
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className={clsx('h-full rounded-full transition-all', {
                  'bg-primary': status === 'uploading',
                  'bg-emerald-500': status === 'success',
                })}
                style={{ width: `${status === 'success' ? 100 : progress}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {status === 'success'
                ? '资料已导入，已进入待 AI 处理队列。'
                : `正在保存原始资料：${progress}%`}
            </p>
          </div>
        ) : null}
      </section>

      {error ? (
        <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}

      <button
        type="button"
        onClick={handleImport}
        disabled={status === 'uploading'}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-4 text-base font-semibold text-white shadow-lg shadow-primary/20 transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:bg-primary/60"
      >
        <FaBrain />
        {status === 'uploading' ? '正在导入...' : '开始 AI 整理'}
      </button>
    </div>
  )
}
