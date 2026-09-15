import { isPlatformServer } from '@angular/common';
import {
  InjectionToken,
  PLATFORM_ID,
  TransferState,
  inject,
  makeStateKey,
} from '@angular/core';

const API_BASE_URL_KEY = makeStateKey<string>('API_BASE_URL');
const DEFAULT_API_BASE_URL = 'http://localhost:3000/api';

/**
 * rest-api and webapp are deployed as separate services with URLs unknown at
 * build time (CDK assigns the Lambda Function URL at deploy time), so this
 * can't be a build-time constant. The server reads it from its own runtime
 * env (API_BASE_URL) and hands it to the client via TransferState, so both
 * the SSR render and client-side hydration/navigation agree on the same URL.
 */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => {
    const transferState = inject(TransferState);

    if (isPlatformServer(inject(PLATFORM_ID))) {
      const url = process.env['API_BASE_URL'] ?? DEFAULT_API_BASE_URL;
      transferState.set(API_BASE_URL_KEY, url);
      return url;
    }

    return transferState.get(API_BASE_URL_KEY, DEFAULT_API_BASE_URL);
  },
});
