import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { FaBackspace, FaFingerprint } from 'react-icons/fa'
import clsx from 'classnames'
import { useAuth } from '../context/AuthContext'

const PIN_LENGTH = 6

export const PinPage: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { verifyPin, user } = useAuth()
  const [pin, setPin] = useState<number[]>([])
  const [status, setStatus] = useState<'idle' | 'verifying' | 'error'>('idle')
  const [email, setEmail] = useState<string>(
    () =>
      (location.state as { email?: string })?.email ||
      user?.email ||
      localStorage.getItem('last_email') ||
      '',
  )

  useEffect(() => {
    if (pin.length === PIN_LENGTH && email) {
      const verify = async () => {
        setStatus('verifying')
        try {
          const isValid = await verifyPin(email, pin.join(''))
          if (isValid) {
            if (email) {
              localStorage.setItem('last_email', email)
            }
            navigate('/dashboard', { replace: true })
          } else {
            setStatus('error')
            setTimeout(() => {
              setStatus('idle')
              setPin([])
            }, 1200)
          }
        } catch (err) {
          setStatus('error')
          setTimeout(() => {
            setStatus('idle')
            setPin([])
          }, 1200)
        }
      }
      verify()
    }
  }, [pin, email, verifyPin, navigate])

  const handleDigit = (digit: number) => {
    if (pin.length >= PIN_LENGTH || status === 'verifying') return
    setPin((prev) => [...prev, digit])
  }

  const handleDelete = () => {
    if (status === 'verifying') return
    setPin((prev) => prev.slice(0, -1))
  }

  return (
    <div className="min-h-screen bg-gradient-hero px-4 py-10">
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-10 rounded-[32px] bg-white/90 p-6 text-slate-900 shadow-card">
        <div className="w-full text-left">
          <button
            onClick={() => navigate(-1)}
            className="text-sm font-semibold text-slate-500 transition hover:text-primary"
          >
            返回登录
          </button>
        </div>

        <div className="text-center">
          <h2 className="text-2xl font-semibold text-slate-900">输入 PIN 码</h2>
          <p className="mt-2 text-sm text-slate-500">请输入 6 位数字 PIN 码</p>
          {status === 'error' ? (
            <p className="mt-2 text-sm font-semibold text-danger">PIN 码错误，请再次尝试</p>
          ) : null}
        </div>

        {!email && (
          <div className="w-full">
            <label className="block text-left text-sm font-semibold text-slate-700">
              邮箱地址
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                if (e.target.value) {
                  localStorage.setItem('last_email', e.target.value)
                }
              }}
              placeholder="your@email.com"
              className="mt-2 w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-sm font-medium transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
        )}

        <div className="flex items-center justify-center gap-3">
          {Array.from({ length: PIN_LENGTH }).map((_, index) => (
            <span
              key={index}
              className={clsx(
                'h-4 w-4 rounded-full border-2 transition-all',
                pin[index] !== undefined
                  ? status === 'error'
                    ? 'border-danger bg-danger/80'
                    : 'border-primary bg-primary'
                  : 'border-slate-300',
              )}
            />
          ))}
        </div>

        <div className="grid w-full max-w-sm grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((number) => (
            <button
              key={number}
              onClick={() => handleDigit(number)}
              className="aspect-square rounded-2xl border-2 border-slate-200 bg-white text-xl font-semibold text-slate-800 shadow-sm transition hover:-translate-y-[1px] hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
            >
              {number}
            </button>
          ))}
          <div />
          <button
            onClick={() => handleDigit(0)}
            className="aspect-square rounded-2xl border-2 border-slate-200 bg-white text-xl font-semibold text-slate-800 shadow-sm transition hover:-translate-y-[1px] hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
          >
            0
          </button>
          <button
            onClick={handleDelete}
            className="aspect-square rounded-2xl border-2 border-slate-200 bg-white text-xl font-semibold text-slate-800 shadow-sm transition hover:-translate-y-[1px] hover:border-danger hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/20"
          >
            <FaBackspace className="mx-auto text-lg" />
          </button>
        </div>

        <button
          className="flex items-center justify-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-200"
          type="button"
        >
          <FaFingerprint className="text-primary" />
          支持面容 ID / 指纹快速验证
        </button>
      </div>
    </div>
  )
}

