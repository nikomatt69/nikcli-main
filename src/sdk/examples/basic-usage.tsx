/**
 * NikCLI SDK - Basic Usage Example
 * Simple example of using the SDK in a React application
 */

import React, { useState, useEffect } from 'react'
import {
    initializeSDK,
    useAgent,
    useStream,
    useTTY,
    TTYInput,
    TTYOutput,
    TTYPanel,
    TTYStatus,
    type SDKConfig,
} from '../src'

// Example configuration
const config: Partial<SDKConfig> = {
    apiKeys: {
        anthropic: process.env.ANTHROPIC_API_KEY,
        openai: process.env.OPENAI_API_KEY,
    },
    defaultModel: 'claude-3-5-sonnet-20241022',
    enableStreaming: true,
    enableAgents: true,
    maxConcurrentTasks: 3,
}

/**
 * Basic TTY Application
 * Simple terminal interface using the SDK
 */
export function BasicTTYApp() {
    const [sdk, setSdk] = useState<any>(null)
    const [initialized, setInitialized] = useState(false)

    // Initialize SDK
    useEffect(() => {
        const initSDK = async () => {
            try {
                const sdkInstance = await initializeSDK(config)
                setSdk(sdkInstance)
                setInitialized(true)
            } catch (error) {
                console.error('Failed to initialize SDK:', error)
            }
        }

        initSDK()
    }, [])

    if (!initialized || !sdk) {
        return (
            <div style={{ padding: '20px', color: '#fff', backgroundColor: '#000' }}>
                <div>Initializing NikCLI SDK...</div>
                <div style={{ marginTop: '10px' }}>
                    <div style={{ width: '200px', height: '4px', backgroundColor: '#333', borderRadius: '2px' }}>
                        <div style={{
                            width: '100%',
                            height: '100%',
                            backgroundColor: '#4caf50',
                            borderRadius: '2px',
                            animation: 'pulse 1.5s infinite'
                        }} />
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            backgroundColor: '#000',
            color: '#fff',
            fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace'
        }}>
            {/* Header */}
            <div style={{
                padding: '12px',
                borderBottom: '1px solid #333',
                backgroundColor: '#1a1a1a'
            }}>
                <h1 style={{ margin: 0, fontSize: '18px' }}>NikCLI SDK - Basic Example</h1>
                <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
                    Terminal interface powered by NikCLI SDK
                </div>
            </div>

            {/* Main Content */}
            <div style={{ display: 'flex', flex: 1, position: 'relative' }}>
                {/* Main Terminal */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <TTYTerminal />
                </div>

                {/* Side Panels */}
                <div style={{ display: 'flex', flexDirection: 'column', width: '300px' }}>
                    <AgentPanel />
                    <StatusPanel />
                </div>
            </div>
        </div>
    )
}

/**
 * Main Terminal Component
 */
function TTYTerminal() {
    const { input, output, setInput, submitInput, clearOutput } = useTTY()
    const { events, isStreaming, sendMessage } = useStream()

    const handleSubmit = async (value: string) => {
        try {
            await sendMessage(value)
            await submitInput()
        } catch (error) {
            console.error('Failed to send message:', error)
        }
    }

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            padding: '12px'
        }}>
            {/* Output */}
            <TTYOutput
                content={output}
                type="text"
                theme="dark"
                maxHeight={400}
                scrollable={true}
                style={{ flex: 1, marginBottom: '12px' }}
            />

            {/* Input */}
            <TTYInput
                placeholder="Enter command..."
                value={input}
                onChange={setInput}
                onSubmit={handleSubmit}
                style={{ width: '100%' }}
            />

            {/* Status */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                marginTop: '8px',
                fontSize: '12px',
                color: '#999'
            }}>
                <TTYStatus
                    status={isStreaming ? 'busy' : 'idle'}
                    message={isStreaming ? 'Processing...' : 'Ready'}
                    showProgress={false}
                />
                <button
                    onClick={clearOutput}
                    style={{
                        background: 'none',
                        border: '1px solid #333',
                        color: '#fff',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px'
                    }}
                >
                    Clear
                </button>
            </div>
        </div>
    )
}

/**
 * Agent Panel Component
 */
function AgentPanel() {
    const { agents, loading, error } = useAgent('universal-agent')

    return (
        <TTYPanel
            title="🤖 Agents"
            position="right"
            width={300}
            height={200}
            collapsible={true}
            resizable={true}
        >
            {loading && <div>Loading agents...</div>}
            {error && <div style={{ color: '#f44336' }}>Error: {error.message}</div>}
            {agents && (
                <div>
                    <div style={{ marginBottom: '8px', fontWeight: 'bold' }}>
                        {agents.name}
                    </div>
                    <div style={{ fontSize: '12px', color: '#999' }}>
                        Status: {agents.status}
                    </div>
                    <div style={{ fontSize: '12px', color: '#999' }}>
                        Tasks: {agents.tasks?.length || 0}
                    </div>
                </div>
            )}
        </TTYPanel>
    )
}

/**
 * Status Panel Component
 */
function StatusPanel() {
    const { stats } = useStream()

    return (
        <TTYPanel
            title="📊 Status"
            position="right"
            width={300}
            height={150}
            collapsible={true}
            resizable={true}
        >
            <div style={{ fontSize: '12px' }}>
                <div style={{ marginBottom: '8px' }}>
                    <strong>Stream Status:</strong> {stats.isStreaming ? 'Active' : 'Inactive'}
                </div>
                <div style={{ marginBottom: '8px' }}>
                    <strong>Total Events:</strong> {stats.totalEvents}
                </div>
                <div style={{ marginBottom: '8px' }}>
                    <strong>Buffer Size:</strong> {stats.bufferSize}
                </div>
                <div style={{ marginBottom: '8px' }}>
                    <strong>Duration:</strong> {Math.round(stats.duration / 1000)}s
                </div>
            </div>
        </TTYPanel>
    )
}

/**
 * Advanced TTY Application
 * More complex example with multiple agents and streaming
 */
export function AdvancedTTYApp() {
    const [sdk, setSdk] = useState<any>(null)
    const [initialized, setInitialized] = useState(false)

    // Initialize SDK with advanced configuration
    useEffect(() => {
        const initSDK = async () => {
            try {
                const sdkInstance = await initializeSDK({
                    ...config,
                    enableBackgroundAgents: true,
                    enableProgressTracking: true,
                    maxConcurrentTasks: 5,
                })
                setSdk(sdkInstance)
                setInitialized(true)
            } catch (error) {
                console.error('Failed to initialize SDK:', error)
            }
        }

        initSDK()
    }, [])

    if (!initialized || !sdk) {
        return <div>Initializing...</div>
    }

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            backgroundColor: '#000',
            color: '#fff'
        }}>
            {/* Header with multiple status indicators */}
            <div style={{
                padding: '12px',
                borderBottom: '1px solid #333',
                backgroundColor: '#1a1a1a',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <h1 style={{ margin: 0, fontSize: '18px' }}>NikCLI SDK - Advanced Example</h1>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <TTYStatus status="idle" message="System Ready" />
                    <TTYStatus status="busy" message="Processing" progress={75} showProgress={true} />
                </div>
            </div>

            {/* Main Content with Tabs */}
            <div style={{ display: 'flex', flex: 1 }}>
                <TTYPanelWithTabs
                    title="Terminal"
                    position="left"
                    width={600}
                    height={400}
                    tabs={[
                        {
                            id: 'main',
                            label: 'Main',
                            content: <TTYTerminal />
                        },
                        {
                            id: 'logs',
                            label: 'Logs',
                            content: <LogViewer />
                        },
                        {
                            id: 'agents',
                            label: 'Agents',
                            content: <AgentManager />
                        }
                    ]}
                />

                {/* Right Panels */}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <AgentPanel />
                    <StatusPanel />
                </div>
            </div>
        </div>
    )
}

/**
 * Log Viewer Component
 */
function LogViewer() {
    const { events } = useStream()

    return (
        <TTYOutput
            content={events.map(e => `[${e.timestamp?.toISOString()}] ${e.type}: ${e.content}`).join('\n')}
            type="text"
            theme="dark"
            maxHeight={300}
            scrollable={true}
        />
    )
}

/**
 * Agent Manager Component
 */
function AgentManager() {
    const { agents, loading, error } = useAgents()

    return (
        <div>
            {loading && <div>Loading agents...</div>}
            {error && <div style={{ color: '#f44336' }}>Error: {error.message}</div>}
            {agents.map(agent => (
                <div key={agent.id} style={{
                    padding: '8px',
                    border: '1px solid #333',
                    borderRadius: '4px',
                    marginBottom: '8px'
                }}>
                    <div style={{ fontWeight: 'bold' }}>{agent.name}</div>
                    <div style={{ fontSize: '12px', color: '#999' }}>
                        Status: {agent.status} | Tasks: {agent.currentTasks}
                    </div>
                </div>
            ))}
        </div>
    )
}

// Add CSS for animations
const style = document.createElement('style')
style.textContent = `
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
`
document.head.appendChild(style)
