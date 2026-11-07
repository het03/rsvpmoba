// Actions shown in the text-selection toolbox. Add highlight, bookmark, etc. here.
export const SELECTION_MENU = [
  { key: 'rsvp', label: 'RSVP from here' },
];

// Where a text selection sits, as reported by a reader page.
export type SelectionInfo = {
  fraction: number;            // 0–1 position in the book (approximate)
  text: string;                // the selected text
  href?: string | null;        // EPUB: chapter file the selection is in
  wordOffset?: number | null;  // EPUB: words from the start of that chapter
  wordIndex?: number;          // TXT: exact word index in the whole text
};
