import { SetMetadata } from '@nestjs/common';
import type { Action } from '@inspectra/shared';

export const IS_PUBLIC = 'inspectra:public';
export const REQUIRED_ACTIONS = 'inspectra:actions';

/** Route needs no signed-in user. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/**
 * Route needs every listed action in the shared role → action map. Checked in one
 * place (AuthGuard) instead of `if (role === 'ADMIN')` scattered through services.
 */
export const RequirePermission = (...actions: Action[]) => SetMetadata(REQUIRED_ACTIONS, actions);
