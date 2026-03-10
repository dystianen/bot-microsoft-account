const adsPowerHelper = require("./adspower_helper");
const MicrosoftBot = require("./microsoft_bot");
const config = require("./config");
const fs = require("fs");
const XLSX = require("xlsx");

const EXCEL_FILE = "./accounts_result.xlsx";
const HISTORY_FILE = "./history.json";

let _saveQueue = Promise.resolve();

function saveToHistory(result) {
  if (result.status !== "SUCCESS") return;
  _saveQueue = _saveQueue
    .then(async () => {
      let history = [];
      if (fs.existsSync(HISTORY_FILE)) {
        try {
          history = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
        } catch (e) {
          history = [];
        }
      }
      history.push({
        domainEmail: result.domainEmail,
        domainPassword: result.domainPassword,
        timestamp: new Date().toISOString(),
      });
      fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
      updateExcelReport(history);
    })
    .catch((e) => console.error("[saveToHistory] Error:", e.message));
}

function updateExcelReport(history) {
  try {
    const data = history.map((item) => ({
      "Domain Email": item.domainEmail,
      "Domain Password": item.domainPassword,
      "Created Date": item.timestamp.split("T")[0],
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Success Accounts");
    worksheet["!cols"] = [{ wch: 45 }, { wch: 25 }, { wch: 15 }];
    XLSX.writeFile(workbook, EXCEL_FILE);
    console.log(`[Excel] Report updated: ${history.length} record(s)`);
  } catch (e) {
    console.error("[Excel] Failed to write report:", e.message);
  }
}

async function processSingleAccount(accountConfig, index, total) {
  const profileName = `MS-Account-${Date.now()}-${index}`;

  console.log(
    `\n--- Starting Account ${index + 1} of ${total}: ${accountConfig.microsoftAccount.email} ---`,
  );

  let currentProfileId = null;
  let bot = null;
  let result = null;
  let executionResult = null;

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
    result = await bot.run();

    if (result && result.success) {
      console.log(
        `[Account ${index + 1}] Automation finished successfully. Domain: ${result.domainEmail} Password: ${accountConfig.microsoftAccount.password}`,
      );
      executionResult = {
        status: "SUCCESS",
        domainEmail: result.domainEmail,
        domainPassword: accountConfig.microsoftAccount.password,
        log: "Completed successfully",
      };
    } else {
      console.error(
        `[Account ${index + 1}] Automation failed: ${result?.error || "Unknown error"}`,
      );
      executionResult = {
        status: "FAILED",
        domainEmail: "",
        domainPassword: "",
        log: result?.error || "Unknown automation error",
      };
    }
  } catch (err) {
    console.error(`\n[ERROR Account ${index + 1}] failed:`, err.message);
    executionResult = {
      status: "ERROR",
      domainEmail: "",
      domainPassword: "",
      log: err.message,
    };
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
        console.log(`[Account ${index + 1}] Browser stopped.`);
      } catch (e) {
        console.warn(
          `[Account ${index + 1}] stopBrowser warning (proceeding anyway):`,
          e.message,
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 3000)); // 3s cukup, 10s terlalu lama

      try {
        await adsPowerHelper.deleteProfile(currentProfileId);
        console.log(`[Account ${index + 1}] AdsPower profile deleted.`);
      } catch (e) {
        console.error(`[Account ${index + 1}] deleteProfile error:`, e.message);
      }
    }

    if (!executionResult) {
      executionResult = {
        status: "FAILED",
        domainEmail: "",
        domainPassword: "",
        log: "Incomplete execution",
      };
    }

    // Save to global history if success
    if (executionResult.status === "SUCCESS") {
      saveToHistory(executionResult);
    }
  }

  return executionResult;
}

module.exports = {
  processSingleAccount,
  HISTORY_FILE,
  EXCEL_FILE,
};
