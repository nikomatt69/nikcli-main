import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import { CommandPanelProps } from '../../types';

interface ImageInfo {
  path: string;
  size?: number;
  dimensions?: { width: number; height: number };
  format?: string;
  lastModified?: Date;
}

interface VisionOperation {
  type: 'analyze' | 'generate' | 'discover';
  imagePath?: string;
  prompt?: string;
  provider?: 'claude' | 'openai' | 'google' | 'vercel';
  customPrompt?: string;
}

interface VisionResult {
  type: 'analysis' | 'generation' | 'discovery' | 'error';
  data?: any;
  message?: string;
}

const VisionCommandPanel: React.FC<CommandPanelProps> = ({
  title,
  borderColor = 'magenta',
  args,
  context,
  onComplete,
}) => {
  const [images, setImages] = useState<ImageInfo[]>([]);
  const [selectedImage, setSelectedImage] = useState<ImageInfo | null>(null);
  const [operation, setOperation] = useState<VisionOperation>({ type: 'discover' });
  const [inputValue, setInputValue] = useState('');
  const [mode, setMode] = useState<'select' | 'input' | 'execute' | 'result'>('select');
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState<VisionResult | null>(null);

  // Carica immagini disponibili
  useEffect(() => {
    discoverImages();
  }, []);

  // Determina operazione dai args
  useEffect(() => {
    if (args.length > 0) {
      const command = args[0];
      switch (command) {
        case 'analyze-image':
        case 'vision':
          if (args[1]) {
            setOperation({ type: 'analyze', imagePath: args[1] });
            setMode('execute');
            executeOperation({ type: 'analyze', imagePath: args[1] });
          } else {
            setOperation({ type: 'analyze' });
            setMode('input');
          }
          break;
        case 'generate-image':
        case 'create-image':
          if (args[1]) {
            setOperation({ type: 'generate', prompt: args.slice(1).join(' ') });
            setMode('execute');
            executeOperation({ type: 'generate', prompt: args.slice(1).join(' ') });
          } else {
            setOperation({ type: 'generate' });
            setMode('input');
          }
          break;
        case 'images':
          setOperation({ type: 'discover' });
          setMode('execute');
          executeOperation({ type: 'discover' });
          break;
        default:
          setMode('select');
      }
    }
  }, [args]);

  const discoverImages = async () => {
    try {
      // Cerca immagini nel progetto
      const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.webp'];
      const toolsManager = context.cliInstance?.toolsManager;
      
      if (!toolsManager) return;

      const allFiles = await toolsManager.listFiles('.', { recursive: true });
      const imageFiles = allFiles.filter((file: string) => 
        imageExtensions.some(ext => file.toLowerCase().endsWith(ext))
      );

      const imageInfos: ImageInfo[] = imageFiles.map((path: string) => ({
        path,
        format: path.split('.').pop()?.toLowerCase(),
      }));

      setImages(imageInfos);
    } catch (error) {
      console.error('Failed to discover images:', error);
    }
  };

  const executeOperation = async (op: VisionOperation) => {
    setIsExecuting(true);
    setResult(null);

    try {
      switch (op.type) {
        case 'analyze':
          if (!op.imagePath) throw new Error('Image path required');
          
          const visionProvider = context.cliInstance?.visionProvider;
          if (!visionProvider) throw new Error('Vision provider not available');

          const analysisResult = await visionProvider.analyzeImage?.(
            op.imagePath,
            op.customPrompt || 'Analyze this image in detail'
          );

          setResult({
            type: 'analysis',
            data: {
              imagePath: op.imagePath,
              analysis: analysisResult,
              provider: op.provider || 'default',
            },
          });
          break;

        case 'generate':
          if (!op.prompt) throw new Error('Generation prompt required');
          
          const imageGenerator = context.cliInstance?.imageGenerator;
          if (!imageGenerator) throw new Error('Image generator not available');

          const generationResult = await imageGenerator.generateImage?.(op.prompt, {
            model: 'dall-e-3',
            size: '1024x1024',
          });

          setResult({
            type: 'generation',
            data: {
              prompt: op.prompt,
              result: generationResult,
              timestamp: new Date(),
            },
          });
          break;

        case 'discover':
          await discoverImages();
          setResult({
            type: 'discovery',
            data: {
              images,
              total: images.length,
              formats: [...new Set(images.map(img => img.format))],
            },
          });
          break;

        default:
          throw new Error(`Unknown vision operation: ${op.type}`);
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

  const getImageIcon = (format?: string) => {
    switch (format?.toLowerCase()) {
      case 'png': return '🖼️';
      case 'jpg': case 'jpeg': return '📸';
      case 'gif': return '🎞️';
      case 'svg': return '🎨';
      case 'webp': return '🌐';
      default: return '🖼️';
    }
  };

  const formatFileSize = (size?: number) => {
    if (!size) return '';
    if (size < 1024) return `${size}B`;
    if (size < 1024 * 1024) return `${Math.round(size / 1024)}KB`;
    return `${Math.round(size / (1024 * 1024))}MB`;
  };

  const visionOperationItems = [
    { label: '🔍 Analyze Image', value: 'analyze' },
    { label: '✨ Generate Image', value: 'generate' },
    { label: '📁 Discover Images', value: 'discover' },
  ];

  const imageItems = images.map(image => ({
    label: `${getImageIcon(image.format)} ${image.path}${image.size ? ` (${formatFileSize(image.size)})` : ''}`,
    value: image,
  }));

  const providerItems = [
    { label: '🧠 Claude (Anthropic)', value: 'claude' },
    { label: '👁️ GPT-4 Vision (OpenAI)', value: 'openai' },
    { label: '🔍 Gemini Vision (Google)', value: 'google' },
    { label: '⚡ Vercel AI', value: 'vercel' },
  ];

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
          {images.length} images found
        </Text>
      </Box>

      {/* Content */}
      <Box flexDirection="column" flex={1}>
        {mode === 'select' && (
          <Box flexDirection="column" flex={1}>
            <Text color="cyan" bold marginBottom={1}>
              👁️ Vision Operations:
            </Text>
            <SelectInput
              items={visionOperationItems}
              onSelect={(item) => {
                setOperation({ type: item.value as any });
                setMode('input');
              }}
            />
          </Box>
        )}

        {mode === 'input' && (
          <Box flexDirection="column" flex={1}>
            <Text color="yellow" bold marginBottom={1}>
              🔧 {operation.type.toUpperCase()} Configuration
            </Text>
            
            {operation.type === 'analyze' && (
              <Box flexDirection="column" flex={1}>
                {!operation.imagePath ? (
                  <>
                    <Text color="cyan" marginBottom={1}>Select Image to Analyze:</Text>
                    {images.length === 0 ? (
                      <Text color="gray" dimColor>No images found in project</Text>
                    ) : (
                      <SelectInput
                        items={imageItems}
                        onSelect={(item) => {
                          setOperation(prev => ({ ...prev, imagePath: item.value.path }));
                        }}
                      />
                    )}
                  </>
                ) : (
                  <>
                    <Text color="green" marginBottom={1}>
                      Selected: {getImageIcon(operation.imagePath.split('.').pop())} {operation.imagePath}
                    </Text>
                    
                    <Text color="cyan">Analysis Prompt (optional): </Text>
                    <TextInput
                      value={inputValue}
                      onChange={setInputValue}
                      onSubmit={(prompt) => executeOperation({ 
                        ...operation, 
                        customPrompt: prompt || 'Analyze this image in detail' 
                      })}
                      placeholder="Custom analysis prompt or press Enter for default..."
                    />
                    
                    <Box marginTop={1}>
                      <Text color="cyan" bold>Select AI Provider:</Text>
                      <SelectInput
                        items={providerItems}
                        onSelect={(item) => executeOperation({ 
                          ...operation, 
                          provider: item.value as any,
                          customPrompt: inputValue || 'Analyze this image in detail'
                        })}
                      />
                    </Box>
                  </>
                )}
              </Box>
            )}

            {operation.type === 'generate' && (
              <>
                <Text color="cyan">Image Generation Prompt: </Text>
                <TextInput
                  value={inputValue}
                  onChange={setInputValue}
                  onSubmit={(prompt) => executeOperation({ ...operation, prompt })}
                  placeholder="Describe the image you want to generate..."
                />
                <Box marginTop={1}>
                  <Text color="gray" dimColor>
                    Be specific about style, composition, and details
                  </Text>
                </Box>
              </>
            )}

            {operation.type === 'discover' && (
              <Box justifyContent="center" alignItems="center" flex={1}>
                <Text color="cyan">
                  Press Enter to discover images in the project
                </Text>
              </Box>
            )}
          </Box>
        )}

        {mode === 'execute' && (
          <Box flexDirection="column" flex={1} justifyContent="center" alignItems="center">
            <Spinner type="dots" />
            <Text color="blue" marginTop={1}>
              {operation.type === 'analyze' ? 'Analyzing image with AI...' :
               operation.type === 'generate' ? 'Generating image...' :
               'Discovering images...'}
            </Text>
            {operation.imagePath && (
              <Text color="gray" dimColor marginTop={1}>
                {operation.imagePath}
              </Text>
            )}
          </Box>
        )}

        {mode === 'result' && result && (
          <Box flexDirection="column" flex={1}>
            {result.type === 'analysis' && result.data && (
              <Box flexDirection="column" flex={1}>
                <Text color="green" bold marginBottom={1}>
                  🔍 Image Analysis: {result.data.imagePath}
                </Text>
                <Box borderStyle="single" borderColor="gray" padding={1} flex={1}>
                  <Text wrap="wrap">
                    {result.data.analysis}
                  </Text>
                </Box>
                <Text color="gray" dimColor marginTop={1}>
                  Provider: {result.data.provider}
                </Text>
              </Box>
            )}

            {result.type === 'generation' && result.data && (
              <Box flexDirection="column" flex={1}>
                <Text color="green" bold marginBottom={1}>
                  ✨ Image Generated
                </Text>
                <Box borderStyle="single" borderColor="gray" padding={1}>
                  <Box flexDirection="column">
                    <Text color="cyan">Prompt: {result.data.prompt}</Text>
                    <Text color="gray">Generated: {result.data.timestamp.toLocaleString()}</Text>
                    {result.data.result?.url && (
                      <Text color="blue">URL: {result.data.result.url}</Text>
                    )}
                    {result.data.result?.path && (
                      <Text color="green">Saved to: {result.data.result.path}</Text>
                    )}
                  </Box>
                </Box>
              </Box>
            )}

            {result.type === 'discovery' && result.data && (
              <Box flexDirection="column" flex={1}>
                <Text color="green" bold marginBottom={1}>
                  📁 Discovered Images ({result.data.total}):
                </Text>
                
                {result.data.total === 0 ? (
                  <Text color="gray" dimColor>No images found in project</Text>
                ) : (
                  <Box flexDirection="column" flex={1}>
                    {result.data.images.slice(0, 10).map((image: ImageInfo, index: number) => (
                      <Box key={index} justifyContent="space-between">
                        <Text>
                          {getImageIcon(image.format)} {image.path}
                        </Text>
                        {image.size && (
                          <Text color="gray" dimColor>
                            {formatFileSize(image.size)}
                          </Text>
                        )}
                      </Box>
                    ))}
                    
                    {result.data.total > 10 && (
                      <Text color="gray" dimColor>
                        ... and {result.data.total - 10} more images
                      </Text>
                    )}

                    <Box marginTop={1}>
                      <Text color="cyan">Formats found: </Text>
                      <Text>{result.data.formats.join(', ')}</Text>
                    </Box>
                  </Box>
                )}
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

      {/* Image Stats */}
      {images.length > 0 && (
        <Box marginTop={1}>
          <Box justifyContent="space-between">
            <Text color="gray" dimColor>
              Total: {images.length} images
            </Text>
            <Text color="gray" dimColor>
              Formats: {[...new Set(images.map(img => img.format))].join(', ')}
            </Text>
          </Box>
        </Box>
      )}

      {/* Footer */}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          {mode === 'select' 
            ? 'Select a vision operation'
            : mode === 'input'
            ? 'Configure the operation • Esc to cancel'
            : mode === 'execute'
            ? 'AI vision operation in progress...'
            : 'Operation completed • Press any key to continue'
          }
        </Text>
      </Box>
    </Box>
  );
};

export default VisionCommandPanel;