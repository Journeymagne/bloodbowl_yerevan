/**
 * Rehearsals only ever touch a database on this machine, and only one name.
 *
 * A rehearsal restores the production dump, then migrates and pokes at it.
 * Pointed at the real server — a tunnel, a stale DATABASE_URL — any of that
 * would be the incident the rehearsal exists to prevent. So the host must be
 * local, and the database is always gata_rehearsal whatever DATABASE_URL names.
 * The driver obeys the query string as well as the authority — `?host=` and
 * `?port=` replace the host and port in the URL — so those keys are refused too.
 * Only a postgres:// or postgresql:// URL is read as one: the driver takes the
 * database of any other scheme from its own query string (`socket://localhost/x?db=…`).
 *
 * The restore also runs through `docker exec` on a container called
 * gata-league-postgres — the production name too. A DOCKER_HOST or a remote
 * docker context would aim that at the server, so those are refused as well.
 */
export const REHEARSAL_DATABASE = "gata_rehearsal";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const OVERRIDE_KEYS = ["host", "hostaddr", "port"];
const POSTGRES_SCHEMES = new Set(["postgres:", "postgresql:"]);

export function assertLocalDatabaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("rehearsal: DATABASE_URL is not a URL; it must name a local database");
  }
  if (!POSTGRES_SCHEMES.has(url.protocol)) {
    throw new Error("rehearsal: DATABASE_URL must start with postgres:// or postgresql://");
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

/**
 * Refuse a Docker that is not the one on this machine.
 *
 * @param {{ dockerHost?: string, contextEndpoint?: string }} docker
 *   `dockerHost` is $DOCKER_HOST; `contextEndpoint` is the current docker
 *   context's endpoint. Any DOCKER_HOST is refused (it overrides the context we
 *   would check); otherwise the context must be a local unix socket.
 */
export function assertLocalDocker({ dockerHost, contextEndpoint } = {}) {
  const endpoint = String(contextEndpoint ?? "").trim();
  if (!dockerHost && endpoint.startsWith("unix://")) return;
  const shown = dockerHost || endpoint || "no endpoint reported";
  throw new Error(`refusing to run against a non-local Docker (${shown}) — the container name gata-league-postgres is the same as production's`);
}

/**
 * Refuse a DATABASE_URL that reaches another Postgres than the container.
 *
 * The restore runs through `docker exec` while the anonymization connects by
 * DATABASE_URL; with a wrong port the two could be different servers — the
 * anonymization would then run on, and the checks read, one that never got the
 * dump. Each server has its own system identifier; both sides must report it.
 */
export function assertSameServer({ containerId, clientId, container }) {
  const inside = String(containerId ?? "").trim();
  const outside = String(clientId ?? "").trim();
  if (!inside || !outside || inside !== outside) {
    throw new Error(`DATABASE_URL reaches a different Postgres server than the container ${container}; check the port in DATABASE_URL`);
  }
}
