import * as FileSystem from 'expo-file-system/legacy';
import JSZip from 'jszip';
import { Platform } from 'react-native';

export type EpubMetadata = {
  title: string;
  author: string;
  coverData: string | null; // base64 data URI ready for <Image source={{ uri }} />
};

// Max raw cover bytes to store — images larger than this are skipped (data:// URI would be too large).
const MAX_COVER_BYTES = 300 * 1024;

function uint8ToDataUri(bytes: Uint8Array, mimeType: string): string {
  const CHUNK = 32768;
  let bin = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[]);
  }
  return `data:${mimeType};base64,${btoa(bin)}`;
}

function mimeFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg',
    png: 'image/png', gif: 'image/gif', webp: 'image/webp',
  };
  return map[ext] ?? 'image/jpeg';
}

export async function extractEpubMetadata(
  filePath: string,
  webBuffer?: ArrayBuffer,
): Promise<EpubMetadata> {
  const empty: EpubMetadata = { title: '', author: '', coverData: null };

  try {
    let zip: JSZip;
    if (Platform.OS === 'web') {
      if (!webBuffer) return empty;
      zip = await JSZip.loadAsync(webBuffer);
    } else {
      const b64 = await FileSystem.readAsStringAsync(filePath, {
        encoding: FileSystem.EncodingType.Base64,
      });
      zip = await JSZip.loadAsync(b64, { base64: true });
    }

    // --- container.xml → OPF path ---
    const containerXml = await zip.file('META-INF/container.xml')?.async('text');
    if (!containerXml) return empty;
    const opfPathMatch = containerXml.match(/full-path="([^"]+)"/);
    if (!opfPathMatch) return empty;
    const opfPath = opfPathMatch[1];
    const opfDir = opfPath.includes('/')
      ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1)
      : '';

    // --- OPF ---
    const opfXml = await zip.file(opfPath)?.async('text');
    if (!opfXml) return empty;

    // Title
    const titleM = opfXml.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/i);
    const title = titleM ? titleM[1].trim() : '';

    // Author (dc:creator)
    const authorM = opfXml.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/i);
    const author = authorM ? authorM[1].trim() : '';

    // --- Manifest id → href ---
    const manifest: Record<string, { href: string; mime: string; coverImage?: boolean }> = {};
    const itemRe = /<item\b([^>]+)>/gi;
    let m: RegExpExecArray | null;
    while ((m = itemRe.exec(opfXml)) !== null) {
      const attrs = m[1];
      const idM   = attrs.match(/\bid="([^"]+)"/);
      const hrefM = attrs.match(/\bhref="([^"]+)"/);
      const mimeM = attrs.match(/\bmedia-type="([^"]+)"/);
      const propM = attrs.match(/\bproperties="([^"]+)"/);
      if (idM && hrefM) {
        manifest[idM[1]] = {
          href: hrefM[1],
          mime: mimeM?.[1] ?? '',
          coverImage: propM?.[1]?.includes('cover-image'),
        };
      }
    }

    // --- Find cover image href ---
    let coverHref: string | null = null;
    let coverMime = 'image/jpeg';

    // 1. <meta name="cover" content="itemId"/> — handle both attribute orderings
    const metaM =
      opfXml.match(/<meta[^>]+name="cover"[^>]*content="([^"]+)"/i) ??
      opfXml.match(/<meta[^>]+content="([^"]+)"[^>]*name="cover"/i);
    if (metaM?.[1] && manifest[metaM[1]]) {
      coverHref = manifest[metaM[1]].href;
      coverMime = manifest[metaM[1]].mime || coverMime;
    }

    // 2. properties="cover-image" (EPUB 3)
    if (!coverHref) {
      const entry = Object.values(manifest).find(e => e.coverImage);
      if (entry) { coverHref = entry.href; coverMime = entry.mime || coverMime; }
    }

    // 3. Common id patterns
    if (!coverHref) {
      for (const id of ['cover', 'cover-image', 'cover_image', 'img_cover', 'coverimage']) {
        if (manifest[id]) { coverHref = manifest[id].href; coverMime = manifest[id].mime || coverMime; break; }
      }
    }

    // --- Extract cover bytes ---
    let coverData: string | null = null;
    if (coverHref) {
      const coverPath = opfDir + decodeURIComponent(coverHref);
      const coverFile = zip.file(coverPath);
      if (coverFile) {
        const bytes = await coverFile.async('uint8array');
        if (bytes.length <= MAX_COVER_BYTES) {
          coverData = uint8ToDataUri(bytes, coverMime || mimeFromPath(coverPath));
        }
      }
    }

    return { title, author, coverData };
  } catch {
    return empty;
  }
}
