// The people behind Flossify, shown on the home page's last page ("Know the
// team"). Real people only, in the order the owner wants them: a name, the
// role, and optionally a photo in public/img/team/ (a square .webp) and one
// line about them. While this list is empty the page leaves the section out
// rather than show a placeholder person.
export interface Member {
  name: string;
  role: string;
  /** Path under public/, e.g. '/img/team/ken.webp'. */
  photo?: string;
  about?: string;
}

export const TEAM: Member[] = [];
