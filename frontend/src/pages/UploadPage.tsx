import clsx from 'classnames'
import dayjs from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import {
  FaCheckCircle,
  FaCloudUploadAlt,
  FaFileAlt,
  FaFileImage,
  FaFilePdf,
  FaInfoCircle,
  FaTimes,
} from 'react-icons/fa'
import type { ChangeEvent, FormEvent, DragEvent as ReactDragEvent } from 'react'
import type { AppShellContextValue } from '../components/layout/AppShell'
import { useAppState } from '../context/AppStateContext'
import type { UploadPayload } from '../types'

const presetTags = ['血常规', 'CT', 'B超', '心电图', 'X光', 'MRI']

export const UploadPage: React.FC = () => {
  console.log('[UploadPage] 组件已加载')
  
  const navigate = useNavigate()
  const { setHeaderConfig } = useOutletContext<AppShellContextValue>()
  const { addReport } = useAppState()
  
  console.log('[UploadPage] addReport 函数:', typeof addReport)
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [title, setTitle] = useState('2024年1月血常规检查')
  const [hospital, setHospital] = useState('北京协和医院')
  const [reportDate, setReportDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [tags, setTags] = useState<string[]>(['血常规'])
  const [customTag, setCustomTag] = useState('')
  const [notes, setNotes] = useState(
    '医生建议继续保持均衡饮食与适量运动，三个月后复查。',
  )
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState<'idle' | 'uploading' | 'success'>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setHeaderConfig({
      title: '上传报告',
      showBackButton: true,
    })
  }, [setHeaderConfig])

  const FileIcon = useMemo(() => {
    if (!selectedFile) return FaFileAlt
    if (selectedFile.type.includes('pdf')) return FaFilePdf
    if (selectedFile.type.startsWith('image/')) return FaFileImage
    return FaFileAlt
  }, [selectedFile])

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      setProgress(0)
    }
  }

  const toggleTag = (tag: string) => {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag],
    )
  }

  const handleCustomTagSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!customTag.trim()) return
    setTags((prev) => [...prev, customTag.trim()])
    setCustomTag('')
  }

  const simulateUpload = async () => {
    console.log('[UploadPage] simulateUpload 被调用', {
      hasSelectedFile: !!selectedFile,
      fileName: selectedFile?.name,
      fileSize: selectedFile?.size,
    })

    if (!selectedFile) {
      console.error('[UploadPage] 错误：没有选择文件')
      setError('请先选择或拖拽文件')
      return
    }

    setError(null)
    setStatus('uploading')
    setProgress(0)

    const payload: UploadPayload = {
      title,
      hospital,
      reportDate: dayjs(reportDate).toISOString(),
      tags,
      notes,
      file: selectedFile,
    }

    console.log('[UploadPage] 准备调用 addReport', {
      payload: {
        ...payload,
        file: {
          name: payload.file?.name,
          size: payload.file?.size,
          type: payload.file?.type,
        },
      },
    })

    try {
      await addReport(payload, (progress) => {
        console.log('[UploadPage] 上传进度:', progress)
        setProgress(progress)
      })
      console.log('[UploadPage] 上传成功')
      setStatus('success')
      setTimeout(() => {
        navigate('/archive', { replace: true })
      }, 1200)
    } catch (err) {
      console.error('[UploadPage] 上传失败:', err)
      setError(err instanceof Error ? err.message : '上传失败，请稍后重试')
      setStatus('idle')
      setProgress(0)
    }
  }

  const handleDrop = (event: ReactDragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    const file = event.dataTransfer.files?.[0]
    if (file) {
      setSelectedFile(file)
      setProgress(0)
    }
  }

  return (
    <div className="space-y-6 bg-white px-4 pb-14 pt-6 md:px-8">
      <section className="rounded-2xl bg-slate-50 p-4">
        <div className="flex items-start gap-3 text-sm text-slate-600">
          <FaInfoCircle className="mt-1 text-primary" />
          <div>
            <p className="font-semibold text-slate-800">
              文件将使用 AES-256 加密后上传至云端
            </p>
            <p className="mt-1 text-xs text-slate-500">
              支持 PDF、JPG、PNG，单份文件最大 50MB。上传完成后可在线预览、分享或删除。
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-6">
        <label
          htmlFor="report-file"
          onDrop={handleDrop}
          onDragOver={(event) => event.preventDefault()}
          className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center transition hover:border-primary hover:bg-primary/5"
        >
          <FaCloudUploadAlt className="text-4xl text-slate-300" />
          <div className="text-sm font-semibold text-slate-800">点击或拖拽文件到此处</div>
          <div className="text-xs text-slate-500">支持 PDF、JPG、PNG，最大 50 MB</div>
          <input
            id="report-file"
            type="file"
            onChange={handleFileChange}
            accept=".pdf,.jpg,.jpeg,.png"
            className="hidden"
          />
        </label>

        {selectedFile ? (
          <div className="mt-4 rounded-2xl bg-white p-4 shadow-card">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                {FileIcon ? <FileIcon className="text-xl" /> : null}
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-900">{selectedFile.name}</p>
                <p className="text-xs text-slate-500">
                  {dayjs().format('YYYY-MM-DD HH:mm')} ·{' '}
                  {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                </p>
              </div>
              <button
                className="rounded-full bg-slate-100 p-2 text-slate-500 transition hover:bg-danger/10 hover:text-danger"
                onClick={() => {
                  setSelectedFile(null)
                  setProgress(0)
                }}
              >
                <FaTimes />
              </button>
            </div>

            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={clsx(
                  'h-full rounded-full transition-all',
                  status === 'success' ? 'bg-emerald-500' : 'bg-primary',
                )}
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-2 text-xs text-slate-500">
              {status === 'success' ? '上传成功！数据已加密存储。' : `上传进度：${progress}%`}
            </div>
          </div>
        ) : null}
      </section>

      <section className="space-y-4 rounded-2xl bg-slate-50 p-4">
        <h2 className="text-sm font-semibold text-slate-600">报告信息</h2>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            报告标题
          </label>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="例如：2024年1月血常规检查"
            className="mt-2 w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-sm font-medium transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            医院/机构
          </label>
          <input
            value={hospital}
            onChange={(event) => setHospital(event.target.value)}
            placeholder="北京协和医院"
            className="mt-2 w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-sm font-medium transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            检查日期
          </label>
          <input
            type="date"
            value={reportDate}
            onChange={(event) => setReportDate(event.target.value)}
            className="mt-2 w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-sm font-medium transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </section>

      <section className="space-y-4 rounded-2xl bg-slate-50 p-4">
        <h2 className="text-sm font-semibold text-slate-600">标签</h2>
        <div className="flex flex-wrap gap-2">
          {presetTags.map((tag) => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className={clsx(
                'rounded-full px-4 py-2 text-sm font-semibold transition',
                tags.includes(tag)
                  ? 'bg-primary text-white shadow-card'
                  : 'bg-white text-primary hover:bg-primary/10',
              )}
            >
              {tag}
            </button>
          ))}
        </div>
        <form onSubmit={handleCustomTagSubmit} className="flex gap-2">
          <input
            value={customTag}
            onChange={(event) => setCustomTag(event.target.value)}
            placeholder="添加自定义标签（回车确认）"
            className="flex-1 rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-sm font-medium transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <button
            type="submit"
            className="rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary-dark"
          >
            添加
          </button>
        </form>
        {tags.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </section>

      <section className="space-y-3 rounded-2xl bg-slate-50 p-4">
        <h2 className="text-sm font-semibold text-slate-600">备注</h2>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="添加备注信息..."
          rows={4}
          className="w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-sm font-medium transition focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700">
          <FaCheckCircle />
          上传完成后，您可以在“我的档案”中查看和管理。
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}

      <button
        type="button"
        onClick={(e) => {
          console.log('[UploadPage] ====== 按钮点击事件触发 ======')
          e.preventDefault()
          e.stopPropagation()
          console.log('[UploadPage] 按钮被点击！', {
            status,
            hasSelectedFile: !!selectedFile,
            selectedFile: selectedFile?.name,
            addReportType: typeof addReport,
          })
          
          // 直接测试
          if (!selectedFile) {
            alert('请先选择文件！')
            return
          }
          
          console.log('[UploadPage] 开始调用 simulateUpload')
          simulateUpload()
        }}
        onMouseDown={() => console.log('[UploadPage] 按钮 onMouseDown')}
        onMouseUp={() => console.log('[UploadPage] 按钮 onMouseUp')}
        disabled={status === 'uploading'}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-base font-semibold text-white shadow-lg shadow-primary/30 transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:bg-primary/60"
        style={{ position: 'relative', zIndex: 1000 }}
      >
        <FaCloudUploadAlt className="text-lg" />
        {status === 'uploading' ? '正在上传...' : '确认上传'}
      </button>
    </div>
  )
}

