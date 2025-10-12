"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.blessedSyntaxColors = void 0;
exports.highlightPathsBlessed = highlightPathsBlessed;
exports.highlightFileRefsBlessed = highlightFileRefsBlessed;
exports.highlightLinksBlessed = highlightLinksBlessed;
exports.highlightKeywordsBlessed = highlightKeywordsBlessed;
exports.highlightCliFlagsBlessed = highlightCliFlagsBlessed;
exports.highlightTitlesBlessed = highlightTitlesBlessed;
exports.highlightJsonBlessed = highlightJsonBlessed;
exports.highlightStringsBlessed = highlightStringsBlessed;
exports.highlightNumbersBlessed = highlightNumbersBlessed;
exports.highlightCommentsBlessed = highlightCommentsBlessed;
exports.highlightShellCommandsBlessed = highlightShellCommandsBlessed;
exports.highlightLogLevelsBlessed = highlightLogLevelsBlessed;
exports.highlightHttpBlessed = highlightHttpBlessed;
exports.highlightEnvVarsBlessed = highlightEnvVarsBlessed;
exports.highlightIPsBlessed = highlightIPsBlessed;
exports.highlightGitShasBlessed = highlightGitShasBlessed;
exports.highlightCodeFramesBlessed = highlightCodeFramesBlessed;
exports.highlightDiffsBlessed = highlightDiffsBlessed;
exports.highlightPackagesBlessed = highlightPackagesBlessed;
exports.highlightCodeBlocksBlessed = highlightCodeBlocksBlessed;
exports.applySyntaxHighlightBlessed = applySyntaxHighlightBlessed;
exports.applyLightSyntaxHighlightBlessed = applyLightSyntaxHighlightBlessed;
exports.colorizeBlockBlessed = colorizeBlockBlessed;
exports.blessedSyntaxColors = {
    path: 'cyan-fg',
    lineNumber: 'yellow-fg',
    keyword: 'magenta-fg',
    string: 'green-fg',
    number: 'yellow-fg',
    comment: 'gray-fg',
    title: 'bright-cyan-fg',
    error: 'red-fg',
    success: 'green-fg',
    warning: 'yellow-fg',
    darkGray: 'gray-fg',
    link: 'blue-fg',
    info: 'bright-blue-fg',
    debug: 'gray-fg',
    httpMethod: 'bright-magenta-fg',
    diffAdd: 'green-fg',
    diffRemove: 'red-fg',
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
function highlightPathsBlessed(text) {
    const pathRegex = /(?:^|\s)((?:\/|\.\/|\.\.\/|~\/)[^\s:]+)/g;
    return text.replace(pathRegex, (match, path) => {
        return match.replace(path, `{${exports.blessedSyntaxColors.path}}${path}{/${exports.blessedSyntaxColors.path}}`);
    });
}
function highlightFileRefsBlessed(text) {
    const fileRefRegex = /((?:\/|\.\/|\.\.\/)?[^\s:]+\.\w+)(:\d+(?::\d+)?)/g;
    return text.replace(fileRefRegex, (match, file, location) => {
        return `{${exports.blessedSyntaxColors.path}}${file}{/${exports.blessedSyntaxColors.path}}{${exports.blessedSyntaxColors.lineNumber}}${location}{/${exports.blessedSyntaxColors.lineNumber}}`;
    });
}
function highlightLinksBlessed(text) {
    let highlighted = text;
    const urlRegex = /(https?:\/\/[^\s)]+|ftp:\/\/[^\s)]+|www\.[^\s)]+)/g;
    highlighted = highlighted.replace(urlRegex, (m) => {
        return `{${exports.blessedSyntaxColors.link}}{underline}${m}{/underline}{/${exports.blessedSyntaxColors.link}}`;
    });
    const emailRegex = /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g;
    highlighted = highlighted.replace(emailRegex, (m) => {
        return `{${exports.blessedSyntaxColors.link}}{underline}${m}{/underline}{/${exports.blessedSyntaxColors.link}}`;
    });
    return highlighted;
}
function highlightKeywordsBlessed(text) {
    let highlighted = text;
    for (const keyword of KEYWORDS) {
        const regex = new RegExp(`\\b(${keyword})\\b`, 'g');
        highlighted = highlighted.replace(regex, `{${exports.blessedSyntaxColors.keyword}}$1{/${exports.blessedSyntaxColors.keyword}}`);
    }
    return highlighted;
}
function highlightCliFlagsBlessed(text) {
    let highlighted = text;
    highlighted = highlighted.replace(/\B--[A-Za-z0-9][\w-]*(?:=[^\s]+)?/g, (m) => {
        return `{${exports.blessedSyntaxColors.lineNumber}}${m}{/${exports.blessedSyntaxColors.lineNumber}}`;
    });
    highlighted = highlighted.replace(/\B-[A-Za-z]+\b/g, (m) => {
        return `{${exports.blessedSyntaxColors.lineNumber}}${m}{/${exports.blessedSyntaxColors.lineNumber}}`;
    });
    return highlighted;
}
function highlightTitlesBlessed(text) {
    const titleRegex = /^(#{1,6})\s+(.+)$/gm;
    return text.replace(titleRegex, (match, hashes, title) => {
        return `{${exports.blessedSyntaxColors.title}}${hashes} ${title}{/${exports.blessedSyntaxColors.title}}`;
    });
}
function highlightJsonBlessed(text) {
    let highlighted = text;
    highlighted = highlighted.replace(/("[A-Za-z_][\w-]*")\s*:/g, (_m, key) => {
        return `{${exports.blessedSyntaxColors.keyword}}${key}{/${exports.blessedSyntaxColors.keyword}}:`;
    });
    highlighted = highlighted.replace(/\b(true|false|null)\b/g, (_m, v) => {
        return `{${exports.blessedSyntaxColors.keyword}}${v}{/${exports.blessedSyntaxColors.keyword}}`;
    });
    return highlighted;
}
function highlightStringsBlessed(text) {
    const stringRegex = /(["'])(?:(?=(\\?))\2.)*?\1/g;
    return text.replace(stringRegex, (match) => {
        return `{${exports.blessedSyntaxColors.string}}${match}{/${exports.blessedSyntaxColors.string}}`;
    });
}
function highlightNumbersBlessed(text) {
    const numberRegex = /\b(\d+\.?\d*)\b/g;
    return text.replace(numberRegex, `{${exports.blessedSyntaxColors.number}}$1{/${exports.blessedSyntaxColors.number}}`);
}
function highlightCommentsBlessed(text) {
    let highlighted = text;
    highlighted = highlighted.replace(/(#.*)$/gm, (match) => {
        if (/^#{1,6}\s/.test(match))
            return match;
        return `{${exports.blessedSyntaxColors.comment}}${match}{/${exports.blessedSyntaxColors.comment}}`;
    });
    highlighted = highlighted.replace(/(\/\/.*)$/gm, `{${exports.blessedSyntaxColors.comment}}$1{/${exports.blessedSyntaxColors.comment}}`);
    highlighted = highlighted.replace(/(\/\*[\s\S]*?\*\/)/g, `{${exports.blessedSyntaxColors.comment}}$1{/${exports.blessedSyntaxColors.comment}}`);
    return highlighted;
}
function highlightShellCommandsBlessed(text) {
    let highlighted = text;
    for (const cmd of SHELL_COMMANDS) {
        const regex = new RegExp(`\\b(${cmd})\\b`, 'g');
        highlighted = highlighted.replace(regex, `{${exports.blessedSyntaxColors.keyword}}$1{/${exports.blessedSyntaxColors.keyword}}`);
    }
    return highlighted;
}
function highlightLogLevelsBlessed(text) {
    let highlighted = text;
    highlighted = highlighted.replace(/\[(INFO|DEBUG|TRACE|WARN|WARNING|ERROR|FATAL|SUCCESS|OK)\]/g, (_m, lvl) => {
        const level = lvl.toUpperCase();
        const color = level === 'ERROR' || level === 'FATAL' ? exports.blessedSyntaxColors.error :
            level === 'WARN' || level === 'WARNING' ? exports.blessedSyntaxColors.warning :
                level === 'SUCCESS' || level === 'OK' ? exports.blessedSyntaxColors.success :
                    level === 'DEBUG' || level === 'TRACE' ? exports.blessedSyntaxColors.debug :
                        exports.blessedSyntaxColors.info;
        return `{${color}}[${level}]{/${color}}`;
    });
    highlighted = highlighted.replace(/\b(INFO|DEBUG|TRACE|WARN|WARNING|ERROR|FATAL|SUCCESS|OK)\b/g, (_m, lvl) => {
        const level = lvl.toUpperCase();
        const color = level === 'ERROR' || level === 'FATAL' ? exports.blessedSyntaxColors.error :
            level === 'WARN' || level === 'WARNING' ? exports.blessedSyntaxColors.warning :
                level === 'SUCCESS' || level === 'OK' ? exports.blessedSyntaxColors.success :
                    level === 'DEBUG' || level === 'TRACE' ? exports.blessedSyntaxColors.debug :
                        exports.blessedSyntaxColors.info;
        return `{${color}}${level}{/${color}}`;
    });
    return highlighted;
}
function highlightHttpBlessed(text) {
    let highlighted = text;
    highlighted = highlighted.replace(/\b(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b(?![\w-])/g, (_m, method) => {
        return `{${exports.blessedSyntaxColors.httpMethod}}{bold}${method}{/bold}{/${exports.blessedSyntaxColors.httpMethod}}`;
    });
    highlighted = highlighted.replace(/HTTP\/((?:1\.[01]|2))\s(\d{3})/g, (_m, ver, code) => {
        const n = parseInt(code, 10);
        const color = n >= 500 ? exports.blessedSyntaxColors.error : n >= 400 ? exports.blessedSyntaxColors.error : n >= 300 ? exports.blessedSyntaxColors.warning : exports.blessedSyntaxColors.success;
        return `HTTP/${ver} ${`{${color}}${code}{/${color}}`}`;
    });
    highlighted = highlighted.replace(/\b(\d{3})\b\s+(OK|Created|Accepted|No\s+Content|Moved\s+Permanently|Found|See\s+Other|Not\s+Modified|Temporary\s+Redirect|Permanent\s+Redirect|Bad\s+Request|Unauthorized|Forbidden|Not\s+Found|Method\s+Not\s+Allowed|Conflict|Gone|Too\s+Many\s+Requests|Internal\s+Server\s+Error|Not\s+Implemented|Bad\s+Gateway|Service\s+Unavailable)/gi, (_m, code, msg) => {
        const n = parseInt(code, 10);
        const color = n >= 500 ? exports.blessedSyntaxColors.error : n >= 400 ? exports.blessedSyntaxColors.error : n >= 300 ? exports.blessedSyntaxColors.warning : exports.blessedSyntaxColors.success;
        return `{${color}}${code} ${msg}{/${color}}`;
    });
    return highlighted;
}
function highlightEnvVarsBlessed(text) {
    return text
        .replace(/\$[A-Z_][A-Z0-9_]*/g, (m) => `{${exports.blessedSyntaxColors.path}}${m}{/${exports.blessedSyntaxColors.path}}`)
        .replace(/\$\{[A-Z_][A-Z0-9_]*\}/g, (m) => `{${exports.blessedSyntaxColors.path}}${m}{/${exports.blessedSyntaxColors.path}}`);
}
function highlightIPsBlessed(text) {
    let highlighted = text;
    highlighted = highlighted.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b(?::\d+)?/g, (m) => {
        return `{${exports.blessedSyntaxColors.path}}${m}{/${exports.blessedSyntaxColors.path}}`;
    });
    return highlighted;
}
function highlightGitShasBlessed(text) {
    return text.replace(/\b[a-f0-9]{7,40}\b/g, (m) => {
        return `{${exports.blessedSyntaxColors.keyword}}${m}{/${exports.blessedSyntaxColors.keyword}}`;
    });
}
function highlightCodeFramesBlessed(text) {
    return text.replace(/^(\s*)(>\s*)?(\d+)\s*\|/gm, (_m, lead, arrow, ln) => {
        const arrowPart = arrow ? `{${exports.blessedSyntaxColors.comment}}${arrow}{/${exports.blessedSyntaxColors.comment}}` : '';
        const num = `{${exports.blessedSyntaxColors.lineNumber}}${ln}{/${exports.blessedSyntaxColors.lineNumber}}`;
        const pipe = `{${exports.blessedSyntaxColors.comment}}|{/${exports.blessedSyntaxColors.comment}}`;
        return `${lead}${arrowPart}${num} ${pipe}`;
    });
}
function highlightDiffsBlessed(text) {
    return text
        .replace(/^(\+.*)$/gm, (_m, line) => `{${exports.blessedSyntaxColors.diffAdd}}${line}{/${exports.blessedSyntaxColors.diffAdd}}`)
        .replace(/^(\-.*)$/gm, (_m, line) => `{${exports.blessedSyntaxColors.diffRemove}}${line}{/${exports.blessedSyntaxColors.diffRemove}}`);
}
function highlightPackagesBlessed(text) {
    const packageRegex = /(@[\w-]+\/[\w-]+|[\w-]+\/[\w-]+|\b[\w-]+@[\d.]+)/g;
    return text.replace(packageRegex, (match) => {
        return `{${exports.blessedSyntaxColors.path}}${match}{/${exports.blessedSyntaxColors.path}}`;
    });
}
function highlightCodeBlocksBlessed(text) {
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    return text.replace(codeBlockRegex, (match, lang, code) => {
        let result = `{${exports.blessedSyntaxColors.path}}\`\`\`${lang || ''}{/${exports.blessedSyntaxColors.path}}\n`;
        const highlightedCode = highlightCodeBlockContentBlessed(code, lang);
        result += highlightedCode;
        result += `{${exports.blessedSyntaxColors.path}}\`\`\`{/${exports.blessedSyntaxColors.path}}`;
        return result;
    });
}
function highlightCodeBlockContentBlessed(code, lang) {
    let highlighted = code;
    if (lang === 'bash' || lang === 'sh' || lang === 'shell') {
        highlighted = highlightShellCommandsBlessed(highlighted);
        highlighted = highlightCommentsBlessed(highlighted);
        highlighted = highlightStringsBlessed(highlighted);
        return highlighted;
    }
    if (lang === 'javascript' || lang === 'js' || lang === 'typescript' || lang === 'ts') {
        highlighted = highlightCommentsBlessed(highlighted);
        highlighted = highlightStringsBlessed(highlighted);
        highlighted = highlightKeywordsBlessed(highlighted);
        highlighted = highlightNumbersBlessed(highlighted);
        return highlighted;
    }
    highlighted = highlightCommentsBlessed(highlighted);
    highlighted = highlightStringsBlessed(highlighted);
    highlighted = highlightKeywordsBlessed(highlighted);
    highlighted = highlightNumbersBlessed(highlighted);
    return highlighted;
}
function applySyntaxHighlightBlessed(text) {
    if (!text)
        return text;
    let highlighted = text;
    highlighted = highlightCodeBlocksBlessed(highlighted);
    highlighted = highlightFileRefsBlessed(highlighted);
    highlighted = highlightLinksBlessed(highlighted);
    highlighted = highlightPathsBlessed(highlighted);
    highlighted = highlightPackagesBlessed(highlighted);
    highlighted = highlightTitlesBlessed(highlighted);
    highlighted = highlightCodeFramesBlessed(highlighted);
    highlighted = highlightDiffsBlessed(highlighted);
    highlighted = highlightEnvVarsBlessed(highlighted);
    highlighted = highlightCliFlagsBlessed(highlighted);
    highlighted = highlightIPsBlessed(highlighted);
    highlighted = highlightGitShasBlessed(highlighted);
    highlighted = highlightLogLevelsBlessed(highlighted);
    highlighted = highlightHttpBlessed(highlighted);
    highlighted = highlightCommentsBlessed(highlighted);
    highlighted = highlightStringsBlessed(highlighted);
    highlighted = highlightJsonBlessed(highlighted);
    highlighted = highlightShellCommandsBlessed(highlighted);
    highlighted = highlightKeywordsBlessed(highlighted);
    highlighted = highlightNumbersBlessed(highlighted);
    return highlighted;
}
function applyLightSyntaxHighlightBlessed(text) {
    if (!text)
        return text;
    let highlighted = text;
    highlighted = highlightFileRefsBlessed(highlighted);
    highlighted = highlightPathsBlessed(highlighted);
    highlighted = highlightLinksBlessed(highlighted);
    return highlighted;
}
function colorizeBlockBlessed(text, color) {
    return `{${color}}${text}{/${color}}`;
}
