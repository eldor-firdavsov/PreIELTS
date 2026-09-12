/** Small DOM helpers shared by ingest. linkedom elements are structurally DOM-like. */

const BLANK = '____';

export function clean(text: string | null | undefined): string {
  return (text ?? '')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Paragraph-preserving text: one line per block, blanks marked. */
export function blockText(el: any): string {
  return clean(el?.textContent);
}

/**
 * Text of `el` with form controls rendered as a blank, and with any element
 * matching one of `drop` removed first. Operates on a clone; `el` is untouched.
 */
export function promptText(el: any, drop: string[] = []): string {
  if (!el) return '';
  const copy = el.cloneNode(true);
  for (const selector of drop) {
    for (const node of [...copy.querySelectorAll(selector)]) node.remove();
  }
  for (const control of [...copy.querySelectorAll('input, select, textarea')]) {
    const blank = copy.ownerDocument.createTextNode(` ${BLANK} `);
    control.replaceWith(blank);
  }
  return clean(copy.textContent);
}

/** Ordinal encoded in an id or name attribute, e.g. `q14` -> 14. */
export function controlOrdinal(el: any): number | null {
  for (const attr of ['id', 'name']) {
    const value = el.getAttribute?.(attr) ?? '';
    const match = /^q[-_]?(\d+)$/i.exec(value);
    if (match) return Number(match[1]);
  }
  return null;
}

/** The label text attached to a radio/checkbox input. */
export function labelTextFor(input: any): string {
  const label = input.closest?.('label');
  if (label) return clean(label.textContent);
  const wrapper = input.parentElement;
  return wrapper ? clean(wrapper.textContent) : '';
}

/** First "Questions 12–17" range declared in an element's text. */
export function declaredRange(el: any): [number, number] | null {
  const text = clean(el?.textContent);
  const match = /questions?\s+(\d+)\s*[–—-]\s*(\d+)/i.exec(text);
  if (match) return [Number(match[1]), Number(match[2])];
  const single = /question\s+(\d+)\b/i.exec(text);
  if (single) return [Number(single[1]), Number(single[1])];
  return null;
}
