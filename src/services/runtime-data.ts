/** Private local demonstrations are ephemeral; business records never enter Web Storage. */
let privateMode = false;
const memory = new Map<string, string>();
export function enablePrivateData() {
  privateMode = true;
  memory.clear();
}
export function isPrivateData() {
  return privateMode;
}
export const businessStorage = {
  getItem(key: string): string | null {
    return privateMode
      ? (memory.get(key) ?? null)
      : globalThis.localStorage.getItem(key);
  },
  setItem(key: string, value: string): void {
    if (privateMode) memory.set(key, value);
    else globalThis.localStorage.setItem(key, value);
  },
};
