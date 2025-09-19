# Universal NikCLI Installation Script for Windows PowerShell
# Supports npm, yarn, pnpm, and bun

param(
    [string]$PackageManager = ""
)

# Colors for output
$colors = @{
    Red = 'Red'
    Green = 'Green'
    Yellow = 'Yellow'
    Blue = 'Blue'
    White = 'White'
}

function Write-ColoredText {
    param([string]$Text, [string]$Color = 'White')
    Write-Host $Text -ForegroundColor $colors[$Color]
}

function Test-CommandExists {
    param([string]$Command)
    $null = Get-Command $Command -ErrorAction SilentlyContinue
    return $?
}

function Get-PackageManagerVersion {
    param([string]$Manager)

    try {
        switch ($Manager) {
            "npm" { return (npm --version) }
            "yarn" { return (yarn --version) }
            "pnpm" { return (pnpm --version) }
            "bun" { return (bun --version) }
        }
    }
    catch {
        return $null
    }
}

function Install-WithManager {
    param([string]$Manager)

    Write-ColoredText "📦 Installing NikCLI with $Manager..." 'Green'

    try {
        switch ($Manager) {
            "npm" {
                npm install -g @nicomatt69/nikcli
                return $LASTEXITCODE -eq 0
            }
            "yarn" {
                yarn global add @nicomatt69/nikcli
                return $LASTEXITCODE -eq 0
            }
            "pnpm" {
                pnpm install -g @nicomatt69/nikcli
                return $LASTEXITCODE -eq 0
            }
            "bun" {
                bun install -g @nicomatt69/nikcli
                return $LASTEXITCODE -eq 0
            }
        }
    }
    catch {
        return $false
    }
}

Write-ColoredText "🚀 NikCLI Universal Installer" 'Blue'
Write-ColoredText "================================" 'Blue'

# Check for Node.js
if (-not (Test-CommandExists "node")) {
    Write-ColoredText "❌ Node.js not found. Please install Node.js 18+ first." 'Red'
    Write-ColoredText "Visit: https://nodejs.org/" 'Blue'
    exit 1
}

$nodeVersion = (node --version) -replace 'v', '' -split '\.' | Select-Object -First 1
if ([int]$nodeVersion -lt 18) {
    Write-ColoredText "❌ Node.js 18+ required. Current version: $(node --version)" 'Red'
    exit 1
}

Write-ColoredText "✅ Node.js $(node --version) detected" 'Green'

# Package managers to try in order of preference
$packageManagers = @("pnpm", "bun", "yarn", "npm")

# Check available package managers
Write-ColoredText "`n🔍 Checking available package managers..." 'Blue'
$availableManagers = @()

foreach ($manager in $packageManagers) {
    if (Test-CommandExists $manager) {
        $version = Get-PackageManagerVersion $manager
        Write-ColoredText "✅ $manager $version" 'Green'
        $availableManagers += $manager
    }
    else {
        Write-ColoredText "⚠️  $manager not found" 'Yellow'
    }
}

if ($availableManagers.Count -eq 0) {
    Write-ColoredText "❌ No supported package managers found!" 'Red'
    Write-ColoredText "Please install one of: npm, yarn, pnpm, or bun" 'Blue'
    exit 1
}

# Use the first available package manager or user choice
$preferredManager = $availableManagers[0]

if ($PackageManager) {
    if ($availableManagers -contains $PackageManager) {
        $preferredManager = $PackageManager
        Write-ColoredText "📋 Using user-specified package manager: $preferredManager" 'Blue'
    }
    else {
        Write-ColoredText "⚠️  $PackageManager not available. Using $preferredManager instead." 'Yellow'
    }
}

Write-ColoredText "`n📦 Installing with $preferredManager..." 'Blue'

# Install NikCLI
if (Install-WithManager $preferredManager) {
    Write-ColoredText "`n🎉 NikCLI installed successfully!" 'Green'
    Write-ColoredText "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" 'Blue'
    Write-ColoredText "🚀 Get started with: " 'Green' -NoNewline
    Write-ColoredText "nikcli" 'Yellow'
    Write-ColoredText "📚 For help: " 'Green' -NoNewline
    Write-ColoredText "nikcli --help" 'Yellow'
    Write-ColoredText "🔧 Configuration: " 'Green' -NoNewline
    Write-ColoredText "nikcli /config" 'Yellow'
    Write-ColoredText "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" 'Blue'
}
else {
    Write-ColoredText "`n❌ Installation failed with $preferredManager" 'Red'

    # Try other managers
    Write-ColoredText "🔄 Trying alternative package managers..." 'Yellow'
    $success = $false

    foreach ($manager in $availableManagers) {
        if ($manager -ne $preferredManager) {
            Write-ColoredText "Trying $manager..." 'Blue'
            if (Install-WithManager $manager) {
                Write-ColoredText "`n🎉 NikCLI installed successfully with $manager!" 'Green'
                $success = $true
                break
            }
        }
    }

    if (-not $success) {
        Write-ColoredText "`n❌ Installation failed with all available package managers." 'Red'
        Write-ColoredText "Please try manual installation:" 'Blue'
        Write-ColoredText "npm install -g @nicomatt69/nikcli" 'Yellow'
        exit 1
    }
}