import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';

interface PromptComponentProps {
  currentMode: string;
  isProcessing: boolean;
  userInputActive: boolean;
  onInput: (input: string) => void;
  onCommand: (command: string) => void;
}

const PromptComponent: React.FC<PromptComponentProps> = ({
  currentMode,
  isProcessing,
  userInputActive,
  onInput,
  onCommand,
}) => {
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Auto-completamento per comandi slash
  useEffect(() => {
    if (input.startsWith('/')) {
      const commands = [
        '/help', '/quit', '/clear', '/model', '/agents', '/auto', '/plan',
        '/read', '/write', '/ls', '/search', '/run', '/install', '/test',
        '/vm', '/vm-create', '/vm-list', '/vm-status', '/vm-exec',
        '/analyze-image', '/generate-image', '/memory', '/snapshot',
        '/config', '/debug', '/approval', '/security'
      ];
      
      const filtered = commands.filter(cmd => 
        cmd.toLowerCase().includes(input.toLowerCase().slice(1))
      );
      setSuggestions(filtered.slice(0, 5));
      setShowSuggestions(filtered.length > 0 && input.length > 1);
    } else {
      setShowSuggestions(false);
    }
  }, [input]);

  const handleSubmit = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;

    if (trimmed.startsWith('/')) {
      onCommand(trimmed);
    } else {
      onInput(trimmed);
    }
    
    setInput('');
    setShowSuggestions(false);
  };

  const getModeIcon = () => {
    switch (currentMode) {
      case 'auto': return '🤖';
      case 'plan': return '📋';
      case 'vm': return '🐳';
      default: return '💬';
    }
  };

  const getModeColor = () => {
    switch (currentMode) {
      case 'auto': return 'blue';
      case 'plan': return 'yellow';
      case 'vm': return 'cyan';
      default: return 'green';
    }
  };

  return (
    <Box flexDirection="column">
      {/* Suggestions */}
      {showSuggestions && (
        <Box 
          borderStyle="round" 
          borderColor="gray" 
          padding={1} 
          marginBottom={1}
        >
          <Box flexDirection="column">
            <Text color="cyan" bold>💡 Suggestions:</Text>
            {suggestions.map((suggestion, index) => (
              <Text key={index} color="gray">
                {suggestion}
              </Text>
            ))}
          </Box>
        </Box>
      )}

      {/* Main Prompt */}
      <Box borderStyle="round" borderColor={getModeColor()} padding={1}>
        <Box alignItems="center" gap={1}>
          {/* Mode Indicator */}
          <Text color={getModeColor()}>
            {getModeIcon()} {currentMode.toUpperCase()}
          </Text>

          {/* Processing Indicator */}
          {isProcessing && (
            <Box>
              <Spinner type="dots" />
              <Text color="yellow"> Processing...</Text>
            </Box>
          )}

          {/* User Input Active Indicator */}
          {userInputActive && !isProcessing && (
            <Text color="blue">⌨️ Typing...</Text>
          )}

          {/* Input Field */}
          {!isProcessing && (
            <Box flex={1}>
              <Text color={getModeColor()}>{'>'} </Text>
              <TextInput
                value={input}
                onChange={setInput}
                onSubmit={handleSubmit}
                placeholder="Type your message or /command..."
                showCursor={true}
              />
            </Box>
          )}
        </Box>

        {/* Help Text */}
        <Box marginTop={1}>
          <Text color="gray" dimColor>
            {isProcessing 
              ? 'Press Esc to interrupt • Ctrl+C to exit'
              : 'Type / for commands • @ for agents • * for files • ? for help'
            }
          </Text>
        </Box>
      </Box>
    </Box>
  );
};

export default PromptComponent;