import { type Theme } from '@/lib/readerPrefs';
import { createContext, useContext, useState } from 'react';

type Ctx = {
  readerTheme: Theme | null;
  setReaderTheme: (theme: Theme | null) => void;
};

const ReaderThemeContext = createContext<Ctx>({ readerTheme: null, setReaderTheme: () => {} });

export function ReaderThemeProvider({ children }: { children: React.ReactNode }) {
  const [readerTheme, setReaderTheme] = useState<Theme | null>(null);
  return (
    <ReaderThemeContext.Provider value={{ readerTheme, setReaderTheme }}>
      {children}
    </ReaderThemeContext.Provider>
  );
}

export function useReaderTheme() {
  return useContext(ReaderThemeContext);
}
