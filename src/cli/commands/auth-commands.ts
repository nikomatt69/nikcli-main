import chalk from 'chalk'
import boxen from 'boxen'
import { authProvider } from '../providers/supabase/auth-provider'

/**
 * AuthCommands - Handles authentication commands
 * Extracted from lines 14952-18610 in nik-cli.ts
 */
export class AuthCommands {
  private nikCLI: any

  constructor(nikCLI: any) {
    this.nikCLI = nikCLI
  }

  async handleAuthCommands(args: string[]): Promise<void> {
    if (args.length === 0) {
      // Show current auth status
      const currentUser = authProvider.getCurrentUser()
      const profile = authProvider.getCurrentProfile()

      if (currentUser) {
        console.log(chalk.green('\n🔐 Authentication Status: Signed In'))
        console.log(`   User: ${profile?.email || profile?.username || currentUser.id}`)
        console.log(`   Subscription: ${profile?.subscription_tier || 'Unknown'}`)
        console.log(`   Authenticated: ${authProvider.isAuthenticated() ? 'Yes' : 'Session Expired'}`)

        if (profile) {
          console.log('\n   Usage This Month:')
          console.log(`   Sessions: ${profile.usage.sessionsThisMonth}/${profile.quotas.sessionsPerMonth}`)
          console.log(`   Tokens: ${profile.usage.tokensThisMonth}/${profile.quotas.tokensPerMonth}`)
          console.log(`   API Calls (hour): ${profile.usage.apiCallsThisHour}/${profile.quotas.apiCallsPerHour}`)
        }
      } else {
        console.log(chalk.gray('🔐 Authentication Status: Not signed in'))
        console.log(chalk.dim('   Use /auth signin to authenticate'))
      }
      return
    }

    const subCmd = args[0]
    switch (subCmd) {
      case 'signin':
      case 'login':
        await this.handleAuthSignIn()
        break
      case 'signup':
      case 'register':
        await this.handleAuthSignUp()
        break
      case 'signout':
      case 'logout':
        await this.handleAuthSignOut()
        break
      case 'profile':
        await this.showAuthProfile()
        break
      case 'quotas':
        await this.showAuthQuotas()
        break
      default:
        this.nikCLI.printPanel(
          boxen('Usage: /auth [signin|signup|signout|profile|quotas]', {
            title: 'Auth Command',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'yellow',
          }),
          'general'
        )
    }
  }

  async handleAuthSignIn(): Promise<void> {
    const rl = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    try {
      const email = await new Promise<string>((resolve) => rl.question('Email: ', resolve))

      const password = await new Promise<string>((resolve) => rl.question('Password: ', resolve))

      if (email && password) {
        console.log(chalk.blue('⚡︎ Signing in...'))
        const result = await authProvider.signIn(email, password, { rememberMe: true })

        if (result) {
          console.log(chalk.green(`✓ Welcome back, ${result.profile.email}!`))

          // Set user for enhanced session manager
          this.nikCLI.enhancedSessionManager.setCurrentUser(result.session.user.id)
        } else {
          console.log(chalk.red('❌ Sign in failed - invalid credentials'))
        }
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Sign in error: ${error.message}`))
    } finally {
      rl.close()
    }
  }

  async handleAuthSignUp(): Promise<void> {
    console.log(chalk.blue('📝 Create New Account'))
    console.log(chalk.gray('─'.repeat(40)))

    try {
      // Dynamic import for auth provider
      const { authProvider } = await import('../providers/supabase/auth-provider')

      if (!authProvider.getConfig().enabled) {
        console.log(chalk.yellow('⚠️ Authentication is not enabled'))
        console.log(chalk.dim('Enable Supabase authentication in configuration'))
        return
      }

      if (authProvider.isAuthenticated()) {
        const profile = authProvider.getCurrentProfile()
        console.log(chalk.yellow(`⚠️ Already signed in as ${profile?.email || profile?.username}`))
        console.log(chalk.dim('Sign out first to create a new account'))
        return
      }

      // Collect user information
      const email = await this.nikCLI.promptInput('Email address: ')
      if (!email || !this.nikCLI.isValidEmail(email)) {
        console.log(chalk.red('❌ Invalid email address'))
        return
      }

      const password = await this.nikCLI.promptInput('Password (min 8 characters): ', true)
      if (!password || password.length < 8) {
        console.log(chalk.red('❌ Password must be at least 8 characters'))
        return
      }

      const confirmPassword = await this.nikCLI.promptInput('Confirm password: ', true)
      if (password !== confirmPassword) {
        console.log(chalk.red('❌ Passwords do not match'))
        return
      }

      // Optional information
      const username = await this.nikCLI.promptInput('Username (optional): ')
      const fullName = await this.nikCLI.promptInput('Full name (optional): ')

      // Create account
      console.log(chalk.blue('⚡︎ Creating account...'))

      const result = await authProvider.signUp(email, password, {
        username: username || undefined,
        fullName: fullName || undefined,
        metadata: {
          source: 'nikcli',
          version: '0.3.0',
          created_at: new Date().toISOString(),
        },
      })

      if (result) {
        console.log(chalk.green('✓ Account created successfully!'))
        console.log(chalk.dim('You are now signed in and can use all NikCLI features'))

        // Display welcome info
        const { profile } = result
        console.log()

        console.log(`   Email: ${profile.email}`)
        console.log(`   Subscription: ${profile.subscription_tier}`)
        console.log(`   Monthly Sessions: ${profile.quotas.sessionsPerMonth}`)
        console.log(`   Monthly Tokens: ${profile.quotas.tokensPerMonth}`)

        // Record usage
        await authProvider.recordUsage('sessions', 1)
      } else {
        console.log(chalk.red('❌ Account creation failed'))
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Sign up failed: ${error.message}`))
      if (error.message.includes('already exists') || error.message.includes('already registered')) {
        console.log(chalk.dim('Try signing in instead: /auth signin'))
      } else if (error.message.includes('rate limit')) {
        console.log(chalk.dim('Too many attempts. Please try again later.'))
      }
    }
  }

  async handleAuthSignOut(): Promise<void> {
    // Implementation for sign out
    try {
      await authProvider.signOut()
      console.log(chalk.green('👋 Signed out successfully'))
    } catch (error: any) {
      console.log(chalk.red(`❌ Sign out error: ${error.message}`))
    }
  }

  async showAuthProfile(): Promise<void> {
    try {
      // Dynamic import for auth provider
      const { authProvider } = await import('../providers/supabase/auth-provider')

      if (!authProvider.isAuthenticated()) {
        const panel = boxen(
          [
            chalk.yellow('⚠️ Not signed in'),
            '',
            chalk.dim('Use /signin or /auth signin to authenticate and load your profile.'),
          ].join('\n'),
          {
            title: 'Profile',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'yellow',
          }
        )
        this.nikCLI.printPanel(panel, 'general')
        return
      }

      const profile = authProvider.getCurrentProfile()
      const user = authProvider.getCurrentUser()

      if (!profile || !user) {
        const panel = boxen(
          chalk.red('❌ Could not load profile from authentication provider'),
          {
            title: 'Profile Error',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'red',
          }
        )
        this.nikCLI.printPanel(panel, 'general')
        return
      }

      const lines: string[] = []

      lines.push(chalk.bold('📋 Basic Information'))
      lines.push(`  Email: ${chalk.cyan(profile.email || 'Not provided')}`)
      lines.push(`  Username: ${chalk.cyan(profile.username || 'Not set')}`)
      lines.push(`  Full Name: ${chalk.cyan(profile.full_name || 'Not provided')}`)
      lines.push(`  User ID: ${chalk.dim(user.id)}`)
      lines.push('')

      const tierColor =
        profile.subscription_tier === 'free' ? chalk.yellow : profile.subscription_tier === 'pro' ? chalk.blue : chalk.green
      lines.push(chalk.bold('💎 Subscription'))
      lines.push(`  Tier: ${tierColor(profile.subscription_tier.toUpperCase())}`)
      lines.push('')

      lines.push(chalk.bold('🎛 Preferences'))
      lines.push(`  Theme: ${chalk.cyan(profile.preferences.theme)}`)
      lines.push(`  Language: ${chalk.cyan(profile.preferences.language)}`)
      lines.push(
        `  Notifications: ${profile.preferences.notifications ? chalk.green('✓ On') : chalk.gray('❌ Off')
        }`
      )
      lines.push(
        `  Analytics: ${profile.preferences.analytics ? chalk.green('✓ On') : chalk.gray('❌ Off')}`
      )
      lines.push('')

      lines.push(chalk.bold('📅 Account Information'))
      lines.push(`  Account Created: ${new Date(user.created_at).toLocaleString()}`)
      lines.push(
        `  Last Sign In: ${(user as any).last_sign_in_at
          ? new Date((user as any).last_sign_in_at).toLocaleString()
          : 'Never'
        }`
      )
      lines.push(
        `  Email Verified: ${(user as any).email_confirmed_at ? chalk.green('✓ Yes') : chalk.yellow('⚠️ Pending')
        }`
      )

      // Quotas & usage (compact summary, full details remain under /auth quotas)
      if (profile.quotas && profile.usage) {
        lines.push('')
        lines.push(chalk.bold('📊 Usage (This Month)'))
        lines.push(
          `  Sessions: ${chalk.cyan(
            `${profile.usage.sessionsThisMonth}/${profile.quotas.sessionsPerMonth}`
          )}`
        )
        lines.push(
          `  Tokens: ${chalk.cyan(
            `${profile.usage.tokensThisMonth}/${profile.quotas.tokensPerMonth}`
          )}`
        )
        lines.push(
          `  API Calls (hour): ${chalk.cyan(
            `${profile.usage.apiCallsThisHour}/${profile.quotas.apiCallsPerHour}`
          )}`
        )
      }

      const panel = boxen(lines.join('\n'), {
        title: 'User Profile',
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
        width: Math.min(120, (process.stdout.columns || 100) - 4),
      })

      this.nikCLI.printPanel(panel, 'general')
    } catch (error: any) {
      const panel = boxen(`Failed to load profile: ${error.message}`, {
        title: 'Profile Error',
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'red',
      })
      this.nikCLI.printPanel(panel, 'general')
    }
  }

  async showAuthQuotas(): Promise<void> {
    try {
      // Dynamic import for auth provider
      const { authProvider } = await import('../providers/supabase/auth-provider')

      if (!authProvider.isAuthenticated()) {
        console.log(chalk.yellow('⚠️ Not signed in'))
        console.log(chalk.dim('Sign in with: /auth signin'))
        return
      }

      const profile = authProvider.getCurrentProfile()
      if (!profile) {
        console.log(chalk.red('❌ Could not load profile'))
        return
      }

      console.log(chalk.blue('📊 Usage Quotas & Limits'))
      console.log(chalk.gray('─'.repeat(50)))

      // Subscription tier info
      const tierColor =
        profile.subscription_tier === 'free' ? 'yellow' : profile.subscription_tier === 'pro' ? 'blue' : 'green'
      console.log(`   Subscription: ${chalk[tierColor].bold(profile.subscription_tier.toUpperCase())}`)
      console.log()

      // Sessions quota
      const sessionQuota = authProvider.checkQuota('sessions')
      const sessionPercent = Math.round((sessionQuota.used / sessionQuota.limit) * 100)
      const sessionColor = sessionPercent > 90 ? 'red' : sessionPercent > 70 ? 'yellow' : 'green'

      console.log(chalk.bold('💬 Chat Sessions (Monthly)'))
      console.log(`   Used: ${chalk[sessionColor](sessionQuota.used.toString())} / ${sessionQuota.limit}`)
      console.log(`   Remaining: ${chalk.cyan((sessionQuota.limit - sessionQuota.used).toString())}`)
      console.log(`   Usage: ${chalk[sessionColor](`${sessionPercent}%`)}`)
      if (sessionQuota.resetTime) {
        console.log(`   Resets: ${chalk.dim(sessionQuota.resetTime.toLocaleDateString())}`)
      }
      console.log()

      // Tokens quota
      const tokenQuota = authProvider.checkQuota('tokens')
      const tokenPercent = Math.round((tokenQuota.used / tokenQuota.limit) * 100)
      const tokenColor = tokenPercent > 90 ? 'red' : tokenPercent > 70 ? 'yellow' : 'green'

      console.log(chalk.bold('🎯 AI Tokens (Monthly)'))
      console.log(
        `   Used: ${chalk[tokenColor](tokenQuota.used.toLocaleString())} / ${tokenQuota.limit.toLocaleString()}`
      )
      console.log(`   Remaining: ${chalk.cyan((tokenQuota.limit - tokenQuota.used).toLocaleString())}`)
      console.log(`   Usage: ${chalk[tokenColor](`${tokenPercent}%`)}`)
      if (tokenQuota.resetTime) {
        console.log(`   Resets: ${chalk.dim(tokenQuota.resetTime.toLocaleDateString())}`)
      }
      console.log()

      // API calls quota
      const apiQuota = authProvider.checkQuota('apiCalls')
      const apiPercent = Math.round((apiQuota.used / apiQuota.limit) * 100)
      const apiColor = apiPercent > 90 ? 'red' : apiPercent > 70 ? 'yellow' : 'green'

      console.log(chalk.bold('⚡ API Calls (Hourly)'))
      console.log(`   Used: ${chalk[apiColor](apiQuota.used.toString())} / ${apiQuota.limit}`)
      console.log(`   Remaining: ${chalk.cyan((apiQuota.limit - apiQuota.used).toString())}`)
      console.log(`   Usage: ${chalk[apiColor](`${apiPercent}%`)}`)
      if (apiQuota.resetTime) {
        console.log(`   Resets: ${chalk.dim(apiQuota.resetTime.toLocaleString())}`)
      }
      console.log()

      // Upgrade info for free users
      if (profile.subscription_tier === 'free') {
        console.log(chalk.bold.yellow('💡 Upgrade Benefits'))
        console.log(chalk.dim('   PRO: 1,000 sessions/month, 100k tokens/month, 300 API calls/hour'))
        console.log(chalk.dim('   ENTERPRISE: Unlimited usage, priority support, custom features'))
      }

      // Warnings
      const warnings: string[] = []
      if (!sessionQuota.allowed) warnings.push('Sessions limit reached')
      if (!tokenQuota.allowed) warnings.push('Token limit reached')
      if (!apiQuota.allowed) warnings.push('API rate limit reached')

      if (warnings.length > 0) {
        console.log(chalk.bold.red('⚠️ Quota Warnings'))
        warnings.forEach((warning) => {
          console.log(chalk.red(`   • ${warning}`))
        })
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to load quotas: ${error.message}`))
    }
  }
}
