import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideHttpClient, withInterceptors, HttpInterceptorFn } from '@angular/common/http';
import { ApiConfiguration } from '@setout/api-client';

import { environment } from '../environments/environment';

import { provideRouter, withComponentInputBinding, TitleStrategy } from '@angular/router';
import { routes } from './app.routes';
import { SetoutTitleStrategy } from './title.strategy';

const credentialsInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req.clone({ withCredentials: true }));
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
