import { createContext, useContext, useEffect, useState } from 'react'

interface AuthContextValue {
  isAuthenticated: boolean
  isPinEnabled: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  verifyPin: (pin: string) => Promise<boolean>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const AUTH_STORAGE_KEY = 'phr_auth_state'
const PIN_CODE = '123456'

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    const stored = window.localStorage.getItem(AUTH_STORAGE_KEY)
    return stored ? JSON.parse(stored)?.isAuthenticated === true : false
  })
  const [isPinEnabled] = useState<boolean>(true)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({
          isAuthenticated,
          updatedAt: new Date().toISOString(),
        }),
      )
    }
  }, [isAuthenticated])

  const login = async (email: string, password: string) => {
    await new Promise((resolve) => setTimeout(resolve, 450))
    if (!email || !password) {
      throw new Error('请填写邮箱和密码')
    }
    setIsAuthenticated(true)
  }

  const logout = () => {
    setIsAuthenticated(false)
  }

  const verifyPin = async (pin: string) => {
    await new Promise((resolve) => setTimeout(resolve, 250))
    const result = pin === PIN_CODE
    if (result) {
      setIsAuthenticated(true)
    }
    return result
  }

  const value: AuthContextValue = {
    isAuthenticated,
    isPinEnabled,
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

