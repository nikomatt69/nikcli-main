#!/usr/bin/env tsx

import dotenv from 'dotenv'
import axios from 'axios'

// Load environment variables
dotenv.config({ path: '.env.production' })

async function testDiscordNotification() {
  console.log('🧪 Testing Discord Notification...\n')

  const webhookUrl = process.env.DISCORD_WEBHOOK_URL
  const enabled = process.env.DISCORD_TASK_NOTIFICATIONS

  console.log('Configuration:')
  console.log(`  DISCORD_TASK_NOTIFICATIONS: ${enabled}`)
  console.log(`  DISCORD_WEBHOOK_URL: ${webhookUrl ? webhookUrl.substring(0, 60) + '...' : 'NOT SET'}`)
  console.log()

  if (!webhookUrl) {
    console.error('❌ Error: DISCORD_WEBHOOK_URL is not set in .env.production')
    process.exit(1)
  }

  const testMessage = {
    embeds: [
      {
        title: '🧪 Test Notification from NikCLI',
        color: 0x00ff00,
        fields: [
          {
            name: '📝 Message',
            value: 'This is a test notification to verify Discord integration',
            inline: false,
          },
          {
            name: '🤖 Status',
            value: 'Testing notification system',
            inline: true,
          },
          {
            name: '⏱️ Timestamp',
            value: new Date().toLocaleString(),
            inline: true,
          },
        ],
        footer: {
          text: 'NikCLI Test',
        },
        timestamp: new Date().toISOString(),
      },
    ],
  }

  try {
    console.log('📤 Sending test notification to Discord...')
    const response = await axios.post(webhookUrl, testMessage, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    })

    console.log(`✅ Success! Discord notification sent (status: ${response.status})`)
    console.log('✓ Check your Discord channel for the test message')
  } catch (error: any) {
    console.error('❌ Error sending Discord notification:')
    console.error(`  Message: ${error.message}`)

    if (error.response) {
      console.error(`  Status: ${error.response.status}`)
      console.error(`  Data:`, error.response.data)
    }

    if (error.code === 'ECONNABORTED') {
      console.error('  Reason: Request timeout')
    }

    process.exit(1)
  }
}

testDiscordNotification()
