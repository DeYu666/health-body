import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FaHeartbeat, FaShieldAlt, FaSignInAlt } from 'react-icons/fa'
import type { FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'

export const LoginPage: React.FC = () => {
  const { login } = useAuth()
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
      <div className="mx-auto flex w-full max-w-md flex-col items-center justify-center gap-8 rounded-lg border border-slate-200 bg-white p-6 text-slate-900 shadow-sm">
        <div className="text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-lg bg-primary/10 shadow-inner">
            <FaHeartbeat className="text-4xl text-primary" />
          </div>
          <h1 className="text-3xl font-semibold">健康档案</h1>
          <p className="mt-2 text-sm text-slate-500">安全、私密的个人健康数据管理中心</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="w-full space-y-4 rounded-lg bg-slate-50 p-6 text-slate-900"
        >
          <div>
            <label className="text-sm font-semibold text-slate-700">邮箱地址</label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="your@email.com"
              className="mt-2 w-full rounded-lg border-2 border-slate-200 bg-white px-4 py-3 text-sm font-medium transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-700">密码</label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="请输入密码"
              className="mt-2 w-full rounded-lg border-2 border-slate-200 bg-white px-4 py-3 text-sm font-medium transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <p className="mt-2 text-xs text-slate-400">
              账号用于同步云端数据。默认体验账号：demo@example.com / demo1234
            </p>
          </div>

          {error ? (
            <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isLoading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 font-semibold text-white shadow-lg shadow-primary/25 transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:bg-primary/60"
          >
            <FaSignInAlt />
            {isLoading ? '正在登录...' : '登录'}
          </button>
        </form>

        <div className="w-full rounded-lg bg-slate-50 p-6 text-slate-900">
          <div className="flex items-center justify-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-700">
            <FaShieldAlt />
            数据采用 AES-256 加密存储
          </div>
          <p className="mt-3 text-center text-xs text-slate-400">
            PIN 与生物识别会在本机解锁流程补全后开放。
          </p>
        </div>

        <div className="text-center">
          <p className="text-sm text-slate-500">
            还没有账号？{' '}
            <Link
              to="/register"
              className="font-semibold text-primary underline hover:text-primary-dark"
            >
              立即注册
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
