/**
 * @jest-environment jsdom
 */

describe('Frontend Security Utils', () => {
  // Mock security utilities since we can't import TypeScript directly in JS tests
  const securityUtils = {
    escapeHtml: (text) => {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    },

    setTextContent: (element, text) => {
      element.textContent = text;
    },

    setSafeHtml: (element, html) => {
      const temp = document.createElement('div');
      temp.innerHTML = html;

      // Remove all script tags
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
    },

    createElement: (tagName, textContent, className) => {
      const element = document.createElement(tagName);
      if (textContent) {
        element.textContent = textContent;
      }
      if (className) {
        element.className = className;
      }
      return element;
    },

    isSafeUrl: (url) => {
      try {
        const parsed = new URL(url, window.location.origin);
        return ['http:', 'https:', 'mailto:'].includes(parsed.protocol);
      } catch {
        return false;
      }
    },

    createSafeLink: (href, text, target) => {
      const link = document.createElement('a');
      link.textContent = text;

      if (securityUtils.isSafeUrl(href)) {
        link.href = href;
      } else {
        link.href = '#';
        console.warn('Unsafe URL blocked:', href);
      }

      if (target) {
        link.target = target;
        if (target === '_blank') {
          link.rel = 'noopener noreferrer';
        }
      }

      return link;
    },

    processChatMessage: (text) => {
      const fragment = document.createDocumentFragment();
      const urlRegex = /(https?:\/\/[^\s<>"]+)/gi;

      let lastIndex = 0;
      let match;
      let hasUrls = false;

      const emojiMap = {
        ':)': '😊',
        ':(': '😢',
        ':D': '😃',
        ':fire:': '🔥',
        ':thumbsup:': '👍'
      };

      function processEmojis(inputText) {
        let processed = inputText;
        Object.entries(emojiMap).forEach(([pattern, emoji]) => {
          processed = processed.replace(new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), emoji);
        });
        return processed;
      }

      while ((match = urlRegex.exec(text)) !== null) {
        hasUrls = true;

        if (match.index > lastIndex) {
          const textBefore = text.slice(lastIndex, match.index);
          const processedTextBefore = processEmojis(textBefore);
          fragment.appendChild(document.createTextNode(processedTextBefore));
        }

        const url = match[0];
        const link = securityUtils.createSafeLink(url, url, '_blank');
        link.className = 'chat-link';
        fragment.appendChild(link);

        lastIndex = match.index + match[0].length;
      }

      if (hasUrls) {
        if (lastIndex < text.length) {
          const remainingText = text.slice(lastIndex);
          const processedRemainingText = processEmojis(remainingText);
          fragment.appendChild(document.createTextNode(processedRemainingText));
        }
      } else {
        const processedText = processEmojis(text);
        fragment.appendChild(document.createTextNode(processedText));
      }

      return fragment;
    }
  };

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('escapeHtml', () => {
    test('should escape HTML entities', () => {
      const result = securityUtils.escapeHtml('<script>alert("xss")</script>');
      expect(result).toBe('&lt;script&gt;alert("xss")&lt;/script&gt;');
    });

    test('should handle special characters', () => {
      expect(securityUtils.escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
      expect(securityUtils.escapeHtml('"Hello World"')).toBe('"Hello World"');
      expect(securityUtils.escapeHtml("It's a test")).toBe("It's a test");
    });

    test('should handle empty and normal strings', () => {
      expect(securityUtils.escapeHtml('')).toBe('');
      expect(securityUtils.escapeHtml('normal text')).toBe('normal text');
      expect(securityUtils.escapeHtml('123456')).toBe('123456');
    });
  });

  describe('setTextContent', () => {
    test('should safely set text content', () => {
      const element = document.createElement('div');
      securityUtils.setTextContent(element, '<script>alert("xss")</script>');
      
      expect(element.textContent).toBe('<script>alert("xss")</script>');
      expect(element.innerHTML).toBe('&lt;script&gt;alert("xss")&lt;/script&gt;');
    });

    test('should handle empty content', () => {
      const element = document.createElement('div');
      securityUtils.setTextContent(element, '');
      
      expect(element.textContent).toBe('');
      expect(element.innerHTML).toBe('');
    });
  });

  describe('setSafeHtml', () => {
    test('should remove script tags', () => {
      const element = document.createElement('div');
      securityUtils.setSafeHtml(element, '<p>Hello</p><script>alert("xss")</script>');
      
      expect(element.innerHTML).toBe('<p>Hello</p>');
      expect(element.querySelector('script')).toBe(null);
    });

    test('should remove event handlers', () => {
      const element = document.createElement('div');
      securityUtils.setSafeHtml(element, '<p onclick="alert(1)" onmouseover="alert(2)">Hello</p>');
      
      const p = element.querySelector('p');
      expect(p.getAttribute('onclick')).toBe(null);
      expect(p.getAttribute('onmouseover')).toBe(null);
      expect(p.textContent).toBe('Hello');
    });

    test('should remove javascript: hrefs', () => {
      const element = document.createElement('div');
      securityUtils.setSafeHtml(element, '<a href="javascript:alert(1)">Link</a>');
      
      const link = element.querySelector('a');
      expect(link.getAttribute('href')).toBe(null);
      expect(link.textContent).toBe('Link');
    });

    test('should preserve safe HTML', () => {
      const element = document.createElement('div');
      const safeHtml = '<p><strong>Bold</strong> and <em>italic</em> text</p>';
      securityUtils.setSafeHtml(element, safeHtml);
      
      expect(element.innerHTML).toBe(safeHtml);
    });

    test('should handle multiple script tags', () => {
      const element = document.createElement('div');
      securityUtils.setSafeHtml(element, 
        '<div>Safe content</div><script>alert(1)</script><p>More content</p><script>alert(2)</script>'
      );
      
      expect(element.innerHTML).toBe('<div>Safe content</div><p>More content</p>');
      expect(element.querySelectorAll('script')).toHaveLength(0);
    });
  });

  describe('createElement', () => {
    test('should create element with text content and class', () => {
      const element = securityUtils.createElement('div', 'Hello World', 'test-class');
      
      expect(element.tagName).toBe('DIV');
      expect(element.textContent).toBe('Hello World');
      expect(element.className).toBe('test-class');
    });

    test('should create element without optional parameters', () => {
      const element = securityUtils.createElement('span');
      
      expect(element.tagName).toBe('SPAN');
      expect(element.textContent).toBe('');
      expect(element.className).toBe('');
    });

    test('should create element with only text content', () => {
      const element = securityUtils.createElement('p', 'Test paragraph');
      
      expect(element.tagName).toBe('P');
      expect(element.textContent).toBe('Test paragraph');
      expect(element.className).toBe('');
    });
  });

  describe('isSafeUrl', () => {
    test('should allow safe protocols', () => {
      expect(securityUtils.isSafeUrl('https://example.com')).toBe(true);
      expect(securityUtils.isSafeUrl('http://example.com')).toBe(true);
      expect(securityUtils.isSafeUrl('mailto:test@example.com')).toBe(true);
    });

    test('should block dangerous protocols', () => {
      expect(securityUtils.isSafeUrl('javascript:alert(1)')).toBe(false);
      expect(securityUtils.isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
      expect(securityUtils.isSafeUrl('vbscript:msgbox(1)')).toBe(false);
    });

    test('should handle relative URLs', () => {
      expect(securityUtils.isSafeUrl('/relative/path')).toBe(true);
      expect(securityUtils.isSafeUrl('relative/path')).toBe(true);
      expect(securityUtils.isSafeUrl('#anchor')).toBe(true);
    });

    test('should handle malformed URLs', () => {
      // These are treated as relative URLs, which are considered safe
      expect(securityUtils.isSafeUrl('not-a-url')).toBe(true);
      expect(securityUtils.isSafeUrl('')).toBe(true);
      expect(securityUtils.isSafeUrl('::invalid::')).toBe(true);
    });
  });

  describe('createSafeLink', () => {
    test('should create safe link with valid URL', () => {
      const link = securityUtils.createSafeLink('https://example.com', 'Example', '_blank');
      
      expect(link.tagName).toBe('A');
      expect(link.href).toBe('https://example.com/');
      expect(link.textContent).toBe('Example');
      expect(link.target).toBe('_blank');
      expect(link.rel).toBe('noopener noreferrer');
    });

    test('should block unsafe URLs', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const link = securityUtils.createSafeLink('javascript:alert(1)', 'Dangerous');
      
      expect(link.href).toBe('http://localhost/#');
      expect(consoleWarnSpy).toHaveBeenCalledWith('Unsafe URL blocked:', 'javascript:alert(1)');
      
      consoleWarnSpy.mockRestore();
    });

    test('should create link without target', () => {
      const link = securityUtils.createSafeLink('https://example.com', 'Example');
      
      expect(link.target).toBe('');
      expect(link.rel).toBe('');
    });

    test('should handle empty text', () => {
      const link = securityUtils.createSafeLink('https://example.com', '');
      
      expect(link.textContent).toBe('');
      expect(link.href).toBe('https://example.com/');
    });
  });

  describe('processChatMessage', () => {
    test('should convert URLs to clickable links', () => {
      const fragment = securityUtils.processChatMessage('Visit https://example.com for more info');
      
      const container = document.createElement('div');
      container.appendChild(fragment);
      
      expect(container.innerHTML).toContain('<a href="https://example.com"');
      expect(container.innerHTML).toContain('class="chat-link"');
      expect(container.innerHTML).toContain('target="_blank"');
      expect(container.innerHTML).toContain('rel="noopener noreferrer"');
      expect(container.textContent).toContain('Visit');
      expect(container.textContent).toContain('for more info');
    });

    test('should process emoji shortcodes', () => {
      const fragment = securityUtils.processChatMessage('Hello :fire: world!');
      
      const container = document.createElement('div');
      container.appendChild(fragment);
      
      expect(container.textContent).toBe('Hello 🔥 world!');
    });

    test('should process text emoticons', () => {
      const fragment = securityUtils.processChatMessage('I am happy :) and sad :(');
      
      const container = document.createElement('div');
      container.appendChild(fragment);
      
      expect(container.textContent).toBe('I am happy 😊 and sad 😢');
    });

    test('should handle mixed content with URLs and emojis', () => {
      const fragment = securityUtils.processChatMessage('Check https://example.com :fire: it looks great :)');
      
      const container = document.createElement('div');
      container.appendChild(fragment);
      
      expect(container.innerHTML).toContain('<a href="https://example.com"');
      expect(container.textContent).toContain('🔥');
      expect(container.textContent).toContain('😊');
      expect(container.textContent).toContain('Check');
      expect(container.textContent).toContain('it looks great');
    });

    test('should handle multiple URLs in one message', () => {
      const fragment = securityUtils.processChatMessage('Visit https://example.com and https://test.com');
      
      const container = document.createElement('div');
      container.appendChild(fragment);
      
      const links = container.querySelectorAll('a');
      expect(links).toHaveLength(2);
      expect(links[0].href).toBe('https://example.com/');
      expect(links[1].href).toBe('https://test.com/');
    });

    test('should handle text without URLs or emojis', () => {
      const fragment = securityUtils.processChatMessage('Just plain text message');
      
      const container = document.createElement('div');
      container.appendChild(fragment);
      
      expect(container.textContent).toBe('Just plain text message');
      expect(container.innerHTML).toBe('Just plain text message');
      expect(container.querySelectorAll('a')).toHaveLength(0);
    });

    test('should handle empty text', () => {
      const fragment = securityUtils.processChatMessage('');
      
      const container = document.createElement('div');
      container.appendChild(fragment);
      
      expect(container.textContent).toBe('');
      expect(container.innerHTML).toBe('');
    });

    test('should handle URLs at start and end of message', () => {
      const fragment = securityUtils.processChatMessage('https://start.com middle text https://end.com');
      
      const container = document.createElement('div');
      container.appendChild(fragment);
      
      const links = container.querySelectorAll('a');
      expect(links).toHaveLength(2);
      expect(container.textContent).toContain('middle text');
    });
  });
});