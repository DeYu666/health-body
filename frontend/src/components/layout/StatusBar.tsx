import clsx from 'classnames'
import { HiMiniArrowLeft } from 'react-icons/hi2'
import type { ReactNode } from 'react'

export interface StatusBarConfig {
  title?: string
  showBackButton?: boolean
  onBack?: () => void
  rightContent?: ReactNode
  accent?: 'light' | 'brand'
}

export const StatusBar: React.FC<StatusBarConfig> = ({
  title,
  showBackButton = false,
  onBack,
  rightContent,
  accent = 'light',
}) => {
  return (
    <header
      className={clsx(
        'flex min-h-16 items-center justify-between gap-4 px-4 md:px-6',
        accent === 'brand' ? 'border-b border-white/20 bg-white/10 text-white' : 'border-b border-slate-200 bg-white text-slate-900',
      )}
    >
      <div className="flex items-center gap-3">
        {showBackButton ? (
          <button
            onClick={onBack}
            className={clsx(
              'flex h-9 w-9 items-center justify-center rounded-full border transition-colors',
              accent === 'brand'
                ? 'border-white/30 text-white hover:bg-white/20'
                : 'border-slate-200 text-slate-700 hover:bg-slate-100',
            )}
            aria-label="返回上一页"
          >
            <HiMiniArrowLeft className="text-lg" />
          </button>
        ) : null}
        {title || !showBackButton ? (
          <span
            className={clsx(
              'text-sm font-semibold',
              accent === 'brand' ? 'text-white/90' : 'text-slate-800',
            )}
          >
            {title || '家庭医疗本'}
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-3 text-sm font-semibold">{rightContent}</div>
    </header>
  )
}
