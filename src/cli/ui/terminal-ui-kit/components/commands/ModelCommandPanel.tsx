import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import { CommandPanelProps } from '../../types';

interface ModelInfo {
  name: string;
  provider: string;
  model: string;
  hasApiKey: boolean;
  isCurrent: boolean;
  description?: string;
  pricing?: {
    input: number;
    output: number;
  };
}

const ModelCommandPanel: React.FC<CommandPanelProps> = ({
  title,
  borderColor = 'blue',
  args,
  context,
  onComplete,
}) => {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState<ModelInfo | null>(null);
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [mode, setMode] = useState<'list' | 'select' | 'configure'>('list');

  // Carica modelli disponibili
  useEffect(() => {
    loadAvailableModels();
  }, []);

  const loadAvailableModels = async () => {
    try {
      // Accedi al config manager dal context
      const configManager = context.cliInstance?.configManager || context.configManager;
      if (!configManager) return;

      const currentModel = configManager.getCurrentModel?.() || configManager.get?.('currentModel');
      const modelsConfig = configManager.get?.('models') || {};

      const modelList: ModelInfo[] = Object.entries(modelsConfig).map(([name, config]: [string, any]) => ({
        name,
        provider: config.provider,
        model: config.model,
        hasApiKey: !!configManager.getApiKey?.(name),
        isCurrent: name === currentModel,
        description: config.description,
        pricing: config.pricing,
      }));

      setModels(modelList);
    } catch (error) {
      console.error('Failed to load models:', error);
    }
  };

  const handleModelSelect = async (model: ModelInfo) => {
    setSelectedModel(model);
    
    if (!model.hasApiKey) {
      setMode('configure');
      setShowKeyInput(true);
      return;
    }

    // Cambia modello direttamente
    try {
      const configManager = context.cliInstance?.configManager || context.configManager;
      configManager?.setCurrentModel?.(model.name);
      
      console.log(`✅ Switched to model: ${model.name}`);
      onComplete?.({ shouldExit: false, shouldUpdatePrompt: true });
    } catch (error: any) {
      console.error(`❌ Failed to switch model: ${error.message}`);
      onComplete?.({ shouldExit: false, shouldUpdatePrompt: false });
    }
  };

  const handleApiKeySubmit = async (key: string) => {
    if (!selectedModel || !key.trim()) return;

    try {
      const configManager = context.cliInstance?.configManager || context.configManager;
      configManager?.setApiKey?.(selectedModel.name, key.trim());
      
      // Ora prova a cambiare modello
      configManager?.setCurrentModel?.(selectedModel.name);
      
      console.log(`✅ API key set and switched to: ${selectedModel.name}`);
      onComplete?.({ shouldExit: false, shouldUpdatePrompt: true });
    } catch (error: any) {
      console.error(`❌ Failed to set API key: ${error.message}`);
      setShowKeyInput(false);
      setMode('list');
    }
  };

  const getProviderIcon = (provider: string) => {
    switch (provider.toLowerCase()) {
      case 'anthropic': return '🧠';
      case 'openai': return '🔥';
      case 'google': return '🔍';
      case 'ollama': return '🦙';
      default: return '🤖';
    }
  };

  const getProviderColor = (provider: string) => {
    switch (provider.toLowerCase()) {
      case 'anthropic': return 'blue';
      case 'openai': return 'green';
      case 'google': return 'yellow';
      case 'ollama': return 'magenta';
      default: return 'white';
    }
  };

  const formatPricing = (pricing?: { input: number; output: number }) => {
    if (!pricing) return '';
    return `$${pricing.input.toFixed(4)}/1K in, $${pricing.output.toFixed(4)}/1K out`;
  };

  const modelItems = models.map(model => ({
    label: `${getProviderIcon(model.provider)} ${model.name}${model.isCurrent ? ' (current)' : ''}${!model.hasApiKey ? ' ⚠️' : ''}`,
    value: model,
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
      <Box marginBottom={1} justifyContent="space-between">
        <Text color={borderColor} bold>{title}</Text>
        <Text color="gray" dimColor>
          {models.length} models
        </Text>
      </Box>

      {/* Current Model Info */}
      {(() => {
        const currentModel = models.find(m => m.isCurrent);
        return currentModel ? (
          <Box marginBottom={1} borderStyle="single" borderColor="green" padding={1}>
            <Box flexDirection="column">
              <Text color="green" bold>
                🎯 Current Model: {currentModel.name}
              </Text>
              <Text color="gray" dimColor>
                {getProviderIcon(currentModel.provider)} Provider: {currentModel.provider}
              </Text>
              <Text color="gray" dimColor>
                Model: {currentModel.model}
              </Text>
              {currentModel.pricing && (
                <Text color="gray" dimColor>
                  💰 {formatPricing(currentModel.pricing)}
                </Text>
              )}
            </Box>
          </Box>
        ) : null;
      })()}

      {/* Content */}
      <Box flexDirection="column" flex={1}>
        {mode === 'list' && (
          <Box flexDirection="column" flex={1}>
            <Text color="cyan" bold marginBottom={1}>
              🤖 Available Models:
            </Text>
            
            {models.length === 0 ? (
              <Box justifyContent="center" alignItems="center" flex={1}>
                <Text color="gray" dimColor>
                  No models configured
                </Text>
              </Box>
            ) : (
              <SelectInput
                items={modelItems}
                onSelect={(item) => handleModelSelect(item.value)}
              />
            )}
          </Box>
        )}

        {mode === 'configure' && selectedModel && (
          <Box flexDirection="column" flex={1}>
            <Text color="yellow" bold marginBottom={1}>
              🔑 Configure API Key for {selectedModel.name}
            </Text>
            
            <Box marginBottom={1}>
              <Text color="gray">
                Provider: {getProviderIcon(selectedModel.provider)} {selectedModel.provider}
              </Text>
            </Box>

            <Box marginBottom={1}>
              <Text color="cyan">Enter API Key: </Text>
            </Box>
            
            <TextInput
              value={apiKey}
              onChange={setApiKey}
              onSubmit={handleApiKeySubmit}
              placeholder={`Enter ${selectedModel.provider} API key...`}
              mask="*"
            />

            <Box marginTop={1}>
              <Text color="gray" dimColor>
                Press Enter to save • Esc to cancel
              </Text>
            </Box>
          </Box>
        )}
      </Box>

      {/* Model Stats */}
      <Box marginTop={1} flexDirection="column">
        <Box justifyContent="space-between">
          <Text color="green">
            ✅ {models.filter(m => m.hasApiKey).length} configured
          </Text>
          <Text color="red">
            ⚠️ {models.filter(m => !m.hasApiKey).length} need API keys
          </Text>
        </Box>
        
        {/* Provider Distribution */}
        <Box>
          {['anthropic', 'openai', 'google', 'ollama'].map(provider => {
            const count = models.filter(m => m.provider.toLowerCase() === provider).length;
            if (count === 0) return null;
            
            return (
              <Text key={provider} color={getProviderColor(provider)} dimColor>
                {getProviderIcon(provider)}{count} 
              </Text>
            );
          })}
        </Box>
      </Box>

      {/* Footer */}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          {mode === 'list' 
            ? 'Select a model to switch • Models without ⚠️ need API keys'
            : mode === 'configure'
            ? 'Enter API key and press Enter'
            : ''
          }
        </Text>
      </Box>
    </Box>
  );
};

export default ModelCommandPanel;