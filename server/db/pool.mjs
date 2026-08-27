/**
 * The one connection pool, and how its URL is worked out.
 *
 * Moved out of server.mjs by step 4.9: a route module in its own file needs a
 * pool to query, and importing one from server.mjs would mean importing the
 * whole server — including the `await`s at its bottom that start listening.
 *
 * The docker-hostname rewrite is not cleverness for its own sake. The env file
 * is shared with docker compose, which addresses the database as `postgres`;
 * a process running on the host has to reach the same database through the
 * published port on localhost.
 */
import { Pool } from "pg";
// Importing this is what guarantees the env file is loaded first; see its note.
import "../config/env.mjs";

function resolveDatabaseUrl() {
  const value = process.env.DATABASE_URL || "postgres://gata_admin:change-me-admin-password@localhost:5432/gata_league";
  if (process.env.RUNNING_IN_DOCKER === "true") {
    return value;
  }

  try {
    const url = new URL(value);
    if (url.hostname === "postgres") {
      url.hostname = "localhost";
      url.port = process.env.POSTGRES_PORT || "5432";
      return url.toString();
    }
  } catch {
    return value;
  }

  return value;
}

export const databaseUrl = resolveDatabaseUrl();
export const pool = new Pool({ connectionString: databaseUrl });

/** Host and database only — a connection string carries a password. */
export function safeDatabaseLabel(value = "") {
  try {
    const url = new URL(value);
    return `${url.hostname}:${url.port || 5432}/${url.pathname.replace(/^\//, "")}`;
  } catch {
    return "configured database";
  }
}
