// Reads real files from disk so EPUB/TXT parsing can be tested end to end.
import fs from 'node:fs';

export const EncodingType = { Base64: 'base64', UTF8: 'utf8' };

export async function readAsStringAsync(uri, options = {}) {
  const buffer = fs.readFileSync(uri.replace(/^file:\/\//, ''));
  return options.encoding === 'base64' ? buffer.toString('base64') : buffer.toString('utf8');
}

export async function deleteAsync(uri) {
  fs.rmSync(uri.replace(/^file:\/\//, ''), { force: true });
}
