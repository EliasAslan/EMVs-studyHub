/**
 * Tiny hash router. Routes are plain objects; views switch on `name`.
 */

import { writable } from 'svelte/store';

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseHash(hash = typeof location !== 'undefined' ? location.hash : '') {
  const raw = String(hash || '').replace(/^#/, '') || '/';
  const [pathPart, queryPart] = raw.split('?');
  const parts = pathPart.split('/').filter(Boolean).map(safeDecode);
  const query = Object.fromEntries(new URLSearchParams(queryPart || ''));

  if (parts.length === 0) return { name: 'today', path: '/', query };
  const [first, second, third] = parts;

  switch (first) {
    case 'homework':
      return { name: 'homework', path: '/homework', query };
    case 'modules':
      return { name: 'modules', path: '/modules', query };
    case 'module':
      return { name: 'module', id: second || null, tab: third || 'overview', path: `/module/${second || ''}`, query };
    case 'notes':
      return second
        ? { name: 'note', id: second, path: `/notes/${second}`, query }
        : { name: 'notes', path: '/notes', query };
    case 'exams':
      return { name: 'exams', path: '/exams', query };
    case 'calendar':
      return { name: 'calendar', path: '/calendar', query };
    case 'links':
      return { name: 'links', path: '/links', query };
    case 'focus':
      return { name: 'focus', path: '/focus', query };
    case 'pomodoro':
      return { name: 'pomodoro', path: '/pomodoro', query };
    case 'settings':
      return { name: 'settings', path: '/settings', query };
    case 'tokens':
      return { name: 'tokens', path: '/tokens', query };
    default:
      return { name: 'notfound', path: `/${parts.join('/')}`, query };
  }
}

export const route = writable(parseHash());

export function initRouter() {
  const update = () => route.set(parseHash());
  if (typeof window !== 'undefined') {
    window.addEventListener('hashchange', update);
    if (!window.location.hash) window.location.replace('#/');
  }
  update();
  return () => {
    if (typeof window !== 'undefined') window.removeEventListener('hashchange', update);
  };
}

export function navigate(path) {
  const next = path.startsWith('#') ? path : `#${path.startsWith('/') ? path : `/${path}`}`;
  if (typeof location !== 'undefined' && location.hash === next) {
    route.set(parseHash(next));
    return;
  }
  if (typeof location !== 'undefined') location.hash = next;
}

export function modulePath(id, tab) {
  return `/module/${id}${tab && tab !== 'overview' ? `/${tab}` : ''}`;
}

export function notePath(id) {
  return `/notes/${id}`;
}
