/**
 * The app shows a reader's local day, and a test's fixtures are moments in UTC: «2026-10-18T…Z» is the 19th in
 * Auckland and the 17th in Samoa. Imported first, before anything that formats a date, this makes the machine's
 * local time UTC, so the day a test expects is the same on every machine.
 */
process.env.TZ = "UTC";
