import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const SCHEDULE_URL = 'https://festival.sundance.org/my-festival/my-schedule';
const COOKIES_PATH = resolve('./cookies.json');

async function checkOnce() {
  console.log('🎬 Sundance One-Time Ticket Check\n');

  if (!existsSync(COOKIES_PATH)) {
    console.error('❌ cookies.json not found!');
    process.exit(1);
  }

  const cookies = JSON.parse(readFileSync(COOKIES_PATH, 'utf-8'));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addCookies(cookies);
  const page = await context.newPage();

  try {
    // Navigate to main page first
    await page.goto('https://festival.sundance.org/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);

    // Navigate to schedule
    await page.goto(SCHEDULE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('.sd_schedule_film_desc', { timeout: 30000 });
    await page.waitForTimeout(3000);

    // Extract tickets
    const tickets = await page.evaluate(() => {
      const tickets = {};
      const filmDescs = Array.from(document.querySelectorAll('.sd_schedule_film_desc'));

      filmDescs.forEach((filmDesc, index) => {
        const titleElement = filmDesc.querySelector('h3');
        if (!titleElement) return;

        const title = titleElement.textContent.trim();
        const dateElement = filmDesc.querySelector('.sd_start_end_date');
        const screeningTime = dateElement ? dateElement.textContent.trim().replace(/\s+/g, ' ') : '';

        const tableRow = filmDesc.closest('.rdt_TableRow, [class*="TableRow"]');
        if (!tableRow) return;

        const tableCells = Array.from(tableRow.querySelectorAll('.rdt_TableCell, [class*="TableCell"]'));

        let status = 'UNKNOWN';
        let buttonText = '';

        tableCells.forEach(cell => {
          const buttons = Array.from(cell.querySelectorAll('button, a.button, .btn')).filter(
            btn => !btn.className.includes('fav')
          );

          buttons.forEach((button) => {
            const text = button.textContent.trim();
            const upperText = text.toUpperCase();

            if (text.length > 0 && !text.match(/^[^a-zA-Z]*$/)) {
              if (upperText.includes('SOLD OUT')) {
                status = 'SOLD_OUT';
                buttonText = text;
              } else if (upperText.includes('WAITLIST')) {
                status = 'WAITLIST';
                buttonText = text;
              } else if (
                upperText.includes('ORDER') ||
                upperText.includes('TICKET')
              ) {
                status = 'AVAILABLE';
                buttonText = text;
              }
            }
          });
        });

        const key = `${title}_${screeningTime || index}`;
        tickets[key] = { title, screeningTime, status, buttonText };
      });

      return tickets;
    });

    const count = Object.keys(tickets).length;
    console.log(`📊 Found ${count} film(s) on your schedule:\n`);

    const available = [];
    const soldOut = [];
    const unknown = [];

    for (const ticket of Object.values(tickets)) {
      if (ticket.status === 'AVAILABLE') {
        available.push(ticket);
      } else if (ticket.status === 'SOLD_OUT') {
        soldOut.push(ticket);
      } else {
        unknown.push(ticket);
      }
    }

    if (available.length > 0) {
      console.log('✅ TICKETS AVAILABLE:');
      available.forEach(t => {
        console.log(`   🎬 ${t.title}`);
        console.log(`   ⏰ ${t.screeningTime}`);
        console.log(`   🔘 "${t.buttonText}"\n`);
      });
    }

    if (soldOut.length > 0) {
      console.log('❌ SOLD OUT:');
      soldOut.forEach(t => {
        console.log(`   🎬 ${t.title}`);
        console.log(`   ⏰ ${t.screeningTime}`);
        console.log(`   🔘 "${t.buttonText}"\n`);
      });
    }

    if (unknown.length > 0) {
      console.log('⚠️  UNKNOWN STATUS:');
      unknown.forEach(t => {
        console.log(`   🎬 ${t.title}`);
        console.log(`   ⏰ ${t.screeningTime}`);
        console.log(`   🔘 "${t.buttonText}"\n`);
      });
    }

    console.log(`\n💡 To start continuous monitoring, run: bun run monitor\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

checkOnce().catch(console.error);
