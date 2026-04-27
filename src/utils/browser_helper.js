/**
 * Common Playwright helper functions for human-like interaction and generic element finding.
 */

/**
 * Delay with random jitter
 */
const humanDelay = async (page, min = 1000, max = 3000) => {
  const delay = Math.floor(Math.random() * (max - min + 1) + min);
  await page.waitForTimeout(delay);
};

/**
 * Normalize text for consistent comparison
 */
const normalizeText = (str = '') =>
  str
    .toLowerCase()
    .replace(/[’`]/g, "'") // samakan semua petik
    .normalize('NFD') // hilangkan aksen (é -> e)
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ') // rapikan spasi
    .trim();

/**
 * Move mouse to a random position
 */
const randomMouseMove = async (page) => {
  try {
    const { width, height } = page.viewportSize() || { width: 1280, height: 720 };
    const x = Math.floor(Math.random() * width);
    const y = Math.floor(Math.random() * height);
    const steps = Math.floor(Math.random() * 3) + 2;
    await page.mouse.move(x, y, { steps });
  } catch (e) {}
};

/**
 * Wait for an element to be visible, with spinner and monitor support
 */
const waitForVisible = async (page, locator, callbacks = {}) => {
  const {
    waitForSpinnerGone = async () => {},
    runWithMonitor = async (p) => await p,
    hardTimeout = 30000,
  } = callbacks;

  await waitForSpinnerGone();
  await runWithMonitor(locator.waitFor({ state: 'visible', timeout: hardTimeout }));
};

/**
 * Click an element with human-like behavior (hover, delay, then click)
 */
const humanClick = async (page, locator, options = {}) => {
  await randomMouseMove(page);
  await locator.hover({ force: true }).catch(() => {});
  await page.waitForTimeout(300);
  await locator.click({ force: true, ...options });
  await page.waitForTimeout(200);
};

/**
 * Type text with random delay between characters
 */
const humanType = async (page, locator, text) => {
  if (!text) return;
  await locator.click({ force: true }).catch(() => {});
  await page.waitForTimeout(100);
  await locator.fill('');
  await locator.pressSequentially(text, {
    delay: Math.floor(Math.random() * 60) + 30,
  });
};

/**
 * Paste text via clipboard (fastest) with fallback to fill
 */
const humanPaste = async (page, locator, text) => {
  if (!text) return;
  await locator.click({ force: true }).catch(() => {});
  await page.waitForTimeout(100);
  await locator.fill('');
  await page.waitForTimeout(50);
  await page.evaluate((val) => {
    const el = document.activeElement;
    if (el) {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set;
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(el, val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  }, text);
  const current = await locator.inputValue().catch(() => '');
  if (current !== text) {
    await locator.fill(text);
  }
};

/**
 * Scroll the page randomly
 */
const humanScroll = async (page) => {
  try {
    const direction = Math.random() > 0.5 ? 1 : -1;
    const distance = Math.floor(Math.random() * 300) + 100;
    await page.mouse.wheel(0, direction * distance);
  } catch (e) {}
};

/**
 * Get a locator based on multiple keywords for common attributes
 */
const getGenericLocator = (page, keywords, elementType = 'input') => {
  const kws = Array.isArray(keywords) ? keywords : [keywords];
  const selectors = kws
    .map(
      (keyword) =>
        `${elementType}[id*="${keyword}" i], ${elementType}[data-testid*="${keyword}" i], ${elementType}[data-bi-id*="${keyword}" i], ${elementType}[name*="${keyword}" i], ${elementType}[aria-label*="${keyword}" i]`
    )
    .join(', ');
  return page.locator(selectors).first();
};

/**
 * Get a button/link locator based on text or common attributes
 */
const getGenericButton = (page, keywords) => {
  const textSelectors = keywords
    .map((k) => `button:has-text("${k}"), a:has-text("${k}")`)
    .join(', ');

  const attrSelectors = keywords
    .map(
      (k) => `
        button[id*="${k}" i],
        button[data-testid*="${k}" i],
        button[data-bi-id*="${k}" i],
        a[data-bi-id*="${k}" i]
      `
    )
    .join(', ');

  return page.locator(`${textSelectors}, ${attrSelectors}`).first();
};

/**
 * Click a button that matches one of the possible names
 */
const clickButtonWithPossibleNames = async (page, names, options = {}, callbacks = {}) => {
  const {
    waitForSpinnerGone = async () => {},
    runWithMonitor = async (p) => await p,
    hardTimeout = 30000,
  } = callbacks;

  await waitForSpinnerGone();

  const { excludeText = [] } = options;
  const excludeLower = excludeText.map((e) => e.trim().toLowerCase());
  const keywords = names.flatMap((n) => n.trim().toLowerCase().split(/\s+/));
  const uniqueKeywords = [...new Set(keywords)];

  const found = await page.evaluate(
    ({ keywords, excludeLower }) => {
      const candidates = [
        ...document.querySelectorAll(
          'button, [role="button"], a, input[type="button"], input[type="submit"], [class*="ms-Button"], [class*="btn"]'
        ),
      ];

      const el = candidates.find((b) => {
        const text = (b.textContent || b.value || b.getAttribute('aria-label') || '')
          .trim()
          .toLowerCase();

        if (text.length === 0 || text.length >= 60) return false;
        if (excludeLower.some((ex) => text.includes(ex))) return false;
        return keywords.some((kw) => text.includes(kw));
      });

      if (!el) return null;

      el.click();
      return el.textContent?.trim() || el.value || 'unknown';
    },
    { keywords: uniqueKeywords, excludeLower }
  );

  if (found) {
    console.log(`[INFO] Clicked: "${found}"`);
    return true;
  }

  console.log('[WARN] JS click not found, fallback to Playwright...');
  const pattern = new RegExp(
    names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*')).join('|'),
    'i'
  );

  const allButtonLocators = page.getByRole('button', { name: pattern });
  const count = await allButtonLocators.count();

  let button = null;
  for (let i = 0; i < count; i++) {
    const candidate = allButtonLocators.nth(i);
    const text = (await candidate.textContent().catch(() => '')).trim().toLowerCase();
    if (excludeLower.some((ex) => text.includes(ex))) continue;
    button = candidate;
    break;
  }

  if (!button) {
    button = allButtonLocators.first();
  }

  try {
    await runWithMonitor(button.waitFor({ state: 'visible', timeout: hardTimeout }));
    await humanClick(page, button, { timeout: hardTimeout });
    const clickedText = await button.textContent().catch(() => 'unknown');
    console.log(`[INFO] Clicked: "${clickedText?.trim()}"`);
    return true;
  } catch (err) {
    console.log('[DEBUG] Searching for button in frames...');
    for (const frame of page.frames()) {
      try {
        const frameButton = frame.getByRole('button', { name: pattern }).first();
        if (await frameButton.isVisible().catch(() => false)) {
          const frameText = (await frameButton.textContent().catch(() => '')).trim().toLowerCase();
          if (excludeLower.some((ex) => frameText.includes(ex))) continue;
          console.log(`[INFO] Found and clicking button in frame: ${frame.url()}`);
          await frameButton.click();
          return true;
        }
      } catch (fErr) {}
    }
    throw err;
  }
};

/**
 * Select an option from a dropdown by text
 */
const selectDropdownByText = async (page, selector, text, callbacks = {}) => {
  const {
    waitForSpinnerGone = async () => {},
    runWithMonitor = async (p) => await p,
    hardTimeout = 30000,
  } = callbacks;

  await waitForSpinnerGone();

  const dropdown = page.locator(selector).first();
  await runWithMonitor(dropdown.waitFor({ state: 'visible', timeout: hardTimeout }));
  await dropdown.scrollIntoViewIfNeeded();

  const tagName = await dropdown.evaluate((el) => el.tagName.toLowerCase());

  if (tagName === 'select') {
    const searchList = Array.isArray(text) ? text : [text];
    for (const t of searchList) {
      try {
        await dropdown.selectOption({ label: t });
        console.log(`[DROPDOWN] Selected via native: "${t}"`);
        return true;
      } catch {
        continue;
      }
    }
  }

  await dropdown.click();

  const dropdownItems = page.locator('.ms-Dropdown-items');
  await runWithMonitor(dropdownItems.waitFor({ state: 'visible', timeout: hardTimeout }));

  const searchList = Array.isArray(text)
    ? text.map((t) => (t || '').toString().trim())
    : [(text || '').toString().trim()];

  let optionSelector = null;
  for (const search of searchList) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const candidate = page
      .locator('.ms-Dropdown-item', { hasText: new RegExp(escaped, 'i') })
      .first();
    if (await candidate.count()) {
      optionSelector = { hasText: new RegExp(escaped, 'i') };
      break;
    }
  }

  if (!optionSelector) {
    console.warn(`[DROPDOWN] Option not found for: ${text}`);
    await page.keyboard.press('Escape');
    return false;
  }

  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const freshOption = page.locator('.ms-Dropdown-item', optionSelector).first();
      await freshOption.waitFor({ state: 'attached', timeout: hardTimeout });
      await freshOption.scrollIntoViewIfNeeded();

      const displayText = await freshOption.textContent().catch(() => text);
      console.log(`[DROPDOWN] Clicking: "${displayText?.trim()}" (attempt ${attempt + 1})`);

      try {
        await freshOption.evaluate((el) => el.click());
      } catch {
        await humanClick(page, freshOption, { timeout: hardTimeout });
      }

      await page
        .waitForSelector('.ms-Dropdown-items', {
          state: 'detached',
          timeout: hardTimeout,
        })
        .catch(() => {});

      return true;
    } catch (err) {
      if (attempt === MAX_RETRIES - 1) throw err;
      await page.waitForTimeout(150);
    }
  }
  return false;
};

/**
 * Wait for a page to load or a specific selector to appear
 */
const waitForPage = async (page, selector, callbacks = {}) => {
  const {
    waitForSpinnerGone = async () => {},
    runWithMonitor = async (p) => await p,
    humanDelay = async () => {},
    hardTimeout = 30000,
  } = callbacks;

  await waitForSpinnerGone();
  if (selector) {
    await runWithMonitor(
      page.waitForSelector(selector, {
        state: 'attached',
        timeout: hardTimeout,
      })
    );
  } else {
    await runWithMonitor(
      page.waitForLoadState('domcontentloaded', {
        timeout: hardTimeout,
      })
    );
  }
  await humanDelay(2500);
};

/**
 * Detect and close common cookie popups
 */
const handleCookiePopup = async (page) => {
  const MAX_WAIT_MS = 3000;
  const CHECK_INTERVAL = 500;
  let elapsed = 0;

  console.log('[COOKIE] Checking for cookie popup...');

  let dialogVisible = false;
  while (elapsed < MAX_WAIT_MS) {
    const dialog = page
      .locator('div[role="dialog"][aria-label*="cookie" i], div[role="dialog"][aria-modal="true"]')
      .first();
    dialogVisible = await dialog.isVisible().catch(() => false);
    if (dialogVisible) break;
    await page.waitForTimeout(CHECK_INTERVAL);
    elapsed += CHECK_INTERVAL;
  }

  if (!dialogVisible) {
    console.log('[COOKIE] No cookie popup detected.');
    return;
  }

  console.log('[COOKIE] Cookie popup detected, closing...');

  const closeStrategies = [
    () => page.locator('button[aria-label="Fermer"]').first(),
    () => page.locator('button').filter({ hasText: '✕' }).first(),
    () => page.locator('button').filter({ hasText: '×' }).first(),
    () => page.locator('button[aria-label*="close" i], button[aria-label*="fermer" i]').first(),
  ];

  for (const getLocator of closeStrategies) {
    const btn = getLocator();
    if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await btn.click({ force: true });
      console.log('[COOKIE] Cookie popup closed.');
      await page.waitForTimeout(800);
      return;
    }
  }

  console.warn('[COOKIE] Close button not found, trying Escape...');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
};

module.exports = {
  humanDelay,
  randomMouseMove,
  humanClick,
  humanType,
  humanPaste,
  humanScroll,
  getGenericLocator,
  getGenericButton,
  clickButtonWithPossibleNames,
  selectDropdownByText,
  waitForPage,
  waitForVisible,
  handleCookiePopup,
  normalizeText,
};
