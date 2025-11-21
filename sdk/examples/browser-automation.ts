/**
 * Browser Automation Example
 *
 * This example demonstrates browser automation capabilities
 */

import { createNikCLI } from '@nikcli/enterprise-sdk';

async function main() {
  const nikcli = await createNikCLI({
    apiKeys: {
      browserbase: process.env.BROWSERBASE_API_KEY,
    },
  });

  console.log('Running Browser Automation Examples...\n');

  // Start browser session
  console.log('--- Starting Browser ---');
  const session = await nikcli.browser.start();
  if (!session.success) {
    console.error('Failed to start browser');
    return;
  }
  console.log('Browser started:', session.data.id);

  // Navigate to website
  console.log('\n--- Navigating ---');
  await nikcli.browser.navigate({
    url: 'https://github.com/trending',
    waitUntil: 'networkidle',
  });
  console.log('Navigated to GitHub Trending');

  // Extract trending repositories
  console.log('\n--- Extracting Data ---');
  const repos = await nikcli.browser.executeScript(`
    return Array.from(document.querySelectorAll('h2.h3.lh-condensed'))
      .map(el => el.textContent.trim())
      .slice(0, 10);
  `);

  if (repos.success) {
    console.log('Top 10 Trending Repositories:');
    repos.data.forEach((repo: string, i: number) => {
      console.log(`${i + 1}. ${repo}`);
    });
  }

  // Take screenshot
  console.log('\n--- Taking Screenshot ---');
  const screenshot = await nikcli.browser.screenshot({
    fullPage: false,
    path: 'github-trending.png',
  });

  if (screenshot.success) {
    console.log('Screenshot saved:', screenshot.data);
  }

  // Search functionality
  console.log('\n--- Interacting with Page ---');
  await nikcli.browser.click({ selector: '[name="q"]' });
  await nikcli.browser.type({
    selector: '[name="q"]',
    text: 'nikcli',
  });

  // Wait for search results
  await nikcli.browser.waitForElement('.repo-list', 5000);

  // Extract search results
  const searchResults = await nikcli.browser.extractText({
    selector: '.repo-list-item',
  });

  if (searchResults.success) {
    console.log('Search results found');
  }

  // Get page info
  console.log('\n--- Page Info ---');
  const pageInfo = await nikcli.browser.getPageInfo();
  if (pageInfo.success) {
    console.log('Page title:', pageInfo.data.title);
    console.log('Page URL:', pageInfo.data.url);
  }

  // Close browser
  console.log('\n--- Closing Browser ---');
  await nikcli.browser.close();
  console.log('Browser closed');

  await nikcli.shutdown();
}

main().catch(console.error);
