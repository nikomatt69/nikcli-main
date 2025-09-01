import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import { CommandPanelProps, TodoItem } from '../../types';

interface ExecutionPlan {
  id: string;
  title: string;
  status: 'draft' | 'approved' | 'executing' | 'completed' | 'failed';
  todos: TodoItem[];
  createdAt: Date;
  estimatedDuration?: number;
  progress?: number;
}

interface PlanOperation {
  type: 'list' | 'create' | 'execute' | 'approve' | 'show';
  planId?: string;
  goal?: string;
}

const PlanCommandPanel: React.FC<CommandPanelProps> = ({
  title,
  borderColor = 'yellow',
  args,
  context,
  onComplete,
}) => {
  const [plans, setPlans] = useState<ExecutionPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<ExecutionPlan | null>(null);
  const [operation, setOperation] = useState<PlanOperation>({ type: 'list' });
  const [inputValue, setInputValue] = useState('');
  const [mode, setMode] = useState<'select' | 'input' | 'execute' | 'result'>('select');
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState<any>(null);

  // Carica piani esistenti
  useEffect(() => {
    loadPlans();
  }, []);

  // Determina operazione dai args
  useEffect(() => {
    if (args.length > 0) {
      const command = args[0];
      switch (command) {
        case 'create':
        case 'generate':
          if (args.length > 1) {
            setOperation({ type: 'create', goal: args.slice(1).join(' ') });
            setMode('execute');
            executeOperation({ type: 'create', goal: args.slice(1).join(' ') });
          } else {
            setOperation({ type: 'create' });
            setMode('input');
          }
          break;
        case 'execute':
        case 'run':
          setOperation({ type: 'execute', planId: args[1] });
          setMode('execute');
          executeOperation({ type: 'execute', planId: args[1] });
          break;
        case 'approve':
          setOperation({ type: 'approve', planId: args[1] });
          setMode('execute');
          executeOperation({ type: 'approve', planId: args[1] });
          break;
        case 'show':
        case 'status':
          setOperation({ type: 'show', planId: args[1] });
          setMode('execute');
          executeOperation({ type: 'show', planId: args[1] });
          break;
        default:
          setOperation({ type: 'list' });
          setMode('execute');
          executeOperation({ type: 'list' });
      }
    }
  }, [args]);

  const loadPlans = async () => {
    try {
      const enhancedPlanning = context.cliInstance?.enhancedPlanning;
      if (!enhancedPlanning) return;

      const activePlans = enhancedPlanning.getActivePlans?.() || [];
      const planInfos: ExecutionPlan[] = activePlans.map((plan: any) => ({
        id: plan.id,
        title: plan.title,
        status: plan.status,
        todos: plan.todos || [],
        createdAt: plan.createdAt,
        estimatedDuration: plan.estimatedDuration,
        progress: plan.progress,
      }));

      setPlans(planInfos);
    } catch (error) {
      console.error('Failed to load plans:', error);
    }
  };

  const executeOperation = async (op: PlanOperation) => {
    setIsExecuting(true);
    setResult(null);

    try {
      const enhancedPlanning = context.cliInstance?.enhancedPlanning;
      if (!enhancedPlanning) throw new Error('Enhanced planning not available');

      switch (op.type) {
        case 'list':
          await loadPlans();
          setResult({
            type: 'plan_list',
            plans,
          });
          break;

        case 'create':
          if (!op.goal) throw new Error('Goal required for plan creation');
          
          const newPlan = await enhancedPlanning.generatePlan(op.goal, {
            maxTodos: 15,
            includeContext: true,
            showDetails: true,
            saveTodoFile: true,
          });

          setResult({
            type: 'plan_created',
            plan: newPlan,
          });
          await loadPlans();
          break;

        case 'execute':
          const planToExecute = op.planId ? 
            plans.find(p => p.id === op.planId) : 
            plans.filter(p => p.status === 'approved')[0] || plans[plans.length - 1];
            
          if (!planToExecute) throw new Error('No plan found to execute');

          await enhancedPlanning.executePlan(planToExecute.id);
          setResult({
            type: 'plan_executed',
            planId: planToExecute.id,
            title: planToExecute.title,
          });
          await loadPlans();
          break;

        case 'approve':
          const planToApprove = op.planId ? 
            plans.find(p => p.id === op.planId) : 
            plans.filter(p => p.status === 'draft')[0];
            
          if (!planToApprove) throw new Error('No plan found to approve');

          await enhancedPlanning.requestPlanApproval(planToApprove.id);
          setResult({
            type: 'plan_approved',
            planId: planToApprove.id,
            title: planToApprove.title,
          });
          await loadPlans();
          break;

        case 'show':
          const planToShow = op.planId ? 
            plans.find(p => p.id === op.planId) : 
            plans[plans.length - 1];
            
          if (!planToShow) throw new Error('No plan found to show');

          setResult({
            type: 'plan_details',
            plan: planToShow,
          });
          break;

        default:
          throw new Error(`Unknown plan operation: ${op.type}`);
      }

      setMode('result');
    } catch (error: any) {
      setResult({
        type: 'error',
        message: error.message,
      });
      setMode('result');
    } finally {
      setIsExecuting(false);
    }
  };

  const getPlanStatusIcon = (status: ExecutionPlan['status']) => {
    switch (status) {
      case 'draft': return '📝';
      case 'approved': return '✅';
      case 'executing': return '🔄';
      case 'completed': return '🎉';
      case 'failed': return '❌';
      default: return '📋';
    }
  };

  const getPlanStatusColor = (status: ExecutionPlan['status']) => {
    switch (status) {
      case 'draft': return 'gray';
      case 'approved': return 'green';
      case 'executing': return 'blue';
      case 'completed': return 'green';
      case 'failed': return 'red';
      default: return 'white';
    }
  };

  const getTodoStats = (todos: TodoItem[]) => {
    const completed = todos.filter(t => t.status === 'completed').length;
    const inProgress = todos.filter(t => t.status === 'in_progress').length;
    const pending = todos.filter(t => t.status === 'pending').length;
    const failed = todos.filter(t => t.status === 'failed').length;
    
    return { completed, inProgress, pending, failed, total: todos.length };
  };

  const createProgressBar = (progress: number, width: number = 20) => {
    const filled = Math.round((progress / 100) * width);
    const empty = width - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  };

  const planOperationItems = [
    { label: '📋 List Plans', value: 'list' },
    { label: '✨ Create Plan', value: 'create' },
    { label: '🚀 Execute Plan', value: 'execute' },
    { label: '✅ Approve Plan', value: 'approve' },
    { label: '👁️ Show Plan Details', value: 'show' },
  ];

  const planItems = plans.map(plan => {
    const stats = getTodoStats(plan.todos);
    const completionPercentage = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
    
    return {
      label: `${getPlanStatusIcon(plan.status)} ${plan.title} (${completionPercentage}% complete)`,
      value: plan,
    };
  });

  return (
    <Box 
      borderStyle="round" 
      borderColor={borderColor} 
      padding={1} 
      flexDirection="column"
      height="100%"
    >
      {/* Header */}
      <Box marginBottom={1} justifyContent="space-between">
        <Text color={borderColor} bold>{title}</Text>
        <Text color="gray" dimColor>
          {plans.length} plans
        </Text>
      </Box>

      {/* Content */}
      <Box flexDirection="column" flex={1}>
        {mode === 'select' && (
          <Box flexDirection="column" flex={1}>
            <Text color="cyan" bold marginBottom={1}>
              📋 Planning Operations:
            </Text>
            <SelectInput
              items={planOperationItems}
              onSelect={(item) => {
                setOperation({ type: item.value as any });
                if (item.value === 'list') {
                  setMode('execute');
                  executeOperation({ type: 'list' });
                } else {
                  setMode('input');
                }
              }}
            />
          </Box>
        )}

        {mode === 'input' && (
          <Box flexDirection="column" flex={1}>
            <Text color="yellow" bold marginBottom={1}>
              🔧 {operation.type.toUpperCase()} Configuration
            </Text>
            
            {operation.type === 'create' && (
              <>
                <Text color="cyan">Project Goal: </Text>
                <TextInput
                  value={inputValue}
                  onChange={setInputValue}
                  onSubmit={(goal) => executeOperation({ ...operation, goal })}
                  placeholder="Describe what you want to build or achieve..."
                />
                <Box marginTop={1}>
                  <Text color="gray" dimColor>
                    Be specific about your requirements and constraints
                  </Text>
                </Box>
              </>
            )}

            {(operation.type === 'execute' || operation.type === 'approve' || operation.type === 'show') && (
              <>
                <Text color="cyan" marginBottom={1}>Select Plan:</Text>
                {plans.length === 0 ? (
                  <Text color="gray" dimColor>No plans available</Text>
                ) : (
                  <SelectInput
                    items={planItems}
                    onSelect={(item) => executeOperation({ 
                      ...operation, 
                      planId: item.value.id 
                    })}
                  />
                )}
              </>
            )}
          </Box>
        )}

        {mode === 'execute' && (
          <Box flexDirection="column" flex={1} justifyContent="center" alignItems="center">
            <Spinner type="dots" />
            <Text color="blue" marginTop={1}>
              {operation.type === 'create' ? 'Generating plan...' :
               operation.type === 'execute' ? 'Executing plan...' :
               operation.type === 'approve' ? 'Processing approval...' :
               'Loading plan details...'}
            </Text>
          </Box>
        )}

        {mode === 'result' && result && (
          <Box flexDirection="column" flex={1}>
            {result.type === 'plan_list' && (
              <Box flexDirection="column" flex={1}>
                <Text color="green" bold marginBottom={1}>
                  📋 Active Plans ({plans.length}):
                </Text>
                {plans.length === 0 ? (
                  <Text color="gray" dimColor>No plans available</Text>
                ) : (
                  plans.map((plan, index) => {
                    const stats = getTodoStats(plan.todos);
                    const completionPercentage = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
                    
                    return (
                      <Box key={index} flexDirection="column" marginBottom={1}>
                        <Box justifyContent="space-between">
                          <Text color={getPlanStatusColor(plan.status)}>
                            {getPlanStatusIcon(plan.status)} {plan.title}
                          </Text>
                          <Text color="gray" dimColor>
                            {completionPercentage}%
                          </Text>
                        </Box>
                        <Box paddingLeft={2}>
                          <Text color="gray" dimColor>
                            📊 {stats.completed}✅ {stats.inProgress}🔄 {stats.pending}⏳ {stats.failed}❌
                          </Text>
                        </Box>
                        {plan.progress !== undefined && (
                          <Box paddingLeft={2}>
                            <Text color="blue">
                              [{createProgressBar(plan.progress, 15)}] {plan.progress}%
                            </Text>
                          </Box>
                        )}
                      </Box>
                    );
                  })
                )}
              </Box>
            )}

            {result.type === 'plan_created' && (
              <Box justifyContent="center" alignItems="center" flex={1}>
                <Box flexDirection="column" alignItems="center">
                  <Text color="green" bold>✨ Plan Created Successfully</Text>
                  <Text color="gray">Title: {result.plan.title}</Text>
                  <Text color="gray">Todos: {result.plan.todos.length}</Text>
                  <Text color="blue">ID: {result.plan.id.slice(0, 8)}</Text>
                  <Text color="yellow" marginTop={1}>
                    Use /plan execute to run this plan
                  </Text>
                </Box>
              </Box>
            )}

            {result.type === 'plan_executed' && (
              <Box justifyContent="center" alignItems="center" flex={1}>
                <Box flexDirection="column" alignItems="center">
                  <Text color="green" bold>🚀 Plan Execution Started</Text>
                  <Text color="gray">Plan: {result.title}</Text>
                  <Text color="blue">ID: {result.planId.slice(0, 8)}</Text>
                  <Text color="cyan" marginTop={1}>
                    Check the todos panel for progress updates
                  </Text>
                </Box>
              </Box>
            )}

            {result.type === 'plan_details' && result.plan && (
              <Box flexDirection="column" flex={1}>
                <Text color="green" bold marginBottom={1}>
                  📋 Plan Details: {result.plan.title}
                </Text>
                
                <Box borderStyle="single" borderColor="gray" padding={1} marginBottom={1}>
                  <Box flexDirection="column">
                    <Text>Status: {getPlanStatusIcon(result.plan.status)} {result.plan.status}</Text>
                    <Text>Created: {result.plan.createdAt.toLocaleString()}</Text>
                    <Text>Todos: {result.plan.todos.length}</Text>
                    {result.plan.estimatedDuration && (
                      <Text>Est. Duration: {Math.round(result.plan.estimatedDuration / 60000)}min</Text>
                    )}
                  </Box>
                </Box>

                {/* Todo Preview */}
                <Box flexDirection="column" flex={1}>
                  <Text color="cyan" bold>📝 Todos Preview:</Text>
                  {result.plan.todos.slice(0, 8).map((todo: TodoItem, index: number) => {
                    const statusIcon = todo.status === 'completed' ? '✅' :
                                      todo.status === 'in_progress' ? '🔄' :
                                      todo.status === 'failed' ? '❌' : '⏳';
                    
                    return (
                      <Box key={index}>
                        <Text>{statusIcon} {todo.content || todo.title}</Text>
                      </Box>
                    );
                  })}
                  {result.plan.todos.length > 8 && (
                    <Text color="gray" dimColor>
                      ... and {result.plan.todos.length - 8} more todos
                    </Text>
                  )}
                </Box>
              </Box>
            )}

            {result.type === 'error' && (
              <Box justifyContent="center" alignItems="center" flex={1}>
                <Box flexDirection="column" alignItems="center">
                  <Text color="red" bold>❌ Operation Failed</Text>
                  <Text color="gray" wrap="wrap">{result.message}</Text>
                </Box>
              </Box>
            )}
          </Box>
        )}
      </Box>

      {/* Plan Stats */}
      {plans.length > 0 && (
        <Box marginTop={1}>
          <Box justifyContent="space-between">
            <Text color="gray">
              📝 {plans.filter(p => p.status === 'draft').length} draft
            </Text>
            <Text color="green">
              ✅ {plans.filter(p => p.status === 'approved').length} approved
            </Text>
            <Text color="blue">
              🔄 {plans.filter(p => p.status === 'executing').length} executing
            </Text>
            <Text color="green">
              🎉 {plans.filter(p => p.status === 'completed').length} completed
            </Text>
          </Box>
        </Box>
      )}

      {/* Footer */}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          {mode === 'select' 
            ? 'Select a planning operation'
            : mode === 'input'
            ? 'Enter required information • Esc to cancel'
            : mode === 'execute'
            ? 'Planning operation in progress...'
            : 'Operation completed • Press any key to continue'
          }
        </Text>
      </Box>
    </Box>
  );
};

export default PlanCommandPanel;