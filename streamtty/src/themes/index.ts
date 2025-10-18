import { MarkdownStyles } from '../types';

/**
 * TTY Theme configuration
 */
export interface TTYTheme {
    name: string;
    markdown: MarkdownStyles;
    syntax: SyntaxTheme;
    ui: UITheme;
}

/**
 * Syntax highlighting theme colors
 */
export interface SyntaxTheme {
    keyword: string;
    string: string;
    comment: string;
    number: string;
    function: string;
    variable: string;
    type: string;
    operator: string;
}

/**
 * UI theme colors
 */
export interface UITheme {
    border: string;
    background?: string;
    foreground: string;
    accent: string;
    error: string;
    warning: string;
    success: string;
}

/**
 * Light theme
 */
export const lightTheme: TTYTheme = {
    name: 'light',
    markdown: {
        h1: { fg: 'black', bold: true },
        h2: { fg: 'black', bold: true },
        h3: { fg: 'black', bold: true },
        h4: { fg: 'black', bold: true },
        h5: { fg: 'black', bold: true },
        h6: { fg: 'black', bold: true },
        paragraph: { fg: 'black' },
        strong: { fg: 'black', bold: true },
        em: { fg: 'black', italic: true },
        code: { fg: 'magenta', bold: true },
        codeBlock: { fg: 'black', bg: 'white' },
        blockquote: { fg: 'gray', italic: true },
        link: { fg: 'blue', underline: true },
        list: { fg: 'black' },
        listItem: { fg: 'black' },
        table: { fg: 'blue' },
        tableHeader: { fg: 'blue', bold: true },
        hr: { fg: 'gray' },
    },
    syntax: {
        keyword: 'magenta',
        string: 'green',
        comment: 'gray',
        number: 'cyan',
        function: 'blue',
        variable: 'black',
        type: 'yellow',
        operator: 'black',
    },
    ui: {
        border: 'blue',
        background: 'white',
        foreground: 'black',
        accent: 'blue',
        error: 'red',
        warning: 'yellow',
        success: 'green',
    },
};

/**
 * Dark theme (default)
 */
export const darkTheme: TTYTheme = {
    name: 'dark',
    markdown: {
        h1: { fg: 'white', bold: true },
        h2: { fg: 'white', bold: true },
        h3: { fg: 'white', bold: true },
        h4: { fg: 'white', bold: true },
        h5: { fg: 'white', bold: true },
        h6: { fg: 'white', bold: true },
        paragraph: { fg: 'white' },
        strong: { fg: 'white', bold: true },
        em: { fg: 'white', italic: true },
        code: { fg: 'cyan', bold: true },
        codeBlock: { fg: 'white', bg: 'black' },
        blockquote: { fg: 'gray', italic: true },
        link: { fg: 'blue', underline: true },
        list: { fg: 'white' },
        listItem: { fg: 'white' },
        table: { fg: 'cyan' },
        tableHeader: { fg: 'cyan', bold: true },
        hr: { fg: 'gray' },
    },
    syntax: {
        keyword: 'magenta',
        string: 'green',
        comment: 'gray',
        number: 'cyan',
        function: 'blue',
        variable: 'white',
        type: 'yellow',
        operator: 'white',
    },
    ui: {
        border: 'blue',
        foreground: 'white',
        accent: 'cyan',
        error: 'red',
        warning: 'yellow',
        success: 'green',
    },
};

/**
 * Get theme by name
 */
export function getTheme(name: 'light' | 'dark' | 'auto'): TTYTheme {
    if (name === 'auto') {
        // Auto-detect based on environment
        return detectTheme();
    }
    return name === 'light' ? lightTheme : darkTheme;
}

/**
 * Detect theme from environment
 */
export function detectTheme(): TTYTheme {
    // Check environment variables
    const colorTerm = process.env.COLORTERM;
    const term = process.env.TERM;

    // Default to dark theme
    return darkTheme;
}

/**
 * Available themes
 */
export const themes = {
    light: lightTheme,
    dark: darkTheme,
};

