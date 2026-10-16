/**
 * The database says for itself that it went through the restore's anonymization.
 *
 * rehearsal:restore writes a comment on gata_rehearsal in the same transaction
 * that strips the hashes and contacts; rehearsal:check and rehearsal:migrate
 * refuse a database without it. So whatever is left behind by an interrupted or
 * failed restore — or by a hand-made gata_rehearsal — is not worked on.
 */
const PREFIX = "anonymized ";

/** What the restore writes: the time and the dump it came from. */
export function anonymizedMarker(dumpName, at = new Date()) {
  return `${PREFIX}${at.toISOString()} from ${dumpName}`;
}

export function isAnonymizedMarker(text) {
  return typeof text === "string" && text.startsWith(PREFIX);
}

/** @param client anything with `query` (a pg Client or Pool) connected to gata_rehearsal */
export async function assertAnonymized(client) {
  const { rows } = await client.query(
    "SELECT shobj_description(oid, 'pg_database') AS marker FROM pg_database WHERE datname = current_database()",
  );
  if (!isAnonymizedMarker(rows[0]?.marker)) {
    throw new Error("rehearsal: gata_rehearsal is not marked as anonymized — run npm run rehearsal:restore first");
  }
}
