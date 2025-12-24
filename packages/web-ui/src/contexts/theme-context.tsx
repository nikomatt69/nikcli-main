import { createContext, useContext, useEffect, useState, ReactNode, useMemo } from 'react'

type Theme = 'light' | 'dark'

interface ThemeContextType {
  theme: Theme
  toggleTheme: () => void
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'

  try {
    const stored = localStorage.getItem('theme') as Theme | null
    if (stored === 'light' || stored === 'dark') return stored

    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    return prefersDark ? 'dark' : 'light'
  } catch {
    return 'dark'
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Use lazy initialization to prevent calling getInitialTheme on every render
  const [theme, setThemeState] = useState<Theme>(() => getInitialTheme())

  useEffect(() => {
    const root = document.documentElement
    // Only update if theme actually changed
    if (!root.classList.contains(theme)) {
      root.classList.remove('light', 'dark')
      root.classList.add(theme)
    }

    try {
      const currentTheme = localStorage.getItem('theme')
      // Only write to localStorage if theme actually changed
      if (currentTheme !== theme) {
        localStorage.setItem('theme', theme)
      }
    } catch (e) {
      console.error('Failed to save theme preference:', e)
    }
  }, [theme])

  const toggleTheme = () => {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme)
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
