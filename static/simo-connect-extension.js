(() => {
  const view = document.body.dataset.connectView;
  const fetchFromSimo = window.fetch.bind(window);
  const prefixes = ["/api/simo-connect/", "/api/simo-calling/"];
  let reloading = false;
  const extensionOrigin = document.body.dataset.extensionOrigin;
  let parentReady = false;
  let callStatus = {state: 'idle', mode: 'audio', text: ''};

  function sendCallStatus() {
    if (parentReady) window.parent.postMessage({type: 'simo-connect:call-status', ...callStatus}, extensionOrigin);
  }

  if (window.parent !== window) {
    window.addEventListener('simo-connect:call-status', event => {
      callStatus = event.detail;
      sendCallStatus();
    });
    window.addEventListener('message', event => {
      if (event.source !== window.parent || event.origin !== extensionOrigin) return;
      if (event.data?.type === 'simo-connect:request-status') {
        parentReady = true;
        document.body.classList.add('simo-extension-call-banner');
        sendCallStatus();
      }
      if (!parentReady) return;
      if (event.data?.type === 'simo-connect:hang-up') {
        window.dispatchEvent(new Event('simo-connect:end-call'));
      }
      if (event.data?.type === 'simo-connect:open-call') {
        window.dispatchEvent(new CustomEvent('simo-connect:open-call'));
      }
    });
  }

  // Keep each open Connect view bound to the account that loaded it.
  window.fetch = async (input, options) => {
    const url = new URL(input instanceof Request ? input.url : input, location.href);
    if (url.origin !== location.origin || !prefixes.some(prefix => url.pathname.startsWith(prefix))) {
      return fetchFromSimo(input, options);
    }

    const headers = new Headers(options?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set("X-Simo-Connect-View", view);
    const response = await fetchFromSimo(input, {...options, headers});
    if (!reloading && response.headers.get("X-Simo-Connect-View") === "stale") {
      reloading = true;
      location.reload();
    }
    return response;
  };
})();
