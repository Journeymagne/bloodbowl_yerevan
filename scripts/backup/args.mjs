// Command-line options for scripts/backup-db.mjs, kept apart from the script so
// the rules can be tested without Docker.
//
// A mistyped option must fail rather than be skipped. A pre-migration dump
// whose flag was misspelt (`--lable premigrate`) or left without a value would
// otherwise get a nightly-shaped name, and rotation would delete it after seven
// more nights.
// The shape of the label itself is checked where the file name is built
// (formatDumpName in ./rotation.mjs).

/**
 * @param {string[]} argv arguments after the script name, i.e. process.argv.slice(2)
 * @returns {{label: string}} label is "" for the nightly run
 */
export function parseBackupArgs(argv) {
  let label = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg !== "--label" && !arg.startsWith("--label=")) {
      throw new Error(`backup: unexpected argument ${arg}; the only option is --label <name>`);
    }
    if (label !== null) throw new Error("backup: --label given twice");

    let value;
    if (arg === "--label") {
      value = argv[index + 1];
      index += 1;
    } else {
      value = arg.slice("--label=".length);
    }
    if (value === undefined || value === "" || value.startsWith("--")) {
      throw new Error("backup: --label needs a value");
    }
    label = value;
  }
  return { label: label ?? "" };
}
