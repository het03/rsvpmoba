import { type ReaderPrefs, THEMES } from '@/lib/readerPrefs';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import WebView, { WebViewMessageEvent } from 'react-native-webview';

type Props = {
  epubSrc: string;       // file:// URI on native, blob: URL on web
  cachedLocations: string | null;
  totalWords: number;
  initialWordIndex: number;
  prefs: ReaderPrefs;
  onWordIndex: (index: number) => void;
  onTotalWords: (count: number) => void;
  onSaveLocations: (data: string) => void;
};

// Position stored as percentage × 1000 (integer 0-1000) in the existing word_index column.
const DENOM = 1000;

function buildHtml(
  epubSrc: string,
  prefs: ReaderPrefs,
  initialPct: number,
  cachedLocations: string | null,
): string {
  const t = THEMES[prefs.theme];
  // jszip must load before epubjs (epubjs expects window.JSZip).
  // epubjs is not on cdnjs — use jsdelivr.
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"><\/script>
<script src="https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js"><\/script>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: ${t.bg}; height: 100%; overflow: hidden; }
#viewer { width: 100vw; height: 100vh; }
#status {
  position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%);
  font-family: Georgia, serif; font-size: 14px; color: ${t.fg}; opacity: 0.5;
  pointer-events: none; text-align: center; padding: 0 20px;
}
<\/style>
</head>
<body>
<div id="viewer"></div>
<div id="status">Opening…<\/div>
<script>
(function() {
  if (typeof window.ReactNativeWebView === 'undefined') {
    window.ReactNativeWebView = { postMessage: function(m) { window.parent.postMessage(m, '*'); } };
  }
  function post(d) { window.ReactNativeWebView.postMessage(JSON.stringify(d)); }
  function setStatus(msg) { var el = document.getElementById('status'); if (el) el.textContent = msg; }
  function hideStatus() { var el = document.getElementById('status'); if (el) el.style.display = 'none'; }

  try {
    if (typeof ePub === 'undefined') {
      setStatus('epub.js failed to load.\\nCheck internet connection.');
      post({ type: 'error', message: 'epub.js not loaded' });
      return;
    }

    var book = ePub('${epubSrc}');
    var rendition = book.renderTo('viewer', {
      manager: 'continuous',
      flow: 'scrolled',
      width: '100%',
      height: '100%',
      spread: 'none',
    });

    rendition.themes.override('color', '${t.fg}');
    rendition.themes.override('background', '${t.bg}');
    rendition.themes.override('font-size', '${prefs.fontSize}px');
    rendition.themes.override('line-height', '${prefs.lineHeight}');
    rendition.themes.override('font-family', 'Georgia, "Times New Roman", serif');
    rendition.themes.override('padding', '0 20px 80px');
    rendition.themes.override('max-width', '680px');
    rendition.themes.override('margin', '0 auto');

    var initialPct = ${initialPct};
    var ready = false;
    var cachedLocs = ${JSON.stringify(cachedLocations)};

    book.ready.then(function() {
      if (cachedLocs) {
        // Locations already generated from a previous session — load instantly.
        book.locations.load(cachedLocs);
        ready = true;
        post({ type: 'wordCount', count: ${DENOM} });
        if (initialPct > 0) {
          var cfi = book.locations.cfiFromPercentage(initialPct);
          rendition.display(cfi).then(hideStatus).catch(function() { rendition.display().then(hideStatus); });
        } else {
          rendition.display().then(hideStatus);
        }
      } else {
        // First open: show first page immediately, generate locations in background.
        rendition.display().then(hideStatus).catch(function(e) {
          setStatus('Render error: ' + String(e));
          post({ type: 'error', message: String(e) });
        });
        return book.locations.generate(1024).then(function() {
          ready = true;
          post({ type: 'wordCount', count: ${DENOM} });
          var saved = book.locations.save();
          post({ type: 'saveLocations', data: saved });
          if (initialPct > 0) {
            var cfi = book.locations.cfiFromPercentage(initialPct);
            rendition.display(cfi);
          }
        });
      }
    }).catch(function(e) {
      setStatus('Error: ' + String(e));
      post({ type: 'error', message: String(e) });
    });

    rendition.on('relocated', function(loc) {
      if (ready && loc && loc.start) {
        post({ type: 'position', percentage: loc.start.percentage || 0 });
      }
    });

    window.__updateStyle = function(bg, fg, fontSize, lineHeight) {
      rendition.themes.override('background', bg);
      rendition.themes.override('color', fg);
      rendition.themes.override('font-size', fontSize + 'px');
      rendition.themes.override('line-height', String(lineHeight));
    };

    window.addEventListener('message', function(e) {
      try {
        var msg = JSON.parse(e.data);
        if (msg.type === 'updateStyle') window.__updateStyle(msg.bg, msg.fg, msg.fontSize, msg.lineHeight);
      } catch (err) {}
    });
  } catch(e) {
    setStatus('Error: ' + String(e));
    post({ type: 'error', message: String(e) });
  }
})();
<\/script>
</body>
</html>`;
}

// ─── Web (iframe) ─────────────────────────────────────────────────────────────

function EpubReaderWeb({ epubSrc, cachedLocations, totalWords, initialWordIndex, prefs, onWordIndex, onTotalWords, onSaveLocations }: Props) {
  const iframeRef = useRef<any>(null);
  const initialPctRef = useRef(totalWords > 0 ? initialWordIndex / totalWords : 0);
  const cachedLocsRef = useRef(cachedLocations);
  const html = useMemo(
    () => buildHtml(epubSrc, prefs, initialPctRef.current, cachedLocsRef.current),
    [epubSrc], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const theme = THEMES[prefs.theme];

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'position') onWordIndex(Math.round(msg.percentage * DENOM));
        else if (msg.type === 'wordCount') onTotalWords(msg.count);
        else if (msg.type === 'saveLocations') onSaveLocations(msg.data);
      } catch {}
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onWordIndex, onTotalWords, onSaveLocations]);

  useEffect(() => {
    const t = THEMES[prefs.theme];
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ type: 'updateStyle', bg: t.bg, fg: t.fg, fontSize: prefs.fontSize, lineHeight: prefs.lineHeight }), '*'
    );
  }, [prefs.theme, prefs.fontSize, prefs.lineHeight]);

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* @ts-ignore */}
      <iframe
        ref={iframeRef}
        srcDoc={html}
        style={{ flex: 1, border: 'none', width: '100%', height: '100%', backgroundColor: theme.bg } as any}
        sandbox="allow-scripts allow-same-origin"
      />
    </View>
  );
}

// ─── Native (WebView) ─────────────────────────────────────────────────────────

function EpubReaderNative({ epubSrc, cachedLocations, totalWords, initialWordIndex, prefs, onWordIndex, onTotalWords, onSaveLocations }: Props) {
  const webViewRef = useRef<WebView>(null);
  const didLoadRef = useRef(false);
  const initialPctRef = useRef(totalWords > 0 ? initialWordIndex / totalWords : 0);
  const cachedLocsRef = useRef(cachedLocations);
  const html = useMemo(
    () => buildHtml(epubSrc, prefs, initialPctRef.current, cachedLocsRef.current),
    [epubSrc], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const theme = THEMES[prefs.theme];

  useEffect(() => {
    if (!didLoadRef.current) return;
    const t = THEMES[prefs.theme];
    webViewRef.current?.injectJavaScript(
      `window.__updateStyle && window.__updateStyle('${t.bg}','${t.fg}',${prefs.fontSize},${prefs.lineHeight}); true;`
    );
  }, [prefs.theme, prefs.fontSize, prefs.lineHeight]);

  const handleMessage = useCallback((e: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === 'position') onWordIndex(Math.round(msg.percentage * DENOM));
      else if (msg.type === 'wordCount') onTotalWords(msg.count);
      else if (msg.type === 'saveLocations') onSaveLocations(msg.data);
    } catch {}
  }, [onWordIndex, onTotalWords, onSaveLocations]);

  const handleLoad = useCallback(() => { didLoadRef.current = true; }, []);

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <WebView
        ref={webViewRef}
        source={{ html, baseUrl: 'file:///' }}
        style={styles.webview}
        onMessage={handleMessage}
        onLoad={handleLoad}
        scrollEnabled
        showsVerticalScrollIndicator={false}
        originWhitelist={['*']}
        javaScriptEnabled
        mixedContentMode="always"
        allowFileAccess={true}
        allowFileAccessFromFileURLs={true}
      />
    </View>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default function EpubReader(props: Props) {
  if (Platform.OS === 'web') return <EpubReaderWeb {...props} />;
  return <EpubReaderNative {...props} />;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1, backgroundColor: 'transparent' },
});
