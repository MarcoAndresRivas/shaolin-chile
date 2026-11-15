// Tab helpers: which tab the URL asks for, and keyboard navigation.

// The tab named by a URL hash ("#finanzas"), or `fallback` when it names none of `ids`.
export function tabFromHash(hash, ids, fallback) {
  const id = String(hash ?? '').replace(/^#/, '');
  return ids.includes(id) ? id : fallback;
}

// The tab a key moves to, or null when the key is not a tab navigation key.
export function nextTab(ids, current, key) {
  const index = ids.indexOf(current);
  if (index === -1) return null;
  if (key === 'ArrowRight') return ids[(index + 1) % ids.length];
  if (key === 'ArrowLeft') return ids[(index - 1 + ids.length) % ids.length];
  if (key === 'Home') return ids[0];
  if (key === 'End') return ids[ids.length - 1];
  return null;
}

// One tab bar for a person with several roles: the tabs of every list, in
// order, keeping the first tab of each id (administration already includes
// everything the instructor's exams tab shows).
export function mergeTabs(...lists) {
  const seen = new Set();
  return lists.flat().filter((tab) => {
    if (seen.has(tab.id)) return false;
    seen.add(tab.id);
    return true;
  });
}
