import clsx from 'classnames'
import type { IconType } from 'react-icons'
import { NavLink } from 'react-router-dom'

interface BottomNavItem {
  label: string
  subLabel?: string
  path: string
  icon: IconType
}

interface BottomNavProps {
  items: BottomNavItem[]
  className?: string
}

export const BottomNav: React.FC<BottomNavProps> = ({ items, className }) => {
  return (
    <nav
      className={clsx(
        'sticky bottom-0 w-full bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/70',
        className,
      )}
    >
      <div className="grid grid-cols-4 gap-2 border-t border-slate-200 px-3 py-2">
        {items.map(({ icon: Icon, label, path }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              clsx(
                'flex flex-col items-center gap-1 rounded-xl py-2 text-center text-xs font-medium transition-all',
                isActive
                  ? 'text-primary bg-primary/10 shadow-inner'
                  : 'text-slate-400 hover:text-primary',
              )
            }
          >
            <Icon className="text-lg" />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

