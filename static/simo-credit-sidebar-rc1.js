/* SIMO CREDIT SIDEBAR RC1 — PRESENTATION ONLY.
   Moves the EXISTING usage card (same IDs, values, and account logic),
   no API/credit writes and no new account or billing controls.
   On narrow displays, returns the card to its original location. */
(function () {
  'use strict';
  if (window.__SIMO_CREDIT_SIDEBAR_RC1__) return;
  window.__SIMO_CREDIT_SIDEBAR_RC1__ = true;

  function start() {
    const card = document.querySelector('.simo-premium-home .simo-status-grid .simo-usage-card');
    const sidebarBrand = document.querySelector('.simo-premium-sidebar .simo-exact-sidebar-brand');
    if (!card || !sidebarBrand || !card.parentNode) return;

    const marker = document.createComment('SIMO original credit-card location');
    card.parentNode.insertBefore(marker, card);
    const media = window.matchMedia('(min-width: 981px)');

    function positionCard() {
      if (media.matches) {
        if (card.parentNode !== sidebarBrand) sidebarBrand.appendChild(card);
        document.body.classList.add('simo-credit-in-sidebar-rc1');
      } else {
        if (marker.parentNode && card.previousSibling !== marker) {
          marker.parentNode.insertBefore(card, marker.nextSibling);
        }
        document.body.classList.remove('simo-credit-in-sidebar-rc1');
      }
    }

    if (media.addEventListener) media.addEventListener('change', positionCard);
    else if (media.addListener) media.addListener(positionCard);
    window.addEventListener('pageshow', positionCard);
    positionCard();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
