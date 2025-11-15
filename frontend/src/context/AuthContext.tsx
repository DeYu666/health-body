import { createContext, useContext, useEffect, useState } from 'react'
import { api, type AuthToken } from '../lib/api'

interface AuthContextValue {
  isAuthenticated: boolean
  isPinEnabled: boolean
  user: AuthToken['user'] | null
  register: (email: string, password: string, displayName: string) => Promise<void>
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  verifyPin: (email: string, pin: string) => Promise<boolean>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const AUTH_STORAGE_KEY = 'phr_auth_state'
const AUTH_TOKEN_KEY = 'auth_token'

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    const token = localStorage.getItem(AUTH_TOKEN_KEY)
    return !!token
  })
  const [user, setUser] = useState<AuthToken['user'] | null>(() => {
    if (typeof window === 'undefined') return null
    const stored = localStorage.getItem(AUTH_STORAGE_KEY)
    if (stored) {
      try {
        const data = JSON.parse(stored)
        return data.user || null
      } catch {
        return null
      }
    }
    return null
  })

  const isPinEnabled = user?.pinEnabled ?? false

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (isAuthenticated && user) {
        localStorage.setItem(
          AUTH_STORAGE_KEY,
          JSON.stringify({
            isAuthenticated,
            user,
            updatedAt: new Date().toISOString(),
          }),
        )
      } else {
        localStorage.removeItem(AUTH_STORAGE_KEY)
        localStorage.removeItem(AUTH_TOKEN_KEY)
      }
    }
  }, [isAuthenticated, user])

  const register = async (email: string, password: string, displayName: string) => {
    if (!email || !password || !displayName) {
      throw new Error('请填写所有必填项')
    }

    try {
      const token = await api.register(email, password, displayName)
      if (typeof window !== 'undefined') {
        localStorage.setItem(AUTH_TOKEN_KEY, token.accessToken)
      }
      setUser(token.user)
      setIsAuthenticated(true)
    } catch (error) {
      const message = error instanceof Error ? error.message : '注册失败'
      throw new Error(message)
    }
  }

  const login = async (email: string, password: string) => {
    if (!email || !password) {
      throw new Error('请填写邮箱和密码')
    }

    try {
      const token = await api.login(email, password)
      if (typeof window !== 'undefined') {
        localStorage.setItem(AUTH_TOKEN_KEY, token.accessToken)
      }
      setUser(token.user)
      setIsAuthenticated(true)
    } catch (error) {
      const message = error instanceof Error ? error.message : '登录失败'
      throw new Error(message)
    }
  }

  const logout = () => {
    setIsAuthenticated(false)
    setUser(null)
    if (typeof window !== 'undefined') {
      localStorage.removeItem(AUTH_TOKEN_KEY)
      localStorage.removeItem(AUTH_STORAGE_KEY)
    }
  }

  const verifyPin = async (email: string, pin: string) => {
    if (!email || !pin) {
      throw new Error('请填写邮箱和 PIN 码')
    }

    try {
      const token = await api.pinLogin(email, pin)
      if (typeof window !== 'undefined') {
        localStorage.setItem(AUTH_TOKEN_KEY, token.accessToken)
      }
      setUser(token.user)
      setIsAuthenticated(true)
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'PIN 码错误'
      throw new Error(message)
    }
  }

  const value: AuthContextValue = {
    isAuthenticated,
    isPinEnabled,
    user,
    register,
    login,
    logout,
    verifyPin,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth 必须在 AuthProvider 内部使用')
  }
  return context
}

