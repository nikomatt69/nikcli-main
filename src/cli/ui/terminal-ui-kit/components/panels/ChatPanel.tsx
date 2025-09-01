import React, { useEffect, useRef } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { ChatMessage } from '../../types';

interface ChatPanelProps {
  title: string;
  borderColor?: string;
  messages: ChatMessage[];
  isStreaming: boolean;
  maxMessages?: number;
}

const ChatPanel: React.FC<ChatPanelProps> = ({
  title,
  borderColor = 'cyan',
  messages,
  isStreaming,
  maxMessages = 50,
}) => {
  const scrollRef = useRef<any>();
  const displayMessages = messages.slice(-maxMessages);

  // Auto-scroll ai nuovi messaggi
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollToBottom();
    }
  }, [messages]);

  const formatMessage = (message: ChatMessage) => {
    const timeStr = message.timestamp.toLocaleTimeString();
    const roleColor = message.role === 'user' ? 'blue' : 
                     message.role === 'assistant' ? 'green' : 'gray';
    const roleIcon = message.role === 'user' ? '👤' : 
                    message.role === 'assistant' ? '🤖' : '⚙️';

    return {
      header: `${roleIcon} ${message.role.toUpperCase()} ${timeStr}`,
      content: message.content,
      color: roleColor,
    };
  };

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
        {isStreaming && (
          <Box>
            <Spinner type="dots" />
            <Text color="yellow"> Streaming</Text>
          </Box>
        )}
      </Box>

      {/* Messages */}
      <Box flexDirection="column" flex={1} ref={scrollRef}>
        {displayMessages.length === 0 ? (
          <Box justifyContent="center" alignItems="center" flex={1}>
            <Text color="gray" dimColor>
              💬 Start a conversation...
            </Text>
          </Box>
        ) : (
          displayMessages.map((message, index) => {
            const formatted = formatMessage(message);
            return (
              <Box key={index} flexDirection="column" marginBottom={1}>
                <Text color={formatted.color} bold>
                  {formatted.header}
                </Text>
                <Box paddingLeft={2}>
                  <Text wrap="wrap">
                    {formatted.content}
                  </Text>
                </Box>
              </Box>
            );
          })
        )}
      </Box>

      {/* Footer con statistiche */}
      <Box marginTop={1} justifyContent="space-between">
        <Text color="gray" dimColor>
          Messages: {messages.length}
        </Text>
        {isStreaming && (
          <Text color="yellow" dimColor>
            🔄 AI is thinking...
          </Text>
        )}
      </Box>
    </Box>
  );
};

export default ChatPanel;