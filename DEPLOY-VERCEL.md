# 🚀 NikCLI Vercel Deployment Guide

## Prerequisites

- Vercel account
- Supabase project configured
- LemonSqueezy account with product setup
- OpenRouter account with admin API access

---

## 📦 1. Deploy Web Frontend

### Navigate to Web Directory
```bash
cd src/cli/background-agents/web
```

### Install Dependencies
```bash
npm install
```

### Deploy to Vercel
```bash
vercel --prod
```

### Configure Custom Domain (Optional)
```bash
vercel domains add your-domain.com
```

---

## 🔧 2. Configure Environment Variables on Vercel

### Required Environment Variables

Add these via Vercel Dashboard or CLI:

#### Supabase
```bash
vercel env add SUPABASE_URL production
# Value: https://bopgyibjrbwaynegbska.supabase.co

vercel env add SUPABASE_SERVICE_ROLE_KEY production
# Value: Your Supabase service_role JWT

vercel env add SUPABASE_ANON_KEY production
# Value: Your Supabase anon key
```

#### LemonSqueezy
```bash
vercel env add LEMONSQUEEZY_WEBHOOK_SECRET production
# Value: Your LemonSqueezy webhook secret

vercel env add LEMONSQUEEZY_PAYMENT_LINK production
# Value: https://nikcli.lemonsqueezy.com/buy/fc90f08c-f1a5-43ac-9275-7739a61ed427
```

#### OpenRouter
```bash
vercel env add OPENROUTER_ADMIN_API_KEY production
# Value: Your OpenRouter admin API key for provisioning

vercel env add OPENROUTER_API_KEY production
# Value: Your OpenRouter standard API key
```

#### Optional: GitHub
```bash
vercel env add GITHUB_TOKEN production
vercel env add GITHUB_CLIENT_ID production
vercel env add GITHUB_CLIENT_SECRET production
```

---

## 🔗 3. Configure LemonSqueezy Webhook

### Setup Webhook in LemonSqueezy Dashboard

1. Go to LemonSqueezy Settings → Webhooks
2. Add new webhook:
   - **URL**: `https://your-domain.vercel.app/api/subscription/webhook`
   - **Events**:
     - `order_created`
     - `subscription_created`
     - `subscription_updated`
     - `subscription_cancelled`
     - `subscription_expired`
     - `subscription_payment_success`
     - `subscription_payment_failed`
   - **Secret**: Copy the webhook secret to `LEMONSQUEEZY_WEBHOOK_SECRET`

3. Test webhook:
```bash
curl -X POST https://your-domain.vercel.app/api/subscription/webhook \
  -H "Content-Type: application/json" \
  -H "X-Signature: test" \
  -d '{}'
```

---

## 📊 4. Verify Deployment

### Test API Endpoints

#### Health Check
```bash
curl https://your-domain.vercel.app/api/health
```

#### Subscription Status
```bash
curl "https://your-domain.vercel.app/api/subscription/status?userId=<test-user-id>"
```

#### OpenRouter Provisioning
```bash
curl -X POST https://your-domain.vercel.app/api/openrouter/provision \
  -H "Content-Type: application/json" \
  -d '{"userId": "<test-user-id>"}'
```

---

## 🖥️ 5. Configure CLI to Use Vercel API

### Set API URL in CLI Environment

Add to your local `.env`:
```bash
NIKCLI_API_URL=https://your-domain.vercel.app
```

Or export as environment variable:
```bash
export NIKCLI_API_URL=https://your-domain.vercel.app
```

### Test CLI Integration
```bash
npm run dev
# Sign in with your Supabase account
# Check subscription status with /status command
```

---

## 🔐 6. Security Checklist

- [ ] `SUPABASE_SERVICE_ROLE_KEY` is set (not ANON_KEY for API endpoints)
- [ ] `LEMONSQUEEZY_WEBHOOK_SECRET` matches LemonSqueezy dashboard
- [ ] `OPENROUTER_ADMIN_API_KEY` has provisioning permissions
- [ ] Webhook signature verification is enabled
- [ ] API endpoints use proper authentication
- [ ] Environment variables are set to "Production" environment in Vercel

---

## 📝 7. Subscription Flow End-to-End

### User Journey

1. **User signs up** via CLI or web
   - Creates account in Supabase
   - Default tier: `free`

2. **User clicks "Upgrade to Pro"** in web UI
   - Opens LemonSqueezy checkout with `user_id` in custom data
   - Completes payment

3. **LemonSqueezy sends webhook** to `/api/subscription/webhook`
   - Webhook validates signature
   - Provisions OpenRouter API key via `/api/openrouter/provision`
   - Updates user profile in Supabase:
     - `subscription_tier: 'pro'`
     - `openrouter_api_key: '<provisioned-key>'`
     - `lemonsqueezy_subscription_id: '<sub-id>'`

4. **CLI loads Pro features**
   - Calls `/api/subscription/status?userId=...`
   - Loads OpenRouter API key from response
   - Enables premium AI models

---

## 🐛 8. Troubleshooting

### Webhook Not Receiving Events
- Verify webhook URL is correct in LemonSqueezy
- Check Vercel function logs: `vercel logs`
- Test signature validation manually

### OpenRouter Provisioning Fails
- Verify `OPENROUTER_ADMIN_API_KEY` has correct permissions
- Check Vercel logs for detailed error messages
- Ensure user is Pro tier before provisioning

### CLI Can't Connect to API
- Verify `NIKCLI_API_URL` is set correctly
- Check if API endpoints return 200 OK
- Ensure CORS is configured if accessing from different domain

---

## 📚 9. Additional Resources

- [Vercel Documentation](https://vercel.com/docs)
- [LemonSqueezy Webhooks](https://docs.lemonsqueezy.com/guides/developer-guide/webhooks)
- [Supabase API Reference](https://supabase.com/docs/reference)
- [OpenRouter API Docs](https://openrouter.ai/docs)

---

## 🎯 Quick Deploy Checklist

- [ ] Web frontend deployed to Vercel
- [ ] All environment variables configured
- [ ] LemonSqueezy webhook configured and tested
- [ ] Supabase database schema created (user_profiles, subscription_events)
- [ ] API endpoints tested (health, status, provision)
- [ ] CLI configured with API URL
- [ ] End-to-end subscription flow tested
- [ ] Security audit complete

---

**Last Updated**: January 2025
**Version**: 1.0.0
