/**
 * All CSS som en sträng — så att widgeten kan levereras som EN script-tagg
 * utan separat stylesheet. Samma stilar används av den fristående sajten.
 */
export const css = `
:root {
  --waylo-bg: #ffffff;
  --waylo-text: #1b2430;
  --waylo-muted: #6b7785;
  --waylo-accent: #1c5d99;
  --waylo-border: #dfe4ea;
}

.waylo-app { display: flex; flex-direction: column; height: 100vh; margin: 0; }
.waylo-app__topp {
  display: flex; align-items: baseline; gap: .75rem;
  padding: .75rem 1rem; border-bottom: 1px solid var(--waylo-border);
  font-family: system-ui, sans-serif;
}
.waylo-app__topp h1 { font-size: 1.05rem; margin: 0; }
.waylo-app__topp span { color: var(--waylo-muted); font-size: .85rem; }
.waylo-app__innehall { display: flex; flex: 1; min-height: 0; }
.waylo-app__karta { flex: 1 1 60%; min-width: 0; }
.waylo-app__chatt {
  flex: 0 0 380px; border-left: 1px solid var(--waylo-border);
  display: flex; min-height: 0;
}
@media (max-width: 820px) {
  .waylo-app__innehall { flex-direction: column; }
  .waylo-app__karta { flex: 1 1 45%; }
  .waylo-app__chatt { flex: 1 1 55%; border-left: none; border-top: 1px solid var(--waylo-border); }
}

.waylo-karta { width: 100%; height: 100%; }
.waylo-markor {
  display: grid; place-items: center; font-size: 18px;
  background: #fff; border: 2px solid var(--waylo-accent);
  border-radius: 50%; box-shadow: 0 1px 4px rgba(0,0,0,.25);
}
.waylo-markor--hem { border-color: #b5441e; font-size: 20px; }

.waylo-chat {
  display: flex; flex-direction: column; width: 100%; min-height: 0;
  background: var(--waylo-bg); color: var(--waylo-text);
  font-family: system-ui, -apple-system, sans-serif; font-size: 15px;
}
.waylo-chat--kompakt {
  height: 520px; max-height: 80vh;
  border: 1px solid var(--waylo-border); border-radius: 12px; overflow: hidden;
}
.waylo-chat__header {
  display: flex; flex-direction: column; gap: 2px;
  padding: .75rem 1rem; background: var(--waylo-accent); color: #fff;
}
.waylo-chat__header span { font-size: .8rem; opacity: .85; }
.waylo-chat__lista {
  flex: 1; overflow-y: auto; padding: 1rem;
  display: flex; flex-direction: column; gap: .6rem;
}
.waylo-bubbla {
  max-width: 85%; padding: .55rem .8rem; border-radius: 14px;
  line-height: 1.45; white-space: pre-wrap; word-wrap: break-word;
}
.waylo-bubbla--assistant { align-self: flex-start; background: #f1f4f8; }
.waylo-bubbla--user { align-self: flex-end; background: var(--waylo-accent); color: #fff; }
.waylo-status { align-self: flex-start; color: var(--waylo-muted); font-size: .85rem; font-style: italic; }
.waylo-chat__form {
  display: flex; gap: .5rem; padding: .75rem;
  border-top: 1px solid var(--waylo-border);
}
.waylo-chat__form input {
  flex: 1; padding: .55rem .75rem; font: inherit;
  border: 1px solid var(--waylo-border); border-radius: 8px;
}
.waylo-chat__form input:focus { outline: 2px solid var(--waylo-accent); outline-offset: -1px; }
.waylo-chat__form button {
  padding: .55rem 1rem; font: inherit; cursor: pointer; color: #fff;
  background: var(--waylo-accent); border: none; border-radius: 8px;
}
.waylo-chat__form button:disabled { opacity: .5; cursor: default; }
`;

/** Injicerar CSS:en en gång per sida. */
export function injiceraStilar() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('waylo-stilar')) return;
  const style = document.createElement('style');
  style.id = 'waylo-stilar';
  style.textContent = css;
  document.head.appendChild(style);
}
