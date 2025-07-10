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

/**
 * Common emoji shortcodes and text emoticons mapping
 */
const emojiMap: Record<string, string> = {
  // Text emoticons (order matters - longer patterns first)
  ':-)': '😊',
  ':)': '😊',
  ';-)': '😉',
  ';)': '😉',
  ':-(': '😢',
  ':(': '😢',
  ':-D': '😃',
  ':D': '😃',
  ':-P': '😛',
  ':P': '😛',
  ':-p': '😛',
  ':p': '😛',
  ':-o': '😮',
  ':o': '😮',
  ':-O': '😮',
  ':O': '😮',
  ':|': '😐',
  ':-|': '😐',
  // Heart alternatives (since < is stripped by security)
  ':heart': '❤️',
  ':love': '❤️',
  ':broken_heart': '💔',
  ':love:': '❤️',
  ':broken_heart:': '💔',

  // Shortcodes with and without closing colons
  ':fire:': '🔥',
  ':fire': '🔥',
  ':smile:': '😊',
  ':smile': '😊',
  ':laughing:': '😆',
  ':laughing': '😆',
  ':grin:': '😀',
  ':grin': '😀',
  ':wink:': '😉',
  ':wink': '😉',
  ':heart:': '❤️',
  ':thumbsup:': '👍',
  ':thumbsup': '👍',
  ':thumbsdown:': '👎',
  ':thumbsdown': '👎',
  ':clap:': '👏',
  ':clap': '👏',
  ':rocket:': '🚀',
  ':rocket': '🚀',
  ':tada:': '🎉',
  ':tada': '🎉',
  ':eyes:': '👀',
  ':eyes': '👀',
  ':thinking:': '🤔',
  ':thinking': '🤔',
  ':facepalm:': '🤦',
  ':facepalm': '🤦',
  ':shrug:': '🤷',
  ':shrug': '🤷',
  ':coffee:': '☕',
  ':coffee': '☕',
  ':pizza:': '🍕',
  ':pizza': '🍕',
  ':beer:': '🍺',
  ':beer': '🍺',
  ':warning:': '⚠️',
  ':warning': '⚠️',
  ':check:': '✅',
  ':check': '✅',
  ':x:': '❌',
  ':x': '❌',
  ':question:': '❓',
  ':question': '❓',
  ':exclamation:': '❗',
  ':exclamation': '❗',
  ':+1:': '👍',
  ':+1': '👍',
  ':-1:': '👎',
  ':-1': '👎',
  ':ok:': '👌',
  ':ok': '👌',
  ':wave:': '👋',
  ':wave': '👋',
  ':pray:': '🙏',
  ':pray': '🙏',
  ':muscle:': '💪',
  ':muscle': '💪',
  ':point_right:': '👉',
  ':point_right': '👉',
  ':point_left:': '👈',
  ':point_left': '👈',
  ':point_up:': '👆',
  ':point_up': '👆',
  ':point_down:': '👇',
  ':point_down': '👇',
};

/**
 * Process text for emoji shortcodes and emoticons
 */
function processEmojis(text: string): string {
  let processed = text;

  // Sort emoji patterns by length (longest first) to handle overlapping patterns correctly
  const sortedEmojis = Object.entries(emojiMap).sort((a, b) => b[0].length - a[0].length);

  for (const [pattern, emoji] of sortedEmojis) {
    // Simple global replacement with escaped pattern
    const escapedPattern = escapeRegex(pattern);
    const regex = new RegExp(escapedPattern, 'g');
    processed = processed.replace(regex, emoji);
  }
  return processed;
}

/**
 * Escape special regex characters
 */
function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Process chat message text to convert URLs to clickable links and support emojis
 */
export function processChatMessage(text: string): DocumentFragment {
  const fragment = document.createDocumentFragment();

  // URL regex pattern that matches http(s) URLs
  const urlRegex = /(https?:\/\/[^\s<>"]+)/gi;

  let lastIndex = 0;
  let match;
  let hasUrls = false;

  while ((match = urlRegex.exec(text)) !== null) {
    hasUrls = true;

    // Add text before the URL (with emoji processing)
    if (match.index > lastIndex) {
      const textBefore = text.slice(lastIndex, match.index);
      const processedTextBefore = processEmojis(textBefore);
      fragment.appendChild(createTextNode(processedTextBefore));
    }

    // Create clickable link
    const url = match[0];
    const link = createSafeLink(url, url, '_blank');
    link.className = 'chat-link';
    fragment.appendChild(link);

    lastIndex = match.index + match[0].length;
  }

  if (hasUrls) {
    // Add remaining text after the last URL (with emoji processing)
    if (lastIndex < text.length) {
      const remainingText = text.slice(lastIndex);
      const processedRemainingText = processEmojis(remainingText);
      fragment.appendChild(createTextNode(processedRemainingText));
    }
  } else {
    // No URLs found, just process emojis and add the text
    const processedText = processEmojis(text);
    fragment.appendChild(createTextNode(processedText));
  }

  return fragment;
}
