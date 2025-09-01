import React, { useState } from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import { CommandPanelProps } from '../../types';

interface CommandCategory {
  name: string;
  icon: string;
  commands: Array<{
    name: string;
    description: string;
    usage: string;
    examples?: string[];
  }>;
}

const HelpCommandPanel: React.FC<CommandPanelProps> = ({
  title,
  borderColor = 'cyan',
  args,
  context,
  onComplete,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<CommandCategory | null>(null);
  const [selectedCommand, setSelectedCommand] = useState<string | null>(null);

  const commandCategories: CommandCategory[] = [
    {
      name: 'Model Management',
      icon: '🤖',
      commands: [
        {
          name: '/model',
          description: 'Switch to a specific AI model',
          usage: '/model <name>',
          examples: ['/model claude-3-5-sonnet', '/model gpt-4']
        },
        {
          name: '/models',
          description: 'List all available models',
          usage: '/models',
        },
        {
          name: '/set-key',
          description: 'Set API key for a model',
          usage: '/set-key <model> <key>',
          examples: ['/set-key claude-3-5-sonnet sk-ant-...']
        }
      ]
    },
    {
      name: 'Agent Management',
      icon: '🤖',
      commands: [
        {
          name: '/agents',
          description: 'List all available agents',
          usage: '/agents',
        },
        {
          name: '/agent',
          description: 'Run specific agent with task',
          usage: '/agent <name> <task>',
          examples: ['/agent coding-agent "analyze this function"']
        },
        {
          name: '/auto',
          description: 'Autonomous multi-agent execution',
          usage: '/auto <description>',
          examples: ['/auto "Create a React todo app"']
        },
        {
          name: '/create-agent',
          description: 'Create new specialized agent',
          usage: '/create-agent <name> <specialization>',
          examples: ['/create-agent react-expert "React optimization"']
        }
      ]
    },
    {
      name: 'File Operations',
      icon: '📁',
      commands: [
        {
          name: '/read',
          description: 'Read file contents',
          usage: '/read <filepath>',
          examples: ['/read src/index.ts']
        },
        {
          name: '/write',
          description: 'Write content to file',
          usage: '/write <filepath> <content>',
        },
        {
          name: '/ls',
          description: 'List files in directory',
          usage: '/ls [directory]',
          examples: ['/ls src/', '/ls']
        },
        {
          name: '/search',
          description: 'Search in files or web',
          usage: '/search <query> [directory]',
          examples: ['/search "function" src/', '/search --web "React hooks"']
        }
      ]
    },
    {
      name: 'VM Operations',
      icon: '🐳',
      commands: [
        {
          name: '/vm-create',
          description: 'Create new VM container',
          usage: '/vm-create <repo-url>',
          examples: ['/vm-create https://github.com/user/repo.git']
        },
        {
          name: '/vm-list',
          description: 'List active containers',
          usage: '/vm-list',
        },
        {
          name: '/vm-status',
          description: 'Show VM system status',
          usage: '/vm-status [id]',
        },
        {
          name: '/vm-exec',
          description: 'Execute command in VM',
          usage: '/vm-exec <command>',
          examples: ['/vm-exec "npm install"']
        }
      ]
    },
    {
      name: 'Planning & Todos',
      icon: '📋',
      commands: [
        {
          name: '/plan',
          description: 'Generate or execute plans',
          usage: '/plan <create|execute|show> [args]',
          examples: ['/plan create "Build a website"', '/plan execute']
        },
        {
          name: '/todo',
          description: 'Manage todo lists',
          usage: '/todo <list|show|open>',
        },
        {
          name: '/approval',
          description: 'Manage approval system',
          usage: '/approval <status|approve|reject>',
        }
      ]
    },
    {
      name: 'Vision & Images',
      icon: '👁️',
      commands: [
        {
          name: '/analyze-image',
          description: 'Analyze image with AI vision',
          usage: '/analyze-image <path>',
          examples: ['/analyze-image screenshot.png']
        },
        {
          name: '/generate-image',
          description: 'Generate image with AI',
          usage: '/generate-image "prompt"',
          examples: ['/generate-image "a beautiful sunset"']
        },
        {
          name: '/images',
          description: 'Discover and analyze images',
          usage: '/images',
        }
      ]
    }
  ];

  const categoryItems = commandCategories.map(cat => ({
    label: `${cat.icon} ${cat.name} (${cat.commands.length} commands)`,
    value: cat,
  }));

  const handleCategorySelect = (category: CommandCategory) => {
    setSelectedCategory(category);
  };

  const handleCommandSelect = (commandName: string) => {
    setSelectedCommand(commandName);
    // Esegui il comando selezionato
    if (context.cliInstance?.dispatchSlash) {
      context.cliInstance.dispatchSlash(commandName);
    }
    onComplete?.({ shouldExit: false, shouldUpdatePrompt: false });
  };

  const getCommandItems = (category: CommandCategory) => {
    return category.commands.map(cmd => ({
      label: `${cmd.name} - ${cmd.description}`,
      value: cmd.name,
    }));
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
      <Box marginBottom={1}>
        <Text color={borderColor} bold>{title}</Text>
      </Box>

      {/* Navigation Breadcrumb */}
      <Box marginBottom={1}>
        <Text color="gray" dimColor>
          Help
          {selectedCategory && (
            <>
              <Text> → </Text>
              <Text color="cyan">{selectedCategory.name}</Text>
            </>
          )}
          {selectedCommand && (
            <>
              <Text> → </Text>
              <Text color="yellow">{selectedCommand}</Text>
            </>
          )}
        </Text>
      </Box>

      {/* Content */}
      <Box flexDirection="column" flex={1}>
        {!selectedCategory ? (
          // Category Selection
          <Box flexDirection="column" flex={1}>
            <Text color="cyan" bold marginBottom={1}>
              📚 Command Categories:
            </Text>
            <SelectInput
              items={categoryItems}
              onSelect={(item) => handleCategorySelect(item.value)}
            />
            <Box marginTop={1}>
              <Text color="gray" dimColor>
                Select a category to see available commands
              </Text>
            </Box>
          </Box>
        ) : (
          // Command Selection
          <Box flexDirection="column" flex={1}>
            <Box marginBottom={1} justifyContent="space-between">
              <Text color="cyan" bold>
                {selectedCategory.icon} {selectedCategory.name}
              </Text>
              <Text 
                color="yellow" 
                dimColor
                onClick={() => setSelectedCategory(null)}
              >
                ← Back
              </Text>
            </Box>
            
            <SelectInput
              items={getCommandItems(selectedCategory)}
              onSelect={(item) => handleCommandSelect(item.value)}
            />

            {/* Command Details */}
            {selectedCommand && (
              <Box marginTop={1} borderStyle="single" borderColor="gray" padding={1}>
                <Box flexDirection="column">
                  {(() => {
                    const cmd = selectedCategory.commands.find(c => c.name === selectedCommand);
                    if (!cmd) return null;
                    
                    return (
                      <>
                        <Text color="yellow" bold>{cmd.name}</Text>
                        <Text wrap="wrap" marginBottom={1}>{cmd.description}</Text>
                        <Text color="cyan">Usage: {cmd.usage}</Text>
                        {cmd.examples && cmd.examples.length > 0 && (
                          <Box flexDirection="column" marginTop={1}>
                            <Text color="green" bold>Examples:</Text>
                            {cmd.examples.map((example, index) => (
                              <Text key={index} color="gray" dimColor>
                                {example}
                              </Text>
                            ))}
                          </Box>
                        )}
                      </>
                    );
                  })()}
                </Box>
              </Box>
            )}
          </Box>
        )}
      </Box>

      {/* Footer */}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          {!selectedCategory 
            ? 'Select a category • Esc: Exit help'
            : 'Select a command • Enter: Execute • ← Back to categories'
          }
        </Text>
      </Box>
    </Box>
  );
};

export default HelpCommandPanel;