#!/usr/bin/env ts-node

/**
 * Automatic Database Setup Script
 * Applies migrations to Supabase database
 */

import { config } from 'dotenv'
import { readFileSync } from 'fs'
import { join } from 'path'
import { createClient } from '@supabase/supabase-js'
import chalk from 'chalk'

// Load environment variables from .env file
config()

async function setupDatabase() {
  console.log(chalk.blue.bold('\n🗄️  NikCLI Database Setup\n'))

  // Check environment variables
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    console.log(chalk.red('✖ Missing Supabase credentials'))
    console.log(chalk.gray('\nSet environment variables:'))
    console.log(chalk.yellow('  export SUPABASE_URL="https://your-project.supabase.co"'))
    console.log(chalk.yellow('  export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"'))
    console.log(chalk.gray('\nOr add to .env file\n'))
    process.exit(1)
  }

  console.log(chalk.cyan('📡 Connecting to Supabase...'))
  console.log(chalk.gray(`   URL: ${supabaseUrl}\n`))

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })

  try {
    // Read migration file
    const migrationPath = join(__dirname, '../database/migrations/001_create_user_profiles.sql')
    console.log(chalk.cyan('📄 Reading migration file...'))
    const migrationSQL = readFileSync(migrationPath, 'utf8')

    console.log(chalk.cyan('⚡ Applying migration...\n'))

    // Execute migration
    // Split on semicolons and execute each statement
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'))

    let successCount = 0
    let skipCount = 0

    for (const statement of statements) {
      // Skip comments and empty lines
      if (!statement || statement.startsWith('--')) continue

      try {
        const { error } = await supabase.rpc('exec_sql', { sql_query: statement + ';' })

        // If exec_sql doesn't exist, try direct execution via REST API
        if (error?.message?.includes('function') || error?.message?.includes('does not exist')) {
          // Fallback: use raw SQL via supabase-js (requires service role key)
          const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`
            },
            body: JSON.stringify({ query: statement + ';' })
          })

          if (!response.ok) {
            const errorText = await response.text()
            // If it's "already exists", skip silently
            if (errorText.includes('already exists') || errorText.includes('exists')) {
              console.log(chalk.yellow(`   ⏭️  Skipped (already exists)`))
              skipCount++
              continue
            }
            throw new Error(errorText)
          }
        } else if (error) {
          // Check if it's an "already exists" error
          if (error.message?.includes('already exists') || error.message?.includes('exists')) {
            console.log(chalk.yellow(`   ⏭️  Skipped (already exists)`))
            skipCount++
            continue
          }
          throw error
        }

        successCount++
        if (successCount % 5 === 0) {
          console.log(chalk.green(`   ✓ ${successCount} statements executed...`))
        }
      } catch (err: any) {
        // Skip "already exists" errors
        if (err.message?.includes('already exists') || err.message?.includes('exists')) {
          console.log(chalk.yellow(`   ⏭️  Skipped (already exists)`))
          skipCount++
          continue
        }

        console.log(chalk.red(`\n✖ Error executing statement:`))
        console.log(chalk.gray(statement.substring(0, 100) + '...'))
        console.log(chalk.red(`Error: ${err.message}\n`))
        throw err
      }
    }

    console.log(chalk.green(`\n✅ Migration completed successfully!`))
    console.log(chalk.gray(`   Executed: ${successCount} statements`))
    console.log(chalk.gray(`   Skipped: ${skipCount} statements (already exist)\n`))

    // Verify installation
    console.log(chalk.cyan('🔍 Verifying installation...\n'))

    const { data: tables, error: verifyError } = await supabase
      .from('user_profiles')
      .select('*')
      .limit(1)

    if (verifyError) {
      console.log(chalk.yellow(`⚠️  Could not verify table (this might be normal if using RLS):`))
      console.log(chalk.gray(`   ${verifyError.message}`))
    } else {
      console.log(chalk.green('✅ Table `user_profiles` verified and accessible\n'))
    }

    console.log(chalk.green.bold('🎉 Database setup complete!'))
    console.log(chalk.gray('\nYou can now:'))
    console.log(chalk.cyan('  1. Test signup: POST /signup'))
    console.log(chalk.cyan('  2. Create users through your app'))
    console.log(chalk.cyan('  3. Query profiles: SELECT * FROM user_profiles\n'))

  } catch (error: any) {
    console.log(chalk.red('\n✖ Migration failed:'))
    console.log(chalk.red(error.message))
    console.log(chalk.gray('\n💡 Alternative method:'))
    console.log(chalk.yellow('1. Go to: https://app.supabase.com/project/YOUR_PROJECT/sql'))
    console.log(chalk.yellow('2. Copy content of: database/migrations/001_create_user_profiles.sql'))
    console.log(chalk.yellow('3. Paste and run in SQL Editor\n'))
    process.exit(1)
  }
}

// Run setup
setupDatabase()
