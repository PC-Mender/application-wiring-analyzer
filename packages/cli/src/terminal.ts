type TerminalStream = {
  isTTY?: boolean;
  hasColors?: () => boolean;
};

const ANSI_CODES = {
  bold: 1,
  dim: 2,
  underline: 4,
  red: 31,
  green: 32,
  yellow: 33,
  blue: 34,
  magenta: 35,
  cyan: 36,
  gray: 90,
  brightRed: 91,
  brightGreen: 92,
  brightYellow: 93,
  brightCyan: 96,
} as const;

type StyleName = keyof typeof ANSI_CODES;

export function supportsColor(stream: TerminalStream = process.stdout): boolean {
  if (process.env.NO_COLOR !== undefined) return false;
  const forceColor = process.env.FORCE_COLOR;
  if (forceColor !== undefined) {
    const normalized = forceColor.toLowerCase();
    return normalized !== "0" && normalized !== "false";
  }
  if (process.env.TERM === "dumb") return false;
  return stream.hasColors ? stream.hasColors() : Boolean(stream.isTTY);
}

export function colorize(value: unknown, ...styles: StyleName[]): string {
  const text = String(value);
  if (!styles.length || !supportsColor()) return text;
  const codes = styles.map((style) => ANSI_CODES[style]).join(";");
  return `\u001B[${codes}m${text}\u001B[0m`;
}

export const paint = {
  brand: (value: unknown) => colorize(value, "bold", "brightCyan"),
  section: (value: unknown) => colorize(value, "bold"),
  label: (value: unknown) => colorize(value, "bold"),
  muted: (value: unknown) => colorize(value, "dim"),
  value: (value: unknown) => colorize(value, "cyan"),
  path: (value: unknown) => colorize(value, "cyan"),
  command: (value: unknown) => colorize(value, "cyan"),
  option: (value: unknown) => colorize(value, "yellow"),
  link: (value: unknown) => colorize(value, "cyan", "underline"),
  info: (value: unknown) => colorize(value, "cyan"),
  success: (value: unknown) => colorize(value, "brightGreen"),
  warning: (value: unknown) => colorize(value, "brightYellow"),
  error: (value: unknown) => colorize(value, "bold", "brightRed"),
};
