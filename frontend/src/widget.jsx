/**
 * Inbäddningsbar widget för WordPress (arcticlodge.nu).
 *
 *   <script src="https://chat.arcticlodge.nu/widget.js"></script>
 *   <div id="waylo"></div>
 *
 * Monteras automatiskt i #waylo (eller #turistbot, det gamla namnet).
 * Saknas elementet väntar widgeten på DOMContentLoaded innan den ger upp.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Chat from './components/Chat.jsx';
import { injiceraStilar } from './styles.js';

function montera() {
  const el =
    document.getElementById('waylo') || document.getElementById('turistbot');
  if (!el || el.dataset.wayloMonterad) return false;

  injiceraStilar();
  el.dataset.wayloMonterad = '1';
  createRoot(el).render(
    <StrictMode>
      <Chat kompakt />
    </StrictMode>
  );
  return true;
}

if (!montera()) {
  document.addEventListener('DOMContentLoaded', montera);
}

export { montera };
