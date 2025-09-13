import * as crypto from 'node:crypto'

export interface PasteAttachment {
  id: string
  filename: string
  content: string
  lineCount: number
  charCount: number
  summary: string
  timestamp: Date
}

export class PasteSummarizer {
  private pasteCounter: number = 0
  private attachments: Map<string, PasteAttachment> = new Map()

  /**
   * Determines if text should be summarized based on OpenCode criteria
   */
  shouldSummarizePastedText(text: string): boolean {
    const lines = text.split('\n')
    const lineCount = lines.length
    const charCount = text.length

    return lineCount > 3 || charCount > 150
  }

  /**
   * Creates a paste attachment and returns the summary text
   */
  createPasteAttachment(text: string): { summary: string; attachmentId: string } {
    this.pasteCounter++
    const lines = text.split('\n')
    const lineCount = lines.length
    const charCount = text.length

    const attachmentId = this.generateAttachmentId()
    const filename = `pasted-text-${this.pasteCounter}.txt`
    const summary = `[pasted #${this.pasteCounter} ${lineCount}+ lines]`

    const attachment: PasteAttachment = {
      id: attachmentId,
      filename,
      content: text,
      lineCount,
      charCount,
      summary,
      timestamp: new Date(),
    }

    this.attachments.set(attachmentId, attachment)
    return { summary, attachmentId }
  }

  /**
   * Retrieves original content from attachment ID
   */
  getAttachmentContent(attachmentId: string): string | null {
    const attachment = this.attachments.get(attachmentId)
    return attachment ? attachment.content : null
  }

  /**
   * Gets attachment metadata
   */
  getAttachment(attachmentId: string): PasteAttachment | null {
    return this.attachments.get(attachmentId) || null
  }

  /**
   * Lists all current attachments
   */
  listAttachments(): PasteAttachment[] {
    return Array.from(this.attachments.values()).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
  }

  /**
   * Clears old attachments to prevent memory leaks
   */
  cleanup(maxAge: number = 3600000): number {
    // 1 hour default
    const now = Date.now()
    let cleared = 0

    for (const [id, attachment] of this.attachments.entries()) {
      if (now - attachment.timestamp.getTime() > maxAge) {
        this.attachments.delete(id)
        cleared++
      }
    }

    return cleared
  }

  private generateAttachmentId(): string {
    return crypto.randomBytes(8).toString('hex')
  }

  /**
   * Gets current statistics
   */
  getStats(): { totalPastes: number; activeAttachments: number } {
    return {
      totalPastes: this.pasteCounter,
      activeAttachments: this.attachments.size,
    }
  }
}

// Export singleton instance
export const pasteSummarizer = new PasteSummarizer()
