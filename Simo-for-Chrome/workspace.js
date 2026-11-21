const actions = {
  website: {selector: '[data-simo-starter="build"], [data-simo-mode="website"]', label: "Build a Website"},
  design: {selector: '[data-simo-starter="design"], [data-simo-mode="design"]', label: "Design Something"},
  library: {selector: "#openLibraryBtn", label: "Library"},
  connect: {selector: "#simoMessagesBtn", label: "Simo Connect", alternateLabel: "Message"},
};

const match = location.hash.match(/^#simo-extension-(website|design|library|connect)$/);
if (["https://simonchat.ai", "http://127.0.0.1:5000"].includes(location.origin) && location.pathname === "/" && match) {
  history.replaceState(history.state, "", location.pathname + location.search);
  const action = actions[match[1]];
  const find = () => {
    const candidates = Array.from(document.querySelectorAll('button, a[href], [role="button"]'))
      .filter(element => element.getClientRects().length && !element.disabled && !element.closest("[hidden], [inert]"));
    const matchesLabel = (element, label) => [element.getAttribute("aria-label"),
      element.getAttribute("title"), element.querySelector("strong, b")?.textContent, element.textContent]
      .some(name => name?.trim().toLowerCase() === label.toLowerCase());
    return candidates.find(element => (action.selector && element.matches(action.selector))
      || matchesLabel(element, action.label))
      || (action.alternateLabel && candidates.find(element => matchesLabel(element, action.alternateLabel)));
  };

  const open = () => {
    const button = find();
    if (!button) return false;
    button.click();
    return true;
  };

  if (!open()) {
    const observer = new MutationObserver(() => {
      if (open()) {
        observer.disconnect();
        clearTimeout(timeout);
      }
    });
    observer.observe(document.body, {childList: true, subtree: true, attributes: true});
    const timeout = setTimeout(() => observer.disconnect(), 2200);
  }
}
