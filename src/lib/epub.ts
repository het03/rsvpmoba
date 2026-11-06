import * as FileSystem from 'expo-file-system/legacy';
import JSZip from 'jszip';
import { Platform } from 'react-native';

export type EpubData = {
  chapters: string[];
  title: string;
};

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

  // Manifest: id → href
  const manifest: Record<string, string> = {};
  const mRe = /<item\b([^>]+)>/gi;
  let m: RegExpExecArray | null;
  while ((m = mRe.exec(opfXml)) !== null) {
    const attrs = m[1];
    const idM = attrs.match(/\bid="([^"]+)"/);
    const hrefM = attrs.match(/\bhref="([^"]+)"/);
    if (idM && hrefM) manifest[idM[1]] = hrefM[1];
  }

  // Spine order
  const spineIds: string[] = [];
  const sRe = /<itemref\b[^>]+idref="([^"]+)"/gi;
  while ((m = sRe.exec(opfXml)) !== null) spineIds.push(m[1]);

  const chapters: string[] = [];
  for (const id of spineIds) {
    const href = manifest[id];
    if (!href) continue;
    const filePart = href.split('#')[0];
    const fullPath = opfDir + filePart;
    const html = await zip.file(fullPath)?.async('text');
    if (html) chapters.push(html);
  }

  return { chapters, title };
}
