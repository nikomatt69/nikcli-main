/**
 * Type declarations for jsdom module
 */

declare module 'jsdom' {
  export class JSDOM {
    constructor(html?: string, options?: any)
    window: Window & typeof globalThis
    static fromURL(url: string, options?: any): Promise<JSDOM>
    static fromFile(filename: string, options?: any): Promise<JSDOM>
  }
}
