// Where the real Google Drive connection will go. Signing in with Google and talking to Drive's hidden app folder are not
// built yet (they need a Google Cloud project, a development build and a real package name), so for now the app is never
// "connected" and sync never runs. Everything else in sync (tracking changes, the queue, merging, the engine, Settings) is
// built and tested against a fake Drive, and plugs in here with no other change.
import type { DriveStore } from '@/lib/syncEngine';

/** The Drive connection for the signed-in Google account, or null when there is none. */
export async function getDriveStore(): Promise<DriveStore | null> {
  return null;
}

export async function isDriveConnected(): Promise<boolean> {
  return (await getDriveStore()) !== null;
}
