import clsx from 'classnames'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import { FaBatteryThreeQuarters, FaSignal, FaWifi } from 'react-icons/fa'
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
  const [time, setTime] = useState(() => dayjs().format('HH:mm'))

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTime(dayjs().format('HH:mm'))
    }, 60_000)
    return () => window.clearInterval(interval)
  }, [])

  return (
    <header
      className={clsx(
        'flex h-14 items-center justify-between px-5',
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
        ) : (
          <span
            className={clsx(
              'text-base font-semibold tracking-wide',
              accent === 'brand' ? 'text-white' : 'text-slate-900',
            )}
          >
            {time}
          </span>
        )}
        {title ? (
          <span
            className={clsx(
              'text-sm font-semibold',
              accent === 'brand' ? 'text-white/90' : 'text-slate-800',
            )}
          >
            {title}
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-3 text-sm font-semibold">
        {rightContent ?? (
          <>
            <FaSignal className={accent === 'brand' ? 'text-white' : 'text-slate-700'} />
            <FaWifi className={accent === 'brand' ? 'text-white' : 'text-slate-700'} />
            <FaBatteryThreeQuarters
              className={accent === 'brand' ? 'text-white' : 'text-slate-700'}
            />
          </>
        )}
      </div>
    </header>
  )
}

