const adsPowerHelper = require('./adspower_helper');
const MicrosoftBot = require('./microsoft_bot');

async function main() {
  try {
    const profileName = `MS-Account-${Date.now()}`;
    
    // 1-2. Create AdsPower profile
    console.log('Creating AdsPower profile...');
    const profileId = await adsPowerHelper.createProfile("");
    console.log(`Created profile: ${profileId}`);

    // Start browser
    console.log('Starting browser...');
    const { wsUrl } = await adsPowerHelper.startBrowser(profileId);
    console.log(`Browser started. WS URL: ${wsUrl}`);

    // Run Microsoft automation
    const bot = new MicrosoftBot(wsUrl);
    await bot.run();

    console.log('Automation finished.');
  } catch (error) {
    console.error('Main process failed:', error);
    process.exit(1);
  }
}

main();
