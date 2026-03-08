const { chromium } = require("playwright-core");
const config = require("./config");

class MicrosoftBot {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
  }

  async waitForPage(selector) {
    if (selector) {
      // Tunggu elemen spesifik muncul = page sudah siap
      await this.page.waitForSelector(selector, {
        state: "attached",
        timeout: 100000,
      });
    } else {
      await this.page.waitForLoadState("domcontentloaded", { timeout: 100000 });
    }
  }

  async connect() {
    console.log("[STEP 1] Connecting to browser");

    this.browser = await chromium.connectOverCDP(this.wsUrl);

    const contexts = this.browser.contexts();
    this.context =
      contexts.length > 0 ? contexts[0] : await this.browser.newContext();

    const pages = this.context.pages();
    this.page = pages.length > 0 ? pages[0] : await this.context.newPage();
    this.profileId = this.wsUrl.split('/').pop(); // Extract profile ID from WS URL if possible
  }

  async openMicrosoftPage() {
    console.log("[STEP 2] Opening Microsoft page");

    await this.page.goto(config.microsoftUrl, {
      waitUntil: "domcontentloaded",
      timeout: 100000,
    });
  }

  async clickTryButton() {
    console.log("[STEP 3] Clicking Try button");

    await this.waitForPage("#action-oc5f9e");

    // Tangkap new page sebelum click
    const [newPage] = await Promise.all([
      this.context.waitForEvent("page"),
      this.page.evaluate(() => {
        document.querySelector("#action-oc5f9e").click();
      }),
    ]);

    // Switch this.page ke tab baru
    await newPage.waitForLoadState("domcontentloaded");
    this.page = newPage;

    console.log("[STEP 3] Switched to new page:", this.page.url());
  }

  async clickBuildCartNextButton() {
    console.log("[STEP 4] Clicking Next button");

    await this.waitForPage('[data-bi-id="BuildCartNext"]');

    await this.page.evaluate(() => {
      document.querySelector('[data-bi-id="BuildCartNext"]').click();
    });
  }

  async fillEmail() {
    console.log("[STEP 5] Filling email");

    // Tunggu sampai input email muncul
    await this.waitForPage('[data-bi-id="Email"]');

    const emailInput = this.page.locator('[data-bi-id="Email"]');
    await emailInput.type(config.microsoftAccount.email, { delay: 80 });
  }

  async clickCollectEmailNextButton() {
    console.log("[STEP 6] Clicking CollectEmail Next button");

    await this.waitForPage('[data-bi-id="CollectEmailNext"]');

    await this.page.evaluate(() => {
      document.querySelector('[data-bi-id="CollectEmailNext"]').click();
    });

    // Tunggu verifikasi manual selesai, baru lanjut ke setup account
    console.log("[INFO] Waiting for email verification to complete...");
    await this.waitForPage('[data-bi-id="ConfirmEmailSetupAccount"]');
    console.log("[INFO] Verification complete, setup account button detected");
  }

  async clickConfirmEmailSetupAccountButton() {
    console.log("[STEP 7] Clicking Setup Account button");

    await this.page.evaluate(() => {
      document.querySelector('[data-bi-id="ConfirmEmailSetupAccount"]').click();
    });
  }

  async fillBasicInfo() {
    console.log("[STEP 8] Filling basic info");

    await this.waitForPage('[data-testid="firstNameField"]');

    // Fill semua text fields
    await this.page.evaluate((account) => {
      const fill = (selector, value) => {
        const el = document.querySelector(selector);
        if (!el) return console.warn("Field not found:", selector);
        el.value = value;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      };

      fill('[data-testid="firstNameField"]', account.firstName);
      fill('[data-testid="lastNameField"]', account.lastName);
      fill('[data-testid="companyNameField"]', account.companyName);
      fill('[data-testid="phoneNumberField"]', account.phone);
      fill('[data-testid="jobTitle"]', account.jobTitle);
    }, config.microsoftAccount);

    await this.page
      .locator("#address_line1")
      .fill(config.microsoftAccount.address);
    await this.page.waitForTimeout(300);

    await this.page.locator("#city").fill(config.microsoftAccount.city);
    await this.page.waitForTimeout(300);

    await this.page
      .locator("#postal_code")
      .fill(config.microsoftAccount.postalCode);
    await this.page.waitForTimeout(300);

    // Pilih company size (random)
    await this.selectDropdownByText(
      '[data-testid="companySizeDropdown"]',
      config.microsoftAccount.companySize,
    );
    await this.page.waitForTimeout(500);

    // Pilih state Alabama (sesuai config)
    await this.selectDropdownByText("#input_region", "Alabama");
    await this.page.waitForTimeout(500);

    // Pilih No untuk website
    await this.selectDropdownByText('[data-testid="websiteDropdown"]', "No");
    await this.page.waitForTimeout(500);

    // Check partner checkbox
    await this.page.evaluate(() => {
      const checkbox = document.querySelector("#partner-checkbox");
      if (checkbox && !checkbox.checked) checkbox.click();
    });

    await this.page.waitForTimeout(500);

    // Click Next
    await this.page.evaluate(() => {
      document.querySelector('[data-bi-id="SignupNext"]').click();
    });
  }

  async selectRandomDropdown(selector) {
    // Open dropdown
    await this.page.evaluate((sel) => {
      document.querySelector(sel).click();
    }, selector);

    // Tunggu options muncul
    await this.page.waitForSelector(".ms-Dropdown-items", {
      state: "attached",
      timeout: 10000,
    });

    // Pilih random option (skip index 0 karena biasanya placeholder)
    await this.page.evaluate((sel) => {
      const dropdown = document.querySelector(sel);
      const options =
        dropdown
          .closest(".ms-Dropdown-container")
          ?.querySelectorAll(".ms-Dropdown-item") ||
        document.querySelectorAll(".ms-Dropdown-items .ms-Dropdown-item");

      const validOptions = Array.from(options).filter(
        (o) => !o.classList.contains("is-disabled"),
      );
      const randomIndex = Math.floor(Math.random() * validOptions.length);
      validOptions[randomIndex]?.click();
    }, selector);
  }

  async selectDropdownByText(selector, text) {
    // Open dropdown
    await this.page.evaluate((sel) => {
      document.querySelector(sel).click();
    }, selector);

    await this.page.waitForSelector(".ms-Dropdown-items", {
      state: "attached",
      timeout: 10000,
    });

    // Pilih option by text
    await this.page.evaluate((text) => {
      const options = document.querySelectorAll(
        ".ms-Dropdown-items .ms-Dropdown-item",
      );
      const target = Array.from(options).find(
        (o) => o.textContent.trim().toLowerCase() === text.toLowerCase(),
      );
      if (target) target.click();
    }, text);
  }

  async waitForManualSteps() {
    console.log(
      "[INFO] Waiting for manual verification (captcha / phone / payment)",
    );

    await this.page.waitForTimeout(100000);
  }

  async clickUseThisAddressButton() {
    console.log("[STEP 10] Checking for Use this address button...");

    try {
      await this.page.waitForSelector("#pidlddc-button-addressUseButton", {
        state: "attached",
        timeout: 30000,
      });

      await this.page.evaluate(() => {
        document.querySelector("#pidlddc-button-addressUseButton").click();
      });

      console.log("[STEP 10] Clicked Use this address button");
    } catch {
      console.log("[STEP 10] Use this address button not found, skipping...");
    }
  }

  async fillPassword() {
    console.log("[STEP 11] Filling password");

    await this.waitForPage('[data-testid="pwdField"]');

    // Tunggu field domain terisi dulu sebelum lanjut (ID nya gonta-ganti)
    console.log("[INFO] Waiting for domain suggestion to appear...");
    await this.page.waitForFunction(
      () => {
        const inputs = Array.from(document.querySelectorAll('input[id^="TextField"]'));
        // Mencari input yang punya value (biasanya auto-filled oleh MS)
        const domainInput = inputs.find(el => el.value && el.value.length > 5);
        return domainInput !== undefined;
      },
      { timeout: 60000 },
    );

    console.log("[INFO] Domain suggestion detected, proceeding...");
    await this.page.waitForTimeout(1000); // Small pause for stability

    await this.page
      .locator('[data-testid="pwdField"]')
      .fill(config.microsoftAccount.password);
    await this.page
      .locator('[data-testid="cPwdField"]')
      .fill(config.microsoftAccount.password);

    await this.page.evaluate(() => {
      document.querySelector('[data-bi-id="AutoDomainNext"]').click();
    });
  }

  async goToPaymentPage() {
    console.log("[STEP 7] Waiting until payment page appears");

    await this.page
      .locator("text=Add payment method")
      .waitFor({ timeout: 100000 });

    console.log("Payment page detected");
  }

  async pauseForManualPayment() {
    console.log(
      "Please enter payment details manually. Automation will wait...",
    );

    await this.page.waitForTimeout(180000);
  }

  async checkForError() {
    const hasError = await this.page.evaluate(() => {
      const text = document.body.innerText;
      return (
        text.includes("Something went wrong") ||
        text.includes("Something happened")
      );
    });

    if (hasError) {
      console.log(
        "[ERROR] Error page detected, closing browser and deleting profile...",
      );
      await this.cleanup();
      return true;
    }

    return false;
  }

  async cleanup() {
    try {
      await this.browser.close();
    } catch (e) {
      console.error("Error closing browser:", e);
    }

    // Note: Profile deletion usually requires AdsPower API, not just fs.rmSync
    // if the profile is managed by the app.
    if (config.profilePath && fs.existsSync(config.profilePath)) {
      try {
        fs.rmSync(config.profilePath, { recursive: true, force: true });
        console.log("[CLEANUP] Local profile folder deleted:", config.profilePath);
      } catch (e) {
        console.warn("[CLEANUP] Could not delete profile folder:", e.message);
      }
    }
  }

  async run() {
    try {
      await this.connect();
      await this.openMicrosoftPage();
      if (await this.checkForError()) return;

      await this.clickTryButton();
      if (await this.checkForError()) return;

      await this.clickBuildCartNextButton();
      if (await this.checkForError()) return;

      await this.fillEmail();
      if (await this.checkForError()) return;

      await this.clickCollectEmailNextButton();
      if (await this.checkForError()) return;

      await this.clickConfirmEmailSetupAccountButton();
      if (await this.checkForError()) return;

      await this.fillBasicInfo();
      if (await this.checkForError()) return;

      await this.clickUseThisAddressButton();
      if (await this.checkForError()) return;

      await this.fillPassword();
      if (await this.checkForError()) return;

      //   await this.waitForManualSteps();
      await this.goToPaymentPage();
      await this.pauseForManualPayment();

      console.log("Automation completed safely");
    } catch (error) {
      console.error("Automation error:", error);
      await this.cleanup();
    }
  }
}

module.exports = MicrosoftBot;
