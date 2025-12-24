/**
 * NikCLI Mobile - Agents Screen
 * View and manage active agents
 */

import React, { useCallback } from 'react'
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAgentStore, selectActiveAgents, selectQueuedTasks, selectAvailableAgents } from '@/stores/agentStore'
import { useChat } from '@/hooks/useChat'
import type { AgentInfo } from '@/types'

const AGENT_STATUS_COLORS = {
  idle: '#64748b',
  running: '#3b82f6',
  completed: '#10b981',
  error: '#ef4444',
  queued: '#f59e0b',
}

const AGENT_STATUS_ICONS = {
  idle: '⏸️',
  running: '▶️',
  completed: '✅',
  error: '❌',
  queued: '⏳',
}

function AgentCard({ agent, onStop }: { agent: AgentInfo; onStop: (id: string) => void }) {
  const statusColor = AGENT_STATUS_COLORS[agent.status] || '#64748b'
  const statusIcon = AGENT_STATUS_ICONS[agent.status] || '•'

  return (
    <View style={styles.agentCard}>
      <View style={styles.agentHeader}>
        <View style={styles.agentTypeContainer}>
          <Text style={styles.agentType}>{agent.type}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
            <Text style={styles.statusIcon}>{statusIcon}</Text>
            <Text style={[styles.statusText, { color: statusColor }]}>
              {agent.status}
            </Text>
          </View>
        </View>
        {agent.status === 'running' && (
          <TouchableOpacity
            style={styles.stopButton}
            onPress={() => onStop(agent.id)}
          >
            <Text style={styles.stopButtonText}>Stop</Text>
          </TouchableOpacity>
        )}
      </View>

      {agent.task && (
        <Text style={styles.agentTask} numberOfLines={2}>
          {agent.task}
        </Text>
      )}

      {agent.progress !== undefined && agent.progress > 0 && (
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View
              style={[styles.progressFill, { width: `${agent.progress}%` }]}
            />
          </View>
          <Text style={styles.progressText}>{agent.progress}%</Text>
        </View>
      )}

      {agent.error && (
        <Text style={styles.errorText}>
          ❌ {agent.error}
        </Text>
      )}

      <View style={styles.agentFooter}>
        <Text style={styles.agentId}>ID: {agent.id.slice(-8)}</Text>
        {agent.startedAt && (
          <Text style={styles.agentTime}>
            Started: {new Date(agent.startedAt).toLocaleTimeString()}
          </Text>
        )}
      </View>
    </View>
  )
}

function AvailableAgentChip({ name, onPress }: { name: string; onPress: () => void }) {
  const agentIcons: Record<string, string> = {
    'universal-agent': '🌐',
    'react-expert': '⚛️',
    'backend-expert': '🔧',
    'frontend-expert': '🎨',
    'devops-expert': '🚀',
    'code-review': '🔍',
    'autonomous-coder': '🤖',
    'vm-agent': '🐳',
  }

  return (
    <TouchableOpacity style={styles.availableChip} onPress={onPress}>
      <Text style={styles.availableChipIcon}>{agentIcons[name] || '🔌'}</Text>
      <Text style={styles.availableChipName}>{name}</Text>
    </TouchableOpacity>
  )
}

export default function AgentsScreen() {
  const activeAgents = useAgentStore(selectActiveAgents)
  const queuedTasks = useAgentStore(selectQueuedTasks)
  const availableAgents = useAgentStore(selectAvailableAgents)
  const { stopAgent, launchAgent, isConnected } = useChat()
  const [refreshing, setRefreshing] = React.useState(false)

  const handleStop = useCallback((agentId: string) => {
    stopAgent(agentId)
  }, [stopAgent])

  const handleLaunch = useCallback((agentName: string) => {
    // Navigate to chat with @agent pre-filled
    // For now, show an alert or prompt
  }, [])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    // Refresh agent list from server
    setTimeout(() => setRefreshing(false), 1000)
  }, [])

  const renderAgent = useCallback(({ item }: { item: AgentInfo }) => (
    <AgentCard agent={item} onStop={handleStop} />
  ), [handleStop])

  const keyExtractor = useCallback((item: AgentInfo) => item.id, [])

  const renderHeader = useCallback(() => (
    <View style={styles.header}>
      {/* Stats */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{activeAgents.length}</Text>
          <Text style={styles.statLabel}>Active</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{queuedTasks.length}</Text>
          <Text style={styles.statLabel}>Queued</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>3</Text>
          <Text style={styles.statLabel}>Max</Text>
        </View>
      </View>

      {/* Available agents */}
      <View style={styles.availableSection}>
        <Text style={styles.sectionTitle}>Available Agents</Text>
        <View style={styles.availableGrid}>
          {availableAgents.map(agent => (
            <AvailableAgentChip
              key={agent}
              name={agent}
              onPress={() => handleLaunch(agent)}
            />
          ))}
        </View>
      </View>

      {activeAgents.length > 0 && (
        <Text style={styles.sectionTitle}>Active Agents</Text>
      )}
    </View>
  ), [activeAgents.length, queuedTasks.length, availableAgents, handleLaunch])

  const renderEmpty = useCallback(() => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyStateIcon}>🔌</Text>
      <Text style={styles.emptyStateTitle}>No Active Agents</Text>
      <Text style={styles.emptyStateSubtitle}>
        Use @agent-name in chat to launch an agent
      </Text>
    </View>
  ), [])

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={activeAgents}
        renderItem={renderAgent}
        keyExtractor={keyExtractor}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#3b82f6"
          />
        }
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  listContent: {
    padding: 16,
  },
  header: {
    marginBottom: 16,
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#f1f5f9',
  },
  statLabel: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  availableSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  availableGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  availableChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  availableChipIcon: {
    fontSize: 16,
  },
  availableChipName: {
    fontSize: 12,
    color: '#e2e8f0',
    fontWeight: '500',
  },
  agentCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  agentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  agentTypeContainer: {
    flex: 1,
  },
  agentType: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f1f5f9',
    marginBottom: 6,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  statusIcon: {
    fontSize: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  stopButton: {
    backgroundColor: '#7f1d1d',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  stopButtonText: {
    color: '#fecaca',
    fontSize: 12,
    fontWeight: '600',
  },
  agentTask: {
    fontSize: 14,
    color: '#94a3b8',
    lineHeight: 20,
    marginBottom: 12,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  progressBar: {
    flex: 1,
    height: 6,
    backgroundColor: '#0f172a',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    color: '#64748b',
    width: 40,
    textAlign: 'right',
  },
  errorText: {
    fontSize: 13,
    color: '#fca5a5',
    marginBottom: 8,
  },
  agentFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  agentId: {
    fontSize: 11,
    color: '#475569',
    fontFamily: 'monospace',
  },
  agentTime: {
    fontSize: 11,
    color: '#475569',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#f1f5f9',
    marginBottom: 8,
  },
  emptyStateSubtitle: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
  },
})
