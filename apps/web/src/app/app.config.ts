import {
  ApplicationConfig,
  ErrorHandler,
  Injectable,
  inject,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideHttpClient, withInterceptors, HttpInterceptorFn } from '@angular/common/http';
import { ApiConfiguration } from '@setout/api-client';

import { environment } from '../environments/environment';

import { Router, provideRouter, withComponentInputBinding, TitleStrategy } from '@angular/router';
import { tap } from 'rxjs';
import { AuthService } from './auth/auth.service';
import { HttpErrorResponse } from '@angular/common/http';
import { detailOf } from './api-error';
import { ToastService } from './toast.service';
import { routes } from './app.routes';
import { SetoutTitleStrategy } from './title.strategy';

@Injectable()
class RequestErrorHandler extends ErrorHandler {
  private readonly toast = inject(ToastService);
  override handleError(error: unknown): void {
    if (error instanceof HttpErrorResponse) {
      this.toast.show(detailOf(error) ?? 'The request failed. Please try again.', 'error');
    }
    super.handleError(error);
  }
}

const credentialsInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return next(req.clone({ withCredentials: true })).pipe(
    tap({
      error: (err: unknown) => {
        const path = new URL(req.url, document.baseURI).pathname;
        if (
          err &&
          typeof err === 'object' &&
          'status' in err &&
          err.status === 401 &&
          path.startsWith('/api/') &&
          !path.startsWith('/api/auth/')
        ) {
          void auth.checkStatus().then(() => {
            if (!auth.statusUnavailable() && !auth.isAuthenticated())
              void router.navigateByUrl('/login');
          });
        }
      },
    }),
  );
};

// The default, alwaysUndefined, sets an input to undefined when the active route
// lacks the param, which overrides declared defaults such as `input('')`.
export const routeInputBinding = withComponentInputBinding({
  unmatchedInputBehavior: 'undefinedIfStale',
});

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, routeInputBinding),
    { provide: TitleStrategy, useClass: SetoutTitleStrategy },
    provideBrowserGlobalErrorListeners(),
    { provide: ErrorHandler, useClass: RequestErrorHandler },
    provideZonelessChangeDetection(),
    provideHttpClient(withInterceptors([credentialsInterceptor])),
    {
      provide: ApiConfiguration,
      useValue: Object.assign(new ApiConfiguration(), {
        rootUrl: environment.apiBaseUrl,
      }),
    },
  ],
};
