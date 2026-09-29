import type { Request, Response } from 'express';
import { RequestContext } from './context/request-context';
import { RequestIdMiddleware } from './request-id.middleware';

function run(incoming?: string) {
  const req = {
    header: (name: string) => (name.toLowerCase() === 'x-request-id' ? incoming : undefined),
  } as Request;
  const setHeader = jest.fn();
  let seen: { requestId?: string; inContext: boolean } = { inContext: false };
  new RequestIdMiddleware().use(req, { setHeader } as unknown as Response, () => {
    seen = { requestId: RequestContext.requestId(), inContext: RequestContext.get() !== undefined };
  });
  return { header: setHeader.mock.calls[0]?.[1] as string, seen };
}

describe('RequestIdMiddleware', () => {
  it('generates req_ plus 12 hex characters when none is sent', () => {
    const { header } = run();
    expect(header).toMatch(/^req_[0-9a-f]{12}$/);
  });

  it('runs the rest of the request inside a context carrying the same id', () => {
    const { header, seen } = run();
    expect(seen).toEqual({ requestId: header, inContext: true });
  });

  it.each(['abcd1234', 'trace_ABC-123', 'x'.repeat(64)])(
    'trusts the well-formed incoming id %s',
    (incoming) => {
      expect(run(incoming).header).toBe(incoming);
    },
  );

  it.each([
    ['empty', ''],
    ['7 characters', 'abc1234'],
    ['65 characters', 'x'.repeat(65)],
    ['a space', 'abc 12345'],
    ['a newline (header splitting)', 'abcd1234\r\nSet-Cookie: x=1'],
    ['a dot', 'abcd.1234'],
    ['non-ASCII', 'åbcd12345'],
  ])('replaces an incoming id with %s', (_label, incoming) => {
    const { header, seen } = run(incoming);
    expect(header).toMatch(/^req_[0-9a-f]{12}$/);
    expect(seen.requestId).toBe(header);
  });

  it('does not leak the context after the request', () => {
    run('abcd1234');
    expect(RequestContext.get()).toBeUndefined();
  });
});
