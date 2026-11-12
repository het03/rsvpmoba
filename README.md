# RSVPMOBA

> A clean, minimal app for reading your books on the go.

RSVPMOBA lets you import EPUB and TXT files and read them on iOS, Android, or the web.

---

## Features for now

- **EPUB & TXT support** — import from your files app, covers and authors pulled automatically
- **Progress tracking** — resumes where you stopped, shelf splits into In Progress and Completed
- **Device theme** — follows system light/dark mode across every screen; reader stays dark for comfort
- **Fast loading** — books open instantly, reads directly from disk with no encoding overhead
- **Search** — filter your shelf by title or author in one tap
- **Reader settings** — adjust font size, line height, and theme

---

## Getting Started

**Prerequisites:** Node.js 18+, Expo CLI

```bash
git clone https://github.com/het03/rsvpmoba.git
cd RSVPMOBA
npm install
npx expo start
```

Scan the QR code with [Expo Go](https://expo.dev/go), or press `i` / `a` to open in a simulator.

---

## Built With

- [Expo SDK 57](https://docs.expo.dev) · React Native 0.86
- `expo-router` — file-based navigation
- `expo-sqlite` — local book library and reading positions
- `epub.js` — EPUB rendering in a WebView
- `JSZip` — metadata extraction on import
- `expo-image` · `expo-document-picker`

---
