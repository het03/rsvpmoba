import * as FileSystem from 'expo-file-system/legacy';
import JSZip from 'jszip';
import { Platform } from 'react-native';

export type EpubData = {
  chapters: string[];
  hrefs: string[]; // zip-relative path of each chapter, aligned with `chapters`
  title: string;
};

function safeDecode(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; }
}

// Joins a spine href onto the OPF directory, resolving "." and ".." segments.
function resolveZipPath(dir: string, href: string): string {
  const out: string[] = [];
  for (const part of (dir + href).split('/')) {
    if (part === '..') out.pop();
    else if (part && part !== '.') out.push(part);
  }
  return out.join('/');
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// Pass a pre-read ArrayBuffer on web (from IndexedDB) to avoid re-fetching the expired picker URI.
export async function parseEpub(filePath: string, webBuffer?: ArrayBuffer): Promise<EpubData> {
  let base64: string;

  if (Platform.OS === 'web') {
    if (!webBuffer) throw new Error('No file data provided for web epub parsing');
    base64 = arrayBufferToBase64(webBuffer);
  } else {
    base64 = await FileSystem.readAsStringAsync(filePath, {
      encoding: FileSystem.EncodingType.Base64,
    });
  }

  const zip = await JSZip.loadAsync(base64, { base64: true });

  const containerXml = await zip.file('META-INF/container.xml')?.async('text');
  if (!containerXml) throw new Error('Invalid epub: missing container.xml');

  const opfPathMatch = containerXml.match(/full-path="([^"]+)"/);
  if (!opfPathMatch) throw new Error('Invalid epub: cannot find OPF path');
  const opfPath = opfPathMatch[1];
  const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';

  const opfXml = await zip.file(opfPath)?.async('text');
  if (!opfXml) throw new Error('Invalid epub: missing OPF file');

  // Book title from dc:title
  const titleMatch = opfXml.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/i);
  const title = titleMatch ? titleMatch[1].trim() : '';

  // Manifest: id → href and media type
  const manifest: Record<string, { href: string; mime: string }> = {};
  const mRe = /<item\b([^>]+)>/gi;
  let m: RegExpExecArray | null;
  while ((m = mRe.exec(opfXml)) !== null) {
    const attrs = m[1];
    const idM = attrs.match(/\bid="([^"]+)"/);
    const hrefM = attrs.match(/\bhref="([^"]+)"/);
    const mimeM = attrs.match(/\bmedia-type="([^"]+)"/);
    if (idM && hrefM) manifest[idM[1]] = { href: hrefM[1], mime: mimeM?.[1] ?? '' };
  }

  // Spine order
  const spineIds: string[] = [];
  const sRe = /<itemref\b[^>]+idref="([^"]+)"/gi;
  while ((m = sRe.exec(opfXml)) !== null) spineIds.push(m[1]);

  const chapters: string[] = [];
  const hrefs: string[] = [];
  for (const id of spineIds) {
    const item = manifest[id];
    if (!item) continue;
    // The reading order can list non-text items (a cover image, for example). Decoding those as text
    // produces garbage "words", so only read HTML/XML documents.
    if (item.mime && !/html|xml/i.test(item.mime)) continue;
    const href = item.href;
    const fullPath = resolveZipPath(opfDir, href.split('#')[0]);
    // Hrefs may be percent-encoded ("My%20Chapter.xhtml") while the zip entry is not.
    const entry = zip.file(fullPath) ?? zip.file(safeDecode(fullPath));
    const html = await entry?.async('text');
    if (html) {
      chapters.push(html);
      // Stored relative to the OPF directory so it lines up with epub.js spine hrefs.
      hrefs.push(resolveZipPath('', safeDecode(href.split('#')[0])));
    }
  }

  return { chapters, hrefs, title };
}
