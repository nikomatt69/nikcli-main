"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.colors = void 0;
exports.colorize = colorize;
exports.style = style;
exports.stripAnsi = stripAnsi;
exports.visualLength = visualLength;
exports.pad = pad;
exports.truncate = truncate;
exports.wordWrap = wordWrap;
exports.horizontalLine = horizontalLine;
exports.box = box;
exports.indent = indent;
exports.progressBar = progressBar;
exports.formatBytes = formatBytes;
exports.formatDuration = formatDuration;
exports.colors = {
    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    gray: '\x1b[90m',
    darkGray: '\x1b[90m',
    lightGray: '\x1b[37m',
    brightRed: '\x1b[91m',
    brightGreen: '\x1b[92m',
    brightYellow: '\x1b[93m',
    brightBlue: '\x1b[94m',
    brightMagenta: '\x1b[95m',
    brightCyan: '\x1b[96m',
    brightWhite: '\x1b[97m',
    bgBlack: '\x1b[40m',
    bgRed: '\x1b[41m',
    bgGreen: '\x1b[42m',
    bgYellow: '\x1b[43m',
    bgBlue: '\x1b[44m',
    bgMagenta: '\x1b[45m',
    bgCyan: '\x1b[46m',
    bgWhite: '\x1b[47m',
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    italic: '\x1b[3m',
    underline: '\x1b[4m',
    inverse: '\x1b[7m',
    hidden: '\x1b[8m',
    strikethrough: '\x1b[9m',
};
function colorize(text, color) {
    return `${exports.colors[color]}${text}${exports.colors.reset}`;
}
function style(text, styles) {
    const prefix = styles.map(s => exports.colors[s]).join('');
    return `${prefix}${text}${exports.colors.reset}`;
}
function stripAnsi(text) {
    return text
        .replace(/\x1b\[[0-9;]*m/g, '')
        .replace(/\x1b\[[\d;]*[A-Za-z]/g, '')
        .replace(/\x1b[A-Z]/g, '')
        .replace(/\x1b\([AB0-9]/g, '')
        .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F]/g, '');
}
function visualLength(text) {
    return stripAnsi(text).length;
}
function pad(text, width, align = 'left') {
    const length = visualLength(text);
    const padding = Math.max(0, width - length);
    switch (align) {
        case 'left':
            return text + ' '.repeat(padding);
        case 'right':
            return ' '.repeat(padding) + text;
        case 'center':
            const leftPad = Math.floor(padding / 2);
            const rightPad = padding - leftPad;
            return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
        default:
            return text;
    }
}
function truncate(text, width, ellipsis = '...') {
    const length = visualLength(text);
    if (length <= width) {
        return text;
    }
    const stripped = stripAnsi(text);
    const truncated = stripped.slice(0, width - ellipsis.length);
    return truncated + ellipsis;
}
function wordWrap(text, width) {
    const lines = [];
    const words = text.split(/\s+/);
    let currentLine = '';
    for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const testLength = visualLength(testLine);
        if (testLength <= width) {
            currentLine = testLine;
        }
        else {
            if (currentLine) {
                lines.push(currentLine);
            }
            currentLine = word;
        }
    }
    if (currentLine) {
        lines.push(currentLine);
    }
    return lines;
}
function horizontalLine(width, char = '─', color) {
    const line = char.repeat(width);
    return color ? colorize(line, color) : line;
}
function box(text, options = {}) {
    const { width = 80, padding = 1, title, borderColor, } = options;
    const lines = wordWrap(text, width - (padding * 2) - 2);
    const maxLineLength = Math.max(...lines.map(l => visualLength(l)));
    const boxWidth = Math.min(width, maxLineLength + (padding * 2) + 2);
    const topBorder = title
        ? `┌─ ${title} ${'─'.repeat(Math.max(0, boxWidth - title.length - 5))}┐`
        : `┌${'─'.repeat(boxWidth - 2)}┐`;
    const bottomBorder = `└${'─'.repeat(boxWidth - 2)}┘`;
    const boxLines = [
        borderColor ? colorize(topBorder, borderColor) : topBorder,
    ];
    for (const line of lines) {
        const paddedLine = pad(line, boxWidth - (padding * 2) - 2);
        const boxLine = `│${' '.repeat(padding)}${paddedLine}${' '.repeat(padding)}│`;
        boxLines.push(borderColor ? colorize(boxLine, borderColor) : boxLine);
    }
    boxLines.push(borderColor ? colorize(bottomBorder, borderColor) : bottomBorder);
    return boxLines.join('\n');
}
function indent(text, spaces) {
    const indentation = ' '.repeat(spaces);
    return text
        .split('\n')
        .map(line => indentation + line)
        .join('\n');
}
function progressBar(current, total, width = 30, options = {}) {
    const { showPercent = true, completeChar = '█', incompleteChar = '░', color, } = options;
    const percent = Math.min(100, Math.max(0, (current / total) * 100));
    const completeWidth = Math.floor((width * percent) / 100);
    const incompleteWidth = width - completeWidth;
    let bar = completeChar.repeat(completeWidth) + incompleteChar.repeat(incompleteWidth);
    if (color) {
        bar = colorize(bar, color);
    }
    if (showPercent) {
        const percentText = ` ${percent.toFixed(0)}%`;
        return `${bar}${percentText}`;
    }
    return bar;
}
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0)
        return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}
function formatDuration(ms) {
    if (ms < 1000)
        return `${ms}ms`;
    if (ms < 60000)
        return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3600000)
        return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
    return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}
