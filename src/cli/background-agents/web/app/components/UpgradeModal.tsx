'use client'

import { useState } from 'react'

interface UpgradeModalProps {
  isOpen: boolean
  onClose: () => void
  userId?: string
}

export default function UpgradeModal({ isOpen, onClose, userId }: UpgradeModalProps) {
  const [loading, setLoading] = useState(false)

  if (!isOpen) return null

  const handleUpgrade = async () => {
    if (!userId) {
      alert('Please sign in first')
      return
    }

    setLoading(true)

    try {
      // Fetch payment link with user_id embedded
      const paymentLink = `${process.env.NEXT_PUBLIC_LEMONSQUEEZY_LINK || 'https://nikcli.lemonsqueezy.com/buy/fc90f08c-f1a5-43ac-9275-7739a61ed427'}?checkout[custom][user_id]=${userId}`

      window.open(paymentLink, '_blank')

      // Close modal after opening payment link
      setTimeout(() => {
        onClose()
        setLoading(false)
      }, 1000)
    } catch (error) {
      console.error('Failed to open payment link:', error)
      alert('Failed to open payment link. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 p-8">
        <div className="flex justify-between items-start mb-6">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
            Upgrade to Pro
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-6">
          <div className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white p-6 rounded-lg">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-2xl font-bold">Pro Plan</h3>
                <p className="text-sm opacity-90">Unlock premium features</p>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold">$29</div>
                <div className="text-sm opacity-90">per month</div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="font-semibold text-gray-900 dark:text-white">
              What's included:
            </h4>

            <div className="grid gap-3">
              {[
                'OpenRouter API Key provisioned automatically',
                'Access to premium AI models (GPT-4, Claude, Gemini)',
                'Unlimited background agents',
                'Priority task execution',
                'Advanced code analysis tools',
                'Priority support',
              ].map((feature, index) => (
                <div key={index} className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-green-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-gray-700 dark:text-gray-300">{feature}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-6 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={handleUpgrade}
              disabled={loading}
              className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Opening payment...' : 'Continue to Payment'}
            </button>

            <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-3">
              Secure payment powered by LemonSqueezy. Cancel anytime.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
