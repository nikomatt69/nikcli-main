import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import { CommandPanelProps } from '../../types';

interface ConfigItem {
  key: string;
  value: any;
  type: 'string' | 'number' | 'boolean' | 'object';
  description?: string;
  category: string;
}

const ConfigCommandPanel: React.FC<CommandPanelProps> = ({
  title,
  borderColor = 'cyan',
  args,
  context,
  onComplete,
}) => {
  const [config, setConfig] = useState<ConfigItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<ConfigItem | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [mode, setMode] = useState<'view' | 'edit' | 'save'>('view');

  useEffect(() => {
    loadConfiguration();
  }, []);

  const loadConfiguration = async () => {
    try {
      const configManager = context.cliInstance?.configManager || context.configManager;
      if (!configManager) return;

      const configData = configManager.getAll?.() || configManager.getConfig?.() || {};
      
      const items: ConfigItem[] = [];
      
      // Flatten config object into items
      const processConfigObject = (obj: any, prefix: string = '', category: string = 'general') => {
        Object.entries(obj).forEach(([key, value]) => {
          const fullKey = prefix ? `${prefix}.${key}` : key;
          
          if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            processConfigObject(value, fullKey, key);
          } else {
            items.push({
              key: fullKey,
              value,
              type: typeof value as any,
              category,
              description: getConfigDescription(fullKey),
            });
          }
        });
      };

      processConfigObject(configData);
      setConfig(items);
    } catch (error) {
      console.error('Failed to load configuration:', error);
    }
  };

  const getConfigDescription = (key: string): string => {
    const descriptions: Record<string, string> = {
      'currentModel': 'Currently selected AI model',
      'temperature': 'AI creativity level (0.0-2.0)',
      'chatHistory': 'Enable chat history persistence',
      'autoApproval': 'Automatically approve low-risk operations',
      'structuredUI': 'Use structured terminal UI',
      'cognitiveMode': 'Enable cognitive orchestration',
      'models': 'Available AI models configuration',
      'apiKeys': 'Stored API keys for different providers',
      'workingDirectory': 'Current working directory',
      'maxTokens': 'Maximum tokens per request',
      'timeout': 'Request timeout in milliseconds',
    };
    
    return descriptions[key] || descriptions[key.split('.').pop() || ''] || 'Configuration value';
  };

  const handleItemSelect = (item: ConfigItem) => {
    setSelectedItem(item);
    setInputValue(String(item.value));
    setMode('edit');
  };

  const handleValueSave = async (newValue: string) => {
    if (!selectedItem) return;

    try {
      const configManager = context.cliInstance?.configManager || context.configManager;
      if (!configManager) throw new Error('Config manager not available');

      let parsedValue: any = newValue;
      
      // Parse value based on type
      switch (selectedItem.type) {
        case 'number':
          parsedValue = parseFloat(newValue);
          if (isNaN(parsedValue)) throw new Error('Invalid number value');
          break;
        case 'boolean':
          parsedValue = ['true', 'yes', '1', 'on'].includes(newValue.toLowerCase());
          break;
        case 'object':
          try {
            parsedValue = JSON.parse(newValue);
          } catch {
            throw new Error('Invalid JSON format');
          }
          break;
      }

      // Set the configuration value
      configManager.set?.(selectedItem.key, parsedValue);
      
      console.log(`✅ Configuration updated: ${selectedItem.key} = ${parsedValue}`);
      
      // Reload configuration
      await loadConfiguration();
      setMode('view');
      setSelectedItem(null);
      
      onComplete?.({ shouldExit: false, shouldUpdatePrompt: true });
    } catch (error: any) {
      console.error(`❌ Failed to save configuration: ${error.message}`);
    }
  };

  const groupConfigByCategory = () => {
    const grouped: Record<string, ConfigItem[]> = {};
    config.forEach(item => {
      if (!grouped[item.category]) {
        grouped[item.category] = [];
      }
      grouped[item.category].push(item);
    });
    return grouped;
  };

  const getValueDisplay = (item: ConfigItem) => {
    if (item.type === 'boolean') {
      return item.value ? '✅ true' : '❌ false';
    }
    if (item.type === 'object') {
      return JSON.stringify(item.value).slice(0, 30) + '...';
    }
    if (typeof item.value === 'string' && item.value.length > 30) {
      return item.value.slice(0, 30) + '...';
    }
    return String(item.value);
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'string': return '📝';
      case 'number': return '🔢';
      case 'boolean': return '☑️';
      case 'object': return '📋';
      default: return '⚙️';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'models': return '🤖';
      case 'apiKeys': return '🔑';
      case 'ui': return '🎨';
      case 'performance': return '⚡';
      case 'security': return '🔒';
      default: return '⚙️';
    }
  };

  const groupedConfig = groupConfigByCategory();

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
          {config.length} settings
        </Text>
      </Box>

      {/* Content */}
      <Box flexDirection="column" flex={1}>
        {mode === 'view' && (
          <Box flexDirection="column" flex={1}>
            <Text color="cyan" bold marginBottom={1}>
              ⚙️ Configuration Settings:
            </Text>
            
            {Object.entries(groupedConfig).map(([category, items]) => (
              <Box key={category} flexDirection="column" marginBottom={1}>
                <Text color="yellow" bold>
                  {getCategoryIcon(category)} {category.toUpperCase()}
                </Text>
                {items.slice(0, 5).map((item, index) => (
                  <Box key={index} justifyContent="space-between" paddingLeft={2}>
                    <Box>
                      <Text>{getTypeIcon(item.type)} {item.key}</Text>
                    </Box>
                    <Text color="gray" dimColor>
                      {getValueDisplay(item)}
                    </Text>
                  </Box>
                ))}
                {items.length > 5 && (
                  <Text color="gray" dimColor paddingLeft={2}>
                    ... and {items.length - 5} more settings
                  </Text>
                )}
              </Box>
            ))}

            <Box marginTop={1}>
              <Text color="cyan">Select a setting to edit:</Text>
              <SelectInput
                items={config.map(item => ({
                  label: `${getTypeIcon(item.type)} ${item.key}: ${getValueDisplay(item)}`,
                  value: item,
                }))}
                onSelect={(item) => handleItemSelect(item.value)}
              />
            </Box>
          </Box>
        )}

        {mode === 'edit' && selectedItem && (
          <Box flexDirection="column" flex={1}>
            <Text color="yellow" bold marginBottom={1}>
              ✏️ Edit Configuration
            </Text>
            
            <Box borderStyle="single" borderColor="gray" padding={1} marginBottom={1}>
              <Box flexDirection="column">
                <Text color="cyan">Key: {selectedItem.key}</Text>
                <Text color="gray">Type: {getTypeIcon(selectedItem.type)} {selectedItem.type}</Text>
                <Text wrap="wrap">Description: {selectedItem.description}</Text>
                <Text color="yellow">Current: {getValueDisplay(selectedItem)}</Text>
              </Box>
            </Box>

            <Text color="cyan">New Value: </Text>
            <TextInput
              value={inputValue}
              onChange={setInputValue}
              onSubmit={handleValueSave}
              placeholder={`Enter new ${selectedItem.type} value...`}
            />

            <Box marginTop={1}>
              <Text color="gray" dimColor>
                {selectedItem.type === 'boolean' && 'Enter: true/false, yes/no, 1/0'}
                {selectedItem.type === 'number' && 'Enter a numeric value'}
                {selectedItem.type === 'object' && 'Enter valid JSON'}
                {selectedItem.type === 'string' && 'Enter any text value'}
              </Text>
            </Box>
          </Box>
        )}
      </Box>

      {/* Quick Actions */}
      <Box marginTop={1} justifyContent="space-around">
        <Text color="blue" dimColor>[R] Reload</Text>
        <Text color="yellow" dimColor>[E] Edit</Text>
        <Text color="red" dimColor>[Q] Quit</Text>
      </Box>

      {/* Footer */}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          {mode === 'view' 
            ? 'Select a setting to edit • R: Reload • Q: Quit'
            : mode === 'edit'
            ? 'Enter new value • Esc to cancel'
            : 'Saving configuration...'
          }
        </Text>
      </Box>
    </Box>
  );
};

export default ConfigCommandPanel;