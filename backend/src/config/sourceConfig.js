/**
 * Official government pages watched by the Sprint 10 change monitor.
 *
 * Scope matches the Checklist Generator: tourist and student visas for
 * Canada and the UK only. Each entry needs:
 *   sourceId   stable ID used in Firestore records (never rename once used)
 *   country    destination country name
 *   visaType   'tourist' or 'student'
 *   url        the official page
 *   selector   CSS selector for the main content area
 *   exclude    optional extra selectors removed before hashing, for page
 *              furniture that changes without the policy text changing
 *
 * Selectors follow the published page templates:
 *   gov.uk     GOV.UK Frontend wraps page content in <main id="content">
 *   canada.ca  the Canada.ca (WET) template marks the content area with
 *              <main property="mainContentOfPage">. Its .pagedetails block
 *              (date modified, report a problem, share) is excluded.
 */

const GOV_UK_SELECTOR = 'main#content';
const GOV_UK_EXCLUDE = ['.gem-c-print-link', '.gem-c-contents-list'];

const CANADA_SELECTOR = 'main[property="mainContentOfPage"]';
const CANADA_EXCLUDE = ['.pagedetails'];

const MONITORED_SOURCES = Object.freeze([
  Object.freeze({
    sourceId: 'uk-student-visa',
    country: 'United Kingdom',
    visaType: 'student',
    url: 'https://www.gov.uk/student-visa',
    selector: GOV_UK_SELECTOR,
    exclude: GOV_UK_EXCLUDE,
  }),
  Object.freeze({
    sourceId: 'uk-standard-visitor',
    country: 'United Kingdom',
    visaType: 'tourist',
    url: 'https://www.gov.uk/standard-visitor',
    selector: GOV_UK_SELECTOR,
    exclude: GOV_UK_EXCLUDE,
  }),
  Object.freeze({
    sourceId: 'canada-study-permit',
    country: 'Canada',
    visaType: 'student',
    url: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit.html',
    selector: CANADA_SELECTOR,
    exclude: CANADA_EXCLUDE,
  }),
  Object.freeze({
    sourceId: 'canada-visit-visa-eta',
    country: 'Canada',
    visaType: 'tourist',
    url: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/visit-canada.html',
    selector: CANADA_SELECTOR,
    exclude: CANADA_EXCLUDE,
  }),
]);

module.exports = { MONITORED_SOURCES };
