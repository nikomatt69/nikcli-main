/**
 * NikCLI Mobile - MessageBubble Component
 * Renders individual chat messages with proper styling
 */

import React, { memo } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import type { ChatMessage, MessageType } from '@/types'
import { formatRelativeTime, getMessageTypeIcon } from '@/lib/utils'

interface MessageBubbleProps {
  message: ChatMessage
}

const MESSAGE_COLORS: Record<MessageType, { bg: string; text: string; border: string }> = {
  user: { bg: '#1e40af', text: '#ffffff', border: '#3b82f6' },
  system: { bg: '#1e293b', text: '#94a3b8', border: '#334155' },
  agent: { bg: '#4c1d95', text: '#ffffff', border: '#8b5cf6' },
  tool: { bg: '#064e3b', text: '#ffffff', border: '#10b981' },
  error: { bg: '#7f1d1d', text: '#ffffff', border: '#ef4444' },
  vm: { bg: '#164e63', text: '#ffffff', border: '#06b6d4' },
  diff: { bg: '#78350f', text: '#ffffff', border: '#f59e0b' },
}

function MessageBubbleComponent({ message }: MessageBubbleProps) {
  const colors = MESSAGE_COLORS[message.type]
  const icon = getMessageTypeIcon(message.type)
  const isUser = message.type === 'user'
  const isStreaming = message.status === 'streaming'

  return (
    <View style={[
      styles.container,
      isUser ? styles.containerUser : styles.containerOther,
    ]}>
      <View style={[
        styles.bubble,
        { 
          backgroundColor: colors.bg,
          borderColor: colors.border,
        },
        isUser ? styles.bubbleUser : styles.bubbleOther,
      ]}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.icon}>{icon}</Text>
          <Text style={[styles.typeLabel, { color: colors.border }]}>
            {message.type.charAt(0).toUpperCase() + message.type.slice(1)}
          </Text>
          <Text style={styles.timestamp}>
            {formatRelativeTime(new Date(message.timestamp))}
          </Text>
          {isStreaming && (
            <Text style={styles.streamingIndicator}>●</Text>
          )}
        </View>

        {/* Content */}
        <Text style={[styles.content, { color: colors.text }]}>
          {message.content}
          {isStreaming && <Text style={styles.cursor}>▌</Text>}
        </Text>

        {/* Progress bar for agents */}
        {message.metadata?.progress !== undefined && message.metadata.progress > 0 && (
          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <View 
                style={[
                  styles.progressFill, 
                  { width: `${message.metadata.progress}%` }
                ]} 
              />
            </View>
            <Text style={styles.progressText}>{message.metadata.progress}%</Text>
          </View>
        )}

        {/* Status indicator */}
        {message.status === 'processing' && (
          <View style={styles.statusContainer}>
            <Text style={styles.statusText}>⏳ Processing...</Text>
          </View>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
    marginHorizontal: 12,
  },
  containerUser: {
    alignItems: 'flex-end',
  },
  containerOther: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '85%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
  },
  bubbleUser: {
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    borderBottomLeftRadius: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  icon: {
    fontSize: 14,
    marginRight: 6,
  },
  typeLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  timestamp: {
    fontSize: 10,
    color: '#64748b',
    marginLeft: 'auto',
  },
  streamingIndicator: {
    fontSize: 10,
    color: '#8b5cf6',
    marginLeft: 6,
    opacity: 0.8,
  },
  content: {
    fontSize: 15,
    lineHeight: 22,
  },
  cursor: {
    color: '#8b5cf6',
    opacity: 0.8,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  progressBar: {
    flex: 1,
    height: 6,
    backgroundColor: '#1e293b',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 11,
    color: '#64748b',
    marginLeft: 8,
    width: 35,
    textAlign: 'right',
  },
  statusContainer: {
    marginTop: 8,
  },
  statusText: {
    fontSize: 12,
    color: '#64748b',
  },
})

export const MessageBubble = memo(MessageBubbleComponent)
