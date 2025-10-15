/**
 * Demo: Show how Streamtty formats the CHANGELOG_INTERACTIVE.md
 */

import * as fs from 'fs';
import * as path from 'path';
import { Streamtty } from '../src/index';

async function main() {
    console.log('🎨 Streamtty Formatting Demo\n');
    console.log('Loading CHANGELOG_INTERACTIVE.md...\n');

    // Read the changelog file
    const changelogPath = path.join(__dirname, '..', 'CHANGELOG_INTERACTIVE.md');
    const markdown = fs.readFileSync(changelogPath, 'utf-8');

    console.log('File size:', markdown.length, 'bytes');
    console.log('Lines:', markdown.split('\n').length);
    console.log('\n' + '='.repeat(80) + '\n');

    if (process.stdout.isTTY) {
        console.log('📺 Rendering in BLESSED MODE (interactive)...\n');

        // Create Streamtty instance with interactive mode
        const streamtty = new Streamtty({
            syntaxHighlight: true,
            autoScroll: true,
            enableInteractive: true, // Interactive mode ON
        });

        console.log('Interactive mode enabled:', streamtty.isInteractiveModeEnabled());
        console.log('\nPress Ctrl+C to exit\n');

        // Stream the content
        streamtty.stream(markdown);

        // Keep process alive to show the blessed UI
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.on('data', (key) => {
            // Ctrl+C
            if (key.toString() === '\x03') {
                streamtty.destroy();
                process.exit(0);
            }
        });

    } else {
        console.log('📄 Rendering in STDOUT MODE (no TTY)...\n');
        console.log('Note: Interactive features require a TTY terminal');
        console.log('Run this in a proper terminal to see interactive mode\n');
        console.log('='.repeat(80));
        console.log(markdown);
    }
}

main().catch(console.error);

