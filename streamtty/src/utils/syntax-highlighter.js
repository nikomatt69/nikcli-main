"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syntaxColors = void 0;
exports.highlightPaths = highlightPaths;
exports.highlightFileRefs = highlightFileRefs;
exports.highlightKeywords = highlightKeywords;
exports.highlightTitles = highlightTitles;
exports.highlightStrings = highlightStrings;
exports.highlightNumbers = highlightNumbers;
exports.highlightComments = highlightComments;
exports.highlightShellCommands = highlightShellCommands;
exports.highlightPackages = highlightPackages;
exports.highlightCodeBlocks = highlightCodeBlocks;
exports.applySyntaxHighlight = applySyntaxHighlight;
exports.applyLightSyntaxHighlight = applyLightSyntaxHighlight;
exports.stripAnsiColors = stripAnsiColors;
exports.colorizeBlock = colorizeBlock;
exports.syntaxColors = {
    path: '\x1b[36m',
    lineNumber: '\x1b[33m',
    keyword: '\x1b[35m',
    string: '\x1b[32m',
    number: '\x1b[93m',
    comment: '\x1b[90m',
    title: '\x1b[96m',
    error: '\x1b[91m',
    success: '\x1b[92m',
    warning: '\x1b[93m',
    codeBlock: '\x1b[36m',
    package: '\x1b[36m',
    reset: '\x1b[0m',
};
const KEYWORDS = [
    'async', 'await', 'function', 'const', 'let', 'var', 'class', 'interface',
    'type', 'import', 'export', 'from', 'return', 'if', 'else', 'for', 'while',
    'try', 'catch', 'throw', 'new', 'this', 'super', 'extends', 'implements',
    'public', 'private', 'protected', 'static', 'readonly', 'enum', 'namespace',
];
const SHELL_COMMANDS = [
    'git', 'npm', 'yarn', 'pnpm', 'docker', 'cd', 'ls', 'mkdir', 'rm', 'cp', 'mv',
    'cat', 'grep', 'find', 'sed', 'awk', 'chmod', 'chown', 'sudo', 'apt', 'brew',
    'curl', 'wget', 'tar', 'zip', 'unzip', 'ssh', 'scp', 'rsync', 'ps', 'kill',
];
function highlightPaths(text) {
    const pathRegex = /(?:^|\s)((?:\/|\.\/|\.\.\/|~\/)[^\s:]+)/g;
    return text.replace(pathRegex, (match, path) => {
        return match.replace(path, `${exports.syntaxColors.path}${path}${exports.syntaxColors.reset}`);
    });
}
function highlightFileRefs(text) {
    const fileRefRegex = /((?:\/|\.\/|\.\.\/)?[^\s:]+\.\w+)(:\d+(?::\d+)?)/g;
    return text.replace(fileRefRegex, (match, file, location) => {
        return `${exports.syntaxColors.path}${file}${exports.syntaxColors.lineNumber}${location}${exports.syntaxColors.reset}`;
    });
}
function highlightKeywords(text) {
    let highlighted = text;
    for (const keyword of KEYWORDS) {
        const regex = new RegExp(`\\b(${keyword})\\b`, 'g');
        highlighted = highlighted.replace(regex, `${exports.syntaxColors.keyword}$1${exports.syntaxColors.reset}`);
    }
    return highlighted;
}
function highlightTitles(text) {
    const titleRegex = /^(#{1,6})\s+(.+)$/gm;
    return text.replace(titleRegex, (match, hashes, title) => {
        return `${exports.syntaxColors.title}${hashes} ${title}${exports.syntaxColors.reset}`;
    });
}
function highlightStrings(text) {
    const stringRegex = /(["'])(?:(?=(\\?))\2.)*?\1/g;
    return text.replace(stringRegex, (match) => {
        return `${exports.syntaxColors.string}${match}${exports.syntaxColors.reset}`;
    });
}
function highlightNumbers(text) {
    const numberRegex = /\b(\d+\.?\d*)\b/g;
    return text.replace(numberRegex, `${exports.syntaxColors.number}$1${exports.syntaxColors.reset}`);
}
function highlightComments(text) {
    let highlighted = text;
    highlighted = highlighted.replace(/(#.*)$/gm, (match) => {
        if (/^#{1,6}\s/.test(match))
            return match;
        return `${exports.syntaxColors.comment}${match}${exports.syntaxColors.reset}`;
    });
    highlighted = highlighted.replace(/(\/\/.*)$/gm, `${exports.syntaxColors.comment}$1${exports.syntaxColors.reset}`);
    highlighted = highlighted.replace(/(\/\*[\s\S]*?\*\/)/g, `${exports.syntaxColors.comment}$1${exports.syntaxColors.reset}`);
    return highlighted;
}
function highlightShellCommands(text) {
    let highlighted = text;
    for (const cmd of SHELL_COMMANDS) {
        const regex = new RegExp(`\\b(${cmd})\\b`, 'g');
        highlighted = highlighted.replace(regex, `${exports.syntaxColors.keyword}$1${exports.syntaxColors.reset}`);
    }
    return highlighted;
}
function highlightPackages(text) {
    const packageRegex = /(@[\w-]+\/[\w-]+|[\w-]+\/[\w-]+|\b[\w-]+@[\d.]+)/g;
    return text.replace(packageRegex, (match) => {
        return `${exports.syntaxColors.package}${match}${exports.syntaxColors.reset}`;
    });
}
function highlightCodeBlocks(text) {
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    return text.replace(codeBlockRegex, (match, lang, code) => {
        let result = `${exports.syntaxColors.codeBlock}\`\`\`${lang || ''}${exports.syntaxColors.reset}\n`;
        const highlightedCode = highlightCodeBlockContent(code, lang);
        result += highlightedCode;
        result += `${exports.syntaxColors.codeBlock}\`\`\`${exports.syntaxColors.reset}`;
        return result;
    });
}
function highlightCodeBlockContent(code, lang) {
    let highlighted = code;
    if (lang === 'bash' || lang === 'sh' || lang === 'shell') {
        highlighted = highlightShellCommands(highlighted);
        highlighted = highlightComments(highlighted);
        highlighted = highlightStrings(highlighted);
        return highlighted;
    }
    if (lang === 'javascript' || lang === 'js' || lang === 'typescript' || lang === 'ts') {
        highlighted = highlightComments(highlighted);
        highlighted = highlightStrings(highlighted);
        highlighted = highlightKeywords(highlighted);
        highlighted = highlightNumbers(highlighted);
        return highlighted;
    }
    highlighted = highlightComments(highlighted);
    highlighted = highlightStrings(highlighted);
    highlighted = highlightKeywords(highlighted);
    highlighted = highlightNumbers(highlighted);
    return highlighted;
}
function applySyntaxHighlight(text) {
    if (!text)
        return text;
    let highlighted = text;
    highlighted = highlightCodeBlocks(highlighted);
    highlighted = highlightFileRefs(highlighted);
    highlighted = highlightPaths(highlighted);
    highlighted = highlightPackages(highlighted);
    highlighted = highlightTitles(highlighted);
    highlighted = highlightComments(highlighted);
    highlighted = highlightStrings(highlighted);
    highlighted = highlightShellCommands(highlighted);
    highlighted = highlightKeywords(highlighted);
    highlighted = highlightNumbers(highlighted);
    return highlighted;
}
function applyLightSyntaxHighlight(text) {
    if (!text)
        return text;
    let highlighted = text;
    highlighted = highlightFileRefs(highlighted);
    highlighted = highlightPaths(highlighted);
    return highlighted;
}
function stripAnsiColors(text) {
    return text
        .replace(/\x1b\[[0-9;]*m/g, '')
        .replace(/\x1b\[[\d;]*[A-Za-z]/g, '')
        .replace(/\x1b[A-Z]/g, '')
        .replace(/\x1b\([AB0-9]/g, '')
        .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F]/g, '');
}
function colorizeBlock(text, color) {
    return `${color}${text}${exports.syntaxColors.reset}`;
}
