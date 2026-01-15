import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const SCHEDULE_URL = 'https://festival.sundance.org/my-festival/my-schedule';
const COOKIES_PATH = resolve('./cookies.json');

async function testDetection() {
  console.log('🧪 Testing film detection on schedule page...\n');

  if (!existsSync(COOKIES_PATH)) {
    console.error('❌ cookies.json not found!');
    process.exit(1);
  }

  const cookies = JSON.parse(readFileSync(COOKIES_PATH, 'utf-8'));

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  await context.addCookies(cookies);
  const page = await context.newPage();

  try {
    // Navigate to main page first
    console.log('📍 Loading main page...');
    await page.goto('https://festival.sundance.org/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);

    // Navigate to schedule
    console.log('📍 Loading schedule page...');
    await page.goto(SCHEDULE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Wait for the schedule content to actually load (it's rendered by JavaScript)
    console.log('⏳ Waiting for schedule content to load...');
    try {
      await page.waitForSelector('.sd_schedule_film_desc, .sd_schedule_film_title', { timeout: 30000 });
      console.log('✓ Schedule content loaded');
    } catch (e) {
      console.log('⚠️  Timeout waiting for schedule content, proceeding anyway...');
    }

    // Give it a bit more time for all dynamic content
    await page.waitForTimeout(3000);

    console.log('🔍 Analyzing page structure...\n');

    // Let's find the full row structure and action buttons
    const pageInfo = await page.evaluate(() => {
      const filmDescs = Array.from(document.querySelectorAll('.sd_schedule_film_desc'));

      // For each film desc, walk up the tree to find the row container
      const containerInfo = filmDescs.slice(0, 3).map((desc, i) => {
        // Walk up to find the row-level container
        let rowContainer = desc;
        const hierarchy = [];
        while (rowContainer && hierarchy.length < 5) {
          hierarchy.push({
            tag: rowContainer.tagName,
            classes: rowContainer.className
          });
          rowContainer = rowContainer.parentElement;
        }

        // Look for ALL buttons in the top-level container we found
        const topContainer = desc.closest('[class*="schedule"]') || desc.closest('[class*="item"]') || desc.closest('div[class*="row"]');
        const allButtonsInRow = topContainer ? Array.from(topContainer.querySelectorAll('button, a.button, .btn')).map(b => ({
          text: b.textContent.trim(),
          classes: b.className,
          disabled: b.disabled,
          hasTicketText: b.textContent.toLowerCase().includes('ticket') ||
                        b.textContent.toLowerCase().includes('sold') ||
                        b.textContent.toLowerCase().includes('buy') ||
                        b.textContent.toLowerCase().includes('waitlist')
        })) : [];

        // Also check siblings of parent elements
        const parent = desc.parentElement;
        const siblings = parent ? Array.from(parent.parentElement?.children || []) : [];
        const siblingInfo = siblings.map(sib => ({
          classes: sib.className,
          buttonCount: sib.querySelectorAll('button').length
        }));

        return {
          index: i,
          title: desc.querySelector('h3')?.textContent.trim() || 'Unknown',
          hierarchy,
          topContainerClass: topContainer?.className || 'none',
          allButtonsInRow: allButtonsInRow.length,
          buttonDetails: allButtonsInRow,
          siblingCount: siblings.length,
          siblingInfo
        };
      });

      return { containerInfo };
    });

    console.log('Container analysis for each film:\n');
    pageInfo.containerInfo.forEach(info => {
      console.log(`\n--- Film: ${info.title} ---`);
      console.log('DOM Hierarchy (bottom to top):');
      info.hierarchy.forEach((level, i) => {
        console.log(`  ${i}. <${level.tag}> class="${level.classes}"`);
      });
      console.log(`Top container class: ${info.topContainerClass}`);
      console.log(`Buttons found in row: ${info.allButtonsInRow}`);
      console.log(`Button details:`);
      info.buttonDetails.forEach(btn => {
        console.log(`  - "${btn.text}" (${btn.classes}) ${btn.disabled ? '[DISABLED]' : ''} ${btn.hasTicketText ? '[TICKET-RELATED]' : ''}`);
      });
      console.log(`Siblings: ${info.siblingCount}`);
      info.siblingInfo.forEach((sib, i) => {
        if (sib.buttonCount > 0) {
          console.log(`  Sibling ${i}: ${sib.classes} (${sib.buttonCount} buttons)`);
        }
      });
    });
    console.log('\n---\n');

    console.log('🔍 Extracting film information...\n');

    // Extract ticket info using table row structure
    const tickets = await page.evaluate(() => {
      const tickets = {};
      const filmDescs = Array.from(document.querySelectorAll('.sd_schedule_film_desc'));

      console.log(`Found ${filmDescs.length} film entries with .sd_schedule_film_desc`);

      filmDescs.forEach((filmDesc, index) => {
        const titleElement = filmDesc.querySelector('h3');
        if (!titleElement) return;

        const title = titleElement.textContent.trim();
        console.log(`\nFilm ${index}: "${title}"`);

        const dateElement = filmDesc.querySelector('.sd_start_end_date');
        const screeningTime = dateElement ? dateElement.textContent.trim().replace(/\s+/g, ' ') : '';

        // Navigate up to table row
        const tableRow = filmDesc.closest('.rdt_TableRow, [class*="TableRow"]');
        if (!tableRow) {
          console.log('  ⚠️  No table row found');
          return;
        }

        // Find all cells in the row
        const tableCells = Array.from(tableRow.querySelectorAll('.rdt_TableCell, [class*="TableCell"]'));
        console.log(`  Found ${tableCells.length} table cells in row`);

        let status = 'UNKNOWN';
        let buttonText = '';

        tableCells.forEach((cell, cellIndex) => {
          const buttons = Array.from(cell.querySelectorAll('button, a.button, .btn')).filter(
            btn => !btn.className.includes('fav')
          );

          if (buttons.length > 0) {
            console.log(`  Cell ${cellIndex}: ${buttons.length} non-fav buttons`);
          }

          buttons.forEach((button) => {
            const text = button.textContent.trim();
            const upperText = text.toUpperCase();

            if (text.length > 0 && !text.match(/^[^a-zA-Z]*$/)) {
              console.log(`    Button: "${text}"`);

              if (upperText.includes('SOLD OUT')) {
                status = 'SOLD_OUT';
                buttonText = text;
              } else if (upperText.includes('WAITLIST') || upperText.includes('WAIT LIST')) {
                status = 'WAITLIST';
                buttonText = text;
              } else if (
                upperText.includes('ORDER') ||
                upperText.includes('BUY') ||
                upperText.includes('GET') ||
                upperText.includes('TICKETS') ||
                upperText.includes('TICKET') ||
                upperText.includes('PURCHASE') ||
                upperText.includes('AVAILABLE')
              ) {
                status = 'AVAILABLE';
                buttonText = text;
              }
            }
          });
        });

        console.log(`  → Status: ${status}, Button: "${buttonText}"`);

        const key = `${title}_${screeningTime || index}`;
        tickets[key] = {
          title,
          screeningTime,
          status,
          buttonText,
          url: window.location.href
        };
      });

      return tickets;
    });

    const count = Object.keys(tickets).length;
    console.log(`📊 Found ${count} film(s) on your schedule:\n`);

    if (count === 0) {
      console.log('⚠️  No films detected. This could mean:');
      console.log('   - Your schedule is empty (add films at festival.sundance.org)');
      console.log('   - The page structure is different than expected');
      console.log('\nBrowser will stay open for 15 seconds for manual inspection.\n');
      await page.waitForTimeout(15000);
    } else {
      for (const [key, ticket] of Object.entries(tickets)) {
        console.log(`🎬 ${ticket.title}`);
        if (ticket.screeningTime) {
          console.log(`   ⏰ ${ticket.screeningTime}`);
        }
        console.log(`   📊 Status: ${ticket.status}`);
        console.log(`   🔘 Button: "${ticket.buttonText}"`);
        console.log('');
      }

      console.log('Browser will stay open for 10 seconds for verification.\n');
      await page.waitForTimeout(10000);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

testDetection().catch(console.error);
