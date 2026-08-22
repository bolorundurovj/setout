import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isStatusLoading()) {
    await auth.checkStatus();
  }

  if (!auth.isSetup()) {
    return router.parseUrl('/setup');
  }

  if (!auth.isAuthenticated()) {
    return router.parseUrl('/login');
  }

  return true;
};

export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isStatusLoading()) {
    await auth.checkStatus();
  }

  if (!auth.isSetup()) {
    return true;
  }

  if (auth.isAuthenticated()) {
    return router.parseUrl('/');
  }

  return true;
};
