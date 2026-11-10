/**
 * mockCommunityTips.js
 *
 * TEMPORARY mock data for the Community Tips UI, used because the real
 * Community Tips API hasn't been built yet (planned for a future sprint).
 *
 * Shape matches what the real API is expected to return per tip:
 *   {
 *     id: string,
 *     destinationCountry: string (ISO2, matching the convention used
 *       everywhere else in the app -- countries, checklist, etc.),
 *     authorName: string,
 *     category: "housing" | "banking" | "transport" | "food" | "culture" | "general",
 *     content: string,
 *     createdAt: ISO date string,
 *     helpfulCount: number,
 *   }
 *
 * DELETE this file once CommunityTipsPage.jsx is connected to the real
 * API -- it exists only so the UI has something real-looking to render
 * against in the meantime.
 */

export const CATEGORIES = [
  { key: "housing", label: "Housing" },
  { key: "banking", label: "Banking" },
  { key: "transport", label: "Transport" },
  { key: "food", label: "Food" },
  { key: "culture", label: "Culture" },
  { key: "general", label: "General" },
];

export const MOCK_TIPS = [
  {
    id: "tip-ca-1",
    destinationCountry: "CA",
    authorName: "Priya K.",
    category: "banking",
    content:
      "Don't wait for your SIN to arrive before opening a bank account -- RBC and Scotiabank both let you open one with just your study/work permit, and you can add the SIN later once it shows up.",
    createdAt: "2026-09-02T14:30:00.000Z",
    helpfulCount: 41,
  },
  {
    id: "tip-ca-2",
    destinationCountry: "CA",
    authorName: "Marcus T.",
    category: "transport",
    content:
      "If you're in Toronto, get the PRESTO card the day you land. Paying per-ride in cash is almost double the cost of a loaded PRESTO fare, and you'll need it for the streetcars too, not just the subway.",
    createdAt: "2026-08-14T09:15:00.000Z",
    helpfulCount: 27,
  },
  {
    id: "tip-gb-1",
    destinationCountry: "GB",
    authorName: "Amara O.",
    category: "housing",
    content:
      "A lot of UK landlords want a UK-based guarantor, which international students obviously don't have. Look up 'rent guarantor service' -- companies like Housing Hand exist specifically for this and most unis have a partnership discount.",
    createdAt: "2026-07-22T18:00:00.000Z",
    helpfulCount: 63,
  },
  {
    id: "tip-gb-2",
    destinationCountry: "GB",
    authorName: "Liam F.",
    category: "food",
    content:
      "Supermarket own-brand ranges (Tesco's 'Everyday Value', Sainsbury's 'Basics') are genuinely fine quality, not a downgrade like some US store brands. Cut my weekly food bill by about a third just switching to those.",
    createdAt: "2026-09-10T11:45:00.000Z",
    helpfulCount: 19,
  },
  {
    id: "tip-mx-1",
    destinationCountry: "MX",
    authorName: "Sofia R.",
    category: "culture",
    content:
      "If your consulate interview is in Spanish and yours isn't fluent, it's completely normal to ask to switch to English partway through. Nobody will hold it against you, better than fumbling an answer about your financial situation.",
    createdAt: "2026-10-01T16:20:00.000Z",
    helpfulCount: 34,
  },
  {
    id: "tip-es-1",
    destinationCountry: "ES",
    authorName: "Tom B.",
    category: "banking",
    content:
      "Bring more copies of your bank statements than you think you need to BLS. Mine got rejected once for a document missing a page, and rebooking an appointment slot added almost three weeks to the whole process.",
    createdAt: "2026-09-28T08:00:00.000Z",
    helpfulCount: 22,
  },
];
