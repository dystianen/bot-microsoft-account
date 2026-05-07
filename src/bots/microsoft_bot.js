const { chromium } = require('playwright-core');
const fs = require('fs');
const config = require('../config');
const remoteLogger = require('../utils/logger');
const i18n = require('../utils/i18n');
const browserHelper = require('../utils/browser_helper');

// Dynamically build SPINNER_SELECTOR using all configured variations
const spinnerTexts = i18n.getAllVariations('selectors.spinner_text');
const SPINNER_SELECTOR = [
  '[data-testid="spinner"]',
  '.ms-Spinner',
  '[class*="spinner" i]',
  ...spinnerTexts.map((text) => `:has-text("${text}")`),
].join(', ');

// Safety net — sangat besar, hanya untuk mencegah hang selamanya
const HARD_TIMEOUT = config.hardTimeout;
const PAYMENT_TIMEOUT = config.paymentTimeout || 5 * 60 * 1000;

class MicrosoftBot {
  constructor(wsUrl, accountConfig, onPaymentSaved) {
    this.wsUrl = wsUrl;
    this.browser = null;
    this.context = null;
    this.page = null;
    this.accountConfig = accountConfig;
    // Set language for this instance
    if (accountConfig.language) {
      i18n.setLanguage(accountConfig.language);
    }
    this.originalEmail = accountConfig.microsoftAccount.email || 'New Account';
    this.onPaymentSaved = onPaymentSaved;
    this._paymentSavedTriggered = false;
    this.currentStep = 0;
    this._setupBtnReady = false;
  }

  async _logStep(stepNum, msg) {
    this.currentStep = stepNum;
    const email = this.accountConfig.microsoftAccount.email || 'New Account';
    const numericStep = typeof stepNum === 'number' ? stepNum : 0;
    remoteLogger
      .logStep(email, numericStep, msg)
      .catch((e) => console.error(`[LOG ERROR] ${e.message}`));
  }

  async triggerPaymentSaved() {
    if (this._paymentSavedTriggered) return;
    this._paymentSavedTriggered = true;
    console.log('[INFO] Triggering onPaymentSaved callback...');
    if (typeof this.onPaymentSaved === 'function') {
      await this.onPaymentSaved().catch((e) =>
        console.error('[CALLBACK ERROR] onPaymentSaved failed:', e.message)
      );
    }
  }

  // ─── Core helpers ────────────────────────────────────────────────────────────

  // ─── Core helpers (Delegated to browserHelper) ───────────────────────────────

  async humanDelay(min = 1000, max = 3000) {
    await browserHelper.humanDelay(this.page, min, max);
  }

  async humanScroll() {
    await browserHelper.humanScroll(this.page);
  }

  async humanPaste(locator, text) {
    await browserHelper.humanPaste(this.page, locator, text);
  }

  async humanType(locator, text) {
    await browserHelper.humanType(this.page, locator, text);
  }

  async humanClick(locator, options = {}) {
    await browserHelper.humanClick(this.page, locator, options);
  }

  async randomMouseMove() {
    await browserHelper.randomMouseMove(this.page);
  }

  async runWithMonitor(promise) {
    let isDone = false;
    let errorMsg = null;

    const checkLoop = async () => {
      while (!isDone) {
        // CPU Saver: Relaxing polling interval from 2500ms to 5000ms
        await this.page.waitForTimeout(5000).catch(() => {
          isDone = true;
        });
        if (isDone) break;

        const detectedError = await this.checkForError();
        if (detectedError) {
          // ✅ Double-check: tunggu 2 detik lagi, lalu cek ulang sebelum throw
          // Ini mencegah false-positive saat teks error muncul sementara (transisi halaman)
          console.log(
            `[MONITOR] Possible error detected: "${detectedError}", re-checking in 2s...`
          );
          await this.page.waitForTimeout(2000).catch(() => {});
          if (isDone) break; // Task selesai duluan, abaikan
          const recheck = await this.checkForError();
          if (recheck) {
            errorMsg = recheck;
            isDone = true;
            break;
          } else {
            console.log(`[MONITOR] False positive cleared, continuing...`);
          }
        }
      }
    };

    const result = await Promise.race([promise, checkLoop()]).finally(() => {
      isDone = true;
    });

    if (errorMsg) {
      throw new Error(`MICROSOFT_ERROR: ${errorMsg}`);
    }

    return result;
  }

  async waitForSpinnerGone(extraDelay = 0, spinnerTimeout = HARD_TIMEOUT) {
    // 1. Tunggu sebentar karena spinner sering kali baru muncul beberapa saat setelah aksi klik
    await this.page.waitForTimeout(500).catch(() => {});

    const spinner = this.page.locator(SPINNER_SELECTOR).first();
    const spinnerVisible = await spinner.isVisible().catch(() => false);

    if (spinnerVisible) {
      console.log('[WAIT] Spinner detected, waiting until hidden...');
      try {
        await this.runWithMonitor(
          spinner.waitFor({ state: 'hidden', timeout: spinnerTimeout }),
          spinnerTimeout
        );
      } catch (e) {
        if (e.message.includes('MICROSOFT_ERROR')) throw e;
        console.log('[WAIT] Spinner still visible or check failed, continuing...');
      }
      console.log('[WAIT] Spinner gone.');
      // Grace period agar DOM stabil setelah spinner hilang
      await this.page.waitForTimeout(800).catch(() => {});
    }

    // 2. Selesai spinner baru cek deteksi error (seperti instruksi USER)
    const postSpinnerError = await this.checkForError();
    if (postSpinnerError) {
      throw new Error(`MICROSOFT_ERROR: ${postSpinnerError}`);
    }

    if (extraDelay > 0) {
      await this.humanDelay(extraDelay + 300);
    }
  }

  async waitForVisible(locator) {
    await browserHelper.waitForVisible(this.page, locator, {
      waitForSpinnerGone: () => this.waitForSpinnerGone(),
      runWithMonitor: (p) => this.runWithMonitor(p),
      hardTimeout: HARD_TIMEOUT,
    });
  }

  async clickButtonWithPossibleNames(names, options = {}) {
    return await browserHelper.clickButtonWithPossibleNames(this.page, names, options, {
      waitForSpinnerGone: () => this.waitForSpinnerGone(),
      runWithMonitor: (p) => this.runWithMonitor(p),
      hardTimeout: HARD_TIMEOUT,
    });
  }

  getGenericLocator(keywords, elementType = 'input') {
    return browserHelper.getGenericLocator(this.page, keywords, elementType);
  }

  getGenericButton(keywords) {
    return browserHelper.getGenericButton(this.page, keywords);
  }

  async selectDropdownByText(selector, text) {
    return await browserHelper.selectDropdownByText(this.page, selector, text, {
      waitForSpinnerGone: () => this.waitForSpinnerGone(),
      runWithMonitor: (p) => this.runWithMonitor(p),
      hardTimeout: HARD_TIMEOUT,
    });
  }

  async waitForPage(selector) {
    await browserHelper.waitForPage(this.page, selector, {
      waitForSpinnerGone: () => this.waitForSpinnerGone(),
      runWithMonitor: (p) => this.runWithMonitor(p),
      humanDelay: (ms) => this.humanDelay(ms),
      hardTimeout: HARD_TIMEOUT,
    });
  }

  // ─── Steps ───────────────────────────────────────────────────────────────────

  async connect() {
    await this._logStep(1, '🌐 Menghubungkan ke browser...');

    // this.browser = await Promise.race([
    //   chromium.connectOverCDP(this.wsUrl),
    //   new Promise((_, reject) =>
    //     setTimeout(
    //       () => reject(new Error(`CDP connection timeout after ${config.hardTimeout / 1000}s`)),
    //       HARD_TIMEOUT
    //     )
    //   ),
    // ]);

    this.browser = await chromium.launch({
      headless:
        this.accountConfig?.headless !== undefined ? this.accountConfig.headless : config.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--incognito',
        '--disable-blink-features=AutomationControlled',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--mute-audio',
        '--window-position=0,0',
      ],
    });

    const contexts = this.browser.contexts();
    this.context = contexts.length > 0 ? contexts[0] : await this.browser.newContext();

    const pages = this.context.pages();
    this.page = pages.length > 0 ? pages[0] : await this.context.newPage();
    this.profileId = this.wsUrl.split('/').pop();

    // --- CPU Saver: Resource Blocking (Network Interception) ---
    // Memblokir assets gambar, media, dan font. Dipertahankan stylesheet (CSS) karena dibutuhkan untuk selector layout.
    await this.context.route('**/*', (route) => {
      const type = route.request().resourceType();
      if (['image', 'media', 'font'].includes(type)) {
        route.abort('blockedbyclient');
      } else {
        route.continue();
      }
    });
    // -------------------------------------------------------------

    // Check IP vs billing address country (Anti-Fraud)
    try {
      console.log('[INFO] Verifying IP location...');
      const ipInfoResponse = await this.page.evaluate(async () => {
        try {
          const res = await fetch('https://ipapi.co/json/');
          return await res.json();
        } catch {
          return null;
        }
      });

      if (ipInfoResponse && ipInfoResponse.country_name) {
        const ipCountry = ipInfoResponse.country_name.toLowerCase();
        const billingAddress =
          this.accountConfig.basicInfo?.address || this.accountConfig.payment?.address || '';
        console.log(
          `[INFO] Current IP location: ${ipInfoResponse.city}, ${ipInfoResponse.country_name} (${ipInfoResponse.ip})`
        );

        // Simple heuristic: check if billing address mentioned country matches IP country
        // (This can be refined if we have a strict country code in config)
        if (billingAddress && !billingAddress.toLowerCase().includes(ipCountry)) {
          console.warn(
            `[ANTI-FRAUD WARNING] Location mismatch! IP is in ${ipCountry}, but billing address might be elsewhere.`
          );
          console.warn(`Billing info provided: ${billingAddress}`);
        }
      }
    } catch (e) {
      console.log('[WARN] Could not verify IP location, continuing anyway.');
    }
  }

  async openMicrosoftPage() {
    await this._logStep(2, '🌍 Membuka halaman Microsoft...');

    const url = this.accountConfig.microsoftUrl || config.microsoftUrl;
    // Speed up initial navigation — wait for commit then poll for elements
    await this.page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: HARD_TIMEOUT,
    });
  }

  // Helper untuk exact plan match (word-boundary safe)
  isPlanMatch(text, targetPlan) {
    const normalized = text.trim().toUpperCase();
    const target = targetPlan.trim().toUpperCase();
    if (!normalized || !target) return false;

    // Exact full match
    if (normalized === target) return true;

    // Escape special regex characters in targetPlan
    const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Strict word-boundary: must not be preceded or followed by alphanumeric
    const regex = new RegExp(`(?<![A-Z0-9])${escaped}(?![A-Z0-9])`, 'i');
    return regex.test(normalized);
  }

  async clickTryForFreeOnTargetCard() {
    const targetPlan = this.accountConfig.targetPlan || 'E3';
    await this._logStep(3, `Memilih paket trial: ${targetPlan}`);

    const cards = this.page.locator('div[ocr-component-name="card-plan-detail"]');
    const cardsVisible = await cards
      .first()
      .waitFor({ state: 'visible', timeout: HARD_TIMEOUT })
      .then(() => true)
      .catch(() => false);

    if (!cardsVisible) {
      console.log("[INFO] No cards visible, checking if we're scanning global buttons...");
    } else {
      const count = await cards.count();
      let targetCard = null;

      // 1. Prioritas: exact match via .oc-product-title
      for (let i = 0; i < count; i++) {
        const card = cards.nth(i);
        const title = await card
          .locator('.oc-product-title')
          .first()
          .textContent()
          .catch(() => '');

        if (this.isPlanMatch(title, targetPlan)) {
          console.log(
            `[INFO] Exact plan title match found for "${targetPlan}" at card index ${i} (title: "${title.trim()}")`
          );
          targetCard = card;
          break;
        }
      }

      // 2. Fallback: cari di heading/title element saja (bukan seluruh innerText)
      if (!targetCard) {
        console.log(`[INFO] Title match not found, falling back to heading scan...`);
        for (let i = 0; i < count; i++) {
          const card = cards.nth(i);
          const heading = await card
            .locator('h1, h2, h3, h4, [class*="title"], [class*="name"], [class*="plan"]')
            .first()
            .textContent()
            .catch(() => '');

          if (this.isPlanMatch(heading, targetPlan)) {
            console.log(
              `[INFO] Heading match found for "${targetPlan}" at card index ${i} (heading: "${heading.trim()}")`
            );
            targetCard = card;
            break;
          }
        }
      }

      // 3. Last resort: seluruh innerText card, scan per baris pendek saja
      //    Baris panjang (> 30 char) dianggap deskripsi dan dilewati
      //    untuk mencegah false positive seperti "Includes all E3 features..."
      if (!targetCard) {
        console.log(`[INFO] Heading match not found, falling back to full card text scan...`);
        for (let i = 0; i < count; i++) {
          const card = cards.nth(i);
          const text = await card.innerText().catch(() => '');

          const lines = text
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean);

          const matched = lines.some((line) => {
            // Skip long lines — likely descriptions that may mention other plans
            if (line.length > 30) return false;
            return this.isPlanMatch(line, targetPlan);
          });

          if (matched) {
            console.log(`[INFO] Full text line match found for "${targetPlan}" at card index ${i}`);
            targetCard = card;
            break;
          }
        }
      }

      // Double-check: validate selected card title before clicking
      if (targetCard) {
        const confirmedTitle = await targetCard
          .locator('.oc-product-title')
          .first()
          .textContent()
          .catch(() => '');

        if (confirmedTitle && !this.isPlanMatch(confirmedTitle, targetPlan)) {
          console.warn(
            `[WARN] Card title mismatch! Expected "${targetPlan}", got "${confirmedTitle.trim()}". Resetting target card.`
          );
          targetCard = null;
        } else {
          console.log(
            `[INFO] Confirmed selected card: "${confirmedTitle.trim() || '(title not readable)'}"`
          );
        }
      }

      if (targetCard) {
        const tryFreeBtn = targetCard
          .locator(
            i18n
              .getAllVariations('buttons.try_for_free')
              .map((text) => `a:has-text("${text}")`)
              .join(', ')
          )
          .first();

        if ((await tryFreeBtn.count()) > 0) {
          console.log(`[INFO] Clicking "Try for free" (Target: ${targetPlan}) via JS click...`);

          const [popup] = await Promise.all([
            this.page
              .context()
              .waitForEvent('page', { timeout: HARD_TIMEOUT })
              .catch(() => null),
            tryFreeBtn
              .evaluate((el) => el.click())
              .catch(async () => {
                console.log('[INFO] JS click failed, attempting native humanClick...');
                await this.humanClick(tryFreeBtn).catch((e) =>
                  console.error('[ERROR] Native click also failed:', e.message)
                );
              }),
          ]);

          if (popup) {
            this.page = popup;
            console.log('[INFO] Switched to new tab. Waiting for content settle...');
            await this.page.waitForLoadState('load', { timeout: HARD_TIMEOUT }).catch(() => {});
            await this.waitForSpinnerGone();
            await this.page
              .locator('button, [role="button"], a.btn')
              .first()
              .waitFor({ state: 'visible', timeout: HARD_TIMEOUT })
              .catch(() => {});
            await this.humanDelay(1500);
            return;
          }
        } else {
          console.warn(
            `[WARN] "Try for free" button not found inside matched card for plan "${targetPlan}"`
          );
        }
      } else {
        console.warn(
          `[WARN] No card matched for plan "${targetPlan}" — falling through to global scan`
        );
      }
    }

    // Fallback global search jika card tidak ditemukan atau button tidak ada di dalam card
    console.log("[INFO] Scanning for global 'Try for free' button...");
    const globalBtn = this.page
      .locator(
        i18n
          .getAllVariations('buttons.try_for_free')
          .flatMap((text) => [`a:has-text("${text}")`, `button:has-text("${text}")`])
          .join(', ')
      )
      .first();

    const [popupGlobal] = await Promise.all([
      this.page
        .context()
        .waitForEvent('page', { timeout: HARD_TIMEOUT })
        .catch(() => null),
      this.humanClick(globalBtn).catch(() => {}),
    ]);

    if (popupGlobal) {
      this.page = popupGlobal;
      console.log('[INFO] Switched to new tab (global click). Waiting for content settle...');
      await this.page.waitForLoadState('load', { timeout: HARD_TIMEOUT }).catch(() => {});
      await this.waitForSpinnerGone();
      await this.page
        .locator('button, [role="button"], a.btn')
        .first()
        .waitFor({ state: 'visible', timeout: HARD_TIMEOUT })
        .catch(() => {});
      await this.humanDelay(1500);
    } else {
      console.error(
        `[ERROR] No popup/tab opened after clicking "Try for free" for plan "${targetPlan}"`
      );
    }
  }

  async clickProductNextButton() {
    await this._logStep(4, 'Mengklik tombol Selanjutnya...');

    // Pilih "1 month" jika opsi durasi langganan muncul (mendukung multi-bahasa)
    try {
      const oneMonthSelectors = [
        // Menargetkan wrapper yang berisi teks "1 month" (Sangat Aman untuk Fluent UI)
        ...i18n
          .getAllVariations('selectors.one_month')
          .map((text) => `.ms-ChoiceField-wrapper:has-text("${text}")`),
        ...i18n
          .getAllVariations('selectors.one_month')
          .map((text) => `input[aria-label*="${text}" i]`),
        ...i18n.getAllVariations('selectors.one_month').map((text) => `label:has-text("${text}")`),
        ...i18n.getAllVariations('selectors.one_month').map((text) => `span:has-text("${text}")`),
        ...i18n.getAllVariations('selectors.one_month').map((text) => `[aria-label*="${text}" i]`),
        'input[value*="month" i]',
      ].join(', ');

      const oneMonthOption = this.page.locator(oneMonthSelectors).first();

      const isVisible = await oneMonthOption
        .isVisible({ timeout: HARD_TIMEOUT })
        .catch(() => false);
      if (isVisible) {
        console.log('[STEP 4] Subscription length option detected. Selecting 1 month...');
        await this.randomMouseMove();
        await oneMonthOption.click({ force: true });
        await this.humanDelay(1500);
      } else {
        console.log('[STEP 4] 1 month option not detected or not visible, proceeding.');
      }
    } catch (e) {
      console.log('[STEP 4] 1 month selection logic skipped:', e.message);
    }

    await this.clickButtonWithPossibleNames(i18n.getAllVariations('buttons.next'));
  }

  async fillEmail() {
    // Bagian alur lama di-comment dulu sementara sesuai permintaan
    // const email = this.accountConfig.microsoftAccount.email;
    // await this._logStep(5, `Mengisi email: ${email}`);

    // Buka dulu temp mail seperti yang sekarang berjalan
    const email = await this.fetchNewEmailFromMailporary();
    await this._logStep(6, `Mengisi email: ${email}`);

    const emailInput = this.getGenericLocator('email');
    await this.waitForVisible(emailInput);
    await this.randomMouseMove();
    await this.humanType(emailInput, email);

    // Verifikasi cepat
    const currentValue = await emailInput.inputValue().catch(() => '');
    if (currentValue.trim() !== email.trim()) {
      console.warn(`[STEP 5] Email mismatch, fixing with rapid fill...`);
      await emailInput.fill(email);
    }

    await this.page.waitForTimeout(500);
  }

  async submitEmailAndWaitForSetup() {
    await this._logStep(6, 'Submit email & menunggu transisi...');
    await this.clickButtonWithPossibleNames(i18n.getAllVariations('buttons.next'));

    // Tunggu spinner selesai (monitor captcha/error otomatis di sini)
    console.log('[INFO] Waiting for page to settle after email submit...');
    await this.waitForSpinnerGone(500);

    // Deteksi apakah muncul Verifikasi Kode (OTP) mendadak setelah submit email
    const otpTrigger = this.page
      .locator('button[data-bi-id="VerifyCode"]')
      .or(
        this.page.locator(
          i18n
            .getAllVariations('selectors.verification_code')
            .map((text) => `label:has-text("${text}")`)
            .join(', ')
        )
      )
      .first();

    if (await otpTrigger.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('[OTP] Verification code appeared immediately after email submit!');
      if (this._emailFromMailporary) {
        // Jika sudah pakai Mailporary, langsung ambil kodenya
        const code = await this.readOtpFromMailporary();
        if (code) {
          const solved = await this.fillMicrosoftOtp(code);
          if (solved) {
            console.log('[OTP] First-stage OTP solved successfully.');
            await this.waitForSpinnerGone();
          }
        }
      } else {
        // Jika belum pakai Mailporary, ganti ke Mailporary dulu (instruksi USER)
        console.log('[OTP] First-stage OTP detected on config email. Switching to Mailporary...');
        await this.fetchNewEmailFromMailporary();
        // Beri sinyal agar run() reload
        throw new Error('MICROSOFT_ERROR: FIRST_STAGE_OTP_SWITCH');
      }
    }

    // Tunggu tombol Setup muncul sebagai konfirmasi transisi halaman
    const setupBtn = this.getGenericButton(i18n.getAllVariations('buttons.setup_account'));
    console.log('[INFO] Menunggu tombol Setup Account muncul...');
    await setupBtn.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {
      console.warn('[INFO] Setup Account button not visible yet, proceeding to Step 7 anyway.');
    });
  }

  /**
   * Mengambil email baru dari Mailporary
   */
  async fetchNewEmailFromMailporary(forceNew = false) {
    const currentEmail = this.accountConfig.microsoftAccount.email || 'New Account';
    await this._logStep(
      this._currentStepIndex || 2,
      `📧 ${currentEmail}: Membuka Mailporary untuk email baru...`
    );
    console.log(`[MAILPORARY] Opening Mailporary (forceNew: ${forceNew})...`);

    const mailporaryPage = await this.page.context().newPage();
    try {
      await mailporaryPage.goto('https://mailporary.com/', {
        waitUntil: 'domcontentloaded',
        timeout: HARD_TIMEOUT,
      });

      // Jika forceNew, klik tombol "Supprimer" (Delete) untuk ganti email
      if (forceNew) {
        console.log('[MAILPORARY] Resetting email address via "Supprimer"...');
        const deleteBtn = mailporaryPage
          .locator('button:has-text("Supprimer"), button:has-text("Delete")')
          .first();
        if (await deleteBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
          await deleteBtn.click();
          await mailporaryPage.waitForTimeout(2000);
        }
      }

      const emailInput = mailporaryPage.locator('input[aria-label="Email Address"]');
      await emailInput.waitFor({ state: 'visible', timeout: 15000 });

      const newEmail = await mailporaryPage.evaluate(async (timeout) => {
        const start = Date.now();
        while (Date.now() - start < timeout) {
          const input = document.querySelector('input[aria-label="Email Address"]');
          const val = input ? input.value : '';
          if (
            val &&
            val.includes('@') &&
            !val.toLowerCase().includes('loading') &&
            val.split('@')[1]?.includes('.')
          ) {
            return val;
          }
          await new Promise((r) => setTimeout(r, 500));
        }
        return null;
      }, 30000);

      const finalEmail = newEmail || (await emailInput.inputValue().catch(() => ''));

      if (!finalEmail || !finalEmail.includes('@')) {
        throw new Error('Failed to extract valid email from Mailporary');
      }

      console.log(`[MAILPORARY] Email acquired: ${finalEmail}`);

      // Migrate log session agar Processing: [email] berubah tapi pesan tetap di-edit (bukan kirim baru)
      const oldEmail = this.accountConfig.microsoftAccount.email;
      if (oldEmail && oldEmail !== finalEmail) {
        await remoteLogger.migrateSession(oldEmail, finalEmail);
      }

      this.accountConfig.microsoftAccount.email = finalEmail;
      this._emailFromMailporary = true; // Tandai bahwa email ini dari Mailporary
      await this._logStep(this._currentStepIndex || 6, `📧 Email baru didapat: ${finalEmail}`);
      return finalEmail;
    } finally {
      await mailporaryPage.close().catch(() => {});
    }
  }

  /**
   * Membaca kode OTP dari Mailporary untuk email saat ini
   */
  async readOtpFromMailporary() {
    const logEmail = this.accountConfig.microsoftAccount.email || 'Account';
    await this._logStep(7, `🔍 ${logEmail}: Menunggu kode OTP di Mailporary...`);
    console.log('[OTP] Waiting for verification code from Mailporary...');

    const mailporaryPage = await this.page.context().newPage();
    try {
      await mailporaryPage.goto('https://mailporary.com/', {
        waitUntil: 'domcontentloaded',
        timeout: HARD_TIMEOUT,
      });

      let code = null;
      const MAX_POLL_ATTEMPTS = 12; // ~1 menit total

      for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
        console.log(`[OTP] Checking inbox (Attempt ${i + 1}/${MAX_POLL_ATTEMPTS})...`);

        // Selector untuk baris pesan (berdasarkan screenshot)
        const messageRow = mailporaryPage
          .locator('text=/Vérifiez votre adresse e-mail|Microsoft/i')
          .first();

        if (await messageRow.isVisible().catch(() => false)) {
          console.log('[OTP] Verification email detected, clicking...');
          await messageRow.click();

          // Tunggu konten muncul (Sesuai HTML: <h3 ...>944920</h3>)
          const codeLocator = mailporaryPage
            .locator('.emailBody h3, h3')
            .filter({ hasText: /^\d{6}$/ })
            .first();

          try {
            await codeLocator.waitFor({ state: 'visible', timeout: 10000 });
            const extracted = await codeLocator.textContent();
            if (extracted && extracted.trim().match(/^\d{6}$/)) {
              code = extracted.trim();
              console.log(`[OTP] Successfully extracted code: ${code}`);
              break;
            }
          } catch (e) {
            console.warn('[OTP] Code not found in body yet, refreshing page...');
            await mailporaryPage.reload({ waitUntil: 'domcontentloaded' });
            continue;
          }
        }

        // Klik tombol Actualiser (Refresh)
        const refreshBtn = mailporaryPage
          .locator(
            'button:has-text("Actualiser"), button:has-text("Refresh"), button:has-text("Update")'
          )
          .first();
        if (await refreshBtn.isVisible()) {
          await refreshBtn.click();
        } else {
          await mailporaryPage.reload({ waitUntil: 'domcontentloaded' });
        }

        await mailporaryPage.waitForTimeout(5000);
      }

      return code;
    } finally {
      await mailporaryPage.close().catch(() => {});
    }
  }

  /**
   * Mengisi kode OTP ke halaman Microsoft
   */
  async fillMicrosoftOtp(code) {
    try {
      await this._logStep(7, `⌨️ Memasukkan kode verifikasi: ${code}`);
      const otpInput = this.page
        .locator(
          'input[id*="TextField" i], input[id*="verification" i], input[name*="code" i], input[aria-label*="code" i], input[aria-label*="verif" i]'
        )
        .first();
      await otpInput.waitFor({ state: 'visible', timeout: 10000 });

      await this.humanType(otpInput, code);
      await this.page.waitForTimeout(500);

      const verifyBtn = this.page
        .locator(
          `button[data-bi-id="VerifyCode"], ${i18n
            .getAllVariations('buttons.verify')
            .map((text) => `button:has-text("${text}")`)
            .join(', ')}`
        )
        .first();
      await verifyBtn.click();

      await this.waitForSpinnerGone();

      // Tunggu sebentar agar halaman sempat bereaksi
      await this.page.waitForTimeout(2000);

      // Cek apakah ada pesan error eksplisit (kode salah)
      const errorMsg = this.page
        .locator(
          `[data-automation-id="error-message"], [role="alert"], .ms-MessageBar--error, text=/${i18n.getAllVariations('selectors.error_code_incorrect').join('|')}/i`
        )
        .first();
      if (await errorMsg.isVisible({ timeout: 1000 }).catch(() => false)) {
        console.warn('[OTP] Explicit error message detected — code was rejected.');
        return false;
      }

      // Jika spinner sudah hilang dan TIDAK ada pesan error → dianggap sukses
      // (Microsoft mungkin masih render input sebentar sebelum navigasi)
      console.log('[OTP] No error detected after submit. Treating as success.');
      return true;
    } catch (err) {
      console.error('[OTP] Error filling code:', err.message);
      return false;
    }
  }

  async handleOtpWithMailporary() {
    // Paksa ambil email baru (delete yang lama) saat reset
    await this.fetchNewEmailFromMailporary(true);

    const logEmail = this.accountConfig.microsoftAccount.email || 'Account';
    // Refresh page Microsoft asli
    const refreshMsg = '[OTP] Refreshing Microsoft page for retry...';
    console.log(refreshMsg);
    await this._logStep(this._currentStepIndex || 8, `🔄 ${logEmail}: ${refreshMsg}`);
    await this.page.reload({ waitUntil: 'domcontentloaded', timeout: HARD_TIMEOUT });

    // Note: clickProductNextButton is now handled by the main run() loop retry logic
  }

  async clickSetupAccountButton() {
    await this._logStep(7, 'Mengklik tombol Setup Account...');

    // Close cookie popup if visible (France specific cookies dialog)
    await this.handleCookiePopup();
    const clicked = await this.clickButtonWithPossibleNames(
      i18n.getAllVariations('buttons.setup_account'),
      {
        // Exclude tombol yang ada hubungannya dengan cookie
        excludeText: ['cookie', 'gérer', 'cookies', 'préférences', 'confidentialité'],
      }
    );

    if (!clicked) {
      console.warn('[STEP 7] Setup button not found — platform may have skipped it.');
    }

    // ── Tunggu: spinner hilang ATAU OTP/Rate-limit muncul ──────────────────
    const secondOtpTrigger = this.page
      .locator('button[data-bi-id="VerifyCode"]')
      .or(
        this.page.locator(
          i18n
            .getAllVariations('selectors.verification_code')
            .map((text) => `label:has-text("${text}")`)
            .join(', ')
        )
      )
      .first();

    const rateLimitTrigger = this.page
      .locator(`text=/${i18n.getAllVariations('selectors.rate_limit').join('|')}/i`)
      .first();

    const spinner = this.page.locator(SPINNER_SELECTOR).first();

    console.log('[STEP 7] Waiting for page transition after Setup click...');
    const startTime = Date.now();
    const waitTimeout = 20000;
    while (Date.now() - startTime < waitTimeout) {
      if (await secondOtpTrigger.isVisible().catch(() => false)) break;
      if (await rateLimitTrigger.isVisible().catch(() => false)) break;
      if (!(await spinner.isVisible().catch(() => false))) {
        await this.page.waitForTimeout(500);
        if (!(await spinner.isVisible().catch(() => false))) break;
      }
      const err = await this.checkForError();
      if (err && err.includes('RATE_LIMIT_ERROR')) break;
      await this.page.waitForTimeout(500);
    }

    await this.page.waitForTimeout(800);

    // 1. Handle OTP muncul setelah klik Setup
    if (await secondOtpTrigger.isVisible({ timeout: 3000 }).catch(() => false)) {
      if (this._emailFromMailporary) {
        // Email berasal dari Mailporary → baca kode OTP dari inbox
        console.log('[OTP] Second verification code detected! Reading from Mailporary inbox...');
        const code = await this.readOtpFromMailporary();
        if (code) {
          const solved = await this.fillMicrosoftOtp(code);
          if (solved) {
            console.log('[OTP] Second verification code solved successfully. Continuing flow.');
            await this.waitForSpinnerGone();
            return 'SUCCESS';
          }
        }
        // Gagal baca OTP → reset total
        console.warn('[OTP] Could not solve second OTP. Falling back to reset flow...');
        await this.handleOtpWithMailporary();
        return 'RETRY';
      } else {
        // Email BUKAN dari Mailporary (email asli config) → ambil email baru dari Mailporary lalu reload
        console.log(
          '[OTP] Verification code detected but email is NOT from Mailporary. Fetching Mailporary email and restarting setup...'
        );
        await this.fetchNewEmailFromMailporary();
        // Reload halaman Microsoft agar retry dimulai dari halaman yang benar
        console.log('[OTP] Reloading Microsoft page for clean retry...');
        await this.page.reload({ waitUntil: 'domcontentloaded', timeout: HARD_TIMEOUT });
        return 'RETRY';
      }
    }

    // 2. Handle Rate Limit
    if (await rateLimitTrigger.isVisible({ timeout: 2000 }).catch(() => false)) {
      const msg = '[WARN] Rate-limit detected AFTER Setup Click! Resetting...';
      console.warn(msg);
      await this._logStep(7, msg);
      await this.handleOtpWithMailporary();
      return 'RETRY';
    }

    this._setupBtnReady = false;
    return 'SUCCESS';
  }

  async handleCookiePopup() {
    await browserHelper.handleCookiePopup(this.page);
  }

  async fillBasicInfo() {
    await this._logStep(8, 'Mengisi informasi dasar akun...');
    await this.waitWithCheck(this.getGenericLocator(['first', 'prénom', 'prenom']), HARD_TIMEOUT);

    // === COUNTRY ===
    await this.selectDropdownByText(
      'div[role="combobox"][id*="country" i], select[id*="country" i]',
      this.accountConfig.microsoftAccount.country || 'United States'
    ).catch(() => {});
    await this.page.waitForTimeout(200);

    // === FIRST NAME ===
    const firstLocator = this.getGenericLocator(['first', 'prénom', 'prenom']);
    await this.waitForVisible(firstLocator);
    await this.humanPaste(firstLocator, this.accountConfig.microsoftAccount.firstName);
    await this.page.waitForTimeout(200);

    // === LAST NAME ===
    const lastLocator = this.getGenericLocator(['last', 'nom', 'famille']);
    await this.waitForVisible(lastLocator);
    await this.humanPaste(lastLocator, this.accountConfig.microsoftAccount.lastName);
    await this.page.waitForTimeout(200);

    // === COMPANY NAME ===
    const companyLocator = this.getGenericLocator(['company', 'entreprise', 'société']);
    await this.waitForVisible(companyLocator);
    await this.humanPaste(companyLocator, this.accountConfig.microsoftAccount.companyName);
    await this.page.waitForTimeout(200);

    // === COMPANY SIZE ===
    await this.humanScroll();
    await this.selectDropdownByText(
      'div[role="combobox"][id*="size" i], div[role="combobox"][data-testid*="size" i], select[id*="size" i]',
      this.accountConfig.microsoftAccount.companySize
    );
    await this.humanDelay(600, 1000);

    // === CONTACT ===
    const phoneLocator = this.getGenericLocator(['phone', 'téléphone', 'numéro']);
    await this.waitForVisible(phoneLocator);
    await this.humanPaste(phoneLocator, this.accountConfig.microsoftAccount.phone);
    await this.page.waitForTimeout(200);

    // === JOB TITLE ===
    const jobLocator = this.getGenericLocator(['job', 'poste', 'fonction']);
    await this.waitForVisible(jobLocator);
    await this.humanPaste(jobLocator, this.accountConfig.microsoftAccount.jobTitle);
    await this.page.waitForTimeout(300);

    // === ADDRESS: isi sesuai urutan DOM aktual ===
    await this._fillAddressInDomOrder();

    // === WEBSITE DROPDOWN ===
    await this.humanDelay(914);
    await this.humanScroll();
    await this.selectDropdownByText(
      'div[role="combobox"][id*="website" i], div[role="combobox"][data-testid*="website" i], select[id*="website" i]',
      ['No', 'Tidak', 'Non']
    );
    await this.humanDelay(800, 1500);

    // === CHECKBOXES ===
    try {
      const checkboxSelectors = [
        '#partner-checkbox',
        '#non-notice-country-ms-checkbox',
        'input[type="checkbox"][aria-label*="share my information" i]',
        'input[type="checkbox"][aria-label*="partage mes informations" i]',
        'input[type="checkbox"][aria-label*="receive information" i]',
        'input[type="checkbox"][aria-label*="recevoir des informations" i]',
      ];
      for (const selector of checkboxSelectors) {
        const cb = this.page.locator(selector).first();
        if (await cb.isVisible().catch(() => false)) {
          if (!(await cb.isChecked())) {
            await this.randomMouseMove();
            await cb.check({ force: true });
            console.log(`[STEP 8] Checkbox checked: ${selector}`);
          }
        }
      }
    } catch (err) {
      console.log('[STEP 8] Checkbox error:', err.message);
    }

    // === SUBMIT ===
    await this.humanDelay(600, 1200);
    await this.randomMouseMove();
    if (Math.random() > 0.5) await this.humanScroll();
    console.log("[STEP 8] Pausing for 'thinking' delay before submit...");
    await this.humanDelay(800, 1500);

    await this.clickButtonWithPossibleNames(i18n.getAllVariations('buttons.next'));
  }

  // Mengisi address fields SESUAI urutan kemunculan di DOM
  async _fillAddressInDomOrder() {
    const cfg = this.accountConfig.microsoftAccount;

    // Definisi semua field address yang mungkin muncul
    // "detect" mengembalikan { el, type } jika field ditemukan & visible
    const fieldDefs = [
      {
        name: 'address_line1',
        detect: async () => {
          const el = this.page
            .locator(
              'input[id="address_line1"], input[name="address_line1"], input[id*="address_line1" i]'
            )
            .first();
          return (await el.isVisible().catch(() => false)) ? { el, type: 'input' } : null;
        },
        value: () => cfg.address,
      },
      {
        name: 'address_line2',
        detect: async () => {
          if (!cfg.address2) return null;
          const el = this.page
            .locator(
              'input[id="address_line2"], input[name="address_line2"], input[id*="address_line2" i]'
            )
            .first();
          return (await el.isVisible().catch(() => false)) ? { el, type: 'input' } : null;
        },
        value: () => cfg.address2,
      },
      {
        name: 'postal',
        detect: async () => {
          const el = this.page
            .locator(
              'input[id="postal_code"], input[id*="postal" i], input[id*="zip" i], input[data-testid*="postal" i]'
            )
            .first();
          return (await el.isVisible().catch(() => false)) ? { el, type: 'input' } : null;
        },
        value: () => cfg.postalCode,
      },
      {
        name: 'region',
        detect: async () => {
          if (!cfg.state) return null;
          const dropdownCandidates = [
            'div[role="combobox"][id="input_region"]',
            'div[role="combobox"][id="input_state"]',
            'div[role="combobox"][id="input_province"]',
            'div[role="combobox"][id*="state" i]',
            'div[role="combobox"][id*="province" i]',
            'div[role="combobox"][id*="region" i]',
            'div[role="combobox"][id*="département" i]',
            'select[id="input_region"]',
            'select[id*="state" i]',
            'select[id*="province" i]',
            'select[id*="region" i]',
          ];
          for (const sel of dropdownCandidates) {
            const el = this.page.locator(sel).first();
            if (await el.isVisible().catch(() => false)) {
              return { el, type: 'dropdown', sel };
            }
          }
          // Input text fallback
          const inputCandidates = [
            'input[id*="state" i]',
            'input[id*="province" i]',
            'input[id*="region" i]',
            'input[name*="state" i]',
          ];
          for (const sel of inputCandidates) {
            const el = this.page.locator(sel).first();
            if (await el.isVisible().catch(() => false)) {
              return { el, type: 'input' };
            }
          }
          return null;
        },
        value: () => cfg.state,
      },
      {
        name: 'city',
        detect: async () => {
          const el = this.page
            .locator(
              'input[id="city"], input[name="city"], input[id*="city" i], input[id*="ville" i]'
            )
            .first();
          return (await el.isVisible().catch(() => false)) ? { el, type: 'input' } : null;
        },
        value: () => cfg.city,
      },
    ];

    // Deteksi posisi DOM setiap field, lalu sort berdasarkan posisi Y
    const detected = [];
    for (const def of fieldDefs) {
      const result = await def.detect();
      if (!result) {
        console.log(`[STEP 8] Field "${def.name}" not found / skipped`);
        continue;
      }
      // Ambil posisi Y di DOM untuk sorting
      const boundingBox = await result.el.boundingBox().catch(() => null);
      const yPos = boundingBox ? boundingBox.y : 9999;
      detected.push({ ...def, result, yPos });
    }

    // Sort berdasarkan posisi Y (urutan DOM aktual di layar)
    detected.sort((a, b) => a.yPos - b.yPos);
    console.log(`[STEP 8] Address fill order: ${detected.map((d) => d.name).join(' → ')}`);

    // Isi satu per satu sesuai urutan DOM
    for (const field of detected) {
      const val = field.value();
      if (!val) continue;

      if (field.result.type === 'dropdown') {
        await this.selectDropdownByText(field.result.sel, val);
        // Setelah dropdown berubah, tunggu DOM stabil (city/postal bisa berubah)
        await this.page.waitForTimeout(500);
      } else {
        await this.humanPaste(field.result.el, val);
        await this.page.waitForTimeout(200);
      }

      console.log(`[STEP 8] Filled "${field.name}": ${val}`);
    }
  }

  async confirmAddressIfPrompted(step = 10, msg = 'Mengecek konfirmasi alamat...') {
    await this._logStep(step, msg);

    await this.waitForSpinnerGone();

    const combinedLocator = this.page
      .locator(
        i18n
          .getAllVariations('buttons.use_this_address')
          .flatMap((text) => [`button:has-text("${text}")`, `button[aria-label*="${text}" i]`])
          .join(', ')
      )
      .first();

    const found = await combinedLocator.isVisible().catch(() => false);

    if (!found) {
      console.log('[STEP 10] Address confirmation button not found, skipping...');
      return;
    }

    // Selalu pilih radio button pertama (atas) jika ada
    const firstRadio = this.page.locator('input[type="radio"]').first();
    const radioVisible = await firstRadio.isVisible().catch(() => false);
    if (radioVisible) {
      await firstRadio.click();
      await this.humanDelay(400);
    }

    await this.randomMouseMove();
    await combinedLocator.click({ force: true });

    const buttonText = await combinedLocator.textContent().catch(() => '');
    console.log(`[STEP 10] Clicked: "${buttonText.trim()}"`);
    await this.humanDelay(500);
  }

  async fillPassword() {
    await this._logStep(10, 'Mengisi password dan konfirmasi domain...');

    await this.waitForSpinnerGone();
    try {
      const inputs = this.page.locator('input.ms-TextField-field');
      const count = await inputs.count();
      let username = '';
      let prefix = '';

      for (let i = 0; i < count; i++) {
        const input = inputs.nth(i);
        const id = await input.getAttribute('id').catch(() => '');
        const placeholder = await input.getAttribute('placeholder').catch(() => '');
        const val = await input.inputValue();

        if (id?.includes('username') || placeholder?.includes('username')) {
          username = val;
        } else if ((await input.getAttribute('maxlength')) === '27') {
          prefix = val;
        }
      }

      // Fallback if ID/placeholder check fails
      if (!username && count >= 2) {
        username = await inputs.nth(0).inputValue();
        prefix = await inputs.nth(1).inputValue();
      }

      if (username && prefix) {
        this.extractedDomainEmail = `${username}@${prefix}.onmicrosoft.com`;
        this.extractedDomainPassword = this.accountConfig.microsoftAccount.password;
        console.log(`[INFO] Extracted Domain Email: ${this.extractedDomainEmail}`);
      } else if (prefix) {
        this.extractedDomainEmail = `${prefix}.onmicrosoft.com`;
      }
    } catch (e) {
      console.log('[WARN] Could not extract domain info:', e.message);
    }

    const passwordLocator = this.page
      .locator(
        'input[type="password"]:not([id*="retype" i]):not([id*="confirm" i]):not([data-testid*="cpwd" i])'
      )
      .first();

    await this.waitForVisible(passwordLocator);
    await this.randomMouseMove();

    // ✅ Password: gunakan humanPaste (copas) agar lebih stabil terhadap lag/proxy
    // Sama seperti yang dilakukan pada pengisian biodata sebelumnya
    await passwordLocator.click({ force: true }).catch(() => {});
    await this.page.waitForTimeout(150);
    await this.humanPaste(passwordLocator, this.accountConfig.microsoftAccount.password);

    await this.page.waitForTimeout(300);
    const confirmPasswordLocator = this.page.locator('input[type="password"]').nth(1);

    const confirmVisible = await confirmPasswordLocator
      .isVisible({ timeout: HARD_TIMEOUT })
      .catch(() => false);
    if (confirmVisible) {
      await confirmPasswordLocator.click({ force: true }).catch(() => {});
      await this.humanPaste(confirmPasswordLocator, this.accountConfig.microsoftAccount.password);
    }
    await this.humanDelay(800, 1500);
    await this.randomMouseMove();
    console.log("[STEP 10] Pausing for 'thinking' delay before submit...");
    await this.humanDelay(1000, 1800);

    await this.clickButtonWithPossibleNames([
      ...i18n.getAllVariations('buttons.next'),
      ...i18n.getAllVariations('buttons.finish'),
    ]);
  }

  async handleOptionalSignIn() {
    await this._logStep(11, 'Mengecek opsi Sign In tambahan...');

    try {
      // Tunggu halaman benar-benar settle setelah submit password
      await this.page.waitForLoadState('domcontentloaded');
      await this.waitForSpinnerGone();
      await this.page.waitForTimeout(800); // beri waktu DOM stabil

      if (await this.checkForError()) {
        throw new Error('MICROSOFT_ERROR_PAGE: Terdeteksi saat pengecekan Sign In.');
      }

      const signInBtn = this.page
        .locator(
          i18n
            .getAllVariations('buttons.sign_in')
            .flatMap((text) => [`button:has-text("${text}")`, `a:has-text("${text}")`])
            .concat(['[data-bi-id*="signin" i]', 'button[id*="signin" i]'])
            .join(', ')
        )
        .first();

      const paymentPageLocator = this.page
        .locator(
          'input[id*="card" i], input[id*="accounttoken" i], input[aria-label*="card number" i], input[aria-label*="Nomor kartu" i]'
        )
        .first();

      // Race: Sign In button vs Payment page — prioritaskan deteksi elemen fisik daripada URL
      const winner = await Promise.race([
        signInBtn
          .waitFor({ state: 'visible', timeout: HARD_TIMEOUT })
          .then(() => 'signin')
          .catch(() => null),

        paymentPageLocator
          .waitFor({ state: 'visible', timeout: HARD_TIMEOUT })
          .then(() => 'payment')
          .catch(() => null),

        this.page
          .waitForURL(/payment|billing|checkout/i, { timeout: HARD_TIMEOUT })
          .then(() => 'payment_url')
          .catch(() => null),
      ]);

      console.log(`[STEP 11.5] Race result: ${winner}`);

      if (winner === 'payment') {
        console.log('[STEP 11.5] Payment field detected, skipping Sign In.');
        return;
      }

      if (winner === 'payment_url') {
        // Jika hanya URL yang match, cek lagi apakah tombol Sign In sebenarnya ada
        const signVisible = await signInBtn.isVisible().catch(() => false);
        if (signVisible) {
          console.log(
            '[STEP 11.5] URL match payment but Sign In button is visible. Prioritizing Sign In.'
          );
        } else {
          console.log('[STEP 11.5] Payment URL detected and no Sign In button found, skipping.');
          return;
        }
      }

      if (
        !winner ||
        (!winner.includes('signin') && !(await signInBtn.isVisible().catch(() => false)))
      ) {
        console.log('[STEP 11.5] No Sign In or Payment page detected, skipping.');
        return;
      }

      // Proceed to click Sign In
      console.log('[STEP 11.5] Sign In detected, clicking...');
      await this.randomMouseMove();

      const [popup] = await Promise.all([
        this.page.waitForEvent('popup').catch(() => null),
        signInBtn.click(),
      ]);

      if (!popup) {
        console.log('[STEP 11.5] No popup after Sign In click, continuing...');
        return;
      }

      await popup.waitForLoadState('domcontentloaded');
      const yesBtn = popup.locator(
        'button:has-text("Yes"), button:has-text("Oui"), input[value="Yes"], input[value="Oui"], #idSIButton9'
      );
      const yesVisible = await yesBtn
        .waitFor({ state: 'visible', timeout: HARD_TIMEOUT })
        .then(() => true)
        .catch(() => false);

      if (yesVisible) {
        await yesBtn.click();
        console.log('[STEP 11.5] Clicked Yes on Stay signed in prompt.');
      }

      await popup.waitForLoadState('networkidle').catch(() => {});
      console.log('[STEP 11.5] Sign In popup handled successfully.');
    } catch (e) {
      if (e.message.includes('MICROSOFT_ERROR_PAGE')) throw e;
      console.log('[STEP 11.5] Optional Sign In handler skipped:', e.message);
    }
  }

  async goToPaymentPage() {
    await this._logStep(12, 'Menunggu halaman pembayaran muncul...');

    await this.page.waitForLoadState('domcontentloaded', { timeout: HARD_TIMEOUT }).catch(() => {});
    await this.waitForSpinnerGone(500);

    const deadline = Date.now() + HARD_TIMEOUT;
    while (Date.now() < deadline) {
      await this.waitForSpinnerGone();

      // Deteksi via URL atau elemen form kartu — lebih reliable dari teks
      const found = await Promise.any([
        this.page.waitForURL(/payment|billing|checkout/i, {
          timeout: HARD_TIMEOUT,
        }),
        this.page
          .locator(
            'input[id*="card" i], input[id*="accounttoken" i], input[aria-label*="Nomor kartu" i], input[aria-label*="card number" i], input[aria-label*="numéro de carte" i]'
          )
          .first()
          .waitFor({ state: 'visible', timeout: HARD_TIMEOUT }),
      ])
        .then(() => true)
        .catch(() => false);

      if (found) {
        console.log('Payment page detected');
        return;
      }

      if (await this.checkForError()) {
        throw new Error('MICROSOFT_ERROR_PAGE: Terdeteksi saat menunggu halaman pembayaran.');
      }

      console.log('[STEP 12] Payment page not yet visible, retrying...');
      await this.page.waitForTimeout(500);
    }

    throw new Error('Timeout waiting for payment page');
  }

  async fillPaymentDetails() {
    await this._logStep(13, 'Mengisi detail pembayaran VCC...');

    await this.waitForSpinnerGone();

    const cardLocator = this.page
      .locator('input[id*="accounttoken" i], input[id*="card" i], input[data-testid*="card" i]')
      .first();
    await this.waitForVisible(cardLocator);

    console.log('Typing card number...');
    await cardLocator.click();
    await this.humanPaste(cardLocator, this.accountConfig.payment.cardNumber);
    await this.humanDelay(592);

    console.log('Typing CVV...');
    const cvvLocator = this.page
      .locator('input[id*="cvv" i], input[data-testid*="cvv" i], input[name*="cvv" i]')
      .first();
    await cvvLocator.click();
    await this.humanPaste(cvvLocator, this.accountConfig.payment.cvv);
    await this.humanDelay(510);

    let expMonth = this.accountConfig.payment.expMonth.toString();
    if (expMonth.length === 1) expMonth = '0' + expMonth;

    console.log('Selecting expiry month:', expMonth);
    await this.selectDropdownByText(
      'div[role="combobox"][id*="month" i], div[role="combobox"][data-testid*="month" i], select[id*="month" i]',
      expMonth
    );
    await this.humanDelay(400);

    console.log('Selecting expiry year:', this.accountConfig.payment.expYear);
    await this.selectDropdownByText(
      'div[role="combobox"][id*="year" i], div[role="combobox"][data-testid*="year" i], select[id*="year" i]',
      this.accountConfig.payment.expYear
    );
    await this.humanDelay(500);

    console.log('VCC details filled');
  }

  async submitPaymentAndWaitResult() {
    await this._logStep(14, 'Submit pembayaran & menunggu hasil...');
    await this.clickButtonWithPossibleNames([
      'Save',
      'Enregistrer',
      'Simpan',
      'Next',
      'Suivant',
      'Selanjutnya',
      'Berikutnya',
    ]);

    console.log('[INFO] Waiting for payment response...');

    const waitForPaymentOutcome = async (timeout = 60000) => {
      let resolved = false;

      const makeWatcher = (promise, label) =>
        promise
          .then(() => {
            resolved = true;
            return label;
          })
          .catch(() => null);

      // Selector address: EN + ID
      const ADDRESS_SELECTOR = [
        'button:has-text("Use this address")',
        'button:has-text("Use address")',
        'button:has-text("Gunakan alamat ini")',
        'button:has-text("Utiliser cette adresse")',
        'button[aria-label*="Use this address" i]',
        'button[aria-label*="Gunakan alamat ini" i]',
        'button[aria-label*="Utiliser cette adresse" i]',
      ].join(', ');

      const errorWatcher = new Promise(async (resolve, reject) => {
        const deadline = Date.now() + timeout;
        while (!resolved && Date.now() < deadline) {
          await this.page.waitForTimeout(2000).catch(() => {});
          if (resolved) break;
          const err = await this.checkForError();
          if (err) {
            // Unify: instead of rejecting with a different label,
            // resolve as "error" and store the message for consistent handling
            this._lastPaymentMonitorError = err;
            return resolve('error');
          }
        }
        resolve(null);
      });

      const result = await Promise.race([
        makeWatcher(
          this.page
            .locator('span[data-automation-id="error-message"]')
            .first()
            .waitFor({ state: 'visible', timeout })
            .then(async () => {
              // Simpan pesan error ke _lastPaymentMonitorError agar konsisten dengan errorWatcher
              const msg = await this.page
                .locator('span[data-automation-id="error-message"]')
                .first()
                .textContent()
                .catch(() => '');
              if (msg?.trim()) this._lastPaymentMonitorError = msg.trim();
            }),
          'error'
        ),
        makeWatcher(
          this.page.waitForSelector(ADDRESS_SELECTOR, {
            state: 'visible',
            timeout,
          }),
          'address'
        ),
        makeWatcher(
          this.page.waitForFunction(
            () => {
              const text = document.body.innerText.toLowerCase();
              return (
                text.includes('check your info') ||
                text.includes('review your order') ||
                text.includes('ordersummary') ||
                text.includes('tinjau pesanan') ||
                text.includes('periksa info') ||
                text.includes('ringkasan pesanan') ||
                text.includes('setup your account') ||
                text.includes('siapkan akun') ||
                text.includes('récapitulatif de la commande') || // Review order / order summary
                text.includes('vérifiez vos informations') || // Check your info
                text.includes('configurer votre compte') || // setup your account
                // Avoid too generic "mulai" unless it's a specific page pattern
                (text.includes('mulai') &&
                  (text.includes('pesanan') || text.includes('data') || text.includes('akun'))) ||
                window.location.href.includes('ordersummary') ||
                window.location.href.includes('setup-account') ||
                window.location.href.includes('review') ||
                // ✅ Tambahan: Deteksi checkbox kesepakatan sebagai sinyal keberhasilan
                document.querySelector(
                  'input[type="checkbox"], [role="checkbox"], .ms-Checkbox-input'
                ) !== null ||
                text.includes('agreement') ||
                text.includes('persetujuan') ||
                text.includes('syarat dan ketentuan') ||
                text.includes('terms and conditions') ||
                text.includes('contrat de service') ||
                text.includes('conditions d’utilisation')
              );
            },
            { timeout }
          ),
          'success'
        ),
        errorWatcher,
      ]);

      resolved = true;
      return result;
    };

    let result = await waitForPaymentOutcome(PAYMENT_TIMEOUT);
    console.log(`[DEBUG] Payment result: ${result}`);

    // Kalau ada address confirmation — klik, lalu tunggu outcome sebenarnya
    if (result === 'address') {
      console.log('[INFO] Address confirmation prompt detected, clicking...');
      const ADDRESS_SELECTOR = [
        'button:has-text("Use this address")',
        'button:has-text("Use address")',
        'button:has-text("Gunakan alamat ini")',
        'button:has-text("Utiliser cette adresse")',
        'button[aria-label*="Use this address" i]',
        'button[aria-label*="Gunakan alamat ini" i]',
        'button[aria-label*="Utiliser cette adresse" i]',
      ].join(', ');

      try {
        await this.page.locator(ADDRESS_SELECTOR).first().click({ force: true });
        console.log('[INFO] Address confirmed, waiting for payment outcome...');
      } catch (e) {
        console.warn('[WARN] Could not click address button:', e.message);
      }

      await this.humanDelay(1000);

      // Tunggu lagi setelah klik address — cek apakah success atau card error
      result = await waitForPaymentOutcome(PAYMENT_TIMEOUT);
      console.log(`[DEBUG] Payment result (post-address): ${result}`);
    }

    if (result === 'success') {
      console.log('[INFO] Payment successfully saved signal detected.');
      await this.triggerPaymentSaved();
    } else if (result === 'error') {
      let errorText = '';

      // Prioritize specific error from monitor if it caught more detail
      if (this._lastPaymentMonitorError) {
        errorText = this._lastPaymentMonitorError
          .replace(/Field Validation Error:|MICROSOFT_ERROR_PAGE:/i, '')
          .trim();
        this._lastPaymentMonitorError = null; // reset
      }

      if (!errorText) {
        // Coba baca dari span error message
        const spanMsg = await this.page
          .locator('span[data-automation-id="error-message"]')
          .first()
          .textContent()
          .catch(() => '');
        // Atau baca dari body teks secara umum
        const bodyMsg = await this.page
          .locator(
            'text=/check that the details|coba kartu lain|try a different card|vérifiez les détails|essayez une autre carte/i'
          )
          .first()
          .textContent()
          .catch(() => '');
        errorText = (spanMsg || bodyMsg)?.trim() || 'Unknown payment error';
      }

      console.error(`[ERROR] Payment error detected: ${errorText}`);
      throw new Error(`PAYMENT_DECLINED: ${errorText}`);
    } else if (result === null) {
      console.warn('[WARN] Payment result timeout - long loading time, trigger payment saved');
      await this.triggerPaymentSaved();
    }

    console.log('[INFO] Payment step finished');
  }

  async acceptTrialAndStart() {
    await this._logStep(16, 'Menyetujui trial dan memulai...');

    // =============================
    // ✅ Keywords
    // =============================
    const trialKeywords = [
      'start trial',
      'mulai uji coba',
      "commencer l'essai",
      "essayer l'essai",
      "demarrer l'essai",
      'try now',
      'coba sekarang',
      'essayer maintenant',
      'mulai percobaan',
      'start free trial',
      'place order',
      'pesan sekarang',
      'passer la commande',
      'commander maintenant',
      'order now',
      'checkout',
      'selesaikan pesanan',
      'confirm',
      'konfirmasi',
      'confirmer',
      'start',
      'mulai',
    ].map(browserHelper.normalizeText);

    // =============================
    // ✅ Handle checkbox (optional)
    // =============================
    try {
      const checkboxSelectors = [
        'input[type="checkbox"]',
        '[role="checkbox"]',
        '.ms-Checkbox-input',
        '#agreement-checkbox',
      ];

      const checkbox = this.page.locator(checkboxSelectors.join(', ')).first();
      const checkboxVisible = await checkbox.isVisible({ timeout: 3000 }).catch(() => false);

      if (checkboxVisible) {
        const isChecked = await checkbox
          .evaluate(
            (el) =>
              el.checked ||
              el.getAttribute('aria-checked') === 'true' ||
              el.classList.contains('is-checked')
          )
          .catch(() => false);

        if (!isChecked) {
          console.log('[INFO] Checking agreement checkbox...');
          await this.randomMouseMove();
          await checkbox.click({ force: true }).catch(() => {});
          await this.humanDelay(1000);
        } else {
          console.log('[INFO] Agreement checkbox already checked.');
        }
      } else {
        console.log('[INFO] No agreement checkbox found, skipping.');
      }
    } catch (e) {
      console.log('[INFO] Checkbox handling skipped/failed:', e.message);
    }

    // =============================
    // ✅ Retry klik tombol
    // =============================
    const MAX_RETRY = 3;
    let clicked = false;

    for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
      console.log(`[INFO] Waiting for Start Trial button (attempt ${attempt}/${MAX_RETRY})...`);

      await this.waitForSpinnerGone(1000, PAYMENT_TIMEOUT);

      // =============================
      // ✅ Tunggu tombol ready
      // =============================
      const btnReady = await this.page
        .waitForFunction(
          (keywords) => {
            const normalize = (str = '') =>
              str
                .toLowerCase()
                .replace(/[’`]/g, "'")
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/\s+/g, ' ')
                .trim();

            const candidates = [
              ...document.querySelectorAll(
                'button, [role="button"], a[role="button"], input[type="submit"]'
              ),
            ];

            const btn = candidates.find((b) => {
              const raw = b.textContent || b.value || b.getAttribute('aria-label') || '';

              const text = normalize(raw);

              return (
                text.length > 0 && text.length < 60 && keywords.some((kw) => text.includes(kw))
              );
            });

            if (!btn) return false;

            const isEnabled =
              !btn.disabled &&
              btn.getAttribute('aria-disabled') !== 'true' &&
              !btn.classList.contains('is-disabled') &&
              !btn.classList.contains('ms-Button--disabled');

            const style = window.getComputedStyle(btn);
            const isVisible =
              style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';

            return isEnabled && isVisible;
          },
          trialKeywords,
          { timeout: PAYMENT_TIMEOUT }
        )
        .then(() => true)
        .catch(() => false);

      if (!btnReady) {
        console.warn(`[WARN] Button not ready on attempt ${attempt}`);
        await this.humanDelay(2000);
        continue;
      }

      // =============================
      // ✅ Klik tombol via JS
      // =============================
      const jsClicked = await this.page.evaluate((keywords) => {
        const normalize = (str = '') =>
          str
            .toLowerCase()
            .replace(/[’`]/g, "'")
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ')
            .trim();

        const candidates = [
          ...document.querySelectorAll(
            'button, [role="button"], a[role="button"], input[type="submit"]'
          ),
        ];

        const btn = candidates.find((b) => {
          const raw = b.textContent || b.value || b.getAttribute('aria-label') || '';

          const text = normalize(raw);

          return (
            text.length > 0 &&
            text.length < 60 &&
            keywords.some((kw) => text.includes(kw)) &&
            !b.disabled &&
            b.getAttribute('aria-disabled') !== 'true'
          );
        });

        if (btn) {
          btn.click();
          return btn.textContent?.trim() || 'clicked';
        }

        return null;
      }, trialKeywords);

      if (jsClicked) {
        console.log(`[INFO] Button clicked: "${jsClicked}"`);
        clicked = true;
        break;
      }

      console.warn(`[WARN] JS click failed attempt ${attempt}`);
      await this.humanDelay(2000);
    }

    if (!clicked) {
      console.warn('[WARN] All retry attempts failed, proceeding anyway...');
    }

    console.log('[INFO] Waiting for navigation...');

    await this.runWithMonitor(
      Promise.race([
        this.page.waitForNavigation({ timeout: HARD_TIMEOUT }).catch(() => {}),
        this.page.waitForLoadState('networkidle').catch(() => {}),
      ])
    );
  }
  async clickGetStartedButton() {
    await this._logStep(17, 'Klik tombol Get Started terakhir...');

    // Kadang loading setelah accept trial sangat lama
    await this.waitForSpinnerGone(2000);

    await this.page.evaluate(() => {
      document
        .querySelectorAll('[data-testid="spinner"], .css-100, .ms-Spinner')
        .forEach((el) => el.remove());
    });

    await this.humanDelay(700);

    await this.clickButtonWithPossibleNames([
      'Next',
      'Selanjutnya',
      'Berikutnya',
      'Suivant',
      'Get started',
      'Get Started',
      'Commencer',
      'Mulai',
      'Mulai percobaan',
    ]);

    console.log('[INFO] Next/Get Started clicked');
    await this.waitForPage();
  }

  async extractFinalDomainAccount() {
    await this._logStep(18, 'Finalisasi data akun...');

    if (this.extractedDomainEmail && this.extractedDomainPassword) {
      console.log('[STEP 16] Using pre-extracted data:', this.extractedDomainEmail);
      return {
        domainEmail: this.extractedDomainEmail,
        domainPassword: this.extractedDomainPassword,
      };
    }

    const emailLocator = this.page.locator('#displayName');
    const found = await emailLocator
      .waitFor({ state: 'visible', timeout: HARD_TIMEOUT })
      .then(() => true)
      .catch(() => false);

    if (!found) {
      return {
        domainEmail: this.extractedDomainEmail || '',
        domainPassword: this.extractedDomainPassword || '',
      };
    }

    const rawText = (await emailLocator.textContent())?.trim() || '';
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.(onmicrosoft\.[a-z]{2,}|onmschina\.cn)/i;
    const domainEmail = rawText.match(emailRegex)?.[0] || this.extractedDomainEmail || '';
    const domainPassword = this.accountConfig.microsoftAccount.password;

    console.log('[STEP 16] Final Domain Email:', domainEmail);
    return { domainEmail, domainPassword };
  }

  // ─── Error detection ─────────────────────────────────────────────────────────

  async checkForError() {
    try {
      // 1. Check title & URL for obvious error states
      const title = await this.page.title().catch(() => '');
      const url = this.page.url().toLowerCase();

      if (
        /error|sorry|happened|wrong|failed|terjadi kesalahan|erreur|désolé|problème/i.test(title) ||
        url.includes('error')
      ) {
        // Double check text content to avoid false positives from "error reporting" pages etc.
        const bodyText = await this.page.textContent('body').catch(() => '');
        if (
          /something went wrong|something happened|terjadi kesalahan|terjadi sesuatu|une erreur s'est produite|un problème est survenu/i.test(
            bodyText
          )
        ) {
          return `Error Page Detected: ${title || url}`;
        }
      }

      // 2. Cek keberadaan iframe Arkose/Captcha secara eksplisit
      const captchaIndicators = [
        'button:has-text("solve the puzzle")',
        'button:has-text("résoudre le puzzle")',
        'h2:has-text("Protecting your account")',
        'h2:has-text("Protection de votre compte")',
      ];

      for (const selector of captchaIndicators) {
        if (
          await this.page
            .locator(selector)
            .first()
            .isVisible()
            .catch(() => false)
        ) {
          return 'CAPTCHA_DETECTED: Microsoft/Arkose puzzle visible.';
        }
      }

      // 3. Cek pesan error validasi di field (data-automation-id common in Fluent UI)
      const fieldError = this.page
        .locator(
          '[data-automation-id="error-message"], [role="alert"].error, .ms-MessageBar--error'
        )
        .first();
      if (await fieldError.isVisible().catch(() => false)) {
        const msg = (await fieldError.innerText().catch(() => '')).trim();
        if (msg) {
          if (
            /requêtes trop élevé|too many requests|reached the limit|jumlah permintaan terlalu tinggi/i.test(
              msg
            )
          ) {
            return `RATE_LIMIT_ERROR: ${msg}`;
          }
          return `Validation/UI Error: ${msg}`;
        }
      }

      // 4. Cek teks di SEMUA frame (termasuk iframe tersembunyi)
      const markers = [
        'something went wrong',
        'something happened',
        "there's a problem",
        'there was a problem',
        'terjadi sesuatu',
        'Terjadi kesalahan',
        'Sesuatu telah terjadi',
        'Melindungi akun Anda',
        'try a different way',
        'Protecting your account',
        'Please solve the puzzle',
        "so we know you're not a robot",
        'Selesaikan teka-teki',
        'agar kami tahu Anda bukan robot',
        'error code',
        'correlation id',
        '715-123280',
        "can't create your account",
        'cannot create your account',
        'identity could not be verified',
        'Nous avons rencontré un problème',
        ...i18n.getAllVariations('selectors.manual_review'),
      ];

      for (const frame of this.page.frames()) {
        try {
          // evaluate textContent catches things innerText might miss (hidden/shadow)
          const frameText = await frame
            .evaluate(() => document.body?.innerText || '')
            .catch(() => '');
          if (!frameText) continue;

          const lowerFrameText = frameText.toLowerCase();
          const found = markers.find((m) => lowerFrameText.includes(m.toLowerCase()));
          if (found) {
            // Ambil snippet text di sekitar marker (max 150 karakter)
            const index = lowerFrameText.indexOf(found.toLowerCase());
            const snippet = frameText
              .substring(index, index + 150)
              .replace(/\s+/g, ' ')
              .trim();

            console.log(
              `[ERROR] Marker "${found}" detected in frame: ${frame.url()}. Context: ${snippet}`
            );

            // Special handling for 715-123280 to give user better context
            if (found === '715-123280' || snippet.includes('715-123280')) {
              return `Something happened (715-123280): Sesi diblokir Microsoft, Coba ganti proxy atau data.`;
            }

            // Special handling for Manual Review
            const manualReviewMarkers = i18n.getAllVariations('selectors.manual_review');
            if (manualReviewMarkers.some((m) => found.toLowerCase().includes(m.toLowerCase()))) {
              return `MANUAL_REVIEW_DETECTED: Microsoft is reviewing your account. Usually takes 2 days.`;
            }

            return snippet || found;
          }
        } catch (e) {
          /* skip inaccessible frames */
        }
      }
    } catch (err) {
      // Ignore errors during check
    }
    return null;
  }

  async waitWithCheck(locator, timeout = HARD_TIMEOUT) {
    return await this.runWithMonitor(locator.waitFor({ state: 'visible', timeout }), timeout);
  }

  // ─── Cleanup & orchestration ─────────────────────────────────────────────────

  async cleanup() {
    try {
      await this.browser.close();
    } catch (e) {
      console.error('Error closing browser:', e);
    }

    if (config.profilePath && fs.existsSync(config.profilePath)) {
      try {
        fs.rmSync(config.profilePath, { recursive: true, force: true });
        console.log('[CLEANUP] Profile folder deleted:', config.profilePath);
      } catch (e) {
        console.warn('[CLEANUP] Could not delete profile folder:', e.message);
      }
    }
  }

  async executeStep(name, stepIndex, fn, delay = null) {
    console.log(`[STEP ${stepIndex}] ${name}`);
    this._currentStep = name;
    this._currentStepIndex = stepIndex;
    const result = await fn();
    // Tunggu spinner hilang
    await this.waitForSpinnerGone();
    // ✅ Double-check error: beri jeda 1.5 detik lalu cek ulang
    // Ini mencegah false-positive dari teks error yang muncul sementara saat transisi halaman
    const firstCheck = await this.checkForError();
    if (firstCheck) {
      console.log(
        `[executeStep] Possible error after "${name}": "${firstCheck}", re-checking in 1.5s...`
      );
      await this.humanDelay(1500);
      const recheck = await this.checkForError();
      if (recheck) {
        throw new Error(`MICROSOFT_ERROR: ${recheck} (Detected after step "${name}")`);
      }
      console.log(`[executeStep] False positive cleared after re-check.`);
    }
    if (delay) await this.humanDelay(...delay);
    return result;
  }

  async run() {
    this._currentStep = 'Initializing';
    try {
      await this.executeStep('Connecting to browser', 1, () => this.connect(), [1000, 3000]);

      /* 
      // Ambil email dari Mailporary jika tidak ada di config atau diminta khusus
      // Bagian ini di-comment dulu sementara, dipindah ke fillEmail
      if (!this.accountConfig.microsoftAccount.email || this.accountConfig.useMailporary) {
        await this.executeStep(
          'Fetching initial email from Mailporary',
          2,
          () => this.fetchNewEmailFromMailporary(),
          [500, 1000]
        );
      }
      */

      await this.executeStep(
        'Opening Microsoft page',
        3,
        () => this.openMicrosoftPage(),
        [400, 800]
      );
      await this.executeStep(
        'Clicking Try for free for target plan',
        4,
        () => this.clickTryForFreeOnTargetCard(),
        [500, 1000]
      );
      // --- Setup Phase (Steps 5-7) with Retry for OTP/Rate-limit ---
      let setupDone = false;
      let setupAttempts = 0;
      const MAX_SETUP_RETRIES = 5;

      while (!setupDone && setupAttempts < MAX_SETUP_RETRIES) {
        setupAttempts++;
        try {
          if (setupAttempts > 1) {
            console.log(`[RETRY] Starting setup retry attempt #${setupAttempts}...`);
          }

          await this.executeStep(
            'Clicking product page Next',
            5,
            () => this.clickProductNextButton(),
            [300, 600]
          );

          await this.executeStep('Filling email', 6, () => this.fillEmail(), [1000, 2500]);

          await this.executeStep(
            'Submitting email & waiting for Setup',
            7,
            () => this.submitEmailAndWaitForSetup(),
            [400, 800]
          );

          const setupResult = await this.executeStep(
            'Clicking Setup Account button',
            8,
            () => this.clickSetupAccountButton(),
            [400, 800]
          );

          if (setupResult === 'RETRY') {
            console.log(
              `[RETRY] OTP/Rate-limit hit on attempt ${setupAttempts}. Flow restarted with new email.`
            );
            continue;
          }

          setupDone = true;
        } catch (err) {
          const msg = err.message || '';

          // Handle Captcha: Ambil email baru & reload
          if (msg.includes('CAPTCHA_DETECTED') || msg.includes('Protecting your account')) {
            if (this._emailFromMailporary) {
              const errorText = 'email dari maiporary terkena captcha';
              console.error(`[ERROR] ${errorText}`);
              throw new Error(`CAPTCHA_MAILPORARY: ${errorText}`);
            }
            const warnMsg =
              '[CAPTCHA] Protecting your account detected. Switching to new Mailporary email...';
            console.warn(warnMsg);
            await this._logStep(this._currentStepIndex || 7, warnMsg);
            await this.fetchNewEmailFromMailporary();
            await this.page.reload({ waitUntil: 'domcontentloaded', timeout: HARD_TIMEOUT });
            continue;
          }

          // Handle OTP Switch (dari submitEmailAndWaitForSetup)
          if (msg.includes('FIRST_STAGE_OTP_SWITCH')) {
            console.log('[OTP] Reloading page to use new Mailporary email...');
            await this.page.reload({ waitUntil: 'domcontentloaded', timeout: HARD_TIMEOUT });
            continue;
          }

          if (
            msg.includes('RATE_LIMIT_ERROR') ||
            msg.includes('715-123280') ||
            (msg.includes('CAPTCHA') && !msg.includes('CAPTCHA_MAILPORARY'))
          ) {
            console.log(`[RETRY] Recoverable error detected: ${msg}. Retrying setup phase...`);
            await this.handleOtpWithMailporary();
            continue;
          }
          throw err;
        }
      }

      if (!setupDone) {
        throw new Error(
          `Failed to complete setup after ${MAX_SETUP_RETRIES} attempts due to persistent OTP/Rate-limits.`
        );
      }
      await this.executeStep('Filling basic info', 9, () => this.fillBasicInfo(), [1500, 3500]);
      await this.executeStep(
        'Confirming address (pre-password)',
        10,
        () => this.confirmAddressIfPrompted(10, 'Mengecek konfirmasi alamat (awal)...'),
        [300, 600]
      );
      await this.executeStep('Filling password', 11, () => this.fillPassword(), [400, 800]);
      await this.executeStep(
        'Handling optional Sign In',
        12,
        () => this.handleOptionalSignIn(),
        [400, 800]
      );
      await this.executeStep(
        'Navigating to payment page',
        13,
        async () => {
          await this.humanScroll();
          await this.randomMouseMove();
          await this.goToPaymentPage();
        },
        [400, 800]
      );
      await this.executeStep(
        'Filling VCC payment details',
        14,
        () => this.fillPaymentDetails(),
        [400, 800]
      );
      await this.executeStep('Submitting payment & waiting result', 15, () =>
        this.submitPaymentAndWaitResult()
      );
      await this.executeStep(
        'Confirming address (post-payment)',
        16,
        () => this.confirmAddressIfPrompted(16, 'Mengecek konfirmasi alamat (post-payment)...'),
        [300, 600]
      );

      if (this.accountConfig.stopPoint === 'vcc_success') {
        console.log('[INFO] Stop point reached: vcc_success. Finalizing account data...');
        this._currentStep = 'Extracting final domain account (early stop)';
        const { domainEmail, domainPassword } = await this.extractFinalDomainAccount();
        await this.triggerPaymentSaved();
        return { success: true, domainEmail, domainPassword };
      }

      await this.executeStep(
        'Accepting trial & clicking Start',
        17,
        () => this.acceptTrialAndStart(),
        [800, 1500]
      );
      await this.executeStep(
        'Clicking Get Started',
        18,
        () => this.clickGetStartedButton(),
        [800, 1500]
      );

      this._currentStep = 'Extracting final domain account';
      const { domainEmail, domainPassword } = await this.extractFinalDomainAccount();

      console.log('Automation completed successfully');

      // Fallback: Pastikan saldo berkurang jika sampai tahap ini tapi sinyal tadi terlewat
      await this.triggerPaymentSaved();

      return { success: true, domainEmail, domainPassword };
    } catch (error) {
      const step = this._currentStep;
      console.error(`Automation error at step [${step}]:`, error);
      return {
        success: false,
        domainEmail: '',
        domainPassword: '',
        error: `Step - ${step}\nError: ${error.message.trim()}`,
      };
    }
  }
}

module.exports = MicrosoftBot;
