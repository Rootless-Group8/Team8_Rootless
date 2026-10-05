/**
 * sources/browserFetch.js
 *
 * Shared helper for sources that need a real (headless) browser
 * instead of a plain HTTP request -- either because the page is
 * rendered client-side with JavaScript (e.g. Australia's visa finder)
 * or because the server blocks simple HTTP clients (e.g. Japan's
 * MOFA site returning 403 to axios, or EUR-Lex's AWS WAF challenge).
 *
 * A full browser engine sends realistic headers, executes JS
 * challenges, and behaves like an actual visitor, which gets past
 * basic bot-filtering that a plain HTTP request cannot.
 *
 * HARDENING: a GitHub Actions run got stuck indefinitely (no error,
 * no timeout) when this was called for EUR-Lex -- likely Puppeteer's
 * browser launch itself hanging in that environment, which the
 * page.goto() timeout alone doesn't cover (that timeout only applies
 * once a browser is already running). This wraps the ENTIRE operation
 * in a hard Promise.race timeout, so no matter what internal step
 * hangs (launch, goto, evaluate), this always eventually rejects
 * instead of hanging forever -- letting callers' retry logic actually
 * kick in.
 */

const puppeteer = require("puppeteer");

function timeoutAfter(ms, label) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms (hard overall timeout)`)), ms);
  });
}

async function fetchRenderedHtmlInner(url, options = {}) {
  const { waitForSelector, timeout = 30000 } = options;

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage();
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

/**
 * Loads a URL in a headless browser and returns the fully rendered
 * HTML (after JS has run). Always settles (resolves or rejects)
 * within roughly `timeout + 15000`ms, even if an internal step (like
 * browser launch) would otherwise hang indefinitely.
 */
async function fetchRenderedHtml(url, options = {}) {
  const { timeout = 30000 } = options;
  // Give the inner operation's own timeout a head start, then add a
  // buffer -- this outer race is a safety net for hangs the inner
  // timeout doesn't cover (like browser launch itself), not the
  // primary timeout mechanism.
  const hardTimeoutMs = timeout + 15000;

  return Promise.race([fetchRenderedHtmlInner(url, options), timeoutAfter(hardTimeoutMs, `fetchRenderedHtml(${url})`)]);
}

module.exports = { fetchRenderedHtml };