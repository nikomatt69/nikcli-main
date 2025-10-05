'use client'

import { useEffect, useState } from 'react'

interface SubscriptionStatus {
  tier: 'free' | 'pro' | 'enterprise'
  isPro: boolean
  hasApiKey: boolean
  startedAt?: string
  endsAt?: string
  canceledAt?: string
}

interface SubscriptionBadgeProps {
  userId?: string
  onUpgradeClick?: () => void
}

export default function SubscriptionBadge({ userId, onUpgradeClick }: SubscriptionBadgeProps) {
  const [status, setStatus] = useState<SubscriptionStatus | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) {
      setLoading(false)
      return
    }

    const fetchStatus = async () => {
      try {
        const response = await fetch(`/api/subscription/status?userId=${userId}`)
        if (response.ok) {
          const data = await response.json()
          setStatus(data)
        }
      } catch (error) {
        console.error('Failed to fetch subscription status:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchStatus()
  }, [userId])

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse">
        <div className="w-12 h-4 bg-gray-300 dark:bg-gray-700 rounded"></div>
      </div>
    )
  }

  if (!status) {
    return (
      <button
        onClick={onUpgradeClick}
        className="flex items-center gap-2 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
      >
        <span>⚡</span>
        <span>Upgrade to Pro</span>
      </button>
    )
  }

  const isPro = status.tier === 'pro'
  const isEnterprise = status.tier === 'enterprise'

  return (
    <div className="flex items-center gap-2">
      {isPro || isEnterprise ? (
        <div className="flex items-center gap-2 px-3 py-1 bg-gradient-to-r from-yellow-400 to-orange-500 text-white rounded-lg shadow-sm">
          <span className="text-sm font-bold">
            {isEnterprise ? '👑 ENTERPRISE' : '⚡ PRO'}
          </span>
          {status.hasApiKey && (
            <span className="text-xs opacity-90" title="OpenRouter API Key Active">
              🔑
            </span>
          )}
        </div>
      ) : (
        <button
          onClick={onUpgradeClick}
          className="flex items-center gap-2 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
        >
          <span>⚡</span>
          <span>Upgrade to Pro</span>
        </button>
      )}

      {status.endsAt && !status.canceledAt && (
        <span className="text-xs text-gray-500 dark:text-gray-400">
          Renews {new Date(status.endsAt).toLocaleDateString()}
        </span>
      )}

      {status.canceledAt && (
        <span className="text-xs text-red-500 dark:text-red-400">
          Canceled
        </span>
      )}
    </div>
  )
}
