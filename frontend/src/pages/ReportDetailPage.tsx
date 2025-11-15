import dayjs from 'dayjs'
import { useEffect, useMemo } from 'react'
import { FaCalendarAlt, FaDownload, FaFileAlt, FaFilePdf, FaHospital, FaLink, FaShareAlt, FaShieldAlt, FaTrash } from 'react-icons/fa'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import type { AppShellContextValue } from '../components/layout/AppShell'
import { useAppState } from '../context/AppStateContext'
import { api } from '../lib/api'

export const ReportDetailPage: React.FC = () => {
  const { reportId } = useParams<{ reportId: string }>()
  const navigate = useNavigate()
  const { setHeaderConfig } = useOutletContext<AppShellContextValue>()
  const { reports, deleteReport } = useAppState()

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

  const PreviewIcon = report.fileType === 'pdf' ? FaFilePdf : FaFileAlt

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

