(() => {
  const settings = document.getElementById('settingsBtn');
  if (!settings) return;
  settings.addEventListener('click', () => {
    const theme = document.getElementById('settingsThemeDefault')?.closest('section');
    const existing = document.getElementById('simoChromeSettingsLink');
    const signedIn = Boolean((window.__SIMO_ACCOUNT_CONTEXT__ || window.SIMO_BOOT)?.loggedIn);
    if (existing) {
      existing.hidden = !signedIn;
      return;
    }
    if (!theme || !signedIn) return;
    const link = document.createElement('a');
    link.id = 'simoChromeSettingsLink';
    link.href = '/chrome';
    link.textContent = 'Simo for Chrome';
    link.target = '_blank';
    link.rel = 'noopener';
    link.style.color = 'inherit';
    theme.before(link);
  });
})();
