import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isStatusLoading() || auth.statusUnavailable()) {
    await auth.checkStatus();
  }

  if (auth.statusUnavailable()) return router.parseUrl('/login');
  if (!auth.isSetUp()) {
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

  if (auth.isStatusLoading() || auth.statusUnavailable()) {
    await auth.checkStatus();
  }

  if (!auth.isSetUp()) {
    return true;
  }

  if (auth.isAuthenticated()) {
    return router.parseUrl('/');
  }

  return true;
};

export const setupGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.checkStatus();
  if (auth.statusUnavailable()) return router.parseUrl('/login');
  return auth.isSetUp() ? router.parseUrl(auth.isAuthenticated() ? '/' : '/login') : true;
};
