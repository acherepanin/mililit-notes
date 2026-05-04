export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

const blockedTags = new Set(['script', 'style', 'iframe', 'object', 'embed', 'form']);
const safeUrlProtocols = new Set(['http:', 'https:', 'mailto:', 'tel:']);

function isSafeUrl(value: string): boolean {
  try {
    const url = new URL(value, window.location.origin);

    return safeUrlProtocols.has(url.protocol);
  } catch {
    return false;
  }
}

export function sanitizeHtml(value: string): string {
  const template = document.createElement('template');
  template.innerHTML = value;

  template.content.querySelectorAll('*').forEach((element) => {
    if (blockedTags.has(element.tagName.toLowerCase())) {
      element.remove();
      return;
    }

    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();

      if (name.startsWith('on') || name === 'style') {
        element.removeAttribute(attribute.name);
        return;
      }

      if ((name === 'href' || name === 'src') && !isSafeUrl(attribute.value)) {
        element.removeAttribute(attribute.name);
      }
    });

    if (element.tagName.toLowerCase() === 'a') {
      element.setAttribute('target', '_blank');
      element.setAttribute('rel', 'noopener noreferrer');
    }
  });

  return template.innerHTML;
}
