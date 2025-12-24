/**
 * NikCLI Mobile - InputBar Component
 * Chat input with quick actions and command suggestions
 */

import React, { useState, useRef, useCallback } from 'react'
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  Keyboard,
  ScrollView,
  Animated,
} from 'react-native'

interface InputBarProps {
  value: string
  onChangeText: (text: string) => void
  onSend: (text: string) => void
  onCommand: (command: string) => void
  onAgentSelect: (agentName: string) => void
  isProcessing: boolean
  isConnected: boolean
  planMode: boolean
  autoAccept: boolean
  vmMode: boolean
}

const QUICK_COMMANDS = [
  { label: '/status', command: 'status', icon: '📊' },
  { label: '/agents', command: 'agents', icon: '🔌' },
  { label: '/help', command: 'help', icon: '❓' },
]

const AVAILABLE_AGENTS = [
  { name: 'universal-agent', label: 'Universal', icon: '🌐' },
  { name: 'react-expert', label: 'React', icon: '⚛️' },
  { name: 'backend-expert', label: 'Backend', icon: '🔧' },
  { name: 'frontend-expert', label: 'Frontend', icon: '🎨' },
  { name: 'devops-expert', label: 'DevOps', icon: '🚀' },
  { name: 'code-review', label: 'Review', icon: '🔍' },
  { name: 'vm-agent', label: 'VM', icon: '🐳' },
]

export function InputBar({
  value,
  onChangeText,
  onSend,
  onCommand,
  onAgentSelect,
  isProcessing,
  isConnected,
  planMode,
  autoAccept,
  vmMode,
}: InputBarProps) {
  const [showAgents, setShowAgents] = useState(false)
  const [showCommands, setShowCommands] = useState(false)
  const inputRef = useRef<TextInput>(null)
  const slideAnim = useRef(new Animated.Value(0)).current

  const handleSend = useCallback(() => {
    if (!value.trim() || isProcessing || !isConnected) return
    
    onSend(value.trim())
    setShowAgents(false)
    setShowCommands(false)
    Keyboard.dismiss()
  }, [value, isProcessing, isConnected, onSend])

  const handleTextChange = useCallback((text: string) => {
    onChangeText(text)
    
    // Show agents panel when typing @
    if (text.endsWith('@')) {
      setShowAgents(true)
      setShowCommands(false)
    } else if (text.endsWith('/') && text.length === 1) {
      setShowCommands(true)
      setShowAgents(false)
    } else if (!text.includes('@') && !text.startsWith('/')) {
      setShowAgents(false)
      setShowCommands(false)
    }
  }, [onChangeText])

  const handleAgentSelect = useCallback((agentName: string) => {
    const newText = value.replace(/@$/, `@${agentName} `)
    onChangeText(newText)
    setShowAgents(false)
    inputRef.current?.focus()
  }, [value, onChangeText])

  const handleCommandSelect = useCallback((command: string) => {
    onCommand(command)
    onChangeText('')
    setShowCommands(false)
  }, [onCommand, onChangeText])

  const toggleAgentsPanel = useCallback(() => {
    setShowAgents(!showAgents)
    setShowCommands(false)
  }, [showAgents])

  return (
    <View style={styles.container}>
      {/* Mode indicators */}
      <View style={styles.modeBar}>
        {planMode && (
          <View style={[styles.modeBadge, styles.planBadge]}>
            <Text style={styles.modeBadgeText}>📋 Plan</Text>
          </View>
        )}
        {autoAccept && (
          <View style={[styles.modeBadge, styles.acceptBadge]}>
            <Text style={styles.modeBadgeText}>✓ Auto</Text>
          </View>
        )}
        {vmMode && (
          <View style={[styles.modeBadge, styles.vmBadge]}>
            <Text style={styles.modeBadgeText}>🐳 VM</Text>
          </View>
        )}
        <View style={styles.modeBarSpacer} />
        <View style={[
          styles.connectionIndicator,
          { backgroundColor: isConnected ? '#10b981' : '#ef4444' }
        ]} />
      </View>

      {/* Agent selection panel */}
      {showAgents && (
        <View style={styles.agentPanel}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {AVAILABLE_AGENTS.map((agent) => (
              <TouchableOpacity
                key={agent.name}
                style={styles.agentChip}
                onPress={() => handleAgentSelect(agent.name)}
              >
                <Text style={styles.agentChipIcon}>{agent.icon}</Text>
                <Text style={styles.agentChipLabel}>{agent.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Command panel */}
      {showCommands && (
        <View style={styles.commandPanel}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {QUICK_COMMANDS.map((cmd) => (
              <TouchableOpacity
                key={cmd.command}
                style={styles.commandChip}
                onPress={() => handleCommandSelect(cmd.command)}
              >
                <Text style={styles.commandChipIcon}>{cmd.icon}</Text>
                <Text style={styles.commandChipLabel}>{cmd.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Input row */}
      <View style={styles.inputRow}>
        {/* Agent button */}
        <TouchableOpacity
          style={[styles.actionButton, showAgents && styles.actionButtonActive]}
          onPress={toggleAgentsPanel}
        >
          <Text style={styles.actionButtonText}>@</Text>
        </TouchableOpacity>

        {/* Text input */}
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={value}
          onChangeText={handleTextChange}
          placeholder={isConnected ? "Type message or /command..." : "Connecting..."}
          placeholderTextColor="#64748b"
          multiline
          maxLength={4000}
          editable={isConnected}
          returnKeyType="send"
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
        />

        {/* Send button */}
        <TouchableOpacity
          style={[
            styles.sendButton,
            (!value.trim() || isProcessing || !isConnected) && styles.sendButtonDisabled,
          ]}
          onPress={handleSend}
          disabled={!value.trim() || isProcessing || !isConnected}
        >
          <Text style={styles.sendButtonText}>
            {isProcessing ? '⏳' : '↑'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0f172a',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  modeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 8,
  },
  modeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  planBadge: {
    backgroundColor: '#1e40af20',
  },
  acceptBadge: {
    backgroundColor: '#05966920',
  },
  vmBadge: {
    backgroundColor: '#0e788520',
  },
  modeBadgeText: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '500',
  },
  modeBarSpacer: {
    flex: 1,
  },
  connectionIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  agentPanel: {
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  agentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
  },
  agentChipIcon: {
    fontSize: 14,
    marginRight: 4,
  },
  agentChipLabel: {
    fontSize: 12,
    color: '#e2e8f0',
    fontWeight: '500',
  },
  commandPanel: {
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  commandChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
  },
  commandChipIcon: {
    fontSize: 14,
    marginRight: 4,
  },
  commandChipLabel: {
    fontSize: 12,
    color: '#e2e8f0',
    fontWeight: '500',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 8,
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonActive: {
    backgroundColor: '#3b82f6',
  },
  actionButtonText: {
    fontSize: 18,
    color: '#e2e8f0',
    fontWeight: '600',
  },
  input: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    paddingTop: 10,
    fontSize: 15,
    color: '#f1f5f9',
    maxHeight: 120,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#334155',
  },
  sendButtonText: {
    fontSize: 18,
    color: '#ffffff',
    fontWeight: '600',
  },
})
