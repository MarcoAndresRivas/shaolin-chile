// Browser wiring: one API client that reads the token from the stored session.
// Components that use it can also render on the server at build time; they only
// call the API in the browser, so the hostname is read when it exists.
import { createApi, apiBaseUrl } from './api.js';
import { readSession } from './session.js';

const hostname = typeof window === 'undefined' ? '' : window.location.hostname;

export const api = createApi({
  baseUrl: apiBaseUrl({ configured: import.meta.env.PUBLIC_API_URL, hostname }),
  getToken: () => (typeof window === 'undefined' ? null : readSession()?.token ?? null),
});

export const appPath = (path) => `${import.meta.env.BASE_URL.replace(/\/$/, '')}/${path}`;
