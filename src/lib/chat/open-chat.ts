/**
 * Opening the chat panel from somewhere else on the page.
 *
 * `JoeyChat` owns its own open/closed state and is mounted once, by the
 * marketing layout, far away in the tree from any page section. The service
 * pages all end by asking the visitor to start a conversation, and that CTA has
 * to open the panel that already exists rather than scroll them to a corner
 * launcher or hand them a second chat UI.
 *
 * A window event is the smallest thing that does that. The alternative — lifting
 * the panel's state into a context provider around the whole marketing layout —
 * would make every page that wants the CTA a consumer of a provider, for one
 * boolean that only ever moves in one direction from the outside.
 *
 * Calling this when the panel is already open is a no-op by design: the
 * listener sets `true` rather than toggling, so a visitor who clicks a second
 * CTA does not close the conversation they just started.
 */

/** Event name. Namespaced so it cannot collide with a library's own events. */
export const OPEN_CHAT_EVENT = 'joeyo:open-chat';

/**
 * Ask the mounted chat panel to open.
 *
 * Safe to call during SSR — it returns without doing anything when there is no
 * `window` — so a server-rendered component can pass it straight to an
 * `onClick` without a guard at the call site.
 */
export function openJoeyChat(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(OPEN_CHAT_EVENT));
}
