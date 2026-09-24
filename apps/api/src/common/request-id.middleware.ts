import { randomBytes } from 'node:crypto';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { RequestContext } from './context/request-context';

const INCOMING = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Gives every request an id (echoed in `x-request-id` and in error bodies) and opens
 * the request context the auth guard and tenant-scoped client read from.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.header('x-request-id');
    const requestId = incoming && INCOMING.test(incoming) ? incoming : `req_${randomBytes(6).toString('hex')}`;
    res.setHeader('x-request-id', requestId);
    RequestContext.run({ requestId }, next);
  }
}
