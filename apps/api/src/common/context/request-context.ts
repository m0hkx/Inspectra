import { AsyncLocalStorage } from 'node:async_hooks';
import type { Role } from '@inspectra/shared';

export interface Actor {
  userId: string;
  organizationId: string;
  role: Role;
}

export interface RequestContextStore {
  requestId: string;
  /** Set by the auth guard; absent for public routes. */
  actor?: Actor;
  /**
   * Tenant for data access. Equals `actor.organizationId` for requests; set on its
   * own by background jobs that act for an organization without a user.
   */
  organizationId?: string;
}

const storage = new AsyncLocalStorage<RequestContextStore>();

export const RequestContext = {
  run<T>(store: RequestContextStore, fn: () => T): T {
    return storage.run(store, fn);
  },

  get(): RequestContextStore | undefined {
    return storage.getStore();
  },

  requestId(): string {
    return storage.getStore()?.requestId ?? 'no-request';
  },

  /** The signed-in actor. Only call from routes behind the auth guard. */
  actor(): Actor {
    const actor = storage.getStore()?.actor;
    if (!actor) throw new Error('No authenticated actor in the current context.');
    return actor;
  },

  /** Fails closed: data access without a tenant is a bug, never "all organizations". */
  organizationId(): string {
    const id = storage.getStore()?.organizationId;
    if (!id) throw new Error('Tenant-scoped data access outside an organization context.');
    return id;
  },
};
