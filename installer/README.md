# NikCLI Universal Installers

This directory contains universal installation scripts that support all major package managers.

## 📦 Available Installers

### Unix/macOS Installer (`install.sh`)

**Quick Install:**
```bash
curl -fsSL https://raw.githubusercontent.com/nikomatt69/nikcli-main/main/installer/install.sh | bash
```

**With Specific Package Manager:**
```bash
curl -fsSL https://raw.githubusercontent.com/nikomatt69/nikcli-main/main/installer/install.sh | bash -s pnpm
```

**Features:**
- ✅ Auto-detects available package managers (pnpm, bun, yarn, npm)
- ✅ Intelligent fallback if preferred manager fails
- ✅ Node.js version validation (18+)
- ✅ Colored output and progress indicators
- ✅ Security verification and error handling

### Windows PowerShell Installer (`install.ps1`)

**Quick Install:**
```powershell
iwr -useb https://raw.githubusercontent.com/nikomatt69/nikcli-main/main/installer/install.ps1 | iex
```

**With Specific Package Manager:**
```powershell
iwr -useb https://raw.githubusercontent.com/nikomatt69/nikcli-main/main/installer/install.ps1 | iex -PackageManager yarn
```

**Features:**
- ✅ PowerShell 5.1+ compatible
- ✅ Same auto-detection and fallback logic
- ✅ Windows-specific error handling
- ✅ Colored console output
- ✅ Package manager validation

## 🔧 Supported Package Managers

| Manager | Priority | Notes |
|---------|----------|-------|
| **pnpm** | 1st | Fastest, most efficient |
| **bun** | 2nd | Modern JavaScript runtime |
| **yarn** | 3rd | Popular alternative to npm |
| **npm** | 4th | Default Node.js package manager |

## 🛡️ Security Features

- **Version Validation**: Ensures Node.js 18+ requirement
- **Source Verification**: Downloads only from official npm registry
- **No Elevated Privileges**: Works with standard user permissions
- **Fallback Safety**: Multiple installation attempts with different managers
- **Error Handling**: Clear error messages and troubleshooting guidance

## 🚀 Installation Process

1. **Environment Check**: Validates Node.js and available package managers
2. **Manager Selection**: Auto-selects best available or uses user preference
3. **Installation**: Attempts global installation with chosen manager
4. **Verification**: Confirms successful installation
5. **Fallback**: Tries alternative managers if primary fails
6. **Completion**: Provides usage instructions and next steps

## 📋 Requirements

### All Platforms
- **Node.js 18+** (enforced at startup)
- At least one supported package manager
- Internet connection for downloading

### Unix/macOS
- `bash` shell
- `curl` for downloading
- Standard Unix utilities

### Windows
- **PowerShell 5.1+** (Windows 10/11 default)
- Windows PowerShell or PowerShell Core
- Network access for downloading

## 🔄 Manual Installation Fallback

If the universal installers fail, you can always install manually:

```bash
# Choose your package manager
npm install -g @nicomatt69/nikcli
yarn global add @nicomatt69/nikcli
pnpm install -g @nicomatt69/nikcli
bun install -g @nicomatt69/nikcli
```

## 🔄 Uninstall

```bash
curl -fsSL https://raw.githubusercontent.com/nikomatt69/nikcli-main/main/installer/uninstall.sh | bash
```

## 🐛 Troubleshooting

### Common Issues

1. **Permission Errors**: Try with user-level installation
2. **Network Issues**: Check firewall and proxy settings
3. **Old Node.js**: Update to Node.js 18+ from [nodejs.org](https://nodejs.org)
4. **Missing Package Manager**: Install your preferred manager first

### Getting Help

- 📖 [Documentation](https://nikcli.mintlify.app)
- 🐛 [Report Issues](https://github.com/nikomatt69/nikcli-main/issues)
- 💬 [Community Discussions](https://github.com/nikomatt69/nikcli-main/discussions)

---

**These installers ensure NikCLI works seamlessly across all environments and package managers!** 🎉
