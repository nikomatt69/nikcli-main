'use client'

import { MessageSquare, Paperclip, Send, X } from 'lucide-react'
import { useState } from 'react'

interface FloatingChatProps {
  jobId?: string
  onSendMessage?: (message: string) => void
}

export default function FloatingChat({ jobId, onSendMessage }: FloatingChatProps) {
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'agent'; content: string; timestamp: Date }>>([])
  const [isExpanded, setIsExpanded] = useState(true)
  const [showFiles, setShowFiles] = useState(false)

  const handleSend = () => {
    if (!message.trim()) return

    const newMessage = {
      role: 'user' as const,
      content: message,
      timestamp: new Date(),
    }

    setMessages([...messages, newMessage])

    // Send follow-up message to API
    if (jobId && onSendMessage) {
      onSendMessage(message)
    }

    fetch(`/api/jobs/${jobId}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, priority: 'normal' }),
    }).catch((error) => console.error('Failed to send message:', error))

    setMessage('')
  }

  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className="fixed left-4 bottom-4 p-4 bg-blue-600 text-white rounded-full shadow-2xl hover:bg-blue-700 transition-colors"
      >
        <MessageSquare className="w-6 h-6" />
      </button>
    )
  }

  return (
    <div className="fixed left-4 bottom-4 w-96 bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col max-h-[600px]">
      {/* Chat Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
        <h3 className="font-semibold text-gray-900 dark:text-white">Chat with Agent</h3>
        <button onClick={() => setIsExpanded(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 dark:text-gray-400 py-8">
            <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>Send a follow-up message to the agent</p>
          </div>
        ) : (
          messages.map((msg, index) => (
            <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-lg p-3 ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
                }`}
              >
                <p className="text-sm">{msg.content}</p>
                <p className="text-xs opacity-70 mt-1">{msg.timestamp.toLocaleTimeString()}</p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex gap-2">
          <button
            onClick={() => setShowFiles(!showFiles)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            title="Attach files"
          >
            <Paperclip className="w-5 h-5" />
          </button>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Send follow-up message..."
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleSend}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!message.trim()}
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  )
}
