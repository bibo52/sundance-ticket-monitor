import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const SCHEDULE_URL = 'https://festival.sundance.org/my-festival/my-schedule';
const COOKIES_PATH = resolve('./cookies.json');

async function testLogin() {
  console.log('🧪 Testing Sundance login with cookies...\n');

  // Check if cookies file exists
  if (!existsSync(COOKIES_PATH)) {
    console.error('❌ cookies.json not found!');
    console.error('Please create a cookies.json file with your Sundance session cookies.');
    console.error('See README.md for instructions.\n');
    process.exit(1);
  }

  // Load cookies
  let cookies;
  try {
    const cookiesJson = readFileSync(COOKIES_PATH, 'utf-8');
    cookies = JSON.parse(cookiesJson);
    console.log(`✓ Loaded ${cookies.length} cookie(s) from cookies.json`);
  } catch (error) {
    console.error('❌ Error reading cookies.json:', error.message);
    process.exit(1);
  }

  // Launch browser
  console.log('🌐 Launching browser...');
  const browser = await chromium.launch({
    headless: false  // Show browser so you can see what's happening
  });

  const context = await browser.newContext();
  await context.addCookies(cookies);

  const page = await context.newPage();

  try {
    // First, go to the main page to establish session
    console.log('📍 Loading main Sundance page first...');
    await page.goto('https://festival.sundance.org/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);

    console.log(`📍 Now navigating to ${SCHEDULE_URL}...`);

    // Listen for navigation events to see if we're being redirected
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        console.log(`   → Navigated to: ${frame.url()}`);
      }
    });

    await page.goto(SCHEDULE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Wait to see if any redirects happen
    await page.waitForTimeout(8000);

    // Check current state
    const title = await page.title();
    const url = page.url();

    console.log(`\n📄 Page title: ${title}`);
    console.log(`🔗 Final URL: ${url}\n`);

    // Take a screenshot for debugging
    await page.screenshot({ path: 'test-screenshot.png', fullPage: false });
    console.log('📸 Screenshot saved to test-screenshot.png\n');

    // Check page content
    const bodyText = await page.evaluate(() => document.body.innerText);
    const hasScheduleContent = bodyText.toLowerCase().includes('my schedule') ||
                               bodyText.toLowerCase().includes('your schedule');

    console.log(`Has "schedule" text: ${hasScheduleContent}`);

    // Check for login indicators
    const isOnSchedulePage = url.includes('/my-festival/my-schedule');
    const hasLoginButton = await page.locator('text=/sign in|log in/i').count() > 0;

    if (isOnSchedulePage && !hasLoginButton) {
      console.log('✅ SUCCESS! You are logged in and can access your schedule.\n');
      console.log('The browser will stay open for 10 seconds so you can verify.');
      console.log('You should see your schedule with your saved films.\n');

      await page.waitForTimeout(10000);
    } else if (hasLoginButton) {
      console.log('❌ FAILED: Login required. Your cookies may be expired.\n');
      console.log('Please log in to Sundance in your regular browser,');
      console.log('then export fresh cookies and update cookies.json.\n');

      await page.waitForTimeout(5000);
    } else {
      console.log('⚠️  UNCLEAR: Could not determine login status.\n');
      console.log('Please manually verify in the browser window.');
      console.log('Browser will stay open for 10 seconds.\n');

      await page.waitForTimeout(10000);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
    console.log('Browser closed.');
  }
}

testLogin().catch(console.error);
