/**
 * Delete with undo — never immediate destructive action.
 * snapshot: deep-cloned array (or item), restore: () => void
 */
export function deleteWithUndo({ message, snapshot, remove, restore }) {
  remove();
  window.EMVS.save();
  window.EMVS.toast.show(message, {
    duration: 8000,
    undo: () => {
      restore(snapshot);
      window.EMVS.save();
      window.EMVS.toast.show('Wiederhergestellt');
      // Refresh current view without losing hash
      const h = location.hash;
      if (!h.startsWith('#/modul')) {
        import('../views/router.js').then(m => m.routeFromHash()).catch(() => location.reload());
      } else {
        import('../views/router.js').then(m => m.routeFromHash()).catch(() => {});
      }
    },
  });
}
