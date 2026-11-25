/** GitHub Pages처럼 하위 주소에 올려도 링크·이미지가 맞게 base를 붙인다 */
export const base = import.meta.env.BASE_URL.replace(/\/$/, '');
export const u = (path: string) => (/^https?:\/\//.test(path) ? path : `${base}${path.startsWith('/') ? '' : '/'}${path}`);

export const sections = [
  { key: 'about', label: 'Yoonjoo', href: '/about' },
  { key: 'drawn-with-light', label: 'Drawn with Light', href: '/drawn-with-light' },
  { key: 'work', label: 'Work', href: '/work' },
  { key: 'publications', label: 'Publications', href: '/publications' },
] as const;

export type SectionKey = (typeof sections)[number]['key'];

/** [TODO: ...] 로 시작하는 임시 값인지 */
export const isTodo = (v: unknown) => typeof v === 'string' && (v.trim() === '' || v.trim().startsWith('[TODO'));
