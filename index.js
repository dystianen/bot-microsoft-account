const adsPowerHelper = require('./adspower_helper');
const MicrosoftBot = require('./microsoft_bot');
const config = require('./config');
const XLSX = require('xlsx');

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
    // Read accounts from Excel file
    const workbook = XLSX.readFile('./accounts.xlsx');
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    // Map flat Excel rows to nested accountConfig structure
    const accounts = rows.map((row) => ({
      microsoftAccount: {
        email: String(row['Email'] || ''),
        password: String(row['Password'] || ''),
        firstName: String(row['First Name'] || ''),
        lastName: String(row['Last Name'] || ''),
        companyName: String(row['Company Name'] || ''),
        companySize: String(row['Company Size'] || '1 person'),
        phone: String(row['Phone'] || ''),
        jobTitle: String(row['Job Title'] || ''),
        address: String(row['Address'] || ''),
        city: String(row['City'] || ''),
        state: String(row['State'] || ''),
        postalCode: String(row['Postal Code'] || ''),
        country: String(row['Country'] || 'United States'),
      },
      payment: {
        cardNumber: String(row['Card Number'] || ''),
        cvv: String(row['CVV'] || ''),
        expMonth: String(row['Exp Month'] || ''),
        expYear: String(row['Exp Year'] || ''),
      },
    }));

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
