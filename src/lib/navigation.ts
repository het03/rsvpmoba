// Where the back button goes. Pure, so it can be tested without a phone.

/** Pages opened from another page, and the page they were opened from. Back from one of these returns to its parent. */
export const PARENT_ROUTES: Record<string, string> = {
  '/settings': '/profile',
};

/**
 * Where the hardware back button should go from a page: its parent if it has one, otherwise home. Null means "leave
 * it alone": home lets Android exit as usual, and a book has its own back handling.
 */
export function backTarget(pathname: string): string | null {
  if (pathname === '/' || pathname.startsWith('/reader/')) return null;
  return PARENT_ROUTES[pathname] ?? '/';
}
