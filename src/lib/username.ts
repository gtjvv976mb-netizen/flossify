// A member's username (029): what they sign in with at their clinic's own door,
// flossify.ph/<clinic>/sign-in/. Unique within the clinic's group, never across
// Flossify: the address already says which clinic. The same rule is the
// database's check (username_ok).
export const USERNAME = /^[a-z0-9][a-z0-9._-]{2,31}$/;
export const USERNAME_MAX = 32;

/** As typed → as stored: trimmed, lowercase, spaces to dots ("Rosa Desk" → "rosa.desk"). */
export const normalizeUsername = (s: string) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, '.');

export function usernameProblem(u: string): string | null {
  if (u.length < 3) return 'A username needs at least 3 characters.';
  if (u.length > USERNAME_MAX) return `Keep the username to ${USERNAME_MAX} characters.`;
  if (!USERNAME.test(u)) return 'Use letters, numbers, dots, dashes or underscores, starting with a letter or number.';
  return null;
}
