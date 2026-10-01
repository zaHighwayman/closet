// Third-party modules, loaded straight from a CDN (no build step needed).
import { h, render, Fragment } from 'https://esm.sh/preact@10.24.3';
import { useState, useEffect, useMemo, useRef, useCallback, useReducer } from 'https://esm.sh/preact@10.24.3/hooks';
import htm from 'https://esm.sh/htm@3.1.1';

export const html = htm.bind(h);
export { h, render, Fragment, useState, useEffect, useMemo, useRef, useCallback, useReducer };

export const loadSupabase = () => import('https://esm.sh/@supabase/supabase-js@2.45.4');
export const loadBackgroundRemoval = () => import('https://esm.sh/@imgly/background-removal@1.5.5');
