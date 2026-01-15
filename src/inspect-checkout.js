import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const SCHEDULE_URL = 'https://festival.sundance.org/my-festival/my-schedule';
const COOKIES_PATH = resolve('./cookies.json');

async function inspectCheckout() {
  const filmTitle = process.argv[2] || 'Public Access';

  if (!existsSync(COOKIES_PATH)) {
    console.error('❌ cookies.json not found!');
    process.exit(1);
  }

  const cookies = JSON.parse(readFileSync(COOKIES_PATH, 'utf-8'));

  console.log(`🔍 Inspecting checkout for: "${filmTitle}"\n`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addCookies(cookies);
  const page = await context.newPage();

  try {
    // Load schedule
    console.log('📍 Loading main page...');
    await page.goto('https://festival.sundance.org/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);

    console.log('📍 Loading schedule page...');
    await page.goto(SCHEDULE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('.sd_schedule_film_desc', { timeout: 30000 });
    await page.waitForTimeout(3000);

    // Find and click Order tickets
    console.log('🔍 Finding Order tickets button...');
    const found = await page.evaluate((title) => {
      const filmDescs = Array.from(document.querySelectorAll('.sd_schedule_film_desc'));
      for (const desc of filmDescs) {
        const titleEl = desc.querySelector('h3');
        if (!titleEl) continue;
        const filmTitle = titleEl.textContent.trim();
        if (!filmTitle.toLowerCase().includes(title.toLowerCase())) continue;

        const row = desc.closest('.rdt_TableRow, [class*="TableRow"]');
        if (!row) continue;

        const buttons = row.querySelectorAll('button, [role="button"], a');
        for (const btn of buttons) {
          const text = btn.textContent.trim().toUpperCase();
          if (text.includes('ORDER') || (text.includes('BUY') && text.includes('TICKET'))) {
            btn.setAttribute('data-inspect-target', 'true');
            return { found: true, buttonText: btn.textContent.trim() };
          }
        }
      }
      return { found: false };
    }, filmTitle);

    if (!found.found) {
      console.log('❌ Order tickets button not found for this film');
      console.log('   (Film might be sold out or not on schedule)');
      await browser.close();
      return;
    }

    console.log(`✓ Found button: "${found.buttonText}"`);

    // Click it and wait for dropdown
    console.log('🖱️ Clicking Order tickets...');
    await page.click('[data-inspect-target="true"]');
    await page.waitForTimeout(2000);

    // Take screenshot of the dropdown
    await page.screenshot({ path: 'checkout-step1-dropdown.png', fullPage: true });
    console.log('📸 Screenshot saved: checkout-step1-dropdown.png');

    // Look for "Buy additional tickets..." in the dropdown
    console.log('\n🔍 Looking for "Buy additional tickets..." button...');

    const buyAdditionalFound = await page.evaluate(() => {
      // Search all text content for "Buy additional tickets"
      const allElements = document.querySelectorAll('*');
      for (const el of allElements) {
        const text = el.textContent || el.innerText || '';
        if (text.toLowerCase().includes('buy additional tickets')) {
          // Check if this element or a close ancestor is clickable
          const clickable = el.closest('a, button, [role="button"], [onclick]') || el;
          if (clickable.offsetParent !== null) { // is visible
            clickable.setAttribute('data-buy-additional', 'true');
            return { found: true, text: text.trim().substring(0, 100), tag: clickable.tagName };
          }
        }
      }
      return { found: false };
    });

    if (buyAdditionalFound.found) {
      console.log(`✓ Found: "${buyAdditionalFound.text}" (${buyAdditionalFound.tag})`);
      console.log('🖱️ Clicking "Buy additional tickets..."');

      await page.click('[data-buy-additional="true"]');
      await page.waitForTimeout(3000);

      // Screenshot after clicking
      await page.screenshot({ path: 'checkout-step2-after-buy-additional.png', fullPage: true });
      console.log('📸 Screenshot saved: checkout-step2-after-buy-additional.png');
    } else {
      console.log('❌ "Buy additional tickets..." not found');
    }

    const checkoutPage = page;

    // Dump all visible buttons/links
    console.log('\n🔎 All visible buttons/links on checkout page:\n');

    const buttons = await checkoutPage.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('button, [role="button"], a, input[type="button"], input[type="submit"]'));
      return elements
        .map(el => {
          const text = (el.innerText || el.value || el.textContent || '').trim();
          const tag = el.tagName.toLowerCase();
          const classes = el.className || '';
          const visible = el.offsetParent !== null;
          return { text, tag, classes: classes.substring(0, 50), visible };
        })
        .filter(b => b.text && b.text.length < 100);
    });

    buttons.forEach((btn, i) => {
      const visibility = btn.visible ? '✓' : '✗';
      console.log(`${i + 1}. [${visibility}] <${btn.tag}> "${btn.text}"`);
    });

    // Check for iframes
    const frames = checkoutPage.frames();
    if (frames.length > 1) {
      console.log(`\n📦 Found ${frames.length - 1} iframe(s), checking for buttons inside...`);
      for (let i = 1; i < frames.length; i++) {
        const frameButtons = await frames[i].evaluate(() => {
          const elements = Array.from(document.querySelectorAll('button, [role="button"], a'));
          return elements.map(el => (el.innerText || el.textContent || '').trim()).filter(Boolean);
        }).catch(() => []);

        if (frameButtons.length > 0) {
          console.log(`   Frame ${i}: ${frameButtons.join(' | ')}`);
        }
      }
    }

    console.log('\n✓ Inspection complete');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

inspectCheckout().catch(console.error);
