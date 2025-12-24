import { motion } from 'framer-motion'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/contexts/theme-context'
import { cn } from '@/lib/utils'

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <motion.button
      onClick={toggleTheme}
      className={cn(
        'relative flex items-center justify-center w-14 h-7 rounded-full',
        'transition-colors duration-300',
        'holo-border focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
        isDark ? 'bg-primary/20' : 'bg-yellow-400/20'
      )}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      aria-label="Toggle theme"
    >
      {/* Background gradient */}
      <motion.div
        className="absolute inset-0 rounded-full"
        animate={{
          background: isDark
            ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(168, 85, 247, 0.2))'
            : 'linear-gradient(135deg, rgba(251, 191, 36, 0.3), rgba(251, 146, 60, 0.3))',
        }}
        transition={{ duration: 0.3 }}
      />

      {/* Sliding circle */}
      <motion.div
        className={cn(
          'absolute w-6 h-6 rounded-full shadow-lg flex items-center justify-center',
          isDark ? 'bg-slate-700' : 'bg-white'
        )}
        animate={{
          x: isDark ? -10 : 10,
        }}
        transition={{
          type: 'spring',
          stiffness: 500,
          damping: 30,
        }}
      >
        <motion.div
          initial={false}
          animate={{
            scale: isDark ? 1 : 0,
            rotate: isDark ? 0 : 180,
            opacity: isDark ? 1 : 0,
          }}
          transition={{ duration: 0.2 }}
          style={{ position: 'absolute' }}
        >
          <Moon className="h-3 w-3 text-primary" />
        </motion.div>

        <motion.div
          initial={false}
          animate={{
            scale: isDark ? 0 : 1,
            rotate: isDark ? -180 : 0,
            opacity: isDark ? 0 : 1,
          }}
          transition={{ duration: 0.2 }}
          style={{ position: 'absolute' }}
        >
          <Sun className="h-3 w-3 text-yellow-600" />
        </motion.div>
      </motion.div>

      {/* Icon indicators */}
      <div className="relative z-10 flex items-center justify-between w-full px-1">
        <motion.div
          animate={{
            opacity: isDark ? 0.4 : 0.8,
            scale: isDark ? 0.8 : 1,
          }}
          transition={{ duration: 0.2 }}
        >
          <Sun className="h-3 w-3 text-yellow-600" />
        </motion.div>
        <motion.div
          animate={{
            opacity: isDark ? 0.8 : 0.4,
            scale: isDark ? 1 : 0.8,
          }}
          transition={{ duration: 0.2 }}
        >
          <Moon className="h-3 w-3 text-primary" />
        </motion.div>
      </div>
    </motion.button>
  )
}
