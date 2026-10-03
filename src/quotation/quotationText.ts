import type { PDFFont } from 'pdf-lib';

export const UNSUPPORTED_QUOTATION_TEXT_MESSAGE = 'This PDF needs additional language support. Your saved text has not been changed. You can still read the structured estimate; please contact support for the document.';
export class UnsupportedQuotationTextError extends Error {
  readonly code = 'PDF_TEXT_UNSUPPORTED';
  constructor() { super(UNSUPPORTED_QUOTATION_TEXT_MESSAGE); this.name = 'UnsupportedQuotationTextError'; }
}
const characters = new WeakMap<PDFFont, Set<number>>();
/** Never send unsupported text to WinAnsi measurement/drawing, and never replace it. */
export function assertSupportedQuotationText(text: string, font: PDFFont) {
  let supported = characters.get(font);
  if (!supported) { supported = new Set(font.getCharacterSet()); characters.set(font, supported); }
  for (const character of text) {
    // Wrapping normalizes whitespace before PDF drawing; keep the existing behavior.
    if (!/\s/.test(character) && !supported.has(character.codePointAt(0)!)) throw new UnsupportedQuotationTextError();
  }
}
