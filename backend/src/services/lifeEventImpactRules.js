// Impact rules for the Visa Life Planner.
//
// Each rule looks at one "trigger" life event (plus the user's other events)
// and returns an impact or null. Rules are plain objects in the RULES list,
// and the numbers they use live in IMPACT_CONFIG, so a new rule or a changed
// threshold doesn't need any change to the engine in evaluateImpacts().
//
// Everything in this file is pure: no Firebase, no clock. The service passes
// in "today" and the processing times it looked up.

const DAY_MS = 24 * 60 * 60 * 1000;

const IMPACT_CONFIG = {
  // A visa expiring within this many days with no renewal planned is critical.
  renewalWindowDays: 90,
  // Extra days to start a renewal before the processing time alone says to,
  // so there is room for document gathering and appointment slots.
  renewalBufferDays: 14,
  // Used when the visa's processing time can't be found or has no numbers
  // (for example the Canada study and work permits in the seed data).
  defaultProcessingDays: 90,
  // A start-by date within this many days is a warning instead of info.
  startSoonDays: 30,
  // Status changes and milestones this close are flagged.
  statusChangeNoticeDays: 30,
  milestoneNoticeDays: 14,
};

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 };

// Statuses that count as "a renewal is planned or done".
const RENEWAL_PLANNED_STATUSES = ['upcoming', 'completed'];

function startOfDayUtc(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function toDay(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : startOfDayUtc(date);
}

function daysBetween(from, to) {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

function toIsoDate(date) {
  return date ? date.toISOString().slice(0, 10) : null;
}

function keyOf(value) {
  return typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : null;
}

// Two events are about the same visa when every visa field set on both of
// them matches. Events with no visa fields are treated as the user's one
// visa, which is the common case for a single-visa user.
function sameVisa(a, b) {
  for (const field of ['destinationCountry', 'visaType']) {
    const x = keyOf(a[field]);
    const y = keyOf(b[field]);
    if (x && y && x !== y) return false;
  }
  return true;
}

function isUpcoming(event) {
  return event.status === 'upcoming';
}

function visaLabel(event) {
  const parts = [event.visaType, event.destinationCountry].filter(Boolean);
  return parts.length ? parts.join(', ') : 'your visa';
}

/**
 * Works out when a renewal should start for a visa_expiry event.
 * processing is { minDays, maxDays, source } from the service; maxDays is
 * used so the date covers the slowest case.
 */
function renewalStartBy(expiry, processing, config) {
  const days =
    processing && Number.isFinite(processing.maxDays)
      ? processing.maxDays
      : config.defaultProcessingDays;
  return addDays(expiry, -(days + config.renewalBufferDays));
}

function processingDetails(processing, config) {
  if (processing && Number.isFinite(processing.maxDays)) {
    return {
      processingDays: { minDays: processing.minDays, maxDays: processing.maxDays },
      processingTimeSource: 'visa_database',
    };
  }
  return {
    processingDays: null,
    processingTimeSource: 'default',
    defaultProcessingDays: config.defaultProcessingDays,
  };
}

const RULES = [
  {
    id: 'visa_expired',
    appliesTo: 'visa_expiry',
    evaluate(event, ctx) {
      const expiry = toDay(event.date);
      if (!expiry || expiry >= ctx.today) return null;
      return {
        severity: 'critical',
        message: `${event.title} was on ${toIsoDate(expiry)} and is still marked upcoming. Check your current status and update this event.`,
        actionDate: toIsoDate(ctx.today),
      };
    },
  },
  {
    id: 'renewal_needed',
    appliesTo: 'visa_expiry',
    evaluate(event, ctx) {
      const expiry = toDay(event.date);
      if (!expiry || expiry < ctx.today) return null;

      const hasRenewal = ctx.events.some(
        (other) =>
          other.type === 'renewal' &&
          RENEWAL_PLANNED_STATUSES.includes(other.status) &&
          sameVisa(event, other)
      );
      if (hasRenewal) return null;

      const processing = ctx.processingFor(event);
      const startBy = renewalStartBy(expiry, processing, ctx.config);
      const daysUntilExpiry = daysBetween(ctx.today, expiry);
      const daysUntilStart = daysBetween(ctx.today, startBy);

      let severity = 'info';
      if (daysUntilExpiry <= ctx.config.renewalWindowDays || daysUntilStart <= 0) {
        severity = 'critical';
      } else if (daysUntilStart <= ctx.config.startSoonDays) {
        severity = 'warning';
      }

      const startText =
        daysUntilStart <= 0
          ? 'You should already have started, so start as soon as possible.'
          : `Start by ${toIsoDate(startBy)}.`;

      return {
        severity,
        message: `${visaLabel(event)} expires on ${toIsoDate(expiry)} and no renewal is planned. ${startText}`,
        actionDate: toIsoDate(daysUntilStart <= 0 ? ctx.today : startBy),
        details: { daysUntilExpiry, ...processingDetails(processing, ctx.config) },
      };
    },
  },
  {
    id: 'renewal_too_late',
    appliesTo: 'renewal',
    evaluate(event, ctx) {
      const renewalDate = toDay(event.date);
      if (!renewalDate) return null;

      const expiryEvent = ctx.events.find(
        (other) =>
          other.type === 'visa_expiry' &&
          isUpcoming(other) &&
          sameVisa(event, other) &&
          toDay(other.date) &&
          toDay(other.date) >= ctx.today
      );
      if (!expiryEvent) return null;

      const expiry = toDay(expiryEvent.date);
      const processing = ctx.processingFor(expiryEvent);
      const startBy = renewalStartBy(expiry, processing, ctx.config);
      if (renewalDate <= startBy) return null;

      const afterExpiry = renewalDate > expiry;
      return {
        severity: afterExpiry ? 'critical' : 'warning',
        message: afterExpiry
          ? `${event.title} is on ${toIsoDate(renewalDate)}, after ${visaLabel(expiryEvent)} expires on ${toIsoDate(expiry)}.`
          : `${event.title} is on ${toIsoDate(renewalDate)}, later than the recommended start of ${toIsoDate(startBy)}, so the renewal may not finish before ${toIsoDate(expiry)}.`,
        actionDate: toIsoDate(startBy < ctx.today ? ctx.today : startBy),
        relatedEventIds: [expiryEvent.id],
        details: processingDetails(processing, ctx.config),
      };
    },
  },
  {
    id: 'appointment_after_expiry',
    appliesTo: 'appointment',
    evaluate(event, ctx) {
      const appointment = toDay(event.date);
      if (!appointment || appointment < ctx.today) return null;

      const expiryEvent = ctx.events.find(
        (other) =>
          other.type === 'visa_expiry' &&
          isUpcoming(other) &&
          sameVisa(event, other) &&
          toDay(other.date) &&
          toDay(other.date) < appointment
      );
      if (!expiryEvent) return null;

      return {
        severity: 'warning',
        message: `${event.title} on ${toIsoDate(appointment)} is after ${visaLabel(expiryEvent)} expires on ${toIsoDate(toDay(expiryEvent.date))}. Move the appointment earlier or make sure a renewal covers it.`,
        actionDate: toIsoDate(ctx.today),
        relatedEventIds: [expiryEvent.id],
      };
    },
  },
  {
    id: 'status_change_review',
    appliesTo: 'status_change',
    evaluate(event, ctx) {
      const date = toDay(event.date);
      if (!date || date < ctx.today) return null;
      const daysUntil = daysBetween(ctx.today, date);
      return {
        severity: daysUntil <= ctx.config.statusChangeNoticeDays ? 'warning' : 'info',
        message: `${event.title} on ${toIsoDate(date)} may change which visas you're eligible for and what's on your checklist. Review both before then.`,
        actionDate: toIsoDate(date),
        details: { daysUntil },
      };
    },
  },
  {
    id: 'milestone_upcoming',
    appliesTo: 'milestone',
    evaluate(event, ctx) {
      const date = toDay(event.date);
      if (!date || date < ctx.today) return null;
      const daysUntil = daysBetween(ctx.today, date);
      if (daysUntil > ctx.config.milestoneNoticeDays) return null;
      return {
        severity: 'info',
        message: `${event.title} is coming up on ${toIsoDate(date)}.`,
        actionDate: toIsoDate(date),
        details: { daysUntil },
      };
    },
  },
];

function compareImpacts(a, b) {
  return (
    SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
    String(a.actionDate || '9999').localeCompare(String(b.actionDate || '9999')) ||
    a.ruleId.localeCompare(b.ruleId)
  );
}

/**
 * Runs every rule against every upcoming event.
 *
 * @param {object[]} events public life events (from lifeEventService)
 * @param {object} options
 * @param {Date} [options.now]
 * @param {(event: object) => object|null} [options.processingFor] returns
 *   { minDays, maxDays } for a visa_expiry event, or null when unknown
 * @param {object[]} [options.rules] defaults to RULES
 * @param {object} [options.config] overrides merged into IMPACT_CONFIG
 * @returns {object[]} impacts, most severe and soonest first
 */
function evaluateImpacts(events, { now = new Date(), processingFor = () => null, rules = RULES, config = {} } = {}) {
  const ctx = {
    events,
    today: startOfDayUtc(now),
    processingFor,
    config: { ...IMPACT_CONFIG, ...config },
  };

  const impacts = [];
  for (const event of events) {
    // Completed and cancelled events never trigger impacts. They can still be
    // looked at by rules, for example a completed renewal.
    if (!isUpcoming(event)) continue;

    for (const rule of rules) {
      if (rule.appliesTo !== event.type) continue;
      const result = rule.evaluate(event, ctx);
      if (!result) continue;
      impacts.push({
        ruleId: rule.id,
        eventId: event.id,
        eventType: event.type,
        severity: result.severity,
        message: result.message,
        actionDate: result.actionDate || null,
        relatedEventIds: result.relatedEventIds || [],
        details: result.details || {},
      });
    }
  }

  return impacts.sort(compareImpacts);
}

module.exports = {
  evaluateImpacts,
  RULES,
  IMPACT_CONFIG,
  SEVERITY_ORDER,
  sameVisa,
};
