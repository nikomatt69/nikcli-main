# Publishing Guide

## ✅ Pre-publish Checklist

- [x] TypeScript builds without errors (`npm run build`)
- [x] Type checking passes (`npm run typecheck`)
- [x] All exports configured in `package.json`
- [x] LICENSE file created (MIT)
- [x] README.md with clear examples
- [x] .env.example with required variables
- [x] .npmignore configured correctly
- [x] Version set in package.json (0.1.0)

## 📦 Package Contents

The published package includes:
- `dist/` - Compiled JavaScript + TypeScript declarations
- `README.md` - Main documentation
- `GETTING_STARTED.md` - Setup guide
- `SIMPLE_INTEGRATION.md` - Quick integration examples
- `PROVIDER_ARCHITECTURE.md` - Architecture documentation
- `.env.example` - Environment variables template
- `LICENSE` - MIT License

## 🚀 Publishing to npm

### 1. Verify Package

```bash
# Preview what will be published
npm pack --dry-run

# Test the package locally
npm pack
npm install -g ./context-interceptor-sdk-0.1.0.tgz
```

### 2. Login to npm

```bash
npm login
```

### 3. Publish

```bash
# For first release
npm publish --access public

# For updates
npm version patch  # 0.1.0 -> 0.1.1
npm publish

# For beta releases
npm publish --tag beta
```

## 📋 Environment Variables Required by Users

Users need these environment variables:

```env
OPENAI_API_KEY=sk-...
UPSTASH_VECTOR_URL=https://...
UPSTASH_VECTOR_TOKEN=...
UPSTASH_REDIS_URL=https://...
UPSTASH_REDIS_TOKEN=...
```

## 🔗 Post-Publish

1. **Update Repository URL** in `package.json`:
   ```json
   "repository": {
     "type": "git",
     "url": "https://github.com/YOUR-USERNAME/context-interceptor-sdk"
   }
   ```

2. **Tag the Release**:
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```

3. **Create GitHub Release**:
   - Go to GitHub → Releases → New Release
   - Tag: v0.1.0
   - Title: "Initial Release - v0.1.0"
   - Description: Copy from CHANGELOG.md

4. **Update npm README**:
   - Package page updates automatically from README.md

## 📊 Version Strategy

- **0.1.x** - Initial releases, may have breaking changes
- **0.2.x** - Stabilization
- **1.0.0** - First stable release
- **1.x.x** - Semantic versioning

Breaking changes:
- Major version bump (1.0.0 → 2.0.0)
- Document in CHANGELOG.md
- Provide migration guide

## 🧪 Testing Before Publish

```bash
# 1. Clean build
npm run clean
npm run build

# 2. Type checking
npm run typecheck

# 3. Test in a separate project
cd /tmp
mkdir test-sdk
cd test-sdk
npm init -y
npm install /path/to/context-interceptor-sdk/context-interceptor-sdk-0.1.0.tgz

# 4. Create test file
cat > test.ts << 'EOF'
import { initContextInterceptor } from '@context-interceptor/sdk';
console.log('SDK imported successfully!');
EOF

npx tsx test.ts
```

## 🐛 Common Issues

### "Package not found"
- Ensure you're logged in: `npm whoami`
- Check package name is available: `npm view @context-interceptor/sdk`

### "403 Forbidden"
- Verify you have publish rights for the scope
- For scoped packages (@context-interceptor/sdk), use `--access public`

### "Files not included"
- Check `.npmignore` and `files` in `package.json`
- Use `npm pack --dry-run` to preview

## 📈 Monitoring

After publishing:
- Check npm package page: https://www.npmjs.com/package/@context-interceptor/sdk
- Monitor download stats
- Watch for issues: https://github.com/YOUR-USERNAME/context-interceptor-sdk/issues

## 🔄 Update Process

For future releases:

```bash
# 1. Make changes
# 2. Update CHANGELOG.md
# 3. Bump version
npm version patch|minor|major

# 4. Build and test
npm run typecheck
npm run build

# 5. Publish
npm publish

# 6. Tag and push
git push origin main --tags
```

## ✨ Success!

Once published, users can install with:

```bash
npm install @context-interceptor/sdk
```

And start using in 2 lines:

```typescript
import { initContextInterceptor, getOpenAIFetch } from '@context-interceptor/sdk';

initContextInterceptor({ /* config */ });
const openai = new OpenAI({ fetch: getOpenAIFetch() });
```

