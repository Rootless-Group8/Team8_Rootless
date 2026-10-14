/**
 * sources/govUk.js
 *
 * Adapter for the UK's "Check if you need a UK visa" tool
 * (https://www.gov.uk/check-uk-visa).
 *
 * ⚠️ IMPORTANT CONTEXT ⚠️
 * This tool is a branching wizard ("smart answer"), NOT a fixed
 * two-part URL (nationality + purpose). The number of follow-up
 * questions depends on the nationality -- confirmed from real gov.uk
 * examples:
 *   - /y/usa/tourism            -> needs an extra "dual British or
 *                                  Irish citizen?" question first
 *   - /y/taiwan/tourism         -> goes straight to a full result
 *   - /y/st-lucia/tourism/no    -> needs a "traveling with family?"
 *                                  question, answered here
 *
 * So instead of building one URL and parsing it, this adapter WALKS
 * the wizard: fetch a page, check if it's a question or the final
 * result, answer known questions with a sensible default, and
 * repeat (capped at MAX_STEPS to avoid an infinite loop if gov.uk
 * changes their question wording).
 *
 * This machine's sandbox has no network access, so this has NOT been
 * run against the live site end-to-end. The question text and
 * general page structure below are copied from real gov.uk result
 * pages found via search, so they should be close -- but verify
 * against the live site before the demo if possible.
 */

const axios = require("axios");
const cheerio = require("cheerio");
const { SourceAdapter } = require("./base");
const { createVisaRequirement, RecordStatus } = require("../models");

const BASE_URL = "https://www.gov.uk/check-uk-visa/y";
const MAX_STEPS = 6; // safety cap so a wording change can't loop forever

// Nationality slugs gov.uk's tool uses in its URLs.
// CONFIRMED (from real gov.uk examples found via search):
//   US, TW, LC, BA, IL, NI
// UNVERIFIED GUESSES (following the confirmed lowercase-hyphenated-
// country-name pattern) -- these are the other 9 phase-1 destination
// countries as ORIGINS visiting the UK. Test each of these live
// before trusting the results; if one 404s or lands on an unexpected
// page, the slug is probably wrong -- check in a browser and fix here.
const NATIONALITY_SLUGS = {
  US: "usa",
  TW: "taiwan",
  LC: "st-lucia",
  BA: "bosnia-and-herzegovina",
  IL: "israel",
  NI: "nicaragua",
  // --- unverified guesses below, test before relying on them ---
  CA: "canada",
  DE: "germany",
  PT: "portugal",
  MX: "mexico",
  ES: "spain",
  AU: "australia",
  JP: "japan",
  NL: "netherlands",
  NZ: "new-zealand",
  CN: "china"
};

// When the wizard asks one of these follow-up questions, answer with
// the given default slug rather than stopping. Matched against the
// page's visible question text (substring, case-insensitive).
// Defaults chosen for the "ordinary short-term tourist" case, which
// matches this ticket's scope (visiting/short-term travel).
//
// NOTE: question ORDER varies by nationality (confirmed: US asks
// "dual British or Irish citizen?" before purpose; other countries
// ask purpose first, or skip the dual-citizen question entirely).
// So we don't hardcode a fixed URL shape -- we start from just the
// nationality slug and answer whatever question comes back, in
// whatever order gov.uk asks it.
const DEFAULT_ANSWERS = [
  { match: "what are you coming to the uk to do", answer: "tourism" },
  { match: "dual british or irish citizen", answer: "no" },
  { match: "travelling with or visiting either your partner or a family member", answer: "no" },
  { match: "what sort of passport do you have", answer: "ordinary-passport" }, // guess -- verify slug
];

function isResultPage($) {
  const title = $("title").text() || "";
  return /information based on your answers/i.test(title) || /information based on your answers/i.test($("h1").first().text());
}

function findQuestionHeading($) {
  // gov.uk renders the current question as an h1 on both the normal
  // question page and the "There is a problem" error-state page.
  return $("h1").first().text().trim();
}

function pickDefaultAnswer(questionText) {
  const lower = questionText.toLowerCase();
  const match = DEFAULT_ANSWERS.find((d) => lower.includes(d.match));
  return match ? match.answer : null;
}

function parseResultPage($, url) {
  // The result heading (e.g. "You'll need a visa to come to the UK",
  // "You'll need an electronic travel authorisation (ETA) or a visa")
  // is the first heading-like element after the page title inside #content.
  const content = $("#content");
  // The FIRST h1/h2 on these pages is always the generic page title
  // ("Check if you need a UK visa: Information based on your
  // answers") -- confirmed from a real scrape. The actual answer
  // ("You'll need a visa to come to the UK", etc.) is the heading
  // right after it.
  const headings = content
    .find("h1, h2")
    .map((_, el) => $(el).text().trim())
    .get();
  const resultHeading = headings.length > 1 ? headings[1] : headings[0] || "";

  const bodyText = content.clone();

  // Cut off known trailing sections that aren't actual requirement
  // content: the "Your answers" recap, and the "Related content" /
  // "Explore the topic" sidebar links gov.uk appends after the real
  // answer. Both were observed bleeding into the document list.
  const cutMarkers = /your answers|related content|explore the topic/i;
  bodyText.find("h2, h3, nav, aside").each((_, el) => {
    if (cutMarkers.test($(el).text())) {
      $(el).nextAll().remove();
      $(el).remove();
    }
  });
  // Also strip common gov.uk component wrappers for these sections
  // outright, in case they aren't simple heading-delimited siblings.
  bodyText.find(".gem-c-related-navigation, .gem-c-contextual-sidebar, nav, aside").remove();

  const documents = [];
  bodyText.find("li").each((_, el) => {
    const text = $(el).text().trim();
    if (text) documents.push(text);
  });

  const noVisaPattern = /will not need|do not need|no visa (is )?required/i;
  const needsSomethingPattern = /need (a|an) (visa|electronic travel authorisation)/i;

  const visaRequired = noVisaPattern.test(resultHeading)
    ? false
    : needsSomethingPattern.test(resultHeading)
    ? true
    : null;

  return {
    visaRequired,
    documents,
    resultHeading,
    sourceUrl: url,
  };
}

const govUkAdapter = new (class extends SourceAdapter {
  get name() {
    return "gov.uk";
  }

  supports(destinationCountry) {
    return destinationCountry === "GB";
  }

  async fetch(originCountry, destinationCountry) {
    const slug = NATIONALITY_SLUGS[originCountry];

    if (!slug) {
      return createVisaRequirement({
        originCountry,
        destinationCountry,
        sourceName: this.name,
        status: RecordStatus.MISSING,
        notes: `No nationality slug mapped for "${originCountry}" yet. Add it to NATIONALITY_SLUGS in sources/govUk.js.`,
      });
    }

    let path = slug;
    let lastUrl = `${BASE_URL}/${path}`;
    let steps = 0;

    while (steps < MAX_STEPS) {
      steps++;
      let html;
      try {
        const response = await axios.get(lastUrl, { timeout: 10000 });
        html = response.data;
      } catch (err) {
        throw new Error(`Request to ${lastUrl} failed: ${err.message}`);
      }

      const $ = cheerio.load(html);

      if (isResultPage($)) {
        const result = parseResultPage($, lastUrl);
        return createVisaRequirement({
          originCountry,
          destinationCountry,
          visaRequired: result.visaRequired,
          documentsRequired: result.documents,
          sourceUrl: result.sourceUrl,
          sourceName: this.name,
          status: result.documents.length > 0 ? RecordStatus.OK : RecordStatus.UNCLEAR,
          notes: result.documents.length > 0 ? `Result: "${result.resultHeading}"` : `Reached result page but couldn't parse content confidently. Result heading was: "${result.resultHeading}"`,
        });
      }

      // Not the final result -- it's a question. Try to answer it.
      const questionText = findQuestionHeading($);
      const nextAnswer = pickDefaultAnswer(questionText);

      if (!nextAnswer) {
        return createVisaRequirement({
          originCountry,
          destinationCountry,
          sourceUrl: lastUrl,
          sourceName: this.name,
          status: RecordStatus.UNCLEAR,
          notes: `Hit an unrecognized wizard question after ${steps} step(s): "${questionText}". Add it to DEFAULT_ANSWERS in sources/govUk.js.`,
        });
      }

      path = `${path}/${nextAnswer}`;
      lastUrl = `${BASE_URL}/${path}`;
    }

    return createVisaRequirement({
      originCountry,
      destinationCountry,
      sourceUrl: lastUrl,
      sourceName: this.name,
      status: RecordStatus.UNCLEAR,
      notes: `Wizard did not reach a result page within ${MAX_STEPS} steps. Last URL tried: ${lastUrl}`,
    });
  }
})();

module.exports = govUkAdapter;