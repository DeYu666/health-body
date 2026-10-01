import clsx from 'classnames'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import {
  FaBrain,
  FaCamera,
  FaCloudUploadAlt,
  FaFileAlt,
  FaFileImage,
  FaFilePdf,
  FaMagic,
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
  { label: '查看结果', detail: '对照原件核对需要修正的内容' },
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
  const { refreshReports, refreshMetrics, selectedMemberId, activeMember } = useAppState()

  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [category, setCategory] = useState(categoryOptions[0].value)
  const [fileMode, setFileMode] = useState<'report' | 'separate'>('report')
  const [resultMessage, setResultMessage] = useState('')
  const [resultPath, setResultPath] = useState('/archive')
  const [backgroundProcessing, setBackgroundProcessing] = useState(false)
  const [quickNote, setQuickNote] = useState(
    () => (location.state as { note?: string } | null)?.note ?? '',
  )
  const [progress, setProgress] = useState(0)
  const [processing, setProcessing] = useState(false)
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
    if (!selectedMemberId) {
      setError('请先选择资料归属的家庭成员')
      return
    }

    setError(null)
    setStatus('uploading')
    setProcessing(false)
    setProgress(0)

    try {
      const uploadedFiles = []
      if (selectedFiles.length > 0) {
        for (let index = 0; index < selectedFiles.length; index += 1) {
          const file = selectedFiles[index]
          const uploadResult = await api.uploadFile(file, (fileProgress) => {
            const uploadProgress = Math.round(
              (index / selectedFiles.length) * 100 +
                (fileProgress / 100) * (100 / selectedFiles.length),
            )
            setProgress(Math.min(uploadProgress, 100))
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
      }

      setProcessing(true)
      const result = await api.importDocument({
        memberId: selectedMemberId,
        fileMode,
        title: estimatedTitle,
        category,
        sourceType: selectedFiles.length > 0 ? 'upload' : 'text',
        note: quickNote.trim(),
        files: uploadedFiles,
      })
      setProgress(100)
      await Promise.all([refreshReports(), refreshMetrics()])
      const queued = 'status' in result
      setBackgroundProcessing(queued)
      setResultPath(!queued && result.legacyReport ? `/reports/${result.legacyReport.id}` : '/archive')
      setResultMessage(queued
        ? `已提交 ${result.documents} 份资料，后台正在逐份整理。可前往档案查看结果。`
        : result.document.status === 'ready'
          ? result.document.summary || '资料已归档，可以查看整理结果和原件。'
          : '原始资料已保存，部分内容还需要核对。请查看结果后确认。')
      setStatus('success')
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败，请稍后重试')
      setStatus('idle')
      setProgress(0)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 bg-slate-50 px-4 pb-14 pt-5 md:px-6 lg:px-8">
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FaBrain />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-900">存好报告，下次需要时随手找到</h1>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              选择报告图片或 PDF，整理后查看摘要与原件。姓名识别结果不会更改你选择的归属成员。
            </p>
          </div>
        </div>
      </section>

      <button type="button" onClick={() => navigate('/health-data')} className="flex w-full items-center justify-between rounded-lg border border-cyan-200 bg-cyan-50 p-4 text-left text-sm text-cyan-900">
        <span><strong className="block">导入 Apple 健康数据</strong><span className="mt-1 block text-xs">把手表的心率、活动与身体测量记录带进医疗本</span></span>
        <span>前往 →</span>
      </button>

      <section className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4">
        <div>
          <p className="text-xs font-semibold text-slate-500">归属成员</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{activeMember?.name ?? '正在加载成员'}</p>
        </div>
        <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">{activeMember?.relationship ?? '家庭成员'}</span>
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
        {selectedFiles.length > 1 ? (
          <fieldset className="mt-4 space-y-2 text-sm text-slate-700" disabled={status !== 'idle'}>
            <legend className="mb-2 font-semibold">这些文件如何归档？</legend>
            <label className="flex items-center gap-2"><input type="radio" name="file-mode" checked={fileMode === 'report'} onChange={() => setFileMode('report')} />同一份报告的多页，合并保存</label>
            <label className="flex items-center gap-2"><input type="radio" name="file-mode" checked={fileMode === 'separate'} onChange={() => setFileMode('separate')} />不同报告，每个文件独立归档</label>
          </fieldset>
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

      <details className="rounded-lg border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-900">资料会怎样整理</summary>
        <div className="mt-4 space-y-3">
          {pipelineSteps.map((step, index) => (
              <div key={step.label} className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-500">{index + 1}</div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-900">{step.label}</p>
                  <p className="text-xs text-slate-500">{step.detail}</p>
                </div>
              </div>
          ))}
        </div>
      </details>

      {status === 'uploading' ? <p role="status" className="text-sm text-slate-600">{processing ? '正在整理内容，请稍候…' : `正在上传文件 ${progress}%`}</p> : null}
      {status === 'success' ? (
        <section role="status" className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <h2 className="font-semibold text-emerald-900">{backgroundProcessing ? '资料已提交' : '原件已保存'}</h2>
          <p className="text-sm leading-6 text-emerald-900">{resultMessage}</p>
          <button type="button" onClick={() => navigate(resultPath, { state: { processing: backgroundProcessing } })} className="rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white">{backgroundProcessing ? '查看整理进度' : '查看结果与原件'}</button>
        </section>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}

      <button
        type="button"
        onClick={handleImport}
        disabled={status !== 'idle' || !canImport || !selectedMemberId}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-4 text-base font-semibold text-white shadow-lg shadow-primary/20 transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:bg-primary/60"
      >
        <FaBrain />
        {status === 'success' ? '本次资料已提交' : status === 'uploading' ? '正在导入...' : '保存并整理'}
      </button>
    </div>
  )
}
