// Tiny pub/sub so any module can raise a confirmation; <Toaster/> renders it in a live region.
type L = (m: string) => void;
const ls = new Set<L>();
export const toast = (m: string) => ls.forEach((l) => l(m));
export const onToast = (l: L) => { ls.add(l); return () => { ls.delete(l); }; };
