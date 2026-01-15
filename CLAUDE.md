# Sundance Ticket Monitor - Project Context

This document provides context for AI assistants working on this project.

## Project Overview

An automated ticket monitoring system for the Sundance Film Festival that:
- Monitors a user's festival schedule page for ticket availability changes
- Sends notifications when sold-out tickets become available
- Uses Playwright browser automation to check the schedule page periodically
- Supports email notifications via Resend

## Technical Stack

- **Runtime**: Bun (JavaScript runtime)
- **Browser Automation**: Playwright (Chromium)
- **Notifications**:
  - macOS system notifications (local)
  - Resend email service (configured in .env)
- **Authentication**: Cookie-based (user exports cookies from logged-in browser session)

## Architecture

### Core Components

1. **src/monitor.js** - Main monitoring loop
   - Loads cookies from `cookies.json`
   - Navigates to schedule page every 60 seconds
   - Extracts ticket information from the page
   - Compares with previous state to detect changes
   - Sends notifications when tickets become available

2. **src/check-once.js** - One-time status check
   - Same detection logic as monitor
   - Runs once and exits
   - Useful for testing and quick status checks

3. **src/test-login.js** - Cookie validation
   - Tests if cookies allow access to schedule page
   - Opens browser to show user they're logged in

4. **src/test-detection.js** - Debug tool
   - Analyzes page structure
   - Shows detailed DOM hierarchy
   - Helps troubleshoot detection issues

### Page Structure (Sundance 2026)

The Sundance schedule page uses **Eventive** as their ticketing platform with a React-based data table:

```
.rdt_TableRow (one per film screening)
├── .rdt_TableCell #1 (Film/Event column)
│   └── .sd_schedule_desc
│       └── .sd_schedule_film_desc
│           ├── h3 (film title)
│           ├── .sd_start_end_date (screening date/time)
│           └── .sd_schedule_sortDesc (venue, badges, etc.)
├── .rdt_TableCell #2 (Status column - not currently used)
└── .rdt_TableCell #3 (Actions column)
    └── button or a.button
        └── "Order tickets" | "Sold out (info)" | "Waitlist"
```

**Key Detection Logic:**
1. Find all `.sd_schedule_film_desc` elements (film descriptions)
2. For each, use `.closest('.rdt_TableRow')` to get the row container
3. Query all `.rdt_TableCell` siblings in that row
4. Search cells for buttons with text matching:
   - "ORDER TICKETS" → AVAILABLE
   - "SOLD OUT" → SOLD_OUT
   - "WAITLIST" → WAITLIST

### State Management

- **ticket-state.json** - Persisted state of all films and their button status
- Compared on each check to detect changes (SOLD_OUT → AVAILABLE)
- Only notifies on NEW availability (not already-available tickets)

### Authentication

Uses exported browser cookies stored in `cookies.json`:
- Must include `eventive-token`, `myEventiveLoginToken`, `STYXKEY_sundanceUser`
- Cookies typically expire after 24-48 hours
- User must refresh cookies periodically

**Cookie Export Instructions:**
Users run this in their browser console while logged into festival.sundance.org:
```javascript
copy(JSON.stringify(
  document.cookie.split('; ').map(c => {
    const [name, value] = c.split('=');
    return { name, value, domain: '.sundance.org', path: '/', secure: true, httpOnly: false, sameSite: 'Lax' };
  }), null, 2
))
```

## Configuration

### Environment Variables (.env)

```bash
# Resend API Configuration (optional - for email notifications)
RESEND_API_KEY=re_xxx
RESEND_FROM_EMAIL=sundance@yourdomain.com
RESEND_TO_EMAIL=yourpersonal@email.com

# Monitoring Configuration (optional)
CHECK_INTERVAL=60000  # Check every 60 seconds (milliseconds)
```

### File Structure

```
sundance-ticket-monitor/
├── .env                    # Environment config (gitignored)
├── .gitignore             # Excludes cookies, state, .env
├── package.json           # Dependencies and scripts
├── README.md              # User-facing documentation
├── CLAUDE.md              # This file - AI assistant context
├── debug-notes.md         # Technical debugging notes
├── cookies.json           # User's session cookies (gitignored)
├── cookies.json.example   # Template for cookies file
├── ticket-state.json      # Cached ticket states (gitignored)
└── src/
    ├── monitor.js         # Main continuous monitoring loop
    ├── check-once.js      # Single check command
    ├── test-login.js      # Cookie validation tool
    └── test-detection.js  # Debug/development tool
```

## Common Tasks

### Adding Features

**Add New Notification Channel:**
1. Update `notifyChanges()` in `src/monitor.js`
2. Add configuration to `.env.example`
3. Update README setup instructions

**Modify Detection Logic:**
1. Update `extractTicketInfo()` in `src/monitor.js`
2. Test with `bun run test-detect` (shows detailed DOM analysis)
3. Update same function in `src/check-once.js` to match

**Change Check Interval:**
- Modify `CHECK_INTERVAL` constant in `src/monitor.js`
- Default: 60000ms (1 minute)
- Warning: Don't go below 30 seconds to avoid rate limiting

### Debugging

**Cookies Not Working:**
- Run `bun run test` to verify cookies
- Check cookie expiration dates
- Re-export fresh cookies from browser

**Films Not Detected:**
- Run `bun run test-detect` to see detailed DOM analysis
- Check if Sundance changed their page structure
- Look at `.rdt_TableRow` and `.sd_schedule_film_desc` selectors

**Stuck in Queue:**
- Sundance uses queue system during high traffic
- Monitor will wait for queue to clear
- Check if `QueueITAccepted` cookie is present

## Future Features (Planned)

### Auto-Purchase
**Status**: Scoped but not implemented

When tickets become available:
1. Click "Order tickets" button
2. Navigate through checkout flow
3. Select seats (if applicable)
4. Complete purchase using saved payment method

**Requirements:**
- User must configure which films to auto-purchase
- Must handle Sundance's purchase flow (multi-step)
- Security: Never store full credit card numbers
- Could use browser's saved payment methods

**Implementation Notes:**
- Add `autoPurchase: boolean` flag to film tracking
- Add configuration file for auto-purchase film list
- Build separate purchase flow handler
- Add safety checks (confirm before final click)

### Remote Deployment
**Status**: Documented but not implemented

**Recommended Platforms:**
- Railway.app (easy deployment, good for always-on)
- Fly.io (global edge network)
- DigitalOcean App Platform
- Any VPS with Node.js support

**Requirements:**
- Needs headless browser support (Playwright)
- Should use email notifications (not macOS notifications)
- Must keep cookies fresh (24-48 hour rotation)
- Consider using GitHub Actions for scheduled runs

**Deployment Steps:**
1. Add `Dockerfile` with Playwright dependencies
2. Configure environment variables in platform
3. Set up persistent storage for `ticket-state.json`
4. Add health check endpoint
5. Configure monitoring/alerts for the monitor itself

**Example Railway Deployment:**
```dockerfile
FROM oven/bun:latest
RUN apt-get update && apt-get install -y \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libxcomposite1 \
    libxdamage1 libxrandr2 libgbm1 libpango-1.0-0 libasound2
WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install
RUN bunx playwright install chromium
COPY . .
CMD ["bun", "run", "monitor"]
```

## Troubleshooting

### Common Issues

**"cookies.json not found"**
- User hasn't created cookies file yet
- Point them to README setup instructions

**"Timeout 30000ms exceeded"**
- Sundance site is slow or down
- Could be in queue system
- Increase timeout in navigation calls

**No films detected but schedule shows films**
- Page structure may have changed
- Run `test-detect` to inspect DOM
- Check if `.sd_schedule_film_desc` selector still works

**Notifications not sending**
- macOS: Check System Preferences > Notifications
- Email: Verify Resend API key and email addresses in .env
- Check console for error messages

### Sundance-Specific Quirks

1. **Slow Page Loads**: Site can take 10-15 seconds to fully load
2. **Queue System**: During peak times, users are put in waiting room
3. **Session Expiry**: Cookies expire after 24-48 hours
4. **Dynamic Content**: Everything is JavaScript-rendered, must wait for elements
5. **Multiple Screenings**: Same film can have multiple screenings with different statuses

## Development Workflow

### Setting Up Development Environment
```bash
bun install
bunx playwright install chromium
cp cookies.json.example cookies.json
# Edit cookies.json with your actual cookies
cp .env.example .env
# Edit .env with your API keys
```

### Testing Changes
```bash
bun run test          # Verify cookies work
bun run test-detect   # Debug detection (shows DOM)
bun run check         # One-time full check
bun run monitor       # Start continuous monitoring
```

### Before Committing
- [ ] Remove any personal info (emails, names, etc.)
- [ ] Test with fresh cookies.json
- [ ] Verify .gitignore excludes sensitive files
- [ ] Update README if user-facing changes
- [ ] Update CLAUDE.md if architecture changes

## Important Notes for AI Assistants

1. **Never commit sensitive data**: cookies.json, .env, ticket-state.json are all gitignored
2. **Page structure can change**: Always verify selectors still work with test-detect
3. **Respect rate limits**: Don't reduce CHECK_INTERVAL below 30 seconds
4. **Cookie security**: Treat cookies.json like passwords - never log or expose
5. **Testing**: Always use test scripts before running full monitor
6. **Browser context**: Must navigate to main page first, then schedule (session establishment)

## Questions to Ask User

When unclear about implementation:
- "Which films should trigger auto-purchase?"
- "What's your Resend domain for sending emails?"
- "Do you want to deploy this or run locally?"
- "How should we handle multiple available films at once?"
- "Should notifications include direct purchase links?"

## Project Status

- ✅ Cookie-based authentication
- ✅ Schedule page monitoring
- ✅ Ticket availability detection
- ✅ State persistence and change detection
- ✅ macOS notifications
- ✅ Email notifications (Resend)
- ✅ Auto-purchase framework (experimental, needs real-world testing)
- ✅ Deployment configs (Railway, Fly.io, Docker)
- ⏳ Multi-user support
- ⏳ Web dashboard
- ⏳ Full checkout flow automation (needs Sundance checkout flow mapping)
