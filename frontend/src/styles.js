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

.waylo-app { display: flex; flex-direction: column; height: 100dvh; margin: 0; }
[hidden] { display: none !important; }

.waylo-app__topp {
  display: flex; align-items: baseline; gap: .75rem;
  padding: .75rem 1rem; border-bottom: 1px solid var(--waylo-border);
  font-family: system-ui, sans-serif;
}
.waylo-app__topp h1 { font-size: 1.05rem; margin: 0; white-space: nowrap; }
.waylo-app__omrade {
  color: var(--waylo-muted); font-size: .85rem;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.waylo-app__sasong {
  margin-left: auto; flex: none; font-size: .78rem; color: var(--waylo-muted);
  background: #f1f4f8; border-radius: 999px; padding: .15rem .6rem;
}
.waylo-app__fel { margin: 0; padding: .5rem 1rem; color: #b5441e; font-size: .85rem; }

.waylo-flikar { display: flex; border-bottom: 1px solid var(--waylo-border); }
.waylo-flikar button {
  flex: 1; min-height: 44px; font: inherit; font-size: .95rem;
  background: none; border: none; border-bottom: 3px solid transparent;
  color: var(--waylo-muted); cursor: pointer;
}
.waylo-flikar button[aria-selected='true'] {
  color: var(--waylo-accent); border-bottom-color: var(--waylo-accent);
  font-weight: 600;
}

.waylo-app__innehall { display: flex; flex: 1; min-height: 0; }
.waylo-app__karta { flex: 1 1 60%; min-width: 0; }
.waylo-app__chatt {
  flex: 0 0 380px; border-left: 1px solid var(--waylo-border);
  display: flex; min-height: 0;
}

/* Mobil: en vy i taget via flikarna, vald vy får hela höjden. */
@media (max-width: 820px) {
  .waylo-app__omrade { display: none; }
  /* Sidhuvudet och fliken säger redan vad det är — chattens egen
     rubrik är bara dubblering och stjäl 70px av meddelandeytan. */
  .waylo-app__chatt .waylo-chat__header { display: none; }
  .waylo-app__karta,
  .waylo-app__chatt { flex: 1 1 auto; border-left: none; }
}

.waylo-karta { width: 100%; height: 100%; }
/* 44px tryckyta, mindre synlig cirkel inuti — Apples riktvärde för touch. */
.waylo-markor { display: grid; place-items: center; background: none; border: none; }
.waylo-markor__cirkel {
  display: grid; place-items: center; width: 32px; height: 32px; font-size: 17px;
  background: #fff; border: 2px solid var(--waylo-accent);
  border-radius: 50%; box-shadow: 0 1px 4px rgba(0,0,0,.25);
}
.waylo-markor--hem .waylo-markor__cirkel {
  border-color: #b5441e; width: 36px; height: 36px; font-size: 19px;
}

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
.waylo-kallor {
  align-self: flex-start; display: flex; flex-wrap: wrap; gap: .35rem .6rem;
  max-width: 100%; font-size: .78rem; color: var(--waylo-muted);
}
.waylo-kallor a {
  color: var(--waylo-accent); text-decoration: underline;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 15rem;
}
.waylo-kartknapp {
  align-self: flex-start; min-height: 44px; padding: .5rem 1rem;
  box-sizing: border-box;
  font: inherit; font-size: .9rem; cursor: pointer;
  color: var(--waylo-accent); background: #fff;
  border: 1px solid var(--waylo-accent); border-radius: 999px;
}
.waylo-chat__form {
  display: flex; gap: .5rem; padding: .75rem;
  border-top: 1px solid var(--waylo-border);
}
.waylo-chat__form input {
  flex: 1; min-width: 0; height: 44px; padding: .55rem .75rem;
  box-sizing: border-box; font: inherit;
  /* 16px är gränsen — under den zoomar iOS Safari in vid fokus. */
  font-size: 16px;
  border: 1px solid var(--waylo-border); border-radius: 8px;
}
.waylo-chat__form input:focus { outline: 2px solid var(--waylo-accent); outline-offset: -1px; }
.waylo-chat__form button {
  height: 44px; padding: .55rem 1.1rem; box-sizing: border-box; font: inherit; cursor: pointer;
  color: #fff; background: var(--waylo-accent); border: none; border-radius: 8px;
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
