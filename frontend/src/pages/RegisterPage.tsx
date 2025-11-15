import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FaHeartbeat, FaShieldAlt, FaUserPlus } from 'react-icons/fa'
import type { FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'

export const RegisterPage: React.FC = () => {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsLoading(true)
    setError(null)

    if (password !== confirmPassword) {
      setError('两次输入的密码不一致')
      setIsLoading(false)
      return
    }

    if (password.length < 6) {
      setError('密码长度至少为6位')
      setIsLoading(false)
      return
    }

    try {
      await register(email, password, displayName)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败，请稍后再试')
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
          <h1 className="text-3xl font-semibold">创建账号</h1>
          <p className="mt-2 text-sm text-white/80">注册您的健康档案账号</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="w-full space-y-4 rounded-3xl bg-white/95 p-6 text-slate-900 shadow-card"
        >
          <div>
            <label className="text-sm font-semibold text-slate-700">姓名</label>
            <input
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="请输入您的姓名"
              className="mt-2 w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-sm font-medium transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              required
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-700">邮箱地址</label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="your@email.com"
              className="mt-2 w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-sm font-medium transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              required
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-700">密码</label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="至少6位字符"
              className="mt-2 w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-sm font-medium transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              required
              minLength={6}
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-700">确认密码</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="请再次输入密码"
              className="mt-2 w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-sm font-medium transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              required
              minLength={6}
            />
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
            <FaUserPlus />
            {isLoading ? '正在注册...' : '注册'}
          </button>
        </form>

        <div className="flex items-center justify-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-700">
          <FaShieldAlt />
          数据采用 AES-256 加密存储
        </div>

        <div className="text-center">
          <p className="text-sm text-white/80">
            已有账号？{' '}
            <Link
              to="/login"
              className="font-semibold text-white underline hover:text-white/90"
            >
              立即登录
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

