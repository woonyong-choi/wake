/*
 * Saving a text file the person asked for (a code block, an exported conversation): the desktop shows a save dialog through the kit
 * file service of the main process (desktop/main.cjs kit.file.save); a browser downloads it. Answers { saved } | { cancelled } | { error }.
 */
import { service, hasService } from './service.js';

export async function saveText(name, text) {
  if (hasService()) return service('kit.file.save', { name, text }).catch(e => ({ error: String(e?.message || e) }));
  try {
    const doc = globalThis.document, a = doc.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 0);
    return { saved: true };
  } catch (e) { return { error: String(e?.message || e) }; }
}
