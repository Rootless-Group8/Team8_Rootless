/**
 * Delivery skeleton for notifications.
 *
 * Sprint 6 only stubs delivery. Each channel is a small async function that
 * receives the stored notification and returns a status string. Later sprints
 * can replace sendEmail with a real provider and add a push channel without
 * changing the notification data model or the routes.
 */

const STATUS_STUBBED = 'stubbed';
const STATUS_FAILED = 'failed';

/**
 * Email channel stub. Logs the attempt and does not send anything.
 *
 * @param {object} notification
 * @returns {Promise<string>}
 */
async function sendEmail(notification) {
  console.log(
    `[delivery:email:stub] notification=${notification.id} ` +
      `recipient=${notification.recipientUid} type=${notification.type}`
  );
  return STATUS_STUBBED;
}

// Add future channels here (for example push) with the same signature.
const CHANNELS = {
  email: sendEmail,
};

/**
 * Attempts delivery on every channel. A failing channel is reported as
 * "failed" and never stops the other channels or the caller.
 *
 * @param {object} notification
 * @returns {Promise<Object<string, string>>} channel name to delivery status
 */
async function deliverNotification(notification) {
  const delivery = {};

  for (const [channel, send] of Object.entries(CHANNELS)) {
    try {
      delivery[channel] = await send(notification);
    } catch (err) {
      console.error(`Delivery failed on channel "${channel}":`, err);
      delivery[channel] = STATUS_FAILED;
    }
  }

  return delivery;
}

module.exports = {
  deliverNotification,
  sendEmail,
  STATUS_STUBBED,
  STATUS_FAILED,
};
