/**
 * sources/browserFetch.js
 *
 * Shared helper for sources that need a real (headless) browser
 * instead of a plain HTTP request -- either because the page is
 * rendered client-side with JavaScript (e.g. Australia's visa finder)
 * or because the server blocks simple HTTP clients (e.g. Japan's
 * MOFA site returning 403 to axios).
 *
 * A full browser engine sends realistic headers, executes JS
 * challenges, and behaves like an actual visitor, which gets past
 * basic bot-filtering that a plain HTTP request cannot.
 */

const puppeteer = require("puppeteer");

/**
 * Loads a URL in a headless browser and returns the fully rendered
 * HTML (after JS has run).
 *
 * @param {string} url
 * @param {Object} [options]
 * @param {string} [options.waitForSelector] - CSS selector to wait for before grabbing HTML (use for JS-rendered content that loads after initial page load)
 * @param {number} [options.timeout] - ms, default 30000
 */
async function fetchRenderedHtml(url, options = {}) {
  const { waitForSelector, timeout = 30000 } = options;

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    // Realistic browser UA -- helps with sites doing basic bot
    // filtering in addition to any JS-execution requirement.
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    );
    await page.goto(url, { waitUntil: "networkidle2", timeout });

    if (waitForSelector) {
      await page.waitForSelector(waitForSelector, { timeout });
    }

    return await page.content();
  } finally {
    await browser.close();
  }
}

module.exports = { fetchRenderedHtml };