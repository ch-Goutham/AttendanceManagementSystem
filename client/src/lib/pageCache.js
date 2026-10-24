// Read-only page data that can be shown immediately when a page is opened
// again. Each page still revalidates in the background, so this only removes
// the blank loading state and the repeat request waterfall on navigation.
const store = new Map();

export function readPageCache(key) {
  return store.has(key) ? store.get(key) : null;
}

export function writePageCache(key, data) {
  store.set(key, data);
}

export function clearPageCache() {
  store.clear();
}
