"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StreamingMarkdownParser = void 0;
const marked_1 = require("marked");
class StreamingMarkdownParser {
    constructor(parseIncomplete = true) {
        this.buffer = '';
        this.tokens = [];
        this.parseIncomplete = parseIncomplete;
        marked_1.marked.setOptions({
            gfm: true,
            breaks: true,
        });
    }
    addChunk(chunk) {
        const processedChunk = this.preprocessText(chunk);
        this.buffer += processedChunk;
        return this.parse();
    }
    preprocessText(text) {
        let processed = text;
        processed = processed.replace(/&#39;/g, "'");
        processed = processed.replace(/&quot;/g, '"');
        processed = processed.replace(/&amp;/g, '&');
        processed = processed.replace(/&lt;/g, '<');
        processed = processed.replace(/&gt;/g, '>');
        processed = processed.replace(/&nbsp;/g, ' ');
        processed = processed.replace(/\{italic\}(.*?)\{\/italic\}/g, '*$1*');
        return processed;
    }
    parse() {
        try {
            const markedTokens = marked_1.marked.lexer(this.buffer);
            const processedTokens = this.processInlineTokens(markedTokens);
            this.tokens = this.convertTokens(processedTokens);
            if (this.parseIncomplete) {
                this.handleIncompleteMarkdown();
            }
            return this.tokens;
        }
        catch (error) {
            return this.parsePartial();
        }
    }
    parseInlineFromText(text) {
        const tokens = [];
        const patterns = [
            { regex: /\*\*(.*?)\*\*/g, type: 'strong' },
            { regex: /__(.*?)__/g, type: 'strong' },
            { regex: /\*(.*?)\*/g, type: 'em' },
            { regex: /_(.*?)_/g, type: 'em' },
            { regex: /`(.*?)`/g, type: 'codespan' },
            { regex: /\[([^\]]+)\]\(([^)]+)\)/g, type: 'link' },
            { regex: /~~(.*?)~~/g, type: 'del' },
        ];
        const matches = [];
        for (const pattern of patterns) {
            let match;
            while ((match = pattern.regex.exec(text)) !== null) {
                matches.push({
                    type: pattern.type,
                    content: match[1] || match[0],
                    start: match.index,
                    end: match.index + match[0].length
                });
            }
        }
        matches.sort((a, b) => a.start - b.start);
        let lastEnd = 0;
        for (const match of matches) {
            if (match.start > lastEnd) {
                const textContent = text.slice(lastEnd, match.start);
                if (textContent.trim()) {
                    tokens.push({
                        type: 'text',
                        raw: textContent,
                        text: textContent
                    });
                }
            }
            tokens.push({
                type: match.type,
                raw: text.slice(match.start, match.end),
                text: match.content
            });
            lastEnd = match.end;
        }
        if (lastEnd < text.length) {
            const textContent = text.slice(lastEnd);
            if (textContent.trim()) {
                tokens.push({
                    type: 'text',
                    raw: textContent,
                    text: textContent
                });
            }
        }
        return tokens;
    }
    processInlineTokens(tokens) {
        const processedTokens = [];
        for (const token of tokens) {
            if (token.type === 'paragraph') {
                const paragraph = token;
                if (paragraph.tokens && paragraph.tokens.length > 0) {
                    const flattenedTokens = this.flattenInlineTokens(paragraph.tokens);
                    processedTokens.push(...flattenedTokens);
                }
                else {
                    const inlineTokens = this.parseInlineFromText(paragraph.text || paragraph.raw || '');
                    if (inlineTokens.length > 0) {
                        processedTokens.push(...inlineTokens);
                    }
                    else {
                        processedTokens.push(token);
                    }
                }
            }
            else if (token.type === 'blockquote') {
                const blockquote = token;
                if (blockquote.tokens && blockquote.tokens.length > 0) {
                    const processedBlockquoteTokens = this.processInlineTokens(blockquote.tokens);
                    processedTokens.push(...processedBlockquoteTokens);
                }
                else {
                    processedTokens.push(token);
                }
            }
            else {
                processedTokens.push(token);
            }
        }
        return processedTokens;
    }
    flattenInlineTokens(tokens) {
        const flattened = [];
        for (const token of tokens) {
            if (token.type === 'em' || token.type === 'strong' || token.type === 'codespan' || token.type === 'link' || token.type === 'del' || token.type === 'text') {
                flattened.push(token);
            }
            else if ('tokens' in token && token.tokens && token.tokens.length > 0) {
                flattened.push(...this.flattenInlineTokens(token.tokens));
            }
            else {
                flattened.push(token);
            }
        }
        return flattened;
    }
    parsePartial() {
        const tokens = [];
        const lines = this.buffer.split('\n');
        for (const line of lines) {
            if (!line.trim())
                continue;
            const token = this.parseIncompleteLine(line);
            tokens.push(token);
        }
        return tokens;
    }
    parseIncompleteLine(line) {
        if (/^#{1,6}\s/.test(line)) {
            const depth = line.match(/^(#{1,6})/)?.[1].length || 1;
            return {
                type: 'heading',
                content: line.replace(/^#{1,6}\s/, ''),
                depth,
                incomplete: !line.includes('\n'),
            };
        }
        if (line.startsWith('```')) {
            const lang = line.replace('```', '').trim();
            return {
                type: 'codeblock',
                content: '',
                lang: lang || 'text',
                incomplete: true,
            };
        }
        if (line.startsWith('>')) {
            return {
                type: 'blockquote',
                content: line.replace(/^>\s*/, ''),
                incomplete: !line.includes('\n'),
            };
        }
        if (/^[-*+]\s/.test(line) || /^\d+\.\s/.test(line)) {
            const ordered = /^\d+\./.test(line);
            return {
                type: 'listitem',
                content: line.replace(/^[-*+\d.]\s*/, ''),
                ordered,
                incomplete: !line.includes('\n'),
            };
        }
        return this.parseInlineFormatting(line);
    }
    handleIncompleteMarkdown() {
        const lastToken = this.tokens[this.tokens.length - 1];
        if (!lastToken)
            return;
        const patterns = [
            { regex: /\*\*[^*]+$/, type: 'strong' },
            { regex: /\*[^*]+$/, type: 'em' },
            { regex: /`[^`]+$/, type: 'code' },
            { regex: /\[[^\]]+$/, type: 'link' },
            { regex: /^#{1,6}\s[^\n]+$/, type: 'heading' },
        ];
        for (const pattern of patterns) {
            if (pattern.regex.test(this.buffer)) {
                if (lastToken.content) {
                    lastToken.incomplete = true;
                }
            }
        }
    }
    parseInlineFormatting(text) {
        let content = text;
        let incomplete = false;
        if (/\*\*[^*]+$/.test(text) || /\*[^*]+$/.test(text) || /`[^`]+$/.test(text)) {
            incomplete = true;
        }
        return {
            type: 'text',
            content,
            incomplete,
        };
    }
    convertTokens(markedTokens) {
        const tokens = [];
        for (const token of markedTokens) {
            const converted = this.convertToken(token);
            if (converted) {
                if (Array.isArray(converted)) {
                    tokens.push(...converted);
                }
                else {
                    tokens.push(converted);
                }
            }
        }
        return tokens;
    }
    convertToken(token) {
        switch (token.type) {
            case 'heading':
                return {
                    type: 'heading',
                    content: token.text,
                    depth: token.depth,
                    raw: token.raw,
                };
            case 'paragraph':
                return {
                    type: 'paragraph',
                    content: token.text,
                    raw: token.raw,
                };
            case 'strong':
                return {
                    type: 'strong',
                    content: token.text,
                    raw: token.raw,
                };
            case 'em':
                return {
                    type: 'em',
                    content: token.text,
                    raw: token.raw,
                };
            case 'codespan':
                return {
                    type: 'code',
                    content: token.text,
                    raw: token.raw,
                };
            case 'link':
                const link = token;
                return {
                    type: 'link',
                    content: link.text,
                    raw: token.raw,
                };
            case 'del':
                return {
                    type: 'del',
                    content: token.text,
                    raw: token.raw,
                };
            case 'text':
                return {
                    type: 'text',
                    content: token.text,
                    raw: token.raw,
                };
            case 'code':
                return {
                    type: 'codeblock',
                    content: token.text,
                    lang: token.lang || 'text',
                    raw: token.raw,
                };
            case 'blockquote':
                const blockquote = token;
                return blockquote.tokens.map(t => this.convertToken(t)).flat().filter(Boolean);
            case 'list':
                const list = token;
                return list.items.map((item, index) => ({
                    type: 'listitem',
                    content: item.text,
                    ordered: list.ordered,
                    depth: 0,
                    raw: item.raw,
                }));
            case 'hr':
                return {
                    type: 'hr',
                    content: '',
                    raw: token.raw,
                };
            case 'table':
                return {
                    type: 'table',
                    content: JSON.stringify(token),
                    raw: token.raw,
                };
            case 'space':
                return null;
            default:
                return {
                    type: 'text',
                    content: token.text || token.raw || '',
                    raw: token.raw,
                };
        }
    }
    clear() {
        this.buffer = '';
        this.tokens = [];
    }
    getBuffer() {
        return this.buffer;
    }
    getTokens() {
        return this.tokens;
    }
}
exports.StreamingMarkdownParser = StreamingMarkdownParser;
