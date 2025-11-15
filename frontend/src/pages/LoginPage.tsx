import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FaFingerprint, FaHeartbeat, FaKey, FaShieldAlt, FaSignInAlt } from 'react-icons/fa'
import type { FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'

export const LoginPage: React.FC = () => {
  const { login, isPinEnabled } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('demo@example.com')
  const [password, setPassword] = useState('demo1234')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsLoading(true)
    setError(null)
    try {
      await login(email, password)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败，请稍后再试')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-hero px-4 py-8">
      <div className="mx-auto flex w-full max-w-md flex-col items-center justify-center gap-8 rounded-[32px] bg-white/5 p-6 text-white shadow-card backdrop-blur">
        <div className="text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-white/20 shadow-inner">
            <FaHeartbeat className="text-4xl text-white" />
          </div>
          <h1 className="text-3xl font-semibold">健康档案</h1>
          <p className="mt-2 text-sm text-white/80">安全、私密的个人健康数据管理中心</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="w-full space-y-4 rounded-3xl bg-white/95 p-6 text-slate-900 shadow-card"
        >
          <div>
            <label className="text-sm font-semibold text-slate-700">邮箱地址</label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="your@email.com"
              className="mt-2 w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-sm font-medium transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-700">密码</label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="请输入密码"
              className="mt-2 w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-sm font-medium transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <p className="mt-2 text-xs text-slate-400">
              账号用于同步云端数据。默认体验账号：demo@example.com / demo1234
            </p>
          </div>

          {error ? (
            <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isLoading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-semibold text-white shadow-lg shadow-primary/25 transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:bg-primary/60"
          >
            <FaSignInAlt />
            {isLoading ? '正在登录...' : '登录'}
          </button>
        </form>

        <div className="text-sm text-white/80">或使用更快捷的安全方式</div>

        <div className="w-full space-y-4 rounded-3xl bg-white/95 p-6 text-slate-900 shadow-card">
          <div className="text-center">
            <h3 className="text-base font-semibold">PWA 快速验证</h3>
            <p className="mt-1 text-xs text-slate-500">使用 PIN 码或生物识别快速登录</p>
          </div>

          {isPinEnabled ? (
            <button
              onClick={() => {
                if (email) {
                  localStorage.setItem('last_email', email)
                  navigate('/pin', { state: { email } })
                } else {
                  navigate('/pin')
                }
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-primary hover:text-primary"
            >
              <FaKey />
              PIN 码登录
            </button>
          ) : null}

          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-primary hover:text-primary"
          >
            <FaFingerprint />
            面容 ID / 指纹
          </button>

          <div className="flex items-center justify-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-700">
            <FaShieldAlt />
            数据采用 AES-256 加密存储
          </div>
        </div>

        <div className="text-center">
          <p className="text-sm text-white/80">
            还没有账号？{' '}
            <Link
              to="/register"
              className="font-semibold text-white underline hover:text-white/90"
            >
              立即注册
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

