"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BlessedRenderer = void 0;
const blessed_1 = __importDefault(require("blessed"));
class BlessedRenderer {
    constructor(context) {
        this.context = context;
        this.defaultStyles = this.getDefaultStyles();
    }
    render(tokens) {
        this.context.container.children.forEach(child => child.destroy());
        let yOffset = 0;
        let currentLineTokens = [];
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            if (['strong', 'em', 'code', 'link', 'del', 'text'].includes(token.type)) {
                currentLineTokens.push(token);
            }
            else {
                if (currentLineTokens.length > 0) {
                    this.renderInlineLine(currentLineTokens, yOffset);
                    yOffset += 1;
                    currentLineTokens = [];
                }
                const element = this.renderToken(token, yOffset);
                if (element) {
                    yOffset += this.getTokenHeight(token);
                }
            }
        }
        if (currentLineTokens.length > 0) {
            this.renderInlineLine(currentLineTokens, yOffset);
        }
        if (this.context.options.autoScroll) {
            this.context.container.setScrollPerc(100);
        }
        this.context.screen.render();
    }
    renderInlineLine(tokens, yOffset) {
        let content = '';
        for (const token of tokens) {
            switch (token.type) {
                case 'strong':
                    content += `{bold}${token.content}{/bold}`;
                    break;
                case 'em':
                    content += `{italic}${token.content}{/italic}`;
                    break;
                case 'code':
                    content += `{cyan-fg}{bold}${token.content}{/bold}{/cyan-fg}`;
                    break;
                case 'link':
                    content += `{blue-fg}{underline}${token.content}{/underline}{/blue-fg}`;
                    break;
                case 'del':
                    content += `{strike}${token.content}{/strike}`;
                    break;
                default:
                    content += token.content;
            }
        }
        blessed_1.default.box({
            parent: this.context.container,
            top: yOffset,
            left: 0,
            width: '100%',
            height: 'shrink',
            content,
            tags: true,
            style: this.defaultStyles.paragraph,
            wrap: true,
        });
    }
    renderToken(token, yOffset) {
        switch (token.type) {
            case 'heading':
                return this.renderHeading(token, yOffset);
            case 'paragraph':
            case 'text':
                return this.renderText(token, yOffset);
            case 'strong':
                return this.renderStrong(token, yOffset);
            case 'em':
                return this.renderEm(token, yOffset);
            case 'code':
                return this.renderInlineCode(token, yOffset);
            case 'link':
                return this.renderLink(token, yOffset);
            case 'del':
                return this.renderDel(token, yOffset);
            case 'codeblock':
                return this.renderCodeBlock(token, yOffset);
            case 'blockquote':
                return this.renderBlockquote(token, yOffset);
            case 'listitem':
                return this.renderListItem(token, yOffset);
            case 'hr':
                return this.renderHorizontalRule(token, yOffset);
            case 'table':
                return this.renderTable(token, yOffset);
            default:
                return this.renderText(token, yOffset);
        }
    }
    renderHeading(token, yOffset) {
        const depth = token.depth || 1;
        const style = this.getHeadingStyle(depth);
        const prefix = token.incomplete ? '# ' : '';
        const content = prefix + token.content;
        return blessed_1.default.box({
            parent: this.context.container,
            top: yOffset,
            left: 0,
            width: '100%',
            height: 'shrink',
            content,
            tags: true,
            style: style,
        });
    }
    renderText(token, yOffset) {
        const style = this.defaultStyles.paragraph;
        let content = this.formatInlineStyles(token.content);
        if (token.incomplete) {
            content += '{yellow-fg}...{/yellow-fg}';
        }
        return blessed_1.default.box({
            parent: this.context.container,
            top: yOffset,
            left: 0,
            width: '100%',
            height: 'shrink',
            content,
            tags: true,
            style: style,
            wrap: true,
        });
    }
    renderStrong(token, yOffset) {
        const style = this.defaultStyles.strong;
        const content = `{bold}${token.content}{/bold}`;
        return blessed_1.default.box({
            parent: this.context.container,
            top: yOffset,
            left: 0,
            width: '100%',
            height: 'shrink',
            content,
            tags: true,
            style: style,
            wrap: true,
        });
    }
    renderEm(token, yOffset) {
        const style = this.defaultStyles.em;
        const content = `{italic}${token.content}{/italic}`;
        return blessed_1.default.box({
            parent: this.context.container,
            top: yOffset,
            left: 0,
            width: '100%',
            height: 'shrink',
            content,
            tags: true,
            style: style,
            wrap: true,
        });
    }
    renderInlineCode(token, yOffset) {
        const style = this.defaultStyles.code;
        const content = `{cyan-fg}{bold}${token.content}{/bold}{/cyan-fg}`;
        return blessed_1.default.box({
            parent: this.context.container,
            top: yOffset,
            left: 0,
            width: '100%',
            height: 'shrink',
            content,
            tags: true,
            style: style,
            wrap: true,
        });
    }
    renderLink(token, yOffset) {
        const style = this.defaultStyles.link;
        const content = `{blue-fg}{underline}${token.content}{/underline}{/blue-fg}`;
        return blessed_1.default.box({
            parent: this.context.container,
            top: yOffset,
            left: 0,
            width: '100%',
            height: 'shrink',
            content,
            tags: true,
            style: style,
            wrap: true,
        });
    }
    renderDel(token, yOffset) {
        const style = this.defaultStyles.paragraph;
        const content = `{strike}${token.content}{/strike}`;
        return blessed_1.default.box({
            parent: this.context.container,
            top: yOffset,
            left: 0,
            width: '100%',
            height: 'shrink',
            content,
            tags: true,
            style: style,
            wrap: true,
        });
    }
    renderCodeBlock(token, yOffset) {
        const style = this.defaultStyles.codeBlock;
        const lang = token.lang || 'text';
        let content = token.content;
        if (token.incomplete) {
            content = `{yellow-fg}[Code block (${lang})...]{/yellow-fg}`;
        }
        return blessed_1.default.box({
            parent: this.context.container,
            top: yOffset,
            left: 2,
            width: '100%-4',
            height: 'shrink',
            content: this.highlightCode(content, lang),
            tags: true,
            border: {
                type: 'line',
            },
            style: {
                border: {
                    fg: style.fg || 'blue',
                },
                ...style,
            },
            padding: {
                left: 1,
                right: 1,
            },
        });
    }
    renderBlockquote(token, yOffset) {
        const style = this.defaultStyles.blockquote;
        return blessed_1.default.box({
            parent: this.context.container,
            top: yOffset,
            left: 2,
            width: '100%-4',
            height: 'shrink',
            content: this.formatInlineStyles(token.content),
            tags: true,
            border: {
                type: 'line',
            },
            style: {
                border: {
                    fg: style.fg || 'gray',
                    left: false,
                    right: false,
                    top: false,
                    bottom: false,
                },
                ...style,
            },
            padding: {
                left: 1,
            },
        });
    }
    renderListItem(token, yOffset) {
        const style = this.defaultStyles.listItem;
        const bullet = token.ordered ? '1.' : '•';
        const content = `${bullet} ${this.formatInlineStyles(token.content)}`;
        return blessed_1.default.box({
            parent: this.context.container,
            top: yOffset,
            left: 2,
            width: '100%-4',
            height: 'shrink',
            content,
            tags: true,
            style: style,
            wrap: true,
        });
    }
    renderHorizontalRule(token, yOffset) {
        return blessed_1.default.box({
            parent: this.context.container,
            top: yOffset,
            left: 0,
            width: '100%',
            height: 1,
            content: '─'.repeat(80),
            style: {
                fg: 'gray',
            },
        });
    }
    renderTable(token, yOffset) {
        return blessed_1.default.box({
            parent: this.context.container,
            top: yOffset,
            left: 0,
            width: '100%',
            height: 'shrink',
            content: '{cyan-fg}[Table]{/cyan-fg}',
            tags: true,
            border: {
                type: 'line',
            },
            style: {
                border: {
                    fg: 'cyan',
                },
            },
        });
    }
    formatInlineStyles(text) {
        let formatted = text;
        if (/\*\*.*\*\*|__.*__|\*.*\*|_.*_|`.*`|\[.*\]\(.*\)|~~.*~~/.test(text)) {
            formatted = formatted.replace(/\*\*(.+?)\*\*/g, '{bold}$1{/bold}');
            formatted = formatted.replace(/__(.+?)__/g, '{bold}$1{/bold}');
            formatted = formatted.replace(/\*(.+?)\*/g, '{italic}$1{/italic}');
            formatted = formatted.replace(/_(.+?)_/g, '{italic}$1{/italic}');
            formatted = formatted.replace(/`(.+?)`/g, '{cyan-fg}{bold}$1{/bold}{/cyan-fg}');
            formatted = formatted.replace(/\[(.+?)\]\((.+?)\)/g, '{blue-fg}{underline}$1{/underline}{/blue-fg}');
            formatted = formatted.replace(/~~(.+?)~~/g, '{strike}$1{/strike}');
        }
        return formatted;
    }
    highlightCode(code, lang) {
        if (!this.context.options.syntaxHighlight) {
            return code;
        }
        const keywords = ['function', 'const', 'let', 'var', 'if', 'else', 'return', 'for', 'while', 'class', 'import', 'export'];
        let highlighted = code;
        for (const keyword of keywords) {
            const regex = new RegExp(`\\b(${keyword})\\b`, 'g');
            highlighted = highlighted.replace(regex, '{magenta-fg}$1{/magenta-fg}');
        }
        highlighted = highlighted.replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, '{green-fg}$&{/green-fg}');
        highlighted = highlighted.replace(/(\/\/.*)$/gm, '{gray-fg}$1{/gray-fg}');
        highlighted = highlighted.replace(/(\/\*[\s\S]*?\*\/)/g, '{gray-fg}$1{/gray-fg}');
        return highlighted;
    }
    getHeadingStyle(depth) {
        const styles = [
            this.defaultStyles.h1,
            this.defaultStyles.h2,
            this.defaultStyles.h3,
            this.defaultStyles.h4,
            this.defaultStyles.h5,
            this.defaultStyles.h6,
        ];
        return styles[depth - 1] || styles[0];
    }
    getTokenHeight(token) {
        switch (token.type) {
            case 'heading':
                return 2;
            case 'codeblock':
                return token.content.split('\n').length + 4;
            case 'hr':
                return 2;
            case 'table':
                return 5;
            case 'strong':
            case 'em':
            case 'code':
            case 'link':
            case 'del':
                return 0;
            default:
                return Math.max(1, Math.ceil(token.content.length / 80));
        }
    }
    getDefaultStyles() {
        return {
            h1: { fg: 'cyan', bold: true },
            h2: { fg: 'blue', bold: true },
            h3: { fg: 'green', bold: true },
            h4: { fg: 'yellow', bold: true },
            h5: { fg: 'magenta', bold: true },
            h6: { fg: 'white', bold: true },
            paragraph: { fg: 'white' },
            strong: { bold: true },
            em: { italic: true },
            code: { fg: 'cyan', bold: true },
            codeBlock: { fg: 'white', bg: 'black' },
            blockquote: { fg: 'gray', italic: true },
            link: { fg: 'blue', underline: true },
            list: { fg: 'white' },
            listItem: { fg: 'white' },
            table: { fg: 'cyan' },
            tableHeader: { fg: 'cyan', bold: true },
            hr: { fg: 'gray' },
        };
    }
}
exports.BlessedRenderer = BlessedRenderer;
