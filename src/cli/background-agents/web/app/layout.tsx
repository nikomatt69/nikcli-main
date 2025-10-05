import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from './contexts/AuthContext'

export const metadata: Metadata = {
  title: 'NikCLI Background Agents',
  description: 'Manage and monitor background agents',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
