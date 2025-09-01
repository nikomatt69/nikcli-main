import { useState, useEffect, useCallback } from 'react';
import { 
  TerminalState, 
  StreamData, 
  StatusIndicator, 
  BackgroundAgentInfo, 
  TodoItem, 
  FileInfo, 
  DiffInfo,
  ChatMessage,
  ApprovalRequest 
} from '../types';

export function useTerminalState(initialMode: string, cliInstance: any) {
  const [terminalState, setTerminalState] = useState<TerminalState>({
    currentMode: initialMode as any,
    isProcessing: false,
    userInputActive: false,
    shouldInterrupt: false,
    structuredUIEnabled: true,
    cognitiveMode: true,
    orchestrationLevel: 8,
  });

  const [streams, setStreams] = useState<StreamData[]>([]);
  const [statusIndicators, setStatusIndicators] = useState<StatusIndicator[]>([]);
  const [backgroundAgents, setBackgroundAgents] = useState<BackgroundAgentInfo[]>([]);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [fileList, setFileList] = useState<FileInfo[]>([]);
  const [currentFile, setCurrentFile] = useState<FileInfo | undefined>();
  const [currentDiff, setCurrentDiff] = useState<DiffInfo | undefined>();
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalRequest[]>([]);
  const [liveUpdates, setLiveUpdates] = useState<StreamData[]>([]);
  const [currentPlan, setCurrentPlan] = useState<any>(null);

  // Sincronizza con l'istanza CLI esistente
  useEffect(() => {
    if (!cliInstance) return;

    // Ascolta eventi dall'istanza CLI
    const handleModeChange = (mode: string) => {
      setTerminalState(prev => ({ ...prev, currentMode: mode as any }));
    };

    const handleProcessingChange = (processing: boolean) => {
      setTerminalState(prev => ({ ...prev, isProcessing: processing }));
    };

    const handleUserInputChange = (active: boolean) => {
      setTerminalState(prev => ({ ...prev, userInputActive: active }));
    };

    const handleStreamData = (data: StreamData) => {
      setStreams(prev => [...prev.slice(-49), data]);
      setLiveUpdates(prev => [...prev.slice(-49), data]);
    };

    const handleStatusUpdate = (indicators: StatusIndicator[]) => {
      setStatusIndicators(indicators);
    };

    const handleAgentUpdate = (agents: BackgroundAgentInfo[]) => {
      setBackgroundAgents(agents);
    };

    const handleTodosUpdate = (todoItems: TodoItem[]) => {
      setTodos(todoItems);
    };

    const handleFileUpdate = (files: FileInfo[]) => {
      setFileList(files);
    };

    const handleCurrentFileUpdate = (file: FileInfo | undefined) => {
      setCurrentFile(file);
    };

    const handleDiffUpdate = (diff: DiffInfo | undefined) => {
      setCurrentDiff(diff);
    };

    const handleChatUpdate = (messages: ChatMessage[]) => {
      setChatMessages(messages);
    };

    const handleApprovalUpdate = (approvals: ApprovalRequest[]) => {
      setPendingApprovals(approvals);
    };

    const handlePlanUpdate = (plan: any) => {
      setCurrentPlan(plan);
    };

    // Registra listeners se l'istanza CLI li supporta
    if (cliInstance.on) {
      cliInstance.on('mode:change', handleModeChange);
      cliInstance.on('processing:change', handleProcessingChange);
      cliInstance.on('input:change', handleUserInputChange);
      cliInstance.on('stream:data', handleStreamData);
      cliInstance.on('status:update', handleStatusUpdate);
      cliInstance.on('agents:update', handleAgentUpdate);
      cliInstance.on('todos:update', handleTodosUpdate);
      cliInstance.on('files:update', handleFileUpdate);
      cliInstance.on('file:current', handleCurrentFileUpdate);
      cliInstance.on('diff:update', handleDiffUpdate);
      cliInstance.on('chat:update', handleChatUpdate);
      cliInstance.on('approval:update', handleApprovalUpdate);
      cliInstance.on('plan:update', handlePlanUpdate);
    }

    // Cleanup
    return () => {
      if (cliInstance.off) {
        cliInstance.off('mode:change', handleModeChange);
        cliInstance.off('processing:change', handleProcessingChange);
        cliInstance.off('input:change', handleUserInputChange);
        cliInstance.off('stream:data', handleStreamData);
        cliInstance.off('status:update', handleStatusUpdate);
        cliInstance.off('agents:update', handleAgentUpdate);
        cliInstance.off('todos:update', handleTodosUpdate);
        cliInstance.off('files:update', handleFileUpdate);
        cliInstance.off('file:current', handleCurrentFileUpdate);
        cliInstance.off('diff:update', handleDiffUpdate);
        cliInstance.off('chat:update', handleChatUpdate);
        cliInstance.off('approval:update', handleApprovalUpdate);
        cliInstance.off('plan:update', handlePlanUpdate);
      }
    };
  }, [cliInstance]);

  // Metodi per interagire con il CLI
  const handleInput = useCallback((input: string) => {
    if (cliInstance?.handleChatInput) {
      cliInstance.handleChatInput(input);
    }
  }, [cliInstance]);

  const handleCommand = useCallback((command: string) => {
    if (cliInstance?.dispatchSlash) {
      cliInstance.dispatchSlash(command);
    }
  }, [cliInstance]);

  const interruptProcessing = useCallback(() => {
    setTerminalState(prev => ({ ...prev, shouldInterrupt: true }));
    if (cliInstance?.interruptProcessing) {
      cliInstance.interruptProcessing();
    }
  }, [cliInstance]);

  const approveRequest = useCallback((id: string) => {
    if (cliInstance?.approvalSystem?.approve) {
      cliInstance.approvalSystem.approve(id);
    }
  }, [cliInstance]);

  const rejectRequest = useCallback((id: string) => {
    if (cliInstance?.approvalSystem?.reject) {
      cliInstance.approvalSystem.reject(id);
    }
  }, [cliInstance]);

  return {
    ...terminalState,
    streams,
    statusIndicators,
    backgroundAgents,
    todos,
    fileList,
    currentFile,
    currentDiff,
    chatMessages,
    pendingApprovals,
    liveUpdates,
    currentPlan,
    handleInput,
    handleCommand,
    interruptProcessing,
    approveRequest,
    rejectRequest,
  };
}