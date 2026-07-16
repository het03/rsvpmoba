import { XMLParser } from "fast-xml-parser";
import JSZip from "jszip";

export interface Chapter {
    title: string;
    text: string;
}

export interface EPUBMetadata {
    title: string;
    author: string;
    publisher?: string;
    cover?: string; // data URI
}

export interface EPUBBook {
    metadata: EPUBMetadata;
    chapters: Chapter[];
}

export async function extractEPUB(
    arrayBuffer: ArrayBuffer
): Promise<EPUBBook> {
    const zip = await JSZip.loadAsync(arrayBuffer);

    function normalizePath(path: string): string {
        const parts: string[] = [];
        for (const part of decodeURIComponent(path).split('/')) {
            if (!part || part === '.') continue;
            if (part === '..') parts.pop();
            else parts.push(part);
        }
        return parts.join('/');
    }

    function resolvePath(base: string, href: string): string {
        return normalizePath(`${base}${href.split(/[?#]/, 1)[0]}`);
    }

    function getFile(path: string, label: string) {
        const file = zip.file(normalizePath(path));
        if (!file) throw new Error(`Invalid EPUB: missing ${label}`);
        return file;
    }

    const parser = new XMLParser({
        ignoreAttributes: false,
    });

    const container = await getFile("META-INF/container.xml", "container.xml").async("text");

    const containerXML = parser.parse(container);

    const rootfiles = containerXML?.container?.rootfiles?.rootfile;
    const rootfile = Array.isArray(rootfiles) ? rootfiles[0] : rootfiles;
    const opfPath = rootfile?.['@_full-path'];
    if (typeof opfPath !== 'string' || !opfPath) {
        throw new Error('Invalid EPUB: no package document found');
    }

    const opf = await getFile(opfPath, 'package document').async('text');

    const opfXML = parser.parse(opf);

    const metadata = opfXML.package.metadata || {};

    function normalizeMeta(val: any) {
        if (Array.isArray(val)) val = val[0];
        if (val && typeof val === 'object') {
            return val['#text'] ?? val['#value'] ?? Object.values(val).find(v => typeof v === 'string') ?? String(val);
        }
        return val ?? '';
    }

    const title = normalizeMeta(metadata['dc:title'] ?? metadata.title) || 'Unknown Title';
    const author = normalizeMeta(metadata['dc:creator'] ?? metadata.creator) || 'Unknown Author';
    const publisher = normalizeMeta(metadata['dc:publisher'] ?? metadata.publisher) || '';



    const manifestItems = opfXML?.package?.manifest?.item;
    const spineItems = opfXML?.package?.spine?.itemref;

    const manifest = (Array.isArray(manifestItems) ? manifestItems : [manifestItems]).filter(Boolean);

    const spine = (Array.isArray(spineItems) ? spineItems : [spineItems]).filter(Boolean);

    const basePath =
        opfPath.substring(0, opfPath.lastIndexOf("/") + 1);

    // try to find cover id from metadata <meta name="cover" content="id" />
    let coverHref: string | null = null;
    const metaItems = metadata.meta ?? metadata['meta'];
    if (metaItems) {
        const metas = Array.isArray(metaItems) ? metaItems : [metaItems];
        for (const m of metas) {
            if (m && (m['@_name'] === 'cover' || m['@_property'] === 'cover')) {
                const cid = m['@_content'] ?? m['@_value'] ?? m['#text'];
                if (cid) {
                    const found = manifest.find((it: any) => it['@_id'] === cid || it['@_id'] === (cid['@_id'] ?? cid));
                    if (found) coverHref = resolvePath(basePath, found['@_href'] || found.href || '');
                }
            }
        }
    }

    // fallback: manifest item with properties containing 'cover-image' or id contains 'cover' or href ends with image
    if (!coverHref) {
        const found = manifest.find((it: any) => {
            const props = it['@_properties'] || it['properties'];
            const href = it['@_href'] || it['href'] || '';
            return (
                (props && String(props).includes('cover')) ||
                /cover/i.test(it['@_id'] || it['id'] || '') ||
                /\.(jpe?g|png|gif)$/i.test(href)
            );
        });
        if (found) coverHref = resolvePath(basePath, found['@_href'] || found.href || '');
    }

    let coverDataUri: string | undefined;
    if (coverHref) {
        try {
            const coverFile = zip.file(coverHref);
            if (!coverFile) throw new Error('Cover file not found');
            const buf = await coverFile.async('base64');
            const coverManifestItem = manifest.find((item: any) => resolvePath(basePath, item['@_href'] || item.href || '') === coverHref);
            const mime = coverManifestItem?.['@_media-type'] || coverManifestItem?.['media-type'] || 'image/jpeg';
            coverDataUri = `data:${mime};base64,${buf}`;
        } catch (e) {
            coverDataUri = undefined;
        }
    }

    const chapters: Chapter[] = [];

    for (const spineItem of spine) {
        const id = spineItem["@_idref"];

        const file = manifest.find(
            (item: any) => item["@_id"] === id
        );

        if (!file) continue;

        const hrefValue = file['@_href'] || file.href;
        if (typeof hrefValue !== 'string' || !hrefValue) continue;
        const href = resolvePath(basePath, hrefValue);

        const chapterFile = zip.file(href);
        if (!chapterFile) continue;
        const html = await chapterFile.async('text');

        // try to extract <title> from html for chapter title
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const chapterTitle = titleMatch ? titleMatch[1].trim() : hrefValue
            .split("/")
            .pop()
            ?.replace(/\.(xhtml|html)$/i, "") || `Chapter ${chapters.length + 1}`;

        const cleanText = html
            .replace(/<script[\s\S]*?<\/script>/gi, "")
            .replace(/<style[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();

        if (cleanText.length) {
            chapters.push({
                title: chapterTitle,
                text: cleanText,
            });
        }
    }

    return {
        metadata: {
            title,
            author,
            publisher: publisher || undefined,
            cover: coverDataUri,
        },
        chapters,
    };
}
