/**
 * NikCLI Mobile - Chat Screen
 * Main chat interface with real-time streaming
 */

import React, { useEffect, useRef, useCallback } from 'react'
import {
  View,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Text,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useChat } from '@/hooks/useChat'
import { MessageBubble } from '@/components/chat/MessageBubble'
import { InputBar } from '@/components/chat/InputBar'
import type { ChatMessage } from '@/types'

export default function ChatScreen() {
  const flatListRef = useRef<FlatList>(null)
  
  const {
    messages,
    isProcessing,
    context,
    inputText,
    connectionStatus,
    isConnected,
    sendMessage,
    setInputText,
    clearMessages,
    togglePlanMode,
    toggleAutoAccept,
    toggleVmMode,
    connect,
    disconnect,
    launchAgent,
    sendCommand,
  } = useChat()

  // Auto-connect on mount
  useEffect(() => {
    connect()
    return () => {
      disconnect()
    }
  }, [connect, disconnect])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true })
      }, 100)
    }
  }, [messages.length])

  const handleSend = useCallback((text: string) => {
    sendMessage(text)
  }, [sendMessage])

  const handleCommand = useCallback((command: string) => {
    sendCommand(command)
  }, [sendCommand])

  const handleAgentSelect = useCallback((agentName: string) => {
    // Insert @agentName into input
    setInputText(`@${agentName} `)
  }, [setInputText])

  const renderMessage = useCallback(({ item }: { item: ChatMessage }) => (
    <MessageBubble message={item} />
  ), [])

  const keyExtractor = useCallback((item: ChatMessage) => item.id, [])

  const renderEmptyState = useCallback(() => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyStateIcon}>🔌</Text>
      <Text style={styles.emptyStateTitle}>NikCLI Mobile</Text>
      <Text style={styles.emptyStateSubtitle}>
        {connectionStatus === 'connecting' 
          ? 'Connecting to backend...'
          : connectionStatus === 'connected'
          ? 'Connected! Start chatting or use @agent commands'
          : 'Not connected. Pull down to retry.'
        }
      </Text>
      {connectionStatus === 'connecting' && (
        <ActivityIndicator size="small" color="#3b82f6" style={{ marginTop: 16 }} />
      )}
      {connectionStatus === 'error' && (
        <TouchableOpacity style={styles.retryButton} onPress={() => connect()}>
          <Text style={styles.retryButtonText}>Retry Connection</Text>
        </TouchableOpacity>
      )}
      <View style={styles.quickTips}>
        <Text style={styles.tipTitle}>Quick Tips:</Text>
        <Text style={styles.tip}>• Type @agent-name to launch an agent</Text>
        <Text style={styles.tip}>• Use /status to check system status</Text>
        <Text style={styles.tip}>• Use /help for available commands</Text>
      </View>
    </View>
  ), [connectionStatus, connect])

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView 
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Messages list */}
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={keyExtractor}
          style={styles.messageList}
          contentContainerStyle={[
            styles.messageListContent,
            messages.length === 0 && styles.messageListEmpty,
          ]}
          ListEmptyComponent={renderEmptyState}
          showsVerticalScrollIndicator={false}
          inverted={false}
          onContentSizeChange={() => {
            if (messages.length > 0) {
              flatListRef.current?.scrollToEnd({ animated: false })
            }
          }}
        />

        {/* Input bar */}
        <InputBar
          value={inputText}
          onChangeText={setInputText}
          onSend={handleSend}
          onCommand={handleCommand}
          onAgentSelect={handleAgentSelect}
          isProcessing={isProcessing}
          isConnected={isConnected}
          planMode={context.planMode}
          autoAccept={context.autoAcceptEdits}
          vmMode={context.vmMode}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  keyboardView: {
    flex: 1,
  },
  messageList: {
    flex: 1,
  },
  messageListContent: {
    paddingTop: 12,
    paddingBottom: 12,
  },
  messageListEmpty: {
    flex: 1,
    justifyContent: 'center',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyStateIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#f1f5f9',
    marginBottom: 8,
  },
  emptyStateSubtitle: {
    fontSize: 15,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 22,
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: '#3b82f6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  quickTips: {
    marginTop: 32,
    alignItems: 'flex-start',
    backgroundColor: '#1e293b',
    padding: 16,
    borderRadius: 12,
    width: '100%',
  },
  tipTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f1f5f9',
    marginBottom: 8,
  },
  tip: {
    fontSize: 13,
    color: '#94a3b8',
    marginBottom: 4,
  },
})
