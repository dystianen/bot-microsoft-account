const languages = require('../config/languages');

class I18n {
  constructor(lang = languages.default) {
    this.setLanguage(lang);
  }

  /**
   * Set the current language
   * @param {string} lang Language code (id, en, fr, etc.)
   */
  setLanguage(lang) {
    this.currentLang = languages[lang] ? lang : languages.default;
    this.t = languages[this.currentLang];
  }

  /**
   * Get a translated string or array
   * @param {string} path Dot-separated path (e.g., 'steps.connecting')
   * @param {Object} placeholders Object containing placeholder values (e.g., { plan: 'E3' })
   * @returns {string|string[]}
   */
  get(path, placeholders = {}) {
    const parts = path.split('.');
    let value = this.t;

    for (const part of parts) {
      if (value && value[part] !== undefined) {
        value = value[part];
      } else {
        // Fallback to default language if path not found in current language
        const fallback = this._getFallback(path);
        if (fallback !== undefined) return this._processPlaceholders(fallback, placeholders);
        return path; // Return the path itself if not found anywhere
      }
    }

    return this._processPlaceholders(value, placeholders);
  }

  /**
   * Get all variations of a string across all languages (useful for combined selectors)
   * @param {string} path Dot-separated path
   * @returns {string[]}
   */
  getAllVariations(path) {
    const variations = new Set();
    const parts = path.split('.');

    for (const lang in languages) {
      if (lang === 'default') continue;

      let value = languages[lang];
      for (const part of parts) {
        if (value && value[part] !== undefined) {
          value = value[part];
        } else {
          value = undefined;
          break;
        }
      }

      if (value !== undefined) {
        if (Array.isArray(value)) {
          value.forEach((v) => variations.add(v));
        } else {
          variations.add(value);
        }
      }
    }

    return Array.from(variations);
  }

  _getFallback(path) {
    const parts = path.split('.');
    let value = languages[languages.default];

    for (const part of parts) {
      if (value && value[part] !== undefined) {
        value = value[part];
      } else {
        return undefined;
      }
    }
    return value;
  }

  _processPlaceholders(value, placeholders) {
    if (typeof value !== 'string') return value;

    let processed = value;
    for (const [key, val] of Object.entries(placeholders)) {
      processed = processed.replace(new RegExp(`{${key}}`, 'g'), val);
    }
    return processed;
  }
}

module.exports = I18n;
