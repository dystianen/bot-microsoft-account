const { Solver } = require('@2captcha/captcha-solver');
const config = require('../config');

const solver = new Solver(config.twoCaptcha.apiKey);

/**
 * Solve FunCaptcha (Arkose Labs)
 * @param {Object} options - Options for the solver
 * @param {string} options.pageurl - URL of the page where the captcha is located
 * @param {string} options.sitekey - Arkose Labs sitekey
 * @param {string} [options.surl] - Arkose Labs surl (optional, but often needed for Microsoft)
 * @param {Object} [options.data] - Additional data (optional)
 * @returns {Promise<string>} - The solved token
 */
const solveFunCaptcha = async (options) => {
  if (!config.twoCaptcha.apiKey) {
    throw new Error('TWOCAPTCHA_API_KEY is not configured');
  }

  console.log(`[CAPTCHA] Solving FunCaptcha for ${options.pageurl}...`);
  try {
    const result = await solver.funCaptcha({
      pageurl: options.pageurl,
      sitekey: options.sitekey,
      surl: options.surl || 'https://client-api.arkoselabs.com',
      ...options.data,
    });
    console.log('[CAPTCHA] FunCaptcha solved successfully.');
    return result.data;
  } catch (error) {
    console.error('[CAPTCHA] Failed to solve FunCaptcha:', error.message);
    throw error;
  }
};

module.exports = {
  solveFunCaptcha,
};
