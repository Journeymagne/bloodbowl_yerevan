/**
 * Tests that can only mean something on a POSIX filesystem.
 *
 * A handful of assertions are about POSIX itself rather than about this app:
 * that a dump is `0600`, that a backup directory is `0700`, that a symlink is
 * excluded from a count. Windows has no such modes — `fs.stat` synthesises them
 * — and creating a symlink there needs Developer Mode or an elevated shell.
 *
 * They used to fail on a Windows checkout, seven at a time, every run. That is
 * worse than not running them: a suite that always fails is a gate nobody
 * reads, and the two real bugs found during task 8 were both found in a browser
 * rather than by `npm test`, partly because its output had stopped meaning
 * anything.
 *
 * The deploy target is Linux, so these still run where it counts — in CI and on
 * the server — and announce themselves as skipped anywhere else.
 */
const windows = process.platform === "win32";

export const posixOnly = windows
  ? { skip: "POSIX file modes and symlinks; runs on Linux, which is where this deploys" }
  : {};

/** A file's mode is the POSIX one: on Windows `fs.stat` makes one up, so a check of it there says nothing. */
export const posixModes = !windows;

/**
 * A test that hands a script (`test/fixtures/*.mjs`, a fake Chrome) to code that starts it as a program, through
 * its shebang: Windows has none, and starts no `.mjs` file as one.
 */
export const shebangScripts = windows
  ? { skip: "starts a .mjs fake Chrome as a program, which Windows cannot; runs on Linux and macOS" }
  : {};
