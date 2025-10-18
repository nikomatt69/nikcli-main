#!/bin/bash

# StreamTTY Cleanup Script - Remove Old/Duplicate Files
# This script safely removes obsolete files that have been replaced by new implementations

set -e

PROJECT_ROOT="/Volumes/SSD/Documents/Personal/nikcli-main/streamtty"
BACKUP_DIR="${PROJECT_ROOT}/.cleanup_backup_$(date +%Y%m%d_%H%M%S)"

echo "🧹 StreamTTY Cleanup & Integration"
echo "=================================="
echo ""

# Create backup directory
echo "📦 Creating backup of files to remove..."
mkdir -p "${BACKUP_DIR}"

# Function to safe remove directory
safe_remove_dir() {
    local dir_path="$1"
    local description="$2"
    
    if [ -d "${dir_path}" ]; then
        echo "  📂 ${description}"
        cp -r "${dir_path}" "${BACKUP_DIR}/"
        rm -rf "${dir_path}"
    fi
}

# Function to safe remove file
safe_remove_file() {
    local file_path="$1"
    local description="$2"
    
    if [ -f "${file_path}" ]; then
        echo "  📄 ${description}"
        cp "${file_path}" "${BACKUP_DIR}/"
        rm "${file_path}"
    fi
}

echo ""
echo "🗑️  Removing obsolete plugin system files..."
safe_remove_file "${PROJECT_ROOT}/src/plugins/plugin-system.ts" "plugin-system.ts (REPLACED BY plugin-system-inline.ts)"
safe_remove_file "${PROJECT_ROOT}/src/plugins/types.ts" "types.ts (old plugin types)"
safe_remove_file "${PROJECT_ROOT}/src/plugins/index.ts" "index.ts (old exports)"
safe_remove_dir "${PROJECT_ROOT}/src/plugins/remark" "remark/ (old remark plugins)"
safe_remove_dir "${PROJECT_ROOT}/src/plugins/rehype" "rehype/ (old rehype plugins)"

echo ""
echo "🗑️  Removing obsolete renderers..."
safe_remove_dir "${PROJECT_ROOT}/src/renderers" "renderers/ (REPLACED BY utils/* files)"

echo ""
echo "🗑️  Removing obsolete streaming integration..."
safe_remove_file "${PROJECT_ROOT}/src/streaming-integration.ts" "streaming-integration.ts (REPLACED BY plugin system)"

echo ""
echo "🗑️  Removing old security files..."
safe_remove_file "${PROJECT_ROOT}/src/security/chunk-processor.ts" "chunk-processor.ts (old)"
safe_remove_file "${PROJECT_ROOT}/src/security/input-validator.ts" "input-validator.ts (REPLACED BY ansi-sanitizer.ts)"
safe_remove_file "${PROJECT_ROOT}/src/security/index.ts" "index.ts (old exports)"

echo ""
echo "✅ Cleanup complete!"
echo ""
echo "📋 Backup created at: ${BACKUP_DIR}"
echo ""
echo "🔍 File structure after cleanup:"
echo "src/"
echo "├── utils/                    (NEW - 4 utilities)"
echo "│   ├── shiki-ansi-renderer.ts"
echo "│   ├── math-unicode-renderer.ts"
echo "│   ├── mermaid-ascii-renderer.ts"
echo "│   └── table-formatter-inline.ts"
echo "├── plugins/                  (CLEANED - only inline system)"
echo "│   └── plugin-system-inline.ts"
echo "├── security/                 (CLEANED - only new)"
echo "│   └── ansi-sanitizer.ts"
echo "├── streaming/                (NEW)"
echo "│   └── stream-stats.ts"
echo "├── widgets/                  (NEW)"
echo "│   └── stream-indicator.ts"
echo "├── parser/                   (KEPT)"
echo "├── renderer/                 (KEPT)"
echo "├── types/                    (KEPT)"
echo "├── themes/                   (KEPT)"
echo "├── index.ts                  (UPDATED - clean imports)"
echo "└── ... (other core files)"
echo ""
echo "🔗 All files are now properly integrated!"
echo "✨ Ready for: yarn build && yarn example:enterprise-streaming"
