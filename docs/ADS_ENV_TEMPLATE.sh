#!/bin/bash
# NikCLI Advertising System - Environment Variables Template
# Copy this to your .env file and fill in the values

# ============================================================================
# STRIPE CONFIGURATION (Required for ads system)
# ============================================================================

# Stripe Secret Key (for payment processing)
# Get from: https://dashboard.stripe.com/apikeys
STRIPE_SECRET_KEY=sk_live_your_secret_key_here

# Stripe Publishable Key (optional, for frontend if you add web UI)
# Get from: https://dashboard.stripe.com/apikeys
STRIPE_PUBLISHABLE_KEY=pk_live_your_publishable_key_here

# Optional: Callback URL for Stripe payment success
# Used to redirect users after successful payment
NIKCLI_CALLBACK_URL=https://yourdomain.com

# ============================================================================
# SUPABASE CONFIGURATION (Required for ads database)
# ============================================================================

# These should already be in your .env, but ensure they're set
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# ============================================================================
# OPTIONAL: ADS FEATURE FLAGS
# ============================================================================

# Enable/disable ads system globally
NIKCLI_ADS_ENABLED=true

# Test mode (use test Stripe API keys)
NIKCLI_ADS_TEST_MODE=false

# Default CPM rate (cost per 1000 impressions)
NIKCLI_ADS_DEFAULT_CPM=3.00

# Default frequency between ads (minutes)
NIKCLI_ADS_DEFAULT_FREQUENCY_MINUTES=5

# ============================================================================
# SETUP INSTRUCTIONS
# ============================================================================
#
# 1. Create a Stripe Account:
#    - Go to https://stripe.com
#    - Sign up for a Stripe account
#    - Go to Dashboard → API Keys
#    - Copy the Secret Key (sk_live_...) and Publishable Key (pk_live_...)
#
# 2. Switch to Test Mode (for development):
#    - In the top-left corner, toggle "View test data"
#    - Use test keys from the API Keys page
#    - Test card: 4242 4242 4242 4242 (expires 12/25, any CVV)
#
# 3. Set up Supabase Tables:
#    - If not already done, run: docs/SUPABASE_ADS_SCHEMA.sql
#    - Go to Supabase Dashboard → SQL Editor
#    - Create new query, paste entire schema file
#    - Execute and verify tables created
#
# 4. Add to your .env file:
#    - Copy the lines below to your .env file
#    - Replace with your actual API keys
#    - Keep .env file private (add to .gitignore)
#
# 5. Verify Setup:
#    - Run: npm run build
#    - Look for no TypeScript errors in ads services
#    - Test: /ads status command in CLI
#
# ============================================================================
# TESTING WITH STRIPE TEST DATA
# ============================================================================
#
# Use these test cards in development (with test API keys):
#
#   Successful payment:      4242 4242 4242 4242
#   Card declined:           4000 0000 0000 0002
#   Expired card:            4000 0000 0000 0069
#   3D Secure required:      4000 0025 0000 3155
#   Incorrect CVC:           4000 0000 0000 0127
#   Address mismatch:        4000 0000 0000 0010
#
#   Expiry: Any future date (e.g., 12/25)
#   CVC: Any 3 digits (e.g., 123)
#   Postal Code: Any valid format
#
# Check payments in Stripe Dashboard → Payments
#
# ============================================================================
# WEBHOOK SETUP (Optional, for production)
# ============================================================================
#
# For production, set up Stripe webhooks to handle payment events:
#
# 1. Go to https://dashboard.stripe.com/webhooks
# 2. Click "Add endpoint"
# 3. Enter endpoint URL: https://yourdomain.com/api/webhooks/stripe
# 4. Select events to listen to:
#    - payment_intent.succeeded
#    - payment_intent.payment_failed
#    - charge.refunded
# 5. Copy signing secret and add to .env:
#    STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
#
# Then in your API handler, verify webhook signature:
#
#    const sig = req.headers['stripe-signature']
#    const event = stripe.webhooks.constructEvent(body, sig, signingSecret)
#
# ============================================================================
# SUPABASE RLS POLICIES
# ============================================================================
#
# The schema file includes Row-Level Security policies:
#
# - Advertisers can only view/edit their own campaigns
# - Users can only view their own impressions
# - Public can view active campaigns (for display)
# - Service role can insert impressions (backend)
#
# These are automatically enforced by Supabase
#
# ============================================================================
# TROUBLESHOOTING
# ============================================================================
#
# Issue: "Stripe API key is missing"
#   → Check STRIPE_SECRET_KEY is set and correct format (sk_live_ or sk_test_)
#
# Issue: "Supabase connection failed"
#   → Check SUPABASE_URL and SUPABASE_ANON_KEY
#   → Verify Supabase project is active
#   → Check ad_campaigns table exists
#
# Issue: "Payment failed - Invalid amount"
#   → Check CPM calculation: (impressions / 1000) * CPM_RATE
#   → Ensure impressions >= 1000
#
# Issue: "No active campaigns available"
#   → Check ad_campaigns table has rows with status='active'
#   → Check end_date is in the future
#   → Check impressions_served < budget_impressions
#
# ============================================================================
