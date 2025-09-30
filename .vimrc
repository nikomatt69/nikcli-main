" ========================================
" VIM PRODUCTION-READY CONFIGURATION
" ========================================

" Basic Settings
set nocompatible                " Disable vi compatibility
set encoding=utf-8              " Set encoding to UTF-8
set fileencoding=utf-8          " File encoding

" Display & Interface
set number                      " Show line numbers
set relativenumber              " Show relative line numbers
set showcmd                     " Show command in status line
set showmatch                   " Highlight matching brackets
set ruler                       " Show cursor position
set cursorline                  " Highlight current line
set laststatus=2                " Always show status line
set wildmenu                    " Enhanced command completion
set wildmode=longest:list,full  " Command completion mode

" Search Settings
set hlsearch                    " Highlight search results
set incsearch                   " Incremental search
set ignorecase                  " Case insensitive search
set smartcase                   " Smart case search

" Indentation & Formatting
set autoindent                  " Auto indent
set smartindent                 " Smart indent
set expandtab                   " Use spaces instead of tabs
set tabstop=2                   " Tab width
set shiftwidth=2                " Indent width
set softtabstop=2               " Soft tab width
set backspace=indent,eol,start  " Better backspace behavior

" File Handling
set autoread                    " Auto reload changed files
set hidden                      " Allow hidden buffers
set backup                      " Enable backup
set backupdir=~/.vim/backup//   " Backup directory
set directory=~/.vim/swap//     " Swap directory
set undofile                    " Enable persistent undo
set undodir=~/.vim/undo//       " Undo directory

" Performance
set lazyredraw                  " Don't redraw during macros
set ttyfast                     " Fast terminal connection
set updatetime=300              " Faster completion

" Syntax & Colors
syntax enable                   " Enable syntax highlighting
set background=dark             " Dark background
colorscheme desert              " Color scheme

" Custom Keybindings
let mapleader = ","             " Set leader key

" Quick save and quit
nnoremap <leader>w :w<CR>
nnoremap <leader>q :q<CR>
nnoremap <leader>x :wq<CR>

" Clear search highlighting
nnoremap <leader>h :nohlsearch<CR>

" Split navigation
nnoremap <C-h> <C-w>h
nnoremap <C-j> <C-w>j
nnoremap <C-k> <C-w>k
nnoremap <C-l> <C-w>l

" Buffer navigation
nnoremap <leader>n :bnext<CR>
nnoremap <leader>p :bprev<CR>
nnoremap <leader>d :bdelete<CR>

" Quick editing
nnoremap <leader>ev :vsplit $MYVIMRC<CR>
nnoremap <leader>sv :source $MYVIMRC<CR>

" Insert mode mappings
inoremap jj <Esc>               " Quick escape
inoremap <C-a> <Home>           " Move to beginning of line
inoremap <C-e> <End>            " Move to end of line

" Visual mode improvements
vnoremap < <gv                  " Keep selection when indenting
vnoremap > >gv                  " Keep selection when indenting

" File type specific settings
autocmd FileType javascript setlocal ts=2 sts=2 sw=2 expandtab
autocmd FileType typescript setlocal ts=2 sts=2 sw=2 expandtab
autocmd FileType json setlocal ts=2 sts=2 sw=2 expandtab
autocmd FileType html setlocal ts=2 sts=2 sw=2 expandtab
autocmd FileType css setlocal ts=2 sts=2 sw=2 expandtab
autocmd FileType python setlocal ts=4 sts=4 sw=4 expandtab
autocmd FileType go setlocal ts=4 sts=4 sw=4 noexpandtab

" Create backup directories if they don't exist
if !isdirectory($HOME."/.vim/backup")
    call mkdir($HOME."/.vim/backup", "p")
endif
if !isdirectory($HOME."/.vim/swap")
    call mkdir($HOME."/.vim/swap", "p")
endif
if !isdirectory($HOME."/.vim/undo")
    call mkdir($HOME."/.vim/undo", "p")
endif

" Status line configuration
set statusline=
set statusline+=%#PmenuSel#
set statusline+=%{StatuslineMode()}
set statusline+=%#LineNr#
set statusline+=\ %f
set statusline+=%m\
set statusline+=%=
set statusline+=%#CursorColumn#
set statusline+=\ %y
set statusline+=\ %{&fileencoding?&fileencoding:&encoding}
set statusline+=\[%{&fileformat}\]
set statusline+=\ %p%%
set statusline+=\ %l:%c
set statusline+=\

function! StatuslineMode()
  let l:mode=mode()
  if l:mode==#"n"
    return "NORMAL"
  elseif l:mode==?"v"
    return "VISUAL"
  elseif l:mode==#"i"
    return "INSERT"
  elseif l:mode==#"R"
    return "REPLACE"
  elseif l:mode==?"s"
    return "SELECT"
  elseif l:mode==#"t"
    return "TERMINAL"
  elseif l:mode==#"c"
    return "COMMAND"
  elseif l:mode==#"!"
    return "SHELL"
  endif
endfunction

" Auto-completion enhancements
set completeopt=menu,menuone,noselect
set pumheight=10                " Limit popup menu height

" Better search and replace
set gdefault                    " Global replace by default

" Mouse support (optional)
set mouse=a                     " Enable mouse in all modes

" Spell checking for text files
autocmd FileType markdown setlocal spell
autocmd FileType text setlocal spell

" Remove trailing whitespace on save
autocmd BufWritePre * :%s/\s\+$//e

" Remember cursor position
autocmd BufReadPost *
  \ if line("'\"") > 1 && line("'\"") <= line("$") |
  \   execute "normal! g`\"" |
  \ endif

" Highlight long lines
highlight ColorColumn ctermbg=235 guibg=#2c2d27
set colorcolumn=80,120

echo "🚀 Vim Production Configuration Loaded!"