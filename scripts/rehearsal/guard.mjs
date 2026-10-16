/**
 * Rehearsals only ever touch a database on this machine, and only one name.
 *
 * A rehearsal restores the production dump, then migrates and pokes at it.
 * Pointed at the real server — a tunnel, a stale DATABASE_URL — any of that
 * would be the incident the rehearsal exists to prevent. So the host must be
 * local, and the database is always gata_rehearsal whatever DATABASE_URL names.
 * The driver obeys the query string as well as the authority — `?host=` and
 * `?port=` replace the host and port in the URL — so those keys are refused too.
 */
export const REHEARSAL_DATABASE = "gata_rehearsal";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const OVERRIDE_KEYS = ["host", "hostaddr", "port"];

export function assertLocalDatabaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("rehearsal: DATABASE_URL is not a URL; it must name a local database");
  }
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(`rehearsal: refusing ${url.hostname}; rehearsals run against a local database only`);
  }
  for (const key of OVERRIDE_KEYS) {
    if (url.searchParams.has(key)) {
      throw new Error(`rehearsal: refusing DATABASE_URL with a ?${key}= parameter; it would override the local host`);
    }
  }
  return url;
}

export function rehearsalDatabaseUrl(value) {
  const url = assertLocalDatabaseUrl(value);
  url.pathname = `/${REHEARSAL_DATABASE}`;
  return url.toString();
}
