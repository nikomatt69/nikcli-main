// nikCLI Background Agents Web Interface
class NikCLIAgentInterface {
    constructor() {
        this.apiUrl = 'http://localhost:3000';
        this.currentTab = 'agents';
        this.isConnected = false;
        this.eventSource = null;
        this.settings = this.loadSettings();
        this.jobs = [];
        this.agents = [];
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupChatInput();
        this.setupSidebar();
        this.setupModals();
        this.connectToAPI();
        this.loadInitialData();
        this.startAutoRefresh();
    }

    // Event Listeners
    setupEventListeners() {
        // Tab switching
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.switchTab(e.currentTarget.dataset.tab);
            });
        });

        // Quick actions
        document.querySelectorAll('.quick-action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.handleQuickAction(e.currentTarget.dataset.action);
            });
        });

        // Settings
        document.getElementById('saveSettings')?.addEventListener('click', () => {
            this.saveSettings();
        });

        document.getElementById('cancelSettings')?.addEventListener('click', () => {
            this.closeModal('settingsModal');
        });

        // Settings tabs
        document.querySelectorAll('.settings-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.switchSettingsTab(e.currentTarget.dataset.tab);
            });
        });

        // Temperature slider
        const temperatureSlider = document.getElementById('temperature');
        if (temperatureSlider) {
            temperatureSlider.addEventListener('input', (e) => {
                document.getElementById('temperatureValue').textContent = e.target.value;
            });
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case 'k':
                        e.preventDefault();
                        this.openSettings();
                        break;
                    case 'n':
                        e.preventDefault();
                        this.startNewJob();
                        break;
                }
            }
        });
    }

    setupChatInput() {
        const chatInput = document.getElementById('chatInput');
        const sendBtn = document.getElementById('sendBtn');

        // Auto-resize textarea
        chatInput.addEventListener('input', () => {
            chatInput.style.height = 'auto';
            chatInput.style.height = Math.min(chatInput.scrollHeight, 200) + 'px';
        });

        // Send message
        const sendMessage = () => {
            const message = chatInput.value.trim();
            if (message) {
                this.sendMessage(message);
                chatInput.value = '';
                chatInput.style.height = 'auto';
            }
        };

        sendBtn.addEventListener('click', sendMessage);
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        // Repository and branch selectors
        document.getElementById('currentRepo')?.addEventListener('click', () => {
            this.showRepositorySelector();
        });

        document.getElementById('currentBranch')?.addEventListener('click', () => {
            this.showBranchSelector();
        });
    }

    setupSidebar() {
        const sidebarToggle = document.getElementById('sidebarToggle');
        const sidebar = document.getElementById('sidebar');

        // Toggle sidebar (for mobile)
        sidebarToggle?.addEventListener('click', () => {
            sidebar.classList.toggle('open');
        });

        // Close sidebar when clicking outside
        document.addEventListener('click', (e) => {
            if (!sidebar.contains(e.target) && !e.target.closest('.quick-action-btn')) {
                sidebar.classList.remove('open');
            }
        });
    }

    setupModals() {
        // Close modals when clicking outside or on close button
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal || e.target.classList.contains('modal-close')) {
                    modal.classList.remove('active');
                }
            });
        });

        // Prevent modal content clicks from closing modal
        document.querySelectorAll('.modal-content').forEach(content => {
            content.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        });
    }

    // API Connection
    async connectToAPI() {
        try {
            const response = await fetch(`${this.apiUrl}/health`);
            if (response.ok) {
                this.setConnectionStatus(true);
                this.setupEventStream();
            } else {
                this.setConnectionStatus(false);
            }
        } catch (error) {
            console.error('Failed to connect to API:', error);
            this.setConnectionStatus(false);
        }
    }

    setupEventStream() {
        if (this.eventSource) {
            this.eventSource.close();
        }

        this.eventSource = new EventSource(`${this.apiUrl}/v1/jobs/stream`);
        
        this.eventSource.onopen = () => {
            this.setConnectionStatus(true);
        };

        this.eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleEventStreamMessage(data);
            } catch (error) {
                console.error('Failed to parse event stream message:', error);
            }
        };

        this.eventSource.onerror = () => {
            this.setConnectionStatus(false);
            setTimeout(() => this.connectToAPI(), 5000);
        };
    }

    handleEventStreamMessage(data) {
        switch (data.type) {
            case 'job:created':
            case 'job:started':
            case 'job:completed':
            case 'job:failed':
                this.updateJob(data.data);
                this.updateDashboard();
                break;
            case 'job:log':
                this.addJobLog(data.data.jobId, data.data.logEntry);
                break;
            case 'heartbeat':
                // Keep connection alive
                break;
        }
    }

    setConnectionStatus(connected) {
        this.isConnected = connected;
        const statusDot = document.getElementById('connectionStatus');
        const statusText = document.getElementById('connectionText');
        
        if (statusDot && statusText) {
            statusDot.className = `status-dot ${connected ? 'connected' : 'disconnected'}`;
            statusText.textContent = connected ? 'Connected' : 'Disconnected';
        }
    }

    // Chat Interface
    async sendMessage(message) {
        this.addMessage('user', message);
        
        // Show typing indicator
        const typingId = this.addTypingIndicator();
        
        try {
            // Parse the message to determine the action
            const action = this.parseMessage(message);
            const response = await this.executeAction(action);
            
            // Remove typing indicator
            this.removeTypingIndicator(typingId);
            
            // Add response message
            this.addMessage('agent', response);
            
        } catch (error) {
            this.removeTypingIndicator(typingId);
            this.addMessage('agent', `Error: ${error.message}`);
        }
    }

    parseMessage(message) {
        const lowerMessage = message.toLowerCase();
        
        // Job management commands
        if (lowerMessage.includes('start') && (lowerMessage.includes('agent') || lowerMessage.includes('job'))) {
            return {
                type: 'start_job',
                message: message
            };
        }
        
        if (lowerMessage.includes('list') && (lowerMessage.includes('job') || lowerMessage.includes('agent'))) {
            return {
                type: 'list_jobs',
                message: message
            };
        }
        
        if (lowerMessage.includes('stop') || lowerMessage.includes('cancel')) {
            return {
                type: 'cancel_job',
                message: message
            };
        }
        
        if (lowerMessage.includes('status') || lowerMessage.includes('dashboard')) {
            return {
                type: 'get_status',
                message: message
            };
        }
        
        if (lowerMessage.includes('logs')) {
            return {
                type: 'get_logs',
                message: message
            };
        }
        
        if (lowerMessage.includes('settings') || lowerMessage.includes('config')) {
            return {
                type: 'open_settings',
                message: message
            };
        }
        
        // Default to general help
        return {
            type: 'help',
            message: message
        };
    }

    async executeAction(action) {
        switch (action.type) {
            case 'start_job':
                return await this.startJobFromMessage(action.message);
            case 'list_jobs':
                return await this.listJobs();
            case 'cancel_job':
                return await this.cancelJobFromMessage(action.message);
            case 'get_status':
                return await this.getSystemStatus();
            case 'get_logs':
                return await this.getRecentLogs();
            case 'open_settings':
                this.openSettings();
                return "Opening settings panel...";
            case 'help':
            default:
                return this.getHelpMessage();
        }
    }

    async startJobFromMessage(message) {
        // Extract job details from message
        const repo = this.extractRepository(message) || 'default/repo';
        const task = this.extractTask(message) || message;
        const playbook = this.extractPlaybook(message) || 'default';
        
        const jobData = {
            repo: repo,
            baseBranch: 'main',
            task: task,
            playbook: playbook,
            limits: {
                timeMin: 30,
                maxToolCalls: 100,
                maxMemoryMB: 2048
            }
        };
        
        try {
            const response = await fetch(`${this.apiUrl}/v1/jobs`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(jobData)
            });
            
            if (response.ok) {
                const result = await response.json();
                this.showNotification('Job started successfully!', 'success');
                return `✅ Background job started successfully!\n\n**Job ID:** ${result.jobId}\n**Repository:** ${repo}\n**Task:** ${task}\n**Status:** Queued\n\nYou can monitor the progress in the sidebar or ask me for updates.`;
            } else {
                throw new Error('Failed to start job');
            }
        } catch (error) {
            throw new Error(`Failed to start job: ${error.message}`);
        }
    }

    async listJobs() {
        try {
            const response = await fetch(`${this.apiUrl}/v1/jobs`);
            if (response.ok) {
                const data = await response.json();
                this.jobs = data.jobs;
                
                if (data.jobs.length === 0) {
                    return "No background jobs found. Start a new job by asking me to 'start a background agent for [your task]'.";
                }
                
                let responseText = `📋 **Background Jobs (${data.jobs.length} total)**\n\n`;
                
                data.jobs.slice(0, 5).forEach(job => {
                    const status = this.getStatusEmoji(job.status);
                    const duration = this.formatDuration(job);
                    responseText += `${status} **${job.id.substring(0, 8)}** - ${job.repo}\n`;
                    responseText += `   Task: ${job.task.substring(0, 60)}${job.task.length > 60 ? '...' : ''}\n`;
                    responseText += `   Status: ${job.status} | Created: ${this.formatTime(job.createdAt)}\n`;
                    if (duration) responseText += `   Duration: ${duration}\n`;
                    responseText += '\n';
                });
                
                if (data.jobs.length > 5) {
                    responseText += `... and ${data.jobs.length - 5} more jobs. Use the dashboard to see all jobs.`;
                }
                
                return responseText;
            } else {
                throw new Error('Failed to fetch jobs');
            }
        } catch (error) {
            throw new Error(`Failed to list jobs: ${error.message}`);
        }
    }

    async getSystemStatus() {
        try {
            const response = await fetch(`${this.apiUrl}/v1/stats`);
            if (response.ok) {
                const stats = await response.json();
                
                let responseText = `📊 **System Status**\n\n`;
                responseText += `**Jobs Overview:**\n`;
                responseText += `• Running: ${stats.jobs.running || 0}\n`;
                responseText += `• Queued: ${stats.jobs.queued || 0}\n`;
                responseText += `• Completed: ${stats.jobs.succeeded || 0}\n`;
                responseText += `• Failed: ${stats.jobs.failed || 0}\n\n`;
                
                responseText += `**Queue Status:**\n`;
                responseText += `• Waiting: ${stats.queue.waiting || 0}\n`;
                responseText += `• Active: ${stats.queue.active || 0}\n`;
                responseText += `• Completed: ${stats.queue.completed || 0}\n`;
                responseText += `• Failed: ${stats.queue.failed || 0}\n\n`;
                
                responseText += `**API Status:** ${this.isConnected ? '🟢 Connected' : '🔴 Disconnected'}\n`;
                responseText += `**Last Updated:** ${new Date().toLocaleTimeString()}`;
                
                return responseText;
            } else {
                throw new Error('Failed to fetch system status');
            }
        } catch (error) {
            throw new Error(`Failed to get system status: ${error.message}`);
        }
    }

    getHelpMessage() {
        return `🤖 **nikCLI Background Agents Help**\n\nI can help you manage background agents and jobs. Here are some commands you can try:\n\n**Job Management:**\n• "Start a background agent to fix failing tests"\n• "List all running jobs"\n• "Show me the status of job [ID]"\n• "Cancel job [ID]"\n\n**Monitoring:**\n• "Show system status"\n• "View recent logs"\n• "Open dashboard"\n\n**Configuration:**\n• "Open settings"\n• "Configure agent settings"\n\n**Examples:**\n• "Start an agent to upgrade dependencies in my project"\n• "List all jobs and show their progress"\n• "What's the current system status?"\n\nYou can also use the quick action buttons in the sidebar for common tasks!`;
    }

    // Message Display
    addMessage(sender, content) {
        const messagesContainer = document.getElementById('chatMessages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message`;
        
        const avatar = sender === 'user' ? '👤' : '🤖';
        const senderName = sender === 'user' ? 'You' : 'nikCLI Assistant';
        
        messageDiv.innerHTML = `
            <div class="message-avatar">
                <i class="fas fa-${sender === 'user' ? 'user' : 'robot'}"></i>
            </div>
            <div class="message-content">
                <div class="message-header">
                    <span class="message-sender">${senderName}</span>
                    <span class="message-time">${new Date().toLocaleTimeString()}</span>
                </div>
                <div class="message-text">${this.formatMessageContent(content)}</div>
            </div>
        `;
        
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        return messageDiv;
    }

    addTypingIndicator() {
        const messagesContainer = document.getElementById('chatMessages');
        const typingDiv = document.createElement('div');
        typingDiv.className = 'message agent-message typing-indicator';
        typingDiv.id = 'typing-' + Date.now();
        
        typingDiv.innerHTML = `
            <div class="message-avatar">
                <i class="fas fa-robot"></i>
            </div>
            <div class="message-content">
                <div class="message-header">
                    <span class="message-sender">nikCLI Assistant</span>
                    <span class="message-time">typing...</span>
                </div>
                <div class="message-text">
                    <div class="typing-dots">
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                </div>
            </div>
        `;
        
        messagesContainer.appendChild(typingDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        return typingDiv.id;
    }

    removeTypingIndicator(typingId) {
        const typingElement = document.getElementById(typingId);
        if (typingElement) {
            typingElement.remove();
        }
    }

    formatMessageContent(content) {
        // Convert markdown-like formatting to HTML
        return content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br>');
    }

    // Utility Functions
    extractRepository(message) {
        const repoMatch = message.match(/(?:repo|repository)[:\s]+([a-zA-Z0-9\-_]+\/[a-zA-Z0-9\-_]+)/i);
        return repoMatch ? repoMatch[1] : null;
    }

    extractTask(message) {
        // Remove common command words and extract the actual task
        const task = message.replace(/(?:start|create|run)\s+(?:a\s+)?(?:background\s+)?(?:agent|job)\s+(?:to\s+)?/i, '');
        return task.trim();
    }

    extractPlaybook(message) {
        const playbookMatch = message.match(/(?:playbook|template)[:\s]+([a-zA-Z0-9\-_]+)/i);
        return playbookMatch ? playbookMatch[1] : null;
    }

    getStatusEmoji(status) {
        const statusEmojis = {
            'queued': '⏳',
            'running': '🔄',
            'succeeded': '✅',
            'failed': '❌',
            'cancelled': '⏹️',
            'timeout': '⏰'
        };
        return statusEmojis[status] || '❓';
    }

    formatDuration(job) {
        if (!job.startedAt) return null;
        const endTime = job.completedAt || new Date();
        const duration = endTime - new Date(job.startedAt);
        const minutes = Math.floor(duration / 60000);
        const seconds = Math.floor((duration % 60000) / 1000);
        return `${minutes}m ${seconds}s`;
    }

    formatTime(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        return date.toLocaleDateString();
    }

    // UI Management
    switchTab(tabName) {
        // Update nav tabs
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });
        
        // Update content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === tabName);
        });
        
        this.currentTab = tabName;
        
        if (tabName === 'dashboard') {
            this.updateDashboard();
        }
    }

    switchSettingsTab(tabName) {
        document.querySelectorAll('.settings-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });
        
        document.querySelectorAll('.settings-panel').forEach(panel => {
            panel.classList.toggle('active', panel.id === tabName + 'Settings');
        });
    }

    openSettings() {
        this.loadSettingsIntoForm();
        this.openModal('settingsModal');
    }

    openModal(modalId) {
        document.getElementById(modalId)?.classList.add('active');
    }

    closeModal(modalId) {
        document.getElementById(modalId)?.classList.remove('active');
    }

    showNotification(message, type = 'info') {
        const notificationsContainer = document.getElementById('notifications');
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        
        notification.innerHTML = `
            <div class="notification-header">
                <span class="notification-title">${type.charAt(0).toUpperCase() + type.slice(1)}</span>
                <button class="notification-close">&times;</button>
            </div>
            <div class="notification-message">${message}</div>
        `;
        
        notificationsContainer.appendChild(notification);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            notification.remove();
        }, 5000);
        
        // Close button
        notification.querySelector('.notification-close').addEventListener('click', () => {
            notification.remove();
        });
    }

    // Data Management
    async loadInitialData() {
        try {
            await Promise.all([
                this.loadJobs(),
                this.loadAgents(),
                this.updateDashboard()
            ]);
        } catch (error) {
            console.error('Failed to load initial data:', error);
        }
    }

    async loadJobs() {
        try {
            const response = await fetch(`${this.apiUrl}/v1/jobs`);
            if (response.ok) {
                const data = await response.json();
                this.jobs = data.jobs;
                this.updateActivityList();
            }
        } catch (error) {
            console.error('Failed to load jobs:', error);
        }
    }

    async loadAgents() {
        // Mock agents for now - in real implementation, this would come from API
        this.agents = [
            { id: '1', name: 'Code Analyzer', status: 'available', description: 'Analyzes code quality and suggests improvements' },
            { id: '2', name: 'Test Runner', status: 'available', description: 'Runs tests and fixes failing ones' },
            { id: '3', name: 'Dependency Manager', status: 'available', description: 'Manages and updates project dependencies' },
            { id: '4', name: 'Security Scanner', status: 'available', description: 'Scans for security vulnerabilities' }
        ];
    }

    updateDashboard() {
        if (this.currentTab !== 'dashboard') return;
        
        const stats = this.calculateStats();
        
        document.getElementById('totalJobs')?.textContent = stats.total;
        document.getElementById('activeJobs')?.textContent = stats.active;
        document.getElementById('successRate')?.textContent = stats.successRate + '%';
        document.getElementById('avgDuration')?.textContent = stats.avgDuration;
        
        this.updateDashboardJobsList();
    }

    calculateStats() {
        const total = this.jobs.length;
        const active = this.jobs.filter(job => ['queued', 'running'].includes(job.status)).length;
        const succeeded = this.jobs.filter(job => job.status === 'succeeded').length;
        const successRate = total > 0 ? Math.round((succeeded / total) * 100) : 0;
        
        // Calculate average duration
        const completedJobs = this.jobs.filter(job => job.completedAt);
        const avgDuration = completedJobs.length > 0 
            ? Math.round(completedJobs.reduce((sum, job) => {
                const duration = new Date(job.completedAt) - new Date(job.startedAt);
                return sum + duration;
            }, 0) / completedJobs.length / 60000)
            : 0;
        
        return {
            total,
            active,
            successRate,
            avgDuration: avgDuration + 'm'
        };
    }

    updateDashboardJobsList() {
        const container = document.getElementById('dashboardJobsList');
        if (!container) return;
        
        const recentJobs = this.jobs.slice(0, 5);
        
        container.innerHTML = recentJobs.map(job => `
            <div class="job-card" onclick="app.showJobDetails('${job.id}')">
                <div class="job-header">
                    <div class="job-title">${job.task.substring(0, 50)}${job.task.length > 50 ? '...' : ''}</div>
                    <div class="job-status ${job.status}">${job.status}</div>
                </div>
                <div class="job-meta">
                    <span class="job-repo">${job.repo}</span>
                    <span>•</span>
                    <span>${this.formatTime(job.createdAt)}</span>
                    ${job.metrics ? `
                        <span>•</span>
                        <div class="job-stats">
                            <span class="additions">+${job.metrics.tokenUsage || 0}</span>
                            <span class="deletions">-${job.metrics.toolCalls || 0}</span>
                        </div>
                    ` : ''}
                </div>
            </div>
        `).join('');
    }

    updateActivityList() {
        const container = document.getElementById('activityList');
        if (!container) return;
        
        const recentJobs = this.jobs.slice(0, 10);
        
        container.innerHTML = recentJobs.map(job => `
            <div class="activity-item" onclick="app.showJobDetails('${job.id}')">
                <div class="activity-icon ${job.status}">
                    <i class="fas fa-${this.getActivityIcon(job.status)}"></i>
                </div>
                <div class="activity-content">
                    <div class="activity-title">${job.task.substring(0, 40)}${job.task.length > 40 ? '...' : ''}</div>
                    <div class="activity-meta">${job.repo} • ${this.formatTime(job.createdAt)}</div>
                </div>
            </div>
        `).join('');
        
        // Update status counts
        const counts = this.jobs.reduce((acc, job) => {
            acc[job.status] = (acc[job.status] || 0) + 1;
            return acc;
        }, {});
        
        document.getElementById('runningCount').textContent = counts.running || 0;
        document.getElementById('queuedCount').textContent = counts.queued || 0;
        document.getElementById('completedCount').textContent = counts.succeeded || 0;
        document.getElementById('failedCount').textContent = counts.failed || 0;
    }

    getActivityIcon(status) {
        const icons = {
            'queued': 'clock',
            'running': 'play',
            'succeeded': 'check',
            'failed': 'times',
            'cancelled': 'stop',
            'timeout': 'clock'
        };
        return icons[status] || 'question';
    }

    updateJob(job) {
        const index = this.jobs.findIndex(j => j.id === job.id);
        if (index >= 0) {
            this.jobs[index] = job;
        } else {
            this.jobs.unshift(job);
        }
        
        this.updateActivityList();
        this.updateDashboard();
    }

    addJobLog(jobId, logEntry) {
        const job = this.jobs.find(j => j.id === jobId);
        if (job) {
            if (!job.logs) job.logs = [];
            job.logs.push(logEntry);
        }
    }

    // Settings Management
    loadSettings() {
        const defaultSettings = {
            apiUrl: 'http://localhost:3000',
            autoRefresh: 5,
            showNotifications: true,
            maxConcurrentJobs: 3,
            defaultTimeLimit: 30,
            defaultMemoryLimit: 2048,
            configPath: '.nik/config.json',
            workspaceRoot: '/workspace',
            modelProvider: 'anthropic',
            defaultModel: 'claude-3-sonnet-20240229',
            temperature: 0.7,
            enableMemory: true,
            enableSnapshots: true
        };
        
        try {
            const saved = localStorage.getItem('nikcli-settings');
            return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
        } catch {
            return defaultSettings;
        }
    }

    loadSettingsIntoForm() {
        Object.keys(this.settings).forEach(key => {
            const element = document.getElementById(key);
            if (element) {
                if (element.type === 'checkbox') {
                    element.checked = this.settings[key];
                } else {
                    element.value = this.settings[key];
                }
            }
        });
        
        // Update temperature display
        const tempSlider = document.getElementById('temperature');
        const tempValue = document.getElementById('temperatureValue');
        if (tempSlider && tempValue) {
            tempValue.textContent = tempSlider.value;
        }
    }

    saveSettings() {
        const newSettings = {};
        
        // Collect form values
        document.querySelectorAll('#settingsModal input, #settingsModal select').forEach(element => {
            if (element.type === 'checkbox') {
                newSettings[element.id] = element.checked;
            } else {
                newSettings[element.id] = element.value;
            }
        });
        
        this.settings = { ...this.settings, ...newSettings };
        
        try {
            localStorage.setItem('nikcli-settings', JSON.stringify(this.settings));
            this.showNotification('Settings saved successfully!', 'success');
            this.closeModal('settingsModal');
            
            // Update API URL if changed
            if (newSettings.apiUrl && newSettings.apiUrl !== this.apiUrl) {
                this.apiUrl = newSettings.apiUrl;
                this.connectToAPI();
            }
        } catch (error) {
            this.showNotification('Failed to save settings', 'error');
        }
    }

    // Quick Actions
    handleQuickAction(action) {
        switch (action) {
            case 'start-agent':
                this.startNewJob();
                break;
            case 'list-jobs':
                this.switchTab('dashboard');
                break;
            case 'view-logs':
                this.getRecentLogs().then(logs => {
                    this.addMessage('agent', logs);
                });
                break;
        }
    }

    startNewJob() {
        const message = prompt('Describe the task for the background agent:');
        if (message) {
            this.sendMessage(`Start a background agent to ${message}`);
        }
    }

    showJobDetails(jobId) {
        const job = this.jobs.find(j => j.id === jobId);
        if (!job) return;
        
        const modal = document.getElementById('jobDetailsModal');
        const title = document.getElementById('jobDetailsTitle');
        const content = document.getElementById('jobDetailsContent');
        
        title.textContent = `Job ${jobId.substring(0, 8)}`;
        content.innerHTML = `
            <div class="job-details">
                <div class="detail-section">
                    <h4>Basic Information</h4>
                    <p><strong>Repository:</strong> ${job.repo}</p>
                    <p><strong>Task:</strong> ${job.task}</p>
                    <p><strong>Status:</strong> <span class="job-status ${job.status}">${job.status}</span></p>
                    <p><strong>Created:</strong> ${new Date(job.createdAt).toLocaleString()}</p>
                    ${job.startedAt ? `<p><strong>Started:</strong> ${new Date(job.startedAt).toLocaleString()}</p>` : ''}
                    ${job.completedAt ? `<p><strong>Completed:</strong> ${new Date(job.completedAt).toLocaleString()}</p>` : ''}
                </div>
                
                ${job.logs && job.logs.length > 0 ? `
                    <div class="detail-section">
                        <h4>Recent Logs</h4>
                        <div class="code-block">
                            <pre>${job.logs.slice(-10).map(log => `[${log.level.toUpperCase()}] ${log.message}`).join('\n')}</pre>
                        </div>
                    </div>
                ` : ''}
                
                ${job.metrics ? `
                    <div class="detail-section">
                        <h4>Metrics</h4>
                        <p><strong>Token Usage:</strong> ${job.metrics.tokenUsage || 0}</p>
                        <p><strong>Tool Calls:</strong> ${job.metrics.toolCalls || 0}</p>
                        <p><strong>Execution Time:</strong> ${job.metrics.executionTime || 0}ms</p>
                        <p><strong>Memory Usage:</strong> ${job.metrics.memoryUsage || 0}MB</p>
                    </div>
                ` : ''}
            </div>
        `;
        
        modal.classList.add('active');
    }

    // Auto-refresh
    startAutoRefresh() {
        setInterval(() => {
            if (this.settings.autoRefresh > 0) {
                this.loadJobs();
                this.updateDashboard();
            }
        }, this.settings.autoRefresh * 1000);
    }

    // Repository and Branch Management
    showRepositorySelector() {
        // In a real implementation, this would fetch available repositories
        const repos = ['nikomatt69/nikcli-main', 'nikomatt69/tui-kit-ai', 'nikomatt69/niktui-kit-ai'];
        const selected = prompt('Select repository:\n' + repos.map((repo, i) => `${i + 1}. ${repo}`).join('\n'));
        
        if (selected && repos[parseInt(selected) - 1]) {
            document.getElementById('currentRepo').textContent = repos[parseInt(selected) - 1];
        }
    }

    showBranchSelector() {
        const branches = ['main', 'develop', 'feature/new-agent'];
        const selected = prompt('Select branch:\n' + branches.map((branch, i) => `${i + 1}. ${branch}`).join('\n'));
        
        if (selected && branches[parseInt(selected) - 1]) {
            document.getElementById('currentBranch').textContent = branches[parseInt(selected) - 1];
        }
    }
}

// Global functions for HTML onclick handlers
function switchToChat() {
    app.switchTab('agents');
}

function switchTab(tabName) {
    app.switchTab(tabName);
}

// Initialize the application
const app = new NikCLIAgentInterface();

// Add some CSS for typing indicator
const style = document.createElement('style');
style.textContent = `
    .typing-indicator .typing-dots {
        display: flex;
        gap: 4px;
        align-items: center;
    }
    
    .typing-indicator .typing-dots span {
        width: 6px;
        height: 6px;
        background: #7d8590;
        border-radius: 50%;
        animation: typing 1.4s infinite ease-in-out;
    }
    
    .typing-indicator .typing-dots span:nth-child(1) {
        animation-delay: -0.32s;
    }
    
    .typing-indicator .typing-dots span:nth-child(2) {
        animation-delay: -0.16s;
    }
    
    @keyframes typing {
        0%, 80%, 100% {
            transform: scale(0.8);
            opacity: 0.5;
        }
        40% {
            transform: scale(1);
            opacity: 1;
        }
    }
    
    .status-dot.connected {
        background: #3fb950;
    }
    
    .status-dot.disconnected {
        background: #f85149;
    }
    
    .job-details {
        display: flex;
        flex-direction: column;
        gap: 20px;
    }
    
    .detail-section h4 {
        color: #e6edf3;
        margin-bottom: 12px;
        font-size: 16px;
        font-weight: 600;
    }
    
    .detail-section p {
        margin-bottom: 8px;
        color: #7d8590;
    }
    
    .detail-section strong {
        color: #e6edf3;
    }
`;
document.head.appendChild(style);