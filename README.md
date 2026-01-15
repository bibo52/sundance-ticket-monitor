# Sundance Ticket Monitor

Automatically monitors your Sundance Film Festival schedule for ticket availability and auto-purchases tickets when they become available.

## Features

- **Continuous Monitoring** - Checks your schedule every 60 seconds
- **Smart Detection** - Detects when "Sold out" changes to "Order tickets"
- **Auto-Purchase** - Automatically buys tickets using your saved payment method
- **Email Notifications** - Get alerts via Resend
- **Deployable** - Run 24/7 on Railway (free tier)

## Prerequisites

- A Sundance account with **a saved payment method**
- Films added to your Sundance schedule
- [Bun](https://bun.sh) installed locally (for testing)
- A [Resend](https://resend.com) account (free) for email alerts

## Quick Start (Local Testing)

```bash
git clone https://github.com/bibo52/sundance-ticket-monitor.git
cd sundance-ticket-monitor
bun install
bunx playwright install chromium
```

### Export Your Cookies

1. Log in to [festival.sundance.org](https://festival.sundance.org)
2. Go to: https://festival.sundance.org/my-festival/my-schedule
3. Open DevTools (`Cmd+Option+I` / `F12`) → Console tab
4. Paste and run:

```javascript
copy(JSON.stringify(
  document.cookie.split('; ').map(c => {
    const [name, value] = c.split('=');
    return { name, value, domain: '.sundance.org', path: '/', secure: true, httpOnly: false, sameSite: 'Lax' };
  }), null, 2
))
```

5. Create `cookies.json` and paste the copied content

### Test It

```bash
bun run check    # See current ticket status
```

## Deploy to Railway (Recommended)

Railway's free tier ($5/month credit) is perfect for this.

### 1. Fork & Clone

Fork this repo, then:

```bash
git clone https://github.com/YOUR_USERNAME/sundance-ticket-monitor.git
cd sundance-ticket-monitor
```

### 2. Set Up Resend (Email Notifications)

1. Create free account at https://resend.com
2. Get your API key
3. Add a domain or use their test domain

### 3. Deploy to Railway

1. Go to [railway.app](https://railway.app) and sign up
2. Click **New Project** → **Deploy from GitHub repo**
3. Select your forked repo
4. Add these **Environment Variables**:

| Variable | Value |
|----------|-------|
| `RESEND_API_KEY` | `re_xxxxx` (from Resend) |
| `RESEND_FROM_EMAIL` | `sundance@yourdomain.com` |
| `RESEND_TO_EMAIL` | `your@email.com` |

5. Create your `cookies.json` content as a **file** in the deployment, or set `COOKIES_JSON` env var with the JSON string

### 4. Configure Auto-Purchase

Create `auto-purchase.json` with films to auto-buy:

```json
{
  "enabled": true,
  "films": [
    { "title": "Film Name Here", "autoPurchase": true },
    { "title": "Another Film", "autoPurchase": true }
  ],
  "settings": {
    "ticketQuantity": 1
  }
}
```

**Important:** Your Sundance account must have a saved payment method. The bot will:
1. Click "Order tickets"
2. Click "Buy additional tickets..."
3. Check "I agree to the Purchasing Terms"
4. Click "COMPLETE PURCHASE"

## How It Works

1. Loads your Sundance session cookies
2. Checks your schedule page every 60 seconds
3. When a film changes from "Sold out" to "Order tickets":
   - Sends you an email notification
   - If `autoPurchase: true`, attempts to buy the ticket
4. Emails you the result (success/failure)

## Cookie Refresh

Sundance cookies expire every 24-48 hours. You'll need to:
1. Log in to Sundance in your browser
2. Export fresh cookies
3. Update `cookies.json` on your deployment

## Commands

```bash
bun run monitor              # Start continuous monitoring
bun run check                # One-time status check
bun run test                 # Test cookie authentication
bun run test-checkout "Film" # Test checkout flow (visible browser)
```

## Costs

| Service | Cost |
|---------|------|
| Railway | Free ($5/month credit covers this) |
| Resend | Free (100 emails/day) |
| **Total** | **$0** |

## Troubleshooting

**"cookies.json not found"** - Create the file with exported cookies

**"Timeout waiting for schedule"** - Sundance site is slow, retry

**"Cookies expired"** - Re-export fresh cookies (they expire in 24-48h)

**"Purchase failed"** - Check that you have a saved payment method on Sundance

## Security

These files contain sensitive data and are gitignored:
- `cookies.json` - Your session
- `.env` - API keys
- `auto-purchase.json` - Your film preferences

Never commit these files.

## License

MIT
