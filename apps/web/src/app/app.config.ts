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

// The only place HttpClient is wired up. The SDK layer owns all HTTP; the rest
// of the app talks to the generated Api service, never to HttpClient.
export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withComponentInputBinding()),
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
