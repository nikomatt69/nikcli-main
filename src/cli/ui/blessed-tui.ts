import * as blessed from 'blessed';

export class BlessedTUI {
  private screen: blessed.Widgets.Screen;
  private streamBox: blessed.Widgets.BoxElement;
  private toolchainsBox: blessed.Widgets.BoxElement;
  private mainContentBox: blessed.Widgets.BoxElement;
  private promptInput: blessed.Widgets.TextboxElement;

  constructor() {
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'NikCLI TUI',
    });

    this.screen.key(['escape', 'q', 'C-c'], function(ch, key) {
      return process.exit(0);
    });

    // Stream Box (top-left)
    this.streamBox = blessed.box({
      top: 0,
      left: 0,
      width: '50%',
      height: '20%',
      content: 'stream',
      tags: true,
      border: { type: 'line' },
      style: {
        fg: 'white',
        bg: 'black',
        border: { fg: '#ff0000' }, // Red border for stream
        hover: { bg: 'green' },
      },
    });
    this.screen.append(this.streamBox);

    // Toolchains Box (top-right)
    this.toolchainsBox = blessed.box({
      top: 0,
      left: '50%',
      width: '50%',
      height: '20%',
      content: 'toolchains',
      tags: true,
      border: { type: 'line' },
      style: {
        fg: 'white',
        bg: 'black',
        border: { fg: '#0000ff' }, // Blue border for toolchains
        hover: { bg: 'green' },
      },
    });
    this.screen.append(this.toolchainsBox);

    // Main Content Box (middle)
    this.mainContentBox = blessed.box({
      top: '20%',
      left: 0,
      width: '100%',
      height: '60%',
      content: 'stream-area/toolchain stream',
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      scrollbar: { ch: ' ' },
      border: { type: 'line' },
      style: {
        fg: 'white',
        bg: 'black',
        border: { fg: '#00ff00' }, // Green border for main content
        hover: { bg: 'green' },
      },
    });
    this.screen.append(this.mainContentBox);

    // Prompt Area (bottom)
    this.promptInput = blessed.textbox({
      bottom: 0,
      left: 0,
      width: '100%',
      height: 3,
      inputOnFocus: true,
      padding: {
        left: 1,
        right: 1,
      },
      border: { type: 'line' },
      style: {
        fg: 'white',
        bg: 'black',
        border: { fg: 'white' },
        focus: { border: { fg: 'blue' } },
      },
      value: 'Add a follow-up',
    });
    this.screen.append(this.promptInput);

    this.promptInput.on('submit', (text: string) => {
      this.mainContentBox.insertBottom('User: ' + text);
      this.promptInput.clearValue();
      this.screen.render();
      // Here you would typically send the text to your CLI logic
    });

    this.promptInput.focus();
    this.screen.render();
  }

  public updateStream(content: string) {
    this.streamBox.setContent(content);
    this.screen.render();
  }

  public updateToolchains(content: string) {
    this.toolchainsBox.setContent(content);
    this.screen.render();
  }

  public appendMainContent(content: string) {
    this.mainContentBox.insertBottom(content);
    this.screen.render();
  }

  public setPrompt(text: string) {
    this.promptInput.setValue(text);
    this.screen.render();
  }

  public focusPrompt() {
    this.promptInput.focus();
    this.screen.render();
  }

  public render() {
    this.screen.render();
  }
}

