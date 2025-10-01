/**
 * NikCLI Integrated Vim Manager
 * Production-ready vim integration with intelligent editing workflows
 */

import chalk from 'chalk'
import { ChildProcess, spawn } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

export interface VimConfig {
  theme: 'gruvbox' | 'desert' | 'molokai' | 'solarized'
  lineNumbers: boolean
  syntax: boolean
  autoIndent: boolean
  expandTabs: boolean
  tabWidth: number
  plugins: string[]
  customMappings: Record<string, string>
}

export interface VimSession {
  id: string
  file: string
  startTime: Date
  lastModified?: Date
  isActive: boolean
  changes: number
}

export class VimManager {
  private sessions: Map<string, VimSession> = new Map()
  private config: VimConfig
  private vimrcPath: string
  private sessionsDir: string

  constructor() {
    this.vimrcPath = path.join(os.homedir(), '.vimrc')
    this.sessionsDir = path.join(os.homedir(), '.vim', 'sessions')
    this.config = this.getDefaultConfig()
    this.ensureDirectories()
  }

  /**
   * Get default production vim configuration
   */
  private getDefaultConfig(): VimConfig {
    return {
      theme: 'gruvbox',
      lineNumbers: true,
      syntax: true,
      autoIndent: true,
      expandTabs: true,
      tabWidth: 2,
      plugins: [
        'tpope/vim-sensible',
        'tpope/vim-surround',
        'tpope/vim-commentary',
        'tpope/vim-fugitive',
        'preservim/nerdtree',
        'ctrlpvim/ctrlp.vim',
        'sheerun/vim-polyglot',
        'dense-analysis/ale',
        'jiangmiao/auto-pairs',
        'vim-airline/vim-airline',
        'morhetz/gruvbox',
        'easymotion/vim-easymotion',
      ],
      customMappings: {
        '<leader>w': ':w<CR>',
        '<leader>q': ':q<CR>',
        '<leader>x': ':wq<CR>',
        '<leader>t': ':NERDTreeToggle<CR>',
        '<leader>f': ':NERDTreeFind<CR>',
        jj: '<Esc>',
        '<C-p>': ':CtrlP<CR>',
      },
    }
  }

  /**
   * Ensure required directories exist
   */
  private ensureDirectories(): void {
    const dirs = [
      path.join(os.homedir(), '.vim'),
      path.join(os.homedir(), '.vim', 'backup'),
      path.join(os.homedir(), '.vim', 'swap'),
      path.join(os.homedir(), '.vim', 'undo'),
      path.join(os.homedir(), '.vim', 'autoload'),
      this.sessionsDir,
    ]

    dirs.forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
    })
  }

  /**
   * Generate production-ready .vimrc
   */
  public generateVimrc(): string {
    const pluginList = this.config.plugins.map((plugin) => `Plug '${plugin}'`).join('\n')

    const mappingsList = Object.entries(this.config.customMappings)
      .map(([key, command]) => `nnoremap ${key} ${command}`)
      .join('\n')

    return `" ========================================
" NIKCLI INTEGRATED VIM CONFIGURATION
" Generated: ${new Date().toISOString()}
" ========================================

set nocompatible
filetype off

" Plugin Management
call plug#begin('~/.vim/plugged')
${pluginList}
call plug#end()

" Basic Settings
set encoding=utf-8
set fileencoding=utf-8
${this.config.lineNumbers ? 'set number' : 'set nonumber'}
${this.config.lineNumbers ? 'set relativenumber' : 'set norelativenumber'}
${this.config.syntax ? 'syntax enable' : 'syntax off'}
set showcmd
set showmatch
set ruler
set cursorline
set laststatus=2
set wildmenu
set wildmode=longest:list,full

" Search Settings
set hlsearch
set incsearch
set ignorecase
set smartcase

" Indentation
${this.config.autoIndent ? 'set autoindent' : 'set noautoindent'}
set smartindent
${this.config.expandTabs ? 'set expandtab' : 'set noexpandtab'}
set tabstop=${this.config.tabWidth}
set shiftwidth=${this.config.tabWidth}
set softtabstop=${this.config.tabWidth}
set backspace=indent,eol,start

" File Handling
set autoread
set hidden
set backup
set backupdir=~/.vim/backup//
set directory=~/.vim/swap//
set undofile
set undodir=~/.vim/undo//

" Performance
set lazyredraw
set ttyfast
set updatetime=300

" Theme
set background=dark
colorscheme ${this.config.theme}

" Leader Key
let mapleader = ","

" Custom Mappings
${mappingsList}

" Plugin Configurations
" NERDTree
let NERDTreeShowHidden=1
let NERDTreeIgnore=['\\.git$', '\\.DS_Store$', '\\.swp$', '\\.swo$']

" CtrlP
let g:ctrlp_show_hidden = 1
let g:ctrlp_custom_ignore = '\\\\v[\\\\/]\\\\.\\(git\\|hg\\|svn\\|node_modules\\)$'

" ALE
let g:ale_linters = {
\\   'javascript': ['eslint'],
\\   'typescript': ['eslint', 'tsserver'],
\\   'python': ['flake8'],
\\   'go': ['golint'],
\\}
let g:ale_fixers = {
\\   'javascript': ['eslint', 'prettier'],
\\   'typescript': ['eslint', 'prettier'],
\\   'python': ['autopep8'],
\\}
let g:ale_fix_on_save = 1

" Airline
let g:airline#extensions#ale#enabled = 1
let g:airline#extensions#branch#enabled = 1
let g:airline#extensions#tabline#enabled = 1
let g:airline_theme='gruvbox'

" File type specific settings
autocmd FileType javascript setlocal ts=2 sts=2 sw=2 expandtab
autocmd FileType typescript setlocal ts=2 sts=2 sw=2 expandtab
autocmd FileType json setlocal ts=2 sts=2 sw=2 expandtab
autocmd FileType python setlocal ts=4 sts=4 sw=4 expandtab

" Auto-commands
autocmd BufWritePre * :%s/\\\\s\\\\+$//e
autocmd BufReadPost *
  \\\\ if line("'\\\\"") > 1 && line("'\\\\"") <= line("$") |
  \\\\   execute "normal! g\`\\\\"" |
  \\\\ endif

" NikCLI Integration
function! NikCLISaveSession()
  let l:session_file = expand('~/.vim/sessions/') . substitute(expand('%:p'), '/', '_', 'g') . '.vim'
  execute 'mksession! ' . l:session_file
  echo "Session saved for NikCLI"
endfunction

function! NikCLILoadSession()
  let l:session_file = expand('~/.vim/sessions/') . substitute(expand('%:p'), '/', '_', 'g') . '.vim'
  if filereadable(l:session_file)
    execute 'source ' . l:session_file
    echo "Session loaded for NikCLI"
  endif
endfunction

" Auto-save session on exit
autocmd VimLeave * call NikCLISaveSession()

echo "🚀 NikCLI Vim Configuration Loaded!"
`
  }

  /**
   * Setup vim configuration
   */
  public async setupVim(): Promise<void> {
    console.log(chalk.blue('🚀 Setting up NikCLI integrated vim...'))

    // Generate and write .vimrc
    const vimrc = this.generateVimrc()
    fs.writeFileSync(this.vimrcPath, vimrc)
    console.log(chalk.green('✅ Generated production .vimrc'))

    // Install vim-plug if not exists
    const vimPlugPath = path.join(os.homedir(), '.vim', 'autoload', 'plug.vim')
    if (!fs.existsSync(vimPlugPath)) {
      console.log(chalk.yellow('📦 Installing vim-plug...'))
      await this.installVimPlug()
    }

    console.log(chalk.green('✅ Vim setup complete!'))
    console.log(chalk.cyan('📋 Next: Run vim and execute :PlugInstall'))
  }

  /**
   * Install vim-plug plugin manager
   */
  private async installVimPlug(): Promise<void> {
    return new Promise((resolve, reject) => {
      const curl = spawn('curl', [
        '-fLo',
        path.join(os.homedir(), '.vim', 'autoload', 'plug.vim'),
        '--create-dirs',
        'https://raw.githubusercontent.com/junegunn/vim-plug/master/plug.vim',
      ])

      curl.on('close', (code) => {
        if (code === 0) {
          console.log(chalk.green('✅ vim-plug installed'))
          resolve()
        } else {
          reject(new Error(`vim-plug installation failed with code ${code}`))
        }
      })

      curl.on('error', reject)
    })
  }

  /**
   * Open file in vim with NikCLI integration
   */
  public async openFile(
    filePath: string,
    options: {
      lineNumber?: number
      column?: number
      readonly?: boolean
      diff?: boolean
    } = {}
  ): Promise<VimSession> {
    const absolutePath = path.resolve(filePath)
    const sessionId = `vim_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

    // Build vim command
    const vimArgs: string[] = []

    if (options.readonly) {
      vimArgs.push('-R')
    }

    if (options.lineNumber) {
      vimArgs.push(`+${options.lineNumber}`)
    }

    if (options.diff) {
      vimArgs.push('-d')
    }

    vimArgs.push(absolutePath)

    console.log(chalk.blue(`📝 Opening ${path.basename(filePath)} in vim...`))

    const session: VimSession = {
      id: sessionId,
      file: absolutePath,
      startTime: new Date(),
      isActive: true,
      changes: 0,
    }

    this.sessions.set(sessionId, session)

    // Spawn vim process
    const vimProcess = spawn('vim', vimArgs, {
      stdio: 'inherit',
      cwd: path.dirname(absolutePath),
    })

    return new Promise((resolve, reject) => {
      vimProcess.on('close', (code) => {
        session.isActive = false
        session.lastModified = new Date()

        if (code === 0) {
          console.log(chalk.green(`✅ Vim session completed for ${path.basename(filePath)}`))
          resolve(session)
        } else {
          console.log(chalk.red(`❌ Vim exited with code ${code}`))
          reject(new Error(`Vim process failed with code ${code}`))
        }
      })

      vimProcess.on('error', (error) => {
        session.isActive = false
        reject(error)
      })
    })
  }

  /**
   * Quick edit file with auto-save
   */
  public async quickEdit(filePath: string, content?: string): Promise<void> {
    if (content) {
      // Pre-populate file with content
      fs.writeFileSync(filePath, content)
    }

    await this.openFile(filePath)
  }

  /**
   * Diff two files in vim
   */
  public async diffFiles(file1: string, file2: string): Promise<void> {
    console.log(chalk.blue(`🔍 Comparing ${path.basename(file1)} vs ${path.basename(file2)}`))

    const vimProcess = spawn('vim', ['-d', file1, file2], {
      stdio: 'inherit',
    })

    return new Promise((resolve, reject) => {
      vimProcess.on('close', (code) => {
        if (code === 0) {
          console.log(chalk.green('✅ Diff session completed'))
          resolve()
        } else {
          reject(new Error(`Vim diff failed with code ${code}`))
        }
      })

      vimProcess.on('error', reject)
    })
  }

  /**
   * Get active vim sessions
   */
  public getActiveSessions(): VimSession[] {
    return Array.from(this.sessions.values()).filter((session) => session.isActive)
  }

  /**
   * Get vim configuration
   */
  public getConfig(): VimConfig {
    return { ...this.config }
  }

  /**
   * Update vim configuration
   */
  public updateConfig(updates: Partial<VimConfig>): void {
    this.config = { ...this.config, ...updates }
  }

  /**
   * Install additional vim plugin
   */
  public addPlugin(plugin: string): void {
    if (!this.config.plugins.includes(plugin)) {
      this.config.plugins.push(plugin)
      console.log(chalk.green(`✅ Added plugin: ${plugin}`))
      console.log(chalk.yellow('📋 Run setupVim() and :PlugInstall to activate'))
    }
  }

  /**
   * Remove vim plugin
   */
  public removePlugin(plugin: string): void {
    const index = this.config.plugins.indexOf(plugin)
    if (index > -1) {
      this.config.plugins.splice(index, 1)
      console.log(chalk.yellow(`🗑️ Removed plugin: ${plugin}`))
      console.log(chalk.yellow('📋 Run setupVim() and :PlugClean to uninstall'))
    }
  }

  /**
   * Check if vim is available
   */
  public static isVimAvailable(): boolean {
    try {
      spawn('vim', ['--version'], { stdio: 'pipe' })
      return true
    } catch {
      return false
    }
  }

  /**
   * Get vim version info
   */
  public static async getVimInfo(): Promise<{ version: string; features: string[] }> {
    return new Promise((resolve, reject) => {
      const vim = spawn('vim', ['--version'], { stdio: 'pipe' })
      let output = ''

      vim.stdout.on('data', (data) => {
        output += data.toString()
      })

      vim.on('close', (code) => {
        if (code === 0) {
          const lines = output.split('\n')
          const versionLine = lines.find((line) => line.includes('VIM - Vi IMproved'))
          const version = versionLine?.match(/\d+\.\d+/)?.[0] || 'unknown'

          const features = lines
            .filter((line) => line.startsWith('+') || line.startsWith('-'))
            .map((line) => line.trim())

          resolve({ version, features })
        } else {
          reject(new Error('Failed to get vim info'))
        }
      })
    })
  }
}

export default VimManager
