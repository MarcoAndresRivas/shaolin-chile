// Browser wiring: one API client that reads the token from the stored session.
import { createApi, apiBaseUrl } from './api.js';
import { readSession } from './session.js';

export const api = createApi({
  baseUrl: apiBaseUrl({ configured: import.meta.env.PUBLIC_API_URL, hostname: window.location.hostname }),
  getToken: () => readSession()?.token ?? null,
});

export const appPath = (path) => `${import.meta.env.BASE_URL.replace(/\/$/, '')}/${path}`;
