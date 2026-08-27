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
export const posixOnly = process.platform === "win32"
  ? { skip: "POSIX file modes and symlinks; runs on Linux, which is where this deploys" }
  : {};
