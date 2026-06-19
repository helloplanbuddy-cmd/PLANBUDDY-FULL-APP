'use strict';

describe('Queue backoff configuration', () => {
  test('webhook-events queue uses exponential backoff for retries', () => {
    const { webhookEventsQueue } = require('../config/queues');

    expect(webhookEventsQueue.opts.defaultJobOptions.attempts).toBe(5);
    expect(webhookEventsQueue.opts.defaultJobOptions.backoff).toEqual({
      type: 'exponential',
      delay: 1000,
    });
  });
});
