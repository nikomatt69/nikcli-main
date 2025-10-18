/**
 * Stream Progress Indicator
 * Lightweight visual feedback for streaming
 */

export interface IndicatorOptions {
  prefix?: string;
  showBar?: boolean;
  barWidth?: number;
  showStats?: boolean;
  hideOnComplete?: boolean;
}

/**
 * Animated progress indicator for terminal
 */
export class StreamIndicator {
  private spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private currentFrame = 0;
  private visible = false;
  private options: Required<IndicatorOptions>;
  private lastOutput = '';

  constructor(options?: IndicatorOptions) {
    this.options = {
      prefix: options?.prefix || '▸',
      showBar: options?.showBar ?? true,
      barWidth: options?.barWidth ?? 20,
      showStats: options?.showStats ?? true,
      hideOnComplete: options?.hideOnComplete ?? true,
    };
  }

  /**
   * Show indicator with initial status
   */
  show(status: string = 'Processing...'): void {
    this.visible = true;
    this.currentFrame = 0;
    this.render(status);
  }

  /**
   * Update indicator
   */
  update(
    status: string,
    options?: { progress?: number; total?: number; stats?: string }
  ): void {
    if (!this.visible) return;

    this.currentFrame = (this.currentFrame + 1) % this.spinnerFrames.length;
    const output = this.buildOutput(status, options);
    this.render(output);
    this.lastOutput = output;
  }

  /**
   * Show completion state
   */
  complete(message?: string): void {
    this.visible = false;

    if (this.options.hideOnComplete) {
      this.clear();
    } else if (message) {
      console.log(`\n✓ ${message}`);
    }
  }

  /**
   * Show error state
   */
  error(message: string): void {
    this.visible = false;
    this.clear();
    console.error(`\n✗ Error: ${message}`);
  }

  /**
   * Hide indicator
   */
  hide(): void {
    this.visible = false;
    this.clear();
  }

  /**
   * Build output string
   */
  private buildOutput(
    status: string,
    options?: { progress?: number; total?: number; stats?: string }
  ): string {
    const spinner = this.spinnerFrames[this.currentFrame];
    const parts: string[] = [];

    // Spinner and status
    parts.push(`${spinner} ${status}`);

    // Progress bar
    if (this.options.showBar && options?.progress !== undefined && options?.total !== undefined) {
      const pct = Math.min(1, options.progress / options.total);
      const filled = Math.round(pct * this.options.barWidth);
      const empty = this.options.barWidth - filled;

      const bar = '█'.repeat(filled) + '░'.repeat(empty);
      const pctStr = `${Math.round(pct * 100)}%`;

      parts.push(`[${bar}] ${pctStr}`);
    }

    // Stats
    if (this.options.showStats && options?.stats) {
      parts.push(options.stats);
    }

    return parts.join(' • ');
  }

  /**
   * Render output to stdout
   */
  private render(output: string): void {
    // Calculate the length of the last output to clear it properly
    const clearLength = Math.max(this.lastOutput.length, output.length);

    // Carriage return + clear to end of line + new output
    process.stdout.write(`\r\x1b[K${output}`);
  }

  /**
   * Clear line
   */
  private clear(): void {
    process.stdout.write('\r\x1b[K');
  }

  /**
   * Log message without clearing indicator
   */
  log(message: string): void {
    if (this.visible) {
      // Re-render indicator after logging
      process.stdout.write('\n' + message + '\n');
      this.render(this.lastOutput);
    } else {
      console.log(message);
    }
  }
}

/**
 * Multi-line indicator for complex progress
 */
export class DetailedIndicator {
  private spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private currentFrame = 0;
  private visible = false;
  private lines: string[] = [];
  private cursorRow = 0;

  show(title: string, initialLines?: string[]): void {
    this.visible = true;
    this.currentFrame = 0;
    this.lines = [title, ...(initialLines || [])];
    this.cursorRow = this.lines.length - 1;
    this.render();
  }

  updateLine(index: number, content: string): void {
    if (index >= this.lines.length) {
      this.lines.push(content);
    } else {
      this.lines[index] = content;
    }
    this.currentFrame = (this.currentFrame + 1) % this.spinner.length;
    this.render();
  }

  addLine(content: string): number {
    this.lines.push(content);
    this.render();
    return this.lines.length - 1;
  }

  private render(): void {
    console.clear();

    for (let i = 0; i < this.lines.length; i++) {
      let line = this.lines[i];

      // Add spinner to first line
      if (i === 0) {
        line = `${this.spinner[this.currentFrame]} ${line}`;
      }

      console.log(line);
    }
  }

  complete(): void {
    this.visible = false;
    console.log('\n✓ Complete');
  }
}

/**
 * Simple progress bar
 */
export class ProgressBar {
  private width: number;
  private lastPct: number = -1;

  constructor(width: number = 30) {
    this.width = width;
  }

  /**
   * Update and display progress bar
   */
  show(current: number, total: number, label?: string): void {
    const pct = Math.min(1, current / total);
    const pctInt = Math.round(pct * 100);

    // Only update if percentage changed (reduce flicker)
    if (pctInt === this.lastPct) return;

    this.lastPct = pctInt;

    const filled = Math.round(pct * this.width);
    const empty = this.width - filled;

    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    const display = label ? `${label} ` : '';

    process.stdout.write(`\r${display}[${bar}] ${pctInt}%`);
  }

  /**
   * Complete
   */
  complete(): void {
    process.stdout.write('\n');
    this.lastPct = -1;
  }

  /**
   * Clear
   */
  clear(): void {
    process.stdout.write('\r\x1b[K');
    this.lastPct = -1;
  }
}

/**
 * Convenience functions
 */

export function createQuickIndicator(): StreamIndicator {
  return new StreamIndicator({
    prefix: '▸',
    showBar: true,
    showStats: true,
  });
}

export function createQuickProgressBar(): ProgressBar {
  return new ProgressBar(25);
}

/**
 * Status line updater for multiple concurrent operations
 */
export class StatusLine {
  private status: string = '';
  private interval: NodeJS.Timeout | null = null;

  /**
   * Set and display status
   */
  set(status: string): void {
    this.status = status;
    this.update();
  }

  /**
   * Start auto-update (useful for animations)
   */
  startAnimation(frames: string[], intervalMs: number = 100): void {
    let currentFrame = 0;

    this.interval = setInterval(() => {
      this.set(frames[currentFrame % frames.length]);
      currentFrame++;
    }, intervalMs);
  }

  /**
   * Stop auto-update
   */
  stopAnimation(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.clear();
  }

  /**
   * Update display
   */
  private update(): void {
    process.stdout.write(`\r\x1b[K${this.status}`);
  }

  /**
   * Clear status
   */
  private clear(): void {
    process.stdout.write('\r\x1b[K');
  }
}
