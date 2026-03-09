const adsPowerHelper = require('./adspower_helper');
const MicrosoftBot = require('./microsoft_bot');
const config = require('./config');
const fs = require('fs');

async function processSingleAccount(accountConfig, index, total) {
  const profileName = `MS-Account-${Date.now()}-${index}`;
  
  console.log(`\n--- Starting Account ${index + 1} of ${total}: ${accountConfig.microsoftAccount.email} ---`);
  
  let currentProfileId = null;
  let bot = null;

  try {
    // 1. Create AdsPower profile
    console.log(`[Account ${index + 1}] Creating AdsPower profile...`);
    currentProfileId = await adsPowerHelper.createProfile(profileName);
    console.log(`[Account ${index + 1}] Created profile: ${currentProfileId}`);

    // 2. Start browser
    console.log(`[Account ${index + 1}] Starting browser...`);
    const { wsUrl } = await adsPowerHelper.startBrowser(currentProfileId);
    console.log(`[Account ${index + 1}] Browser started. WS URL: ${wsUrl}`);

    // 3. Run Microsoft automation
    bot = new MicrosoftBot(wsUrl, accountConfig);
    await bot.run();
    console.log(`[Account ${index + 1}] Automation finished successfully.`);
    
  } catch (err) {
    console.error(`\n[ERROR Account ${index + 1}] failed:`, err.message);
  } finally {
    console.log(`[Account ${index + 1}] Starting cleanup...`);
    
    // 1. Close the browser instance through Playwright first
    if (bot) {
      try {
        await bot.cleanup();
      } catch (e) {
        console.error(`[Account ${index + 1}] Bot cleanup error:`, e.message);
      }
    }

    // 2. Stop & Delete profil AdsPower
    if (currentProfileId) {
      try {
        await adsPowerHelper.stopBrowser(currentProfileId);
        // Wait a bit before deleting to ensure API process is ready
        await new Promise(resolve => setTimeout(resolve, 5000));
        await adsPowerHelper.deleteProfile(currentProfileId);
        console.log(`[Account ${index + 1}] AdsPower profile cleaned up.`);
      } catch (cleanupError) {
        console.error(`[Account ${index + 1}] AdsPower cleanup error:`, cleanupError.message);
      }
    }
  }
}

async function main() {
  try {
    // Read accounts from JSON file
    const accountsData = fs.readFileSync('./accounts.json', 'utf8');
    const accounts = JSON.parse(accountsData);

    const concurrencyLimit = config.concurrencyLimit || 3;
    console.log(`Loaded ${accounts.length} accounts. Concurrency limit: ${concurrencyLimit}`);

    const executing = new Set();
    const tasks = [];

    for (let i = 0; i < accounts.length; i++) {
      const accountConfig = accounts[i];
      
      const promise = processSingleAccount(accountConfig, i, accounts.length)
        .then(() => executing.delete(promise));
      
      tasks.push(promise);
      executing.add(promise);

      if (executing.size >= concurrencyLimit) {
        await Promise.race(executing);
      }
      
      // Optional: Add a small staggered startup delay (e.g., 2-5 seconds)
      // to avoid triggering anti-bot by opening many browsers exactly at the same time
      if (i < accounts.length - 1) {
        const staggerDelay = 2000; 
        await new Promise(resolve => setTimeout(resolve, staggerDelay));
      }
    }

    await Promise.all(tasks);
    console.log('\nAll accounts processing attempts finished!');
  } catch (error) {
    console.error('Fatal execution error:', error.message);
    process.exit(1);
  }
}

main();
