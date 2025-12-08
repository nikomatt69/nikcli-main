import { BaseTool, type ToolExecutionResult } from './base-tool'
import { suggestFormatter } from './formatter-registry'
import { advancedUI } from '../ui/advanced-cli-ui'

const PREVIEW_LIMIT = 200

export class FormatSuggestionTool extends BaseTool {
  constructor(workingDirectory: string) {
    super('format-suggestion-tool', workingDirectory)
  }

  async execute(filePath: string): Promise<ToolExecutionResult> {
    const suggestion = suggestFormatter(filePath)

    if (!suggestion) {
      const message = `No formatter mapping for ${filePath}`
      advancedUI.logInfo(message)
      return {
        success: true,
        data: {
          filePath,
          suggestion: null,
          message,
        },
      }
    }

    const preview = `${suggestion.command} ${suggestion.args.join(' ')}`
    const truncatedPreview = preview.length > PREVIEW_LIMIT ? `${preview.slice(0, PREVIEW_LIMIT)}...` : preview

    advancedUI.logInfo(`Formatter: ${suggestion.id} -> ${truncatedPreview}`)

    return {
      success: true,
      data: {
        filePath,
        suggestion,
        preview: truncatedPreview,
      },
    }
  }
}
