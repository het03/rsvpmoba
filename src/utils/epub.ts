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

    const parser = new XMLParser({
        ignoreAttributes: false,
    });

    const container = await zip
        .file("META-INF/container.xml")!
        .async("text");

    const containerXML = parser.parse(container);

    const opfPath =
        containerXML.container.rootfiles.rootfile["@_full-path"];

    const opf = await zip.file(opfPath)!.async("text");

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



    const manifestItems = opfXML.package.manifest.item;
    const spineItems = opfXML.package.spine.itemref;

    const manifest = Array.isArray(manifestItems)
        ? manifestItems
        : [manifestItems];

    const spine = Array.isArray(spineItems)
        ? spineItems
        : [spineItems];

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
                    if (found) coverHref = basePath + (found['@_href'] || found['@_href']);
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
        if (found) coverHref = basePath + (found['@_href'] || found['href'] || found['@_href']);
    }

    let coverDataUri: string | undefined;
    if (coverHref) {
        try {
            const buf = await zip.file(coverHref)!.async('base64');
            const ext = coverHref.split('.').pop()?.toLowerCase() ?? 'jpg';
            const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
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

        const href = basePath + file["@_href"];

        const html = await zip.file(href)!.async("text");

        // try to extract <title> from html for chapter title
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const chapterTitle = titleMatch ? titleMatch[1].trim() : file["@_href"]
            .split("/")
            .pop()
            .replace(/\.(xhtml|html)$/i, "");

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