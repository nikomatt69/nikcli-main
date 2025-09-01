import React, { useState } from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import { TodoItem } from '../../types';

interface TodosPanelProps {
  title: string;
  borderColor?: string;
  todos: TodoItem[];
  planTitle?: string;
  onTodoSelect?: (todo: TodoItem) => void;
  interactive?: boolean;
}

const TodosPanel: React.FC<TodosPanelProps> = ({
  title,
  borderColor = 'yellow',
  todos,
  planTitle,
  onTodoSelect,
  interactive = false,
}) => {
  const [selectedTodo, setSelectedTodo] = useState<TodoItem | null>(null);

  const getStatusIcon = (status: TodoItem['status']) => {
    switch (status) {
      case 'completed': return '✅';
      case 'in_progress': return '🔄';
      case 'failed': return '❌';
      case 'skipped': return '⏭️';
      default: return '⏳';
    }
  };

  const getStatusColor = (status: TodoItem['status']) => {
    switch (status) {
      case 'completed': return 'green';
      case 'in_progress': return 'blue';
      case 'failed': return 'red';
      case 'skipped': return 'yellow';
      default: return 'gray';
    }
  };

  const getPriorityIcon = (priority?: TodoItem['priority']) => {
    switch (priority) {
      case 'critical': return '🔴';
      case 'high': return '🟡';
      case 'medium': return '🟢';
      case 'low': return '🔵';
      default: return '';
    }
  };

  const getCategoryColor = (category?: string) => {
    switch (category) {
      case 'planning': return 'blue';
      case 'implementation': return 'green';
      case 'testing': return 'yellow';
      case 'documentation': return 'cyan';
      case 'deployment': return 'magenta';
      default: return 'white';
    }
  };

  const createProgressBar = (progress: number, width: number = 15) => {
    const filled = Math.round((progress / 100) * width);
    const empty = width - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  };

  const getStats = () => {
    const completed = todos.filter(t => t.status === 'completed').length;
    const inProgress = todos.filter(t => t.status === 'in_progress').length;
    const pending = todos.filter(t => t.status === 'pending').length;
    const failed = todos.filter(t => t.status === 'failed').length;
    const total = todos.length;
    
    return { completed, inProgress, pending, failed, total };
  };

  const stats = getStats();
  const completionPercentage = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

  const selectItems = todos.map((todo, index) => ({
    label: `${getStatusIcon(todo.status)} ${getPriorityIcon(todo.priority)} ${todo.content || todo.title || `Todo ${index + 1}`}`,
    value: todo,
  }));

  return (
    <Box 
      borderStyle="round" 
      borderColor={borderColor} 
      padding={1} 
      flexDirection="column"
      height="100%"
    >
      {/* Header */}
      <Box marginBottom={1} flexDirection="column">
        <Box justifyContent="space-between">
          <Text color={borderColor} bold>{title}</Text>
          <Text color="gray" dimColor>
            {completionPercentage}% complete
          </Text>
        </Box>
        {planTitle && (
          <Text color="cyan" dimColor>
            📋 {planTitle}
          </Text>
        )}
      </Box>

      {/* Progress Overview */}
      {stats.total > 0 && (
        <Box marginBottom={1} flexDirection="column">
          <Box>
            <Text color="cyan">Progress: </Text>
            <Text color="green">
              [{createProgressBar(completionPercentage)}] {completionPercentage}%
            </Text>
          </Box>
          <Box>
            <Text color="green">✅{stats.completed} </Text>
            <Text color="blue">🔄{stats.inProgress} </Text>
            <Text color="gray">⏳{stats.pending} </Text>
            {stats.failed > 0 && <Text color="red">❌{stats.failed}</Text>}
          </Box>
        </Box>
      )}

      {/* Todos List */}
      <Box flexDirection="column" flex={1}>
        {todos.length === 0 ? (
          <Box justifyContent="center" alignItems="center" flex={1}>
            <Text color="gray" dimColor>
              📋 No todos available
            </Text>
          </Box>
        ) : interactive && todos.length > 1 ? (
          <SelectInput
            items={selectItems}
            onSelect={(item) => {
              setSelectedTodo(item.value);
              onTodoSelect?.(item.value);
            }}
          />
        ) : (
          todos.map((todo, index) => (
            <Box key={index} flexDirection="column" marginBottom={1}>
              <Box>
                <Text>{getStatusIcon(todo.status)} </Text>
                <Text>{getPriorityIcon(todo.priority)} </Text>
                <Text 
                  color={getStatusColor(todo.status)}
                  strikethrough={todo.status === 'completed'}
                >
                  {todo.content || todo.title || `Todo ${index + 1}`}
                </Text>
              </Box>
              
              {todo.category && (
                <Box marginLeft={4}>
                  <Text color={getCategoryColor(todo.category)} dimColor>
                    [{todo.category}]
                  </Text>
                </Box>
              )}

              {todo.status === 'in_progress' && todo.progress !== undefined && (
                <Box marginLeft={4}>
                  <Text color="blue">
                    [{createProgressBar(todo.progress, 10)}] {todo.progress}%
                  </Text>
                </Box>
              )}
            </Box>
          ))
        )}
      </Box>

      {/* Selected Todo Details */}
      {selectedTodo && (
        <Box marginTop={1} borderStyle="single" borderColor="gray" padding={1}>
          <Box flexDirection="column">
            <Text color="cyan" bold>Selected Todo:</Text>
            <Text wrap="wrap">{selectedTodo.content || selectedTodo.title}</Text>
            {selectedTodo.category && (
              <Text color={getCategoryColor(selectedTodo.category)}>
                Category: {selectedTodo.category}
              </Text>
            )}
            {selectedTodo.priority && (
              <Text>Priority: {selectedTodo.priority}</Text>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default TodosPanel;