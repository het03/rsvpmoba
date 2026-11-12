// Actions shown in the text-selection toolbox. Add highlight, bookmark, etc. here.
export const SELECTION_MENU = [
  { key: 'define', label: 'Define' },
  // The system menu only shows plain text, so "RSVP" is bolded with Unicode bold letters.
  { key: 'rsvp', label: '\u{1D5E5}\u{1D5E6}\u{1D5E9}\u{1D5E3} from here' },
];

// Where a text selection sits, as reported by a reader page.
export type SelectionInfo = {
  fraction: number;            // 0–1 position in the book (approximate)
  text: string;                // the selected text
  href?: string | null;        // EPUB: chapter file the selection is in
  wordOffset?: number | null;  // EPUB: words from the start of that chapter
  wordIndex?: number;          // TXT: exact word index in the whole text
  context?: string;            // the paragraph (or a window of it) around the selection
  contextOffset?: number;      // where the selection starts inside `context`, in characters
};
