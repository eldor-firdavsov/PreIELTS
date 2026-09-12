/**
 * Light, dark, or whatever the machine says.
 *
 * Three states, not two. "system" is the default and stamps nothing on the
 * root element, so the tokens resolve through `prefers-color-scheme`; the
 * other two stamp `data-theme` and win over the media query in both
 * directions. Modelling this as a boolean is the usual bug: it forces a
 * viewer who has never expressed a preference into whichever value the
 * boolean happened to start at, and then ignores their system when it
 * changes.
 *
 * Lives in `lib/` because it is neither a feature nor a component. It touches
 * the DOM and localStorage only, never Supabase, so there is no service to
 * route it through.
 */

export type ThemeChoice = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'ieltsiq.theme';

function isChoice(value: unknown): value is ThemeChoice {
  return value === 'light' || value === 'dark' || value === 'system';
}

/** The stored choice, or "system" when there is none or storage is unavailable. */
export function readTheme(): ThemeChoice {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isChoice(stored) ? stored : 'system';
  } catch {
    // A private window, or site data blocked. Following the machine is the
    // right default for someone whose preference we cannot remember.
    return 'system';
  }
}

/**
 * Put the choice on the document, and remember it.
 *
 * "system" removes the attribute rather than writing a resolved value, so the
 * page keeps tracking the machine if the machine changes while the tab is
 * open. Writing "light" because the system was light at that moment would
 * silently convert a preference for "follow me" into a preference for light.
 */
export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);

  try {
    localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // The theme still applies for this page view. Nothing is lost that
    // matters enough to tell the student about.
  }
}

/** What the viewer is actually looking at right now, choice resolved. */
export function resolveTheme(choice: ThemeChoice): 'light' | 'dark' {
  if (choice !== 'system') return choice;
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

/**
 * Apply the stored choice before React mounts.
 *
 * Called from the entry module so the first paint is already in the right
 * theme. Without it a student who chose dark gets a white flash on every load,
 * which is exactly the moment they were trying to avoid.
 */
export function initTheme(): void {
  applyTheme(readTheme());
  applyTextSize(readTextSize());
}

/**
 * Text size, the way the exam offers it.
 *
 * The computer-delivered IELTS lets a candidate choose between three text sizes
 * and a contrast setting before the paper starts. That is not a nicety: a
 * student sitting a sixty-minute reading paper on an unfamiliar monitor needs
 * to be able to make the passage comfortable, and the exam room expects them to
 * already know the control exists.
 *
 * Implemented as a multiplier on the root font size rather than as a second set
 * of type tokens, so every `rem` in the type scale moves together and nothing
 * has to opt in. The scale itself keeps its proportions.
 */
export type TextSize = 'standard' | 'large' | 'largest';

const TEXT_SIZE_KEY = 'ieltsiq.textSize';

/** Multipliers against the 16px root. Deliberately modest: 1.25 already reflows
 *  a two-pane exam layout, and anything past that belongs to browser zoom. */
const SCALE: Record<TextSize, string> = {
  standard: '100%',
  large: '112.5%',
  largest: '125%',
};

function isTextSize(value: unknown): value is TextSize {
  return value === 'standard' || value === 'large' || value === 'largest';
}

export function readTextSize(): TextSize {
  try {
    const stored = localStorage.getItem(TEXT_SIZE_KEY);
    return isTextSize(stored) ? stored : 'standard';
  } catch {
    return 'standard';
  }
}

export function applyTextSize(size: TextSize): void {
  // On the root element, so every rem-based token scales with it and the
  // browser's own zoom still composes on top.
  document.documentElement.style.fontSize = SCALE[size];
  try {
    localStorage.setItem(TEXT_SIZE_KEY, size);
  } catch {
    // Applies for this page view; not worth telling the student about.
  }
}

export const TEXT_SIZES: ReadonlyArray<{ value: TextSize; label: string }> = [
  { value: 'standard', label: 'Standard' },
  { value: 'large', label: 'Large' },
  { value: 'largest', label: 'Largest' },
];
