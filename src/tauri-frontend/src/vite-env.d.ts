/// <reference types="vite/client" />

declare module 'ghostty-web' {
  export function init(): Promise<void>;

  export interface TerminalTheme {
    background?: string;
    foreground?: string;
    cursor?: string;
    cursorAccent?: string;
    selectionBackground?: string;
    black?: string;
    red?: string;
    green?: string;
    yellow?: string;
    blue?: string;
    magenta?: string;
    cyan?: string;
    white?: string;
    brightBlack?: string;
    brightRed?: string;
    brightGreen?: string;
    brightYellow?: string;
    brightBlue?: string;
    brightMagenta?: string;
    brightCyan?: string;
    brightWhite?: string;
  }

  export interface TerminalOptions {
    fontSize?: number;
    fontFamily?: string;
    theme?: TerminalTheme;
    cursorBlink?: boolean;
    cursorStyle?: 'block' | 'underline' | 'bar';
    scrollback?: number;
  }

  export class Terminal {
    constructor(options?: TerminalOptions);

    cols: number;
    rows: number;

    open(container: HTMLElement): void;
    write(data: string): void;
    onData(callback: (data: string) => void): void;
    onResize?(callback: (size: { cols: number; rows: number }) => void): void;
    fit?(): void;
    focus?(): void;
    blur?(): void;
    dispose?(): void;
    clear?(): void;
    reset?(): void;
  }
}
