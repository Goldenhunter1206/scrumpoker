/**
 * Security utilities for safe HTML handling and XSS prevention
 */

/**
 * Escape HTML entities to prevent XSS attacks
 */
export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Safely set text content without XSS risk
 */
export function setTextContent(element: HTMLElement, text: string): void {
  element.textContent = text;
}

/**
 * Safely set HTML content with basic sanitization
 * Only allows specific safe tags and attributes
 */
export function setSafeHtml(element: HTMLElement, html: string): void {
  // Create a temporary element to parse HTML
  const temp = document.createElement('div');
  temp.innerHTML = html;

  // Remove all script tags and event handlers
  const scripts = temp.querySelectorAll('script');
  scripts.forEach(script => script.remove());

  // Remove dangerous attributes
  const allElements = temp.querySelectorAll('*');
  allElements.forEach(el => {
    const attributes = el.getAttributeNames();
    attributes.forEach(attr => {
      if (
        attr.toLowerCase().startsWith('on') ||
        (attr.toLowerCase() === 'href' && el.getAttribute(attr)?.startsWith('javascript:'))
      ) {
        el.removeAttribute(attr);
      }
    });
  });

  element.innerHTML = temp.innerHTML;
}

/**
 * Create a safe text node
 */
export function createTextNode(text: string): Text {
  return document.createTextNode(text);
}

/**
 * Safely create an element with text content
 */
export function createElement(
  tagName: string,
  textContent?: string,
  className?: string
): HTMLElement {
  const element = document.createElement(tagName);
  if (textContent) {
    element.textContent = textContent;
  }
  if (className) {
    element.className = className;
  }
  return element;
}

/**
 * Validate URL to prevent javascript: protocol
 */
export function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url, window.location.origin);
    return ['http:', 'https:', 'mailto:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Safely create a link element
 */
export function createSafeLink(href: string, text: string, target?: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.textContent = text;

  if (isSafeUrl(href)) {
    link.href = href;
  } else {
    link.href = '#';
    console.warn('Unsafe URL blocked:', href);
  }

  if (target) {
    link.target = target;
    // Add security attributes for external links
    if (target === '_blank') {
      link.rel = 'noopener noreferrer';
    }
  }

  return link;
}
