const enabled = !!process.env.DEBUG;

export function dbg(tag: string, ...args: unknown[]): void {
  if (!enabled) return;
  const ts = new Date().toISOString().slice(11, 23);
  console.error(`\x1b[2m${ts}\x1b[0m \x1b[36m[${tag}]\x1b[0m`, ...args);
}
