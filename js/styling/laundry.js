// Laundry state changes. Pure functions: return the field changes to save.
// Clothes only become dirty when you say so — wearing something just counts the wear.

export const STATUSES = { clean: 'Clean', dirty: 'Dirty', in_wash: 'In the wash' };

/** Wearing an item once: counts the wear, never changes clean/dirty. */
export function applyWear(item, when = new Date()) {
  return {
    wears_since_wash: (item.wears_since_wash || 0) + 1,
    wear_count: (item.wear_count || 0) + 1,
    last_worn: when.toISOString(),
  };
}

/** Undo one wear (e.g. a wear log was deleted). */
export function undoWear(item) {
  return {
    wears_since_wash: Math.max(0, (item.wears_since_wash || 0) - 1),
    wear_count: Math.max(0, (item.wear_count || 0) - 1),
  };
}

export const markDirty = () => ({ status: 'dirty' });
export const startWash = () => ({ status: 'in_wash' });
export const markClean = () => ({ status: 'clean', wears_since_wash: 0 });
