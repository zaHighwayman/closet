// Laundry state transitions. Pure functions: return the field changes to save.

import { defaultsFor } from './taxonomy.js';

export const STATUSES = { clean: 'Clean', dirty: 'Dirty', in_wash: 'In the wash' };

export const wearLimitFor = (item) => item.wear_limit ?? defaultsFor(item.subcategory)?.wear_limit ?? 3;

/** Wearing an item once. Auto-marks dirty when it hits its wears-before-wash limit. */
export function applyWear(item, when = new Date()) {
  const wears = (item.wears_since_wash || 0) + 1;
  const limit = wearLimitFor(item);
  return {
    wears_since_wash: wears,
    wear_count: (item.wear_count || 0) + 1,
    last_worn: when.toISOString(),
    status: wears >= limit ? 'dirty' : item.status === 'in_wash' ? 'clean' : (item.status || 'clean'),
  };
}

/** Undo one wear (e.g. a wear log was deleted). */
export function undoWear(item) {
  const wears = Math.max(0, (item.wears_since_wash || 0) - 1);
  return {
    wears_since_wash: wears,
    wear_count: Math.max(0, (item.wear_count || 0) - 1),
    status: item.status === 'dirty' && wears < wearLimitFor(item) ? 'clean' : item.status,
  };
}

export const markDirty = () => ({ status: 'dirty' });
export const startWash = () => ({ status: 'in_wash' });
export const markClean = () => ({ status: 'clean', wears_since_wash: 0 });

export function wearsLeft(item) {
  return Math.max(0, wearLimitFor(item) - (item.wears_since_wash || 0));
}
