/**
 * NikCLI Mobile - Settings Screen
 * Configuration and connection settings
 */

import React, { useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  Alert,
  Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useConnectionStore, selectConnectionStatus, selectEndpoint, selectServerStatus } from '@/stores/connectionStore'
import { useChatStore, selectContext } from '@/stores/chatStore'
import { useChat } from '@/hooks/useChat'

function SettingRow({ 
  label, 
  description, 
  children 
}: { 
  label: string
  description?: string
  children: React.ReactNode 
}) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingLabelContainer}>
        <Text style={styles.settingLabel}>{label}</Text>
        {description && (
          <Text style={styles.settingDescription}>{description}</Text>
        )}
      </View>
      {children}
    </View>
  )
}

function SectionHeader({ title }: { title: string }) {
  return (
    <Text style={styles.sectionHeader}>{title}</Text>
  )
}

export default function SettingsScreen() {
  const connectionStatus = useConnectionStore(selectConnectionStatus)
  const endpoint = useConnectionStore(selectEndpoint)
  const serverStatus = useConnectionStore(selectServerStatus)
  const context = useChatStore(selectContext)
  const { setAutoReconnect, setEndpoint } = useConnectionStore()
  const autoReconnect = useConnectionStore(state => state.autoReconnect)
  
  const {
    connect,
    disconnect,
    togglePlanMode,
    toggleAutoAccept,
    toggleVmMode,
    clearMessages,
    isConnected,
  } = useChat()

  const [customEndpoint, setCustomEndpoint] = useState(endpoint)

  const handleConnect = useCallback(() => {
    if (isConnected) {
      disconnect()
    } else {
      connect(customEndpoint)
    }
  }, [isConnected, connect, disconnect, customEndpoint])

  const handleSaveEndpoint = useCallback(() => {
    setEndpoint(customEndpoint)
    Alert.alert('Saved', 'Endpoint updated. Reconnect to apply changes.')
  }, [customEndpoint, setEndpoint])

  const handleClearMessages = useCallback(() => {
    Alert.alert(
      'Clear Messages',
      'Are you sure you want to clear all messages?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: clearMessages },
      ]
    )
  }, [clearMessages])

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Connection Section */}
        <SectionHeader title="Connection" />
        
        <View style={styles.card}>
          <SettingRow label="Status">
            <View style={styles.statusContainer}>
              <View style={[
                styles.statusDot,
                { backgroundColor: isConnected ? '#10b981' : '#ef4444' }
              ]} />
              <Text style={[
                styles.statusText,
                { color: isConnected ? '#10b981' : '#ef4444' }
              ]}>
                {connectionStatus}
              </Text>
            </View>
          </SettingRow>

          <SettingRow 
            label="Server Endpoint"
            description="WebSocket URL for the NikCLI backend"
          >
            <View style={styles.endpointContainer}>
              <TextInput
                style={styles.endpointInput}
                value={customEndpoint}
                onChangeText={setCustomEndpoint}
                placeholder="ws://localhost:3001/ws/mobile"
                placeholderTextColor="#64748b"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSaveEndpoint}
              >
                <Text style={styles.saveButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </SettingRow>

          <SettingRow 
            label="Auto Reconnect"
            description="Automatically reconnect when disconnected"
          >
            <Switch
              value={autoReconnect}
              onValueChange={setAutoReconnect}
              trackColor={{ false: '#334155', true: '#1d4ed8' }}
              thumbColor={autoReconnect ? '#3b82f6' : '#64748b'}
            />
          </SettingRow>

          <TouchableOpacity
            style={[
              styles.connectButton,
              isConnected ? styles.disconnectButton : styles.connectButtonActive
            ]}
            onPress={handleConnect}
          >
            <Text style={styles.connectButtonText}>
              {isConnected ? 'Disconnect' : 'Connect'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Mode Settings */}
        <SectionHeader title="Modes" />
        
        <View style={styles.card}>
          <SettingRow 
            label="Plan Mode"
            description="Create execution plans before running tasks"
          >
            <Switch
              value={context.planMode}
              onValueChange={togglePlanMode}
              trackColor={{ false: '#334155', true: '#1d4ed8' }}
              thumbColor={context.planMode ? '#3b82f6' : '#64748b'}
            />
          </SettingRow>

          <SettingRow 
            label="Auto-Accept Edits"
            description="Automatically accept file changes"
          >
            <Switch
              value={context.autoAcceptEdits}
              onValueChange={toggleAutoAccept}
              trackColor={{ false: '#334155', true: '#1d4ed8' }}
              thumbColor={context.autoAcceptEdits ? '#3b82f6' : '#64748b'}
            />
          </SettingRow>

          <SettingRow 
            label="VM Mode"
            description="Run tasks in isolated VM containers"
          >
            <Switch
              value={context.vmMode}
              onValueChange={toggleVmMode}
              trackColor={{ false: '#334155', true: '#1d4ed8' }}
              thumbColor={context.vmMode ? '#3b82f6' : '#64748b'}
            />
          </SettingRow>
        </View>

        {/* Server Status */}
        {serverStatus && (
          <>
            <SectionHeader title="Server Status" />
            
            <View style={styles.card}>
              <SettingRow label="Working Directory">
                <Text style={styles.statusValue} numberOfLines={1}>
                  {serverStatus.workingDirectory}
                </Text>
              </SettingRow>

              <SettingRow label="Active Agents">
                <Text style={styles.statusValue}>
                  {serverStatus.activeAgents}/3
                </Text>
              </SettingRow>

              <SettingRow label="Queued Tasks">
                <Text style={styles.statusValue}>
                  {serverStatus.queuedTasks}
                </Text>
              </SettingRow>

              <SettingRow label="Pending Diffs">
                <Text style={styles.statusValue}>
                  {serverStatus.pendingDiffs}
                </Text>
              </SettingRow>

              <SettingRow label="Context Used">
                <Text style={styles.statusValue}>
                  {100 - (serverStatus.contextLeft || 100)}%
                </Text>
              </SettingRow>
            </View>
          </>
        )}

        {/* Actions */}
        <SectionHeader title="Actions" />
        
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleClearMessages}
          >
            <Text style={styles.actionButtonIcon}>🗑️</Text>
            <Text style={styles.actionButtonText}>Clear Messages</Text>
          </TouchableOpacity>
        </View>

        {/* About */}
        <SectionHeader title="About" />
        
        <View style={styles.card}>
          <SettingRow label="Version">
            <Text style={styles.statusValue}>1.0.0</Text>
          </SettingRow>

          <SettingRow label="NikCLI Backend">
            <Text style={styles.statusValue}>v1.6.0</Text>
          </SettingRow>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 24,
    marginBottom: 12,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  settingLabelContainer: {
    flex: 1,
    marginRight: 12,
  },
  settingLabel: {
    fontSize: 15,
    color: '#f1f5f9',
    fontWeight: '500',
  },
  settingDescription: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  statusValue: {
    fontSize: 14,
    color: '#94a3b8',
    maxWidth: 180,
  },
  endpointContainer: {
    flex: 1,
    flexDirection: 'column',
    gap: 8,
  },
  endpointInput: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#f1f5f9',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  saveButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignSelf: 'flex-end',
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  connectButton: {
    margin: 16,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  connectButtonActive: {
    backgroundColor: '#3b82f6',
  },
  disconnectButton: {
    backgroundColor: '#7f1d1d',
  },
  connectButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  actionButtonIcon: {
    fontSize: 20,
  },
  actionButtonText: {
    fontSize: 15,
    color: '#f1f5f9',
    fontWeight: '500',
  },
})
