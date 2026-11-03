/**
 * Static checklist templates for the Checklist Generator (Sprint 5).
 *
 * Scope: tourist visas ("tourist_visit") and student visas ("student").
 *
 * Visa facts (entry rules per passport, fees, required documents, processing
 * times) are NOT written here. They come from src/data/checklistData.json,
 * which is generated from the team's Realtime Database export, and are turned
 * into items by checklistRules.js. This file only holds general trip logistics
 * that do not depend on that data.
 *
 * Every template item has:
 *   key         stable id, reused as the checklist item id so completed
 *               status can be preserved when a checklist is regenerated
 *   category    one of CATEGORIES
 *   title       short action
 *   description what to do and why ({destination} is replaced at build time)
 *   priority    'high' | 'medium' | 'low'
 *   offsetDays  due date relative to the arrival date. Negative means before
 *               arrival, positive means after arrival.
 */

const CATEGORIES = {
  VISA: 'Visa and Immigration',
  DOCUMENTS: 'Documents',
  HOUSING: 'Housing',
  FINANCE: 'Finance',
  HEALTH: 'Health',
  TRAVEL: 'Travel',
};

const VISA_TYPES = {
  TOURIST: 'tourist_visit',
  STUDENT: 'student',
};

const SUPPORTED_VISA_TYPES = [VISA_TYPES.TOURIST, VISA_TYPES.STUDENT];

// Alternate spellings accepted from the profile, mapped to a supported type.
const VISA_TYPE_ALIASES = {
  tourist: 'tourist_visit',
  tourist_visa: 'tourist_visit',
  visitor_visa: 'tourist_visit',
  student_visa: 'student',
  study: 'student',
};

// Items for every checklist, tourist or student.
const COMMON_ITEMS = [
  {
    key: 'docs-passport-validity',
    category: CATEGORIES.DOCUMENTS,
    title: 'Check passport validity',
    description:
      'Many countries want a passport valid for several months beyond your stay and with blank pages. Check the rule for {destination} and renew now if needed.',
    priority: 'high',
    offsetDays: -150,
  },
  {
    key: 'docs-certified-copies',
    category: CATEGORIES.DOCUMENTS,
    title: 'Make copies of key documents',
    description:
      'Make paper copies of your passport, visa or authorization, insurance, and bookings, and keep them separate from the originals.',
    priority: 'medium',
    offsetDays: -21,
  },
  {
    key: 'docs-digital-backup',
    category: CATEGORIES.DOCUMENTS,
    title: 'Store secure digital backups',
    description:
      'Save scans or photos of your important documents somewhere secure that you can reach from {destination}.',
    priority: 'low',
    offsetDays: -14,
  },
  {
    key: 'finance-budget',
    category: CATEGORIES.FINANCE,
    title: 'Build a budget',
    description:
      'Estimate your costs in {destination}: flights, accommodation, daily living costs, and any visa or authorization fees.',
    priority: 'medium',
    offsetDays: -120,
  },
  {
    key: 'finance-notify-bank',
    category: CATEGORIES.FINANCE,
    title: 'Notify your bank and card providers',
    description:
      'Tell your bank and card providers about your trip so your cards are not blocked, and check foreign transaction fees.',
    priority: 'medium',
    offsetDays: -14,
  },
  {
    key: 'finance-cash-and-cards',
    category: CATEGORIES.FINANCE,
    title: 'Plan cash and payment methods',
    description:
      'Decide how you will pay in {destination}. Carry a small amount of local currency and a backup card.',
    priority: 'low',
    offsetDays: -7,
  },
  {
    key: 'health-vaccinations',
    category: CATEGORIES.HEALTH,
    title: 'Check vaccination and health entry requirements',
    description:
      'Check whether {destination} requires or recommends vaccinations for visitors, and book any appointments early.',
    priority: 'medium',
    offsetDays: -60,
  },
  {
    key: 'health-prescriptions',
    category: CATEGORIES.HEALTH,
    title: 'Plan for prescriptions and medications',
    description:
      'Pack enough regular medication for the start of your stay in its original packaging, and check that your medicines are legal in {destination}.',
    priority: 'medium',
    offsetDays: -21,
  },
  {
    key: 'travel-book-flights',
    category: CATEGORIES.TRAVEL,
    title: 'Book your flights',
    description:
      'Book your flights to {destination} once your dates are settled, and check baggage limits.',
    priority: 'high',
    offsetDays: -45,
  },
  {
    key: 'travel-connectivity',
    category: CATEGORIES.TRAVEL,
    title: 'Sort out phone data and local transport',
    description:
      'Arrange an eSIM, local SIM, or roaming plan, and find out how to get around {destination}, including any transport passes.',
    priority: 'low',
    offsetDays: -7,
  },
  {
    key: 'travel-pack-essentials',
    category: CATEGORIES.TRAVEL,
    title: 'Pack essentials and carry-on documents',
    description:
      'Pack your passport, visa papers, medication, chargers, and plug adapters in your carry-on.',
    priority: 'medium',
    offsetDays: -5,
  },
  {
    key: 'travel-arrival-plan',
    category: CATEGORIES.TRAVEL,
    title: 'Plan your arrival day',
    description:
      'Arrange airport transport and directions to your first accommodation in {destination}.',
    priority: 'low',
    offsetDays: -3,
  },
];

// Extra items for tourist visits.
const TOURIST_ITEMS = [
  {
    key: 'housing-research-areas',
    category: CATEGORIES.HOUSING,
    title: 'Choose where to stay',
    description:
      'Compare areas in {destination} for cost, safety, and how close they are to the places you want to visit.',
    priority: 'medium',
    offsetDays: -75,
  },
  {
    key: 'housing-book-accommodation',
    category: CATEGORIES.HOUSING,
    title: 'Book your accommodation',
    description:
      'Reserve your stay in {destination} and choose a booking with free cancellation if you can. Save the confirmation for border checks.',
    priority: 'high',
    offsetDays: -60,
  },
  {
    key: 'housing-confirm-bookings',
    category: CATEGORIES.HOUSING,
    title: 'Confirm bookings and check-in times',
    description:
      'Contact your host or hotel to confirm your reservation, the address, and check-in instructions, especially if you arrive late.',
    priority: 'medium',
    offsetDays: -7,
  },
  {
    key: 'health-travel-insurance',
    category: CATEGORIES.HEALTH,
    title: 'Arrange travel and medical insurance',
    description:
      'Buy travel insurance that covers medical care, and check whether {destination} requires proof of insurance for entry.',
    priority: 'high',
    offsetDays: -45,
  },
  {
    key: 'docs-driving-permit',
    category: CATEGORIES.DOCUMENTS,
    title: 'Check whether you need an international driving permit',
    description:
      'If you plan to drive in {destination}, check whether your licence is accepted or whether you need an international driving permit.',
    priority: 'low',
    offsetDays: -30,
  },
  {
    key: 'travel-plan-itinerary',
    category: CATEGORIES.TRAVEL,
    title: 'Plan your itinerary',
    description:
      'Outline what you want to do in {destination}, and book popular tours or attractions that sell out.',
    priority: 'medium',
    offsetDays: -30,
  },
  {
    key: 'visa-proof-of-travel',
    category: CATEGORIES.VISA,
    title: 'Prepare proof of itinerary, onward travel, and funds',
    description:
      'Border officers in {destination} may ask for your accommodation booking, return or onward ticket, and proof you can pay for your stay. Keep these easy to show.',
    priority: 'medium',
    offsetDays: -14,
  },
  {
    key: 'visa-keep-entry-record',
    category: CATEGORIES.VISA,
    title: 'Keep your entry record and departure date handy',
    description:
      'Keep any entry stamp, permit, or confirmation you receive on arrival, and note the date you must leave {destination}.',
    priority: 'low',
    offsetDays: 1,
  },
];

// Extra items for student visas.
const STUDENT_ITEMS = [
  {
    key: 'health-student-insurance',
    category: CATEGORIES.HEALTH,
    title: 'Arrange health insurance for your studies',
    description:
      'Check whether your school or your visa requires specific health cover in {destination}, and arrange insurance that starts the day you arrive.',
    priority: 'high',
    offsetDays: -45,
  },
  {
    key: 'housing-student-options',
    category: CATEGORIES.HOUSING,
    title: 'Ask your school about student housing',
    description:
      'Check whether your school offers housing or housing support and apply before places run out.',
    priority: 'medium',
    offsetDays: -100,
  },
  {
    key: 'housing-temporary-stay',
    category: CATEGORIES.HOUSING,
    title: 'Book temporary accommodation',
    description:
      'Reserve a short-term place to stay for your first weeks in {destination} while you sort out longer-term housing.',
    priority: 'high',
    offsetDays: -45,
  },
  {
    key: 'student-orientation',
    category: CATEGORIES.DOCUMENTS,
    title: 'Confirm enrollment and attend orientation',
    description:
      'After you arrive, complete your school enrollment steps and attend orientation. Keep proof of enrollment, as you may need it for immigration checks.',
    priority: 'medium',
    offsetDays: 7,
  },
];

// Student steps used only when there is no visa program data for the destination.
const STUDENT_GENERIC_VISA_ITEMS = [
  {
    key: 'student-admission-letter',
    category: CATEGORIES.VISA,
    title: 'Secure your admission letter',
    description:
      'Make sure you have your official acceptance or enrollment letter from your school in {destination}, as the student visa application depends on it.',
    priority: 'high',
    offsetDays: -140,
  },
  {
    key: 'student-proof-of-funds',
    category: CATEGORIES.FINANCE,
    title: 'Prepare proof of funds',
    description:
      'Gather bank statements or a funding letter showing you can cover tuition and living costs, as student visas usually require this.',
    priority: 'high',
    offsetDays: -130,
  },
  {
    key: 'visa-student-apply',
    category: CATEGORIES.VISA,
    title: 'Check student visa requirements and apply',
    description:
      'Visa details for {destination} are not in the Rootless data yet. Check the official {destination} government website for the student visa requirements, fees, and processing times, then apply.',
    priority: 'high',
    offsetDays: -120,
  },
  {
    key: 'visa-track-application',
    category: CATEGORIES.VISA,
    title: 'Track your application and respond to requests',
    description:
      'Check your application status and respond quickly to any request for extra documents.',
    priority: 'medium',
    offsetDays: -75,
  },
  {
    key: 'visa-collect-decision',
    category: CATEGORIES.VISA,
    title: 'Check your approval details',
    description:
      'Once approved, confirm that your name, passport number, and permitted dates are correct before you travel.',
    priority: 'high',
    offsetDays: -45,
  },
];

// Tourist steps used when a visa application is needed (or entry rules are
// unknown) and there is no visa program data for the destination.
const TOURIST_GENERIC_VISA_ITEMS = [
  {
    key: 'visa-gather-documents',
    category: CATEGORIES.VISA,
    title: 'Gather application documents',
    description:
      'If you need a visa or authorization, collect the documents the official {destination} site asks for, such as photos, forms, bookings, and proof of funds.',
    priority: 'high',
    offsetDays: -75,
  },
  {
    key: 'visa-submit-application',
    category: CATEGORIES.VISA,
    title: 'Submit your visa or travel authorization application',
    description:
      'Apply through the official {destination} channel only, pay the fee, and keep a copy of your confirmation.',
    priority: 'high',
    offsetDays: -60,
  },
  {
    key: 'visa-track-application',
    category: CATEGORIES.VISA,
    title: 'Track your application and respond to requests',
    description:
      'Check your application status and respond quickly to any request for extra documents.',
    priority: 'medium',
    offsetDays: -30,
  },
  {
    key: 'visa-collect-decision',
    category: CATEGORIES.VISA,
    title: 'Check your approval details',
    description:
      'Once approved, confirm that your name, passport number, and permitted dates are correct before you travel.',
    priority: 'high',
    offsetDays: -21,
  },
];

module.exports = {
  CATEGORIES,
  VISA_TYPES,
  SUPPORTED_VISA_TYPES,
  VISA_TYPE_ALIASES,
  COMMON_ITEMS,
  TOURIST_ITEMS,
  STUDENT_ITEMS,
  STUDENT_GENERIC_VISA_ITEMS,
  TOURIST_GENERIC_VISA_ITEMS,
};
