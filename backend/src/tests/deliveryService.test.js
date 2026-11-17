const {
  deliverNotification,
  STATUS_STUBBED,
  STATUS_FAILED,
} = require('../services/deliveryService');

const notification = {
  id: 'n1',
  recipientUid: 'user-a',
  type: 'system',
  message: 'Hello',
};

let logSpy;
let errorSpy;

beforeEach(() => {
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('deliverNotification', () => {
  it('reports the email channel as stubbed and logs the attempt', async () => {
    const result = await deliverNotification(notification);

    expect(result).toEqual({ email: STATUS_STUBBED });
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain('n1');
  });

  it('reports a failing channel as failed without throwing', async () => {
    logSpy.mockImplementation(() => {
      throw new Error('log failure');
    });

    const result = await deliverNotification(notification);

    expect(result).toEqual({ email: STATUS_FAILED });
    expect(errorSpy).toHaveBeenCalled();
  });
});
