/**
 * Error type thrown by checklistService. Routes translate it directly into
 * an HTTP response using `status`, so the service stays free of Express.
 */
class ChecklistError extends Error {
  /**
   * @param {string} code    machine readable code, e.g. PROFILE_INCOMPLETE
   * @param {string} message clear message safe to show the user
   * @param {number} status  HTTP status the route should return
   * @param {object} [details] optional field level details
   */
  constructor(code, message, status, details) {
    super(message);
    this.name = 'ChecklistError';
    this.code = code;
    this.status = status;
    if (details) {
      this.details = details;
    }
  }
}

module.exports = { ChecklistError };
