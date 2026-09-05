import { createApiClient, createIdentityApi } from '@lingcoo-edu-oms/api-client';

function readCookie(name: string): string | undefined {
  const prefix = `${encodeURIComponent(name)}=`;
  const item = document.cookie.split('; ').find((cookie) => cookie.startsWith(prefix));
  return item ? decodeURIComponent(item.slice(prefix.length)) : undefined;
}

const csrfCookieName = import.meta.env.VITE_AUTH_CSRF_COOKIE_NAME ?? 'app_csrf';

export const appApiClient = createApiClient({ getCsrfToken: () => readCookie(csrfCookieName) });
export const identityApi = createIdentityApi(appApiClient);
