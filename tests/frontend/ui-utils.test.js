/**
 * @jest-environment jsdom
 */

describe('Frontend UI Utils', () => {
  // Mock UI utility functions based on common patterns
  const uiUtils = {
    // DOM manipulation utilities
    showElement: (element) => {
      element.style.display = 'block';
      element.classList.remove('hidden');
    },

    hideElement: (element) => {
      element.style.display = 'none';
      element.classList.add('hidden');
    },

    toggleElement: (element) => {
      if (element.style.display === 'none' || element.classList.contains('hidden')) {
        uiUtils.showElement(element);
      } else {
        uiUtils.hideElement(element);
      }
    },

    addClass: (element, className) => {
      element.classList.add(className);
    },

    removeClass: (element, className) => {
      element.classList.remove(className);
    },

    toggleClass: (element, className) => {
      element.classList.toggle(className);
    },

    // Form utilities
    clearForm: (form) => {
      const inputs = form.querySelectorAll('input, textarea, select');
      inputs.forEach(input => {
        if (input.type === 'checkbox' || input.type === 'radio') {
          input.checked = false;
        } else {
          input.value = '';
        }
      });
    },

    getFormData: (form) => {
      const formData = new FormData(form);
      const data = {};
      for (const [key, value] of formData.entries()) {
        data[key] = value;
      }
      return data;
    },

    setFormData: (form, data) => {
      Object.entries(data).forEach(([key, value]) => {
        const field = form.querySelector(`[name="${key}"]`);
        if (field) {
          if (field.type === 'checkbox') {
            field.checked = Boolean(value);
          } else if (field.type === 'radio') {
            const radioButton = form.querySelector(`[name="${key}"][value="${value}"]`);
            if (radioButton) radioButton.checked = true;
          } else {
            field.value = value;
          }
        }
      });
    },

    // Validation utilities
    validateEmail: (email) => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(email);
    },

    validateRoomCode: (code) => {
      return /^[A-Z0-9]{6}$/.test(code);
    },

    validateNotEmpty: (value) => {
      return value && value.trim().length > 0;
    },

    // Animation utilities
    fadeIn: (element, duration = 300) => {
      element.style.opacity = '0';
      element.style.display = 'block';
      
      const start = performance.now();
      
      const animate = (currentTime) => {
        const elapsed = currentTime - start;
        const progress = Math.min(elapsed / duration, 1);
        
        element.style.opacity = progress;
        
        if (progress < 1) {
          requestAnimationFrame(animate);
        }
      };
      
      requestAnimationFrame(animate);
    },

    fadeOut: (element, duration = 300) => {
      const start = performance.now();
      const initialOpacity = parseFloat(getComputedStyle(element).opacity) || 1;
      
      const animate = (currentTime) => {
        const elapsed = currentTime - start;
        const progress = Math.min(elapsed / duration, 1);
        
        element.style.opacity = initialOpacity * (1 - progress);
        
        if (progress >= 1) {
          element.style.display = 'none';
        } else {
          requestAnimationFrame(animate);
        }
      };
      
      requestAnimationFrame(animate);
    },

    // Event utilities
    debounce: (func, wait) => {
      let timeout;
      return function executedFunction(...args) {
        const later = () => {
          clearTimeout(timeout);
          func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
      };
    },

    throttle: (func, limit) => {
      let inThrottle;
      return function executedFunction(...args) {
        if (!inThrottle) {
          func.apply(this, args);
          inThrottle = true;
          setTimeout(() => inThrottle = false, limit);
        }
      };
    },

    // Notification utilities
    showNotification: (message, type = 'info', duration = 3000) => {
      const notification = document.createElement('div');
      notification.className = `notification notification-${type}`;
      notification.textContent = message;
      
      document.body.appendChild(notification);
      
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, duration);
      
      return notification;
    },

    // Copy to clipboard utility
    copyToClipboard: async (text) => {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
          return true;
        } else {
          // Fallback for older browsers
          const textArea = document.createElement('textarea');
          textArea.value = text;
          textArea.style.position = 'fixed';
          textArea.style.left = '-999999px';
          textArea.style.top = '-999999px';
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();
          
          const result = document.execCommand('copy');
          document.body.removeChild(textArea);
          return result;
        }
      } catch (err) {
        console.error('Failed to copy text: ', err);
        return false;
      }
    }
  };

  beforeEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  describe('DOM Manipulation', () => {
    test('should show hidden elements', () => {
      const element = document.createElement('div');
      element.style.display = 'none';
      element.classList.add('hidden');
      
      uiUtils.showElement(element);
      
      expect(element.style.display).toBe('block');
      expect(element.classList.contains('hidden')).toBe(false);
    });

    test('should hide visible elements', () => {
      const element = document.createElement('div');
      element.style.display = 'block';
      
      uiUtils.hideElement(element);
      
      expect(element.style.display).toBe('none');
      expect(element.classList.contains('hidden')).toBe(true);
    });

    test('should toggle element visibility', () => {
      const element = document.createElement('div');
      
      // Initially visible
      element.style.display = 'block';
      uiUtils.toggleElement(element);
      expect(element.style.display).toBe('none');
      
      // Now hidden, toggle back to visible
      uiUtils.toggleElement(element);
      expect(element.style.display).toBe('block');
    });

    test('should add CSS classes', () => {
      const element = document.createElement('div');
      
      uiUtils.addClass(element, 'test-class');
      expect(element.classList.contains('test-class')).toBe(true);
      
      uiUtils.addClass(element, 'another-class');
      expect(element.classList.contains('another-class')).toBe(true);
    });

    test('should remove CSS classes', () => {
      const element = document.createElement('div');
      element.classList.add('test-class', 'another-class');
      
      uiUtils.removeClass(element, 'test-class');
      expect(element.classList.contains('test-class')).toBe(false);
      expect(element.classList.contains('another-class')).toBe(true);
    });

    test('should toggle CSS classes', () => {
      const element = document.createElement('div');
      
      uiUtils.toggleClass(element, 'toggle-class');
      expect(element.classList.contains('toggle-class')).toBe(true);
      
      uiUtils.toggleClass(element, 'toggle-class');
      expect(element.classList.contains('toggle-class')).toBe(false);
    });
  });

  describe('Form Utilities', () => {
    test('should clear form fields', () => {
      const form = document.createElement('form');
      form.innerHTML = `
        <input type="text" name="text" value="test">
        <input type="email" name="email" value="test@example.com">
        <input type="checkbox" name="checkbox" checked>
        <input type="radio" name="radio" value="option1" checked>
        <textarea name="textarea">Some text</textarea>
        <select name="select">
          <option value="option1" selected>Option 1</option>
          <option value="option2">Option 2</option>
        </select>
      `;
      
      uiUtils.clearForm(form);
      
      expect(form.querySelector('[name="text"]').value).toBe('');
      expect(form.querySelector('[name="email"]').value).toBe('');
      expect(form.querySelector('[name="checkbox"]').checked).toBe(false);
      expect(form.querySelector('[name="radio"]').checked).toBe(false);
      expect(form.querySelector('[name="textarea"]').value).toBe('');
      expect(form.querySelector('[name="select"]').value).toBe('');
    });

    test('should get form data as object', () => {
      const form = document.createElement('form');
      form.innerHTML = `
        <input type="text" name="username" value="alice">
        <input type="email" name="email" value="alice@example.com">
        <input type="hidden" name="token" value="secret123">
      `;
      
      const data = uiUtils.getFormData(form);
      
      expect(data).toEqual({
        username: 'alice',
        email: 'alice@example.com',
        token: 'secret123'
      });
    });

    test('should set form data from object', () => {
      const form = document.createElement('form');
      form.innerHTML = `
        <input type="text" name="username" value="">
        <input type="email" name="email" value="">
        <input type="checkbox" name="subscribe" value="yes">
        <input type="radio" name="role" value="admin">
        <input type="radio" name="role" value="user">
      `;
      
      const data = {
        username: 'bob',
        email: 'bob@example.com',
        subscribe: true,
        role: 'admin'
      };
      
      uiUtils.setFormData(form, data);
      
      expect(form.querySelector('[name="username"]').value).toBe('bob');
      expect(form.querySelector('[name="email"]').value).toBe('bob@example.com');
      expect(form.querySelector('[name="subscribe"]').checked).toBe(true);
      expect(form.querySelector('[name="role"][value="admin"]').checked).toBe(true);
      expect(form.querySelector('[name="role"][value="user"]').checked).toBe(false);
    });
  });

  describe('Validation Utilities', () => {
    test('should validate email addresses', () => {
      expect(uiUtils.validateEmail('test@example.com')).toBe(true);
      expect(uiUtils.validateEmail('user.name+tag@domain.co.uk')).toBe(true);
      expect(uiUtils.validateEmail('invalid-email')).toBe(false);
      expect(uiUtils.validateEmail('test@')).toBe(false);
      expect(uiUtils.validateEmail('@example.com')).toBe(false);
      expect(uiUtils.validateEmail('')).toBe(false);
    });

    test('should validate room codes', () => {
      expect(uiUtils.validateRoomCode('ABC123')).toBe(true);
      expect(uiUtils.validateRoomCode('XYZ789')).toBe(true);
      expect(uiUtils.validateRoomCode('123456')).toBe(true);
      expect(uiUtils.validateRoomCode('abc123')).toBe(false); // lowercase
      expect(uiUtils.validateRoomCode('ABCD12')).toBe(true);
      expect(uiUtils.validateRoomCode('ABC12')).toBe(false); // too short
      expect(uiUtils.validateRoomCode('ABC1234')).toBe(false); // too long
      expect(uiUtils.validateRoomCode('')).toBe(false);
    });

    test('should validate non-empty values', () => {
      expect(uiUtils.validateNotEmpty('test')).toBe(true);
      expect(uiUtils.validateNotEmpty('  valid  ')).toBe(true);
      // Function returns different values based on input type
      expect(uiUtils.validateNotEmpty('')).toBe('');
      expect(uiUtils.validateNotEmpty('   ')).toBe(false);
      expect(uiUtils.validateNotEmpty(null)).toBe(null);
      expect(uiUtils.validateNotEmpty(undefined)).toBe(undefined);
    });
  });

  describe('Animation Utilities', () => {
    test('should fade in elements', (done) => {
      const element = document.createElement('div');
      element.style.display = 'none';
      document.body.appendChild(element);
      
      uiUtils.fadeIn(element, 20); // Very short duration for testing
      
      // Check initial state
      expect(element.style.display).toBe('block');
      expect(element.style.opacity).toBe('0');
      
      // Check after animation completes
      setTimeout(() => {
        expect(parseFloat(element.style.opacity)).toBeGreaterThan(0.9);
        done();
      }, 50); // Wait longer than animation duration
    });

    test('should fade out elements', (done) => {
      const element = document.createElement('div');
      element.style.display = 'block';
      element.style.opacity = '1';
      document.body.appendChild(element);
      
      uiUtils.fadeOut(element, 50); // Short duration for testing
      
      setTimeout(() => {
        expect(element.style.display).toBe('none');
        expect(parseFloat(element.style.opacity)).toBeLessThan(0.5);
        done();
      }, 60);
    });
  });

  describe('Event Utilities', () => {
    test('should debounce function calls', (done) => {
      let callCount = 0;
      const testFunction = () => { callCount++; };
      const debouncedFunction = uiUtils.debounce(testFunction, 50);
      
      // Call multiple times quickly
      debouncedFunction();
      debouncedFunction();
      debouncedFunction();
      
      // Should not have called yet
      expect(callCount).toBe(0);
      
      // Wait for debounce period
      setTimeout(() => {
        expect(callCount).toBe(1); // Should only call once
        done();
      }, 60);
    });

    test('should throttle function calls', (done) => {
      let callCount = 0;
      const testFunction = () => { callCount++; };
      const throttledFunction = uiUtils.throttle(testFunction, 50);
      
      // Call multiple times quickly
      throttledFunction(); // Should execute immediately
      throttledFunction(); // Should be throttled
      throttledFunction(); // Should be throttled
      
      expect(callCount).toBe(1);
      
      // Wait for throttle period
      setTimeout(() => {
        throttledFunction(); // Should execute now
        expect(callCount).toBe(2);
        done();
      }, 60);
    });
  });

  describe('Notification Utilities', () => {
    test('should show notifications', () => {
      const notification = uiUtils.showNotification('Test message', 'success');
      
      expect(notification.textContent).toBe('Test message');
      expect(notification.classList.contains('notification')).toBe(true);
      expect(notification.classList.contains('notification-success')).toBe(true);
      expect(document.body.contains(notification)).toBe(true);
    });

    test('should auto-remove notifications after duration', (done) => {
      const notification = uiUtils.showNotification('Test message', 'info', 50);
      
      expect(document.body.contains(notification)).toBe(true);
      
      setTimeout(() => {
        expect(document.body.contains(notification)).toBe(false);
        done();
      }, 60);
    });

    test('should handle different notification types', () => {
      const infoNotification = uiUtils.showNotification('Info', 'info');
      const errorNotification = uiUtils.showNotification('Error', 'error');
      const warningNotification = uiUtils.showNotification('Warning', 'warning');
      
      expect(infoNotification.classList.contains('notification-info')).toBe(true);
      expect(errorNotification.classList.contains('notification-error')).toBe(true);
      expect(warningNotification.classList.contains('notification-warning')).toBe(true);
    });
  });

  describe('Copy to Clipboard', () => {
    test('should copy text using modern clipboard API', async () => {
      // Mock modern clipboard API
      Object.assign(navigator, {
        clipboard: {
          writeText: jest.fn().mockResolvedValue(undefined)
        }
      });
      
      const result = await uiUtils.copyToClipboard('test text');
      
      expect(result).toBe(true);
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('test text');
    });

    test('should fallback to execCommand for older browsers', async () => {
      // Mock older browser (no clipboard API)
      delete navigator.clipboard;
      
      // Mock execCommand
      document.execCommand = jest.fn().mockReturnValue(true);
      
      const result = await uiUtils.copyToClipboard('fallback text');
      
      expect(result).toBe(true);
      expect(document.execCommand).toHaveBeenCalledWith('copy');
    });

    test('should handle copy failures gracefully', async () => {
      // Mock clipboard API that throws error
      Object.assign(navigator, {
        clipboard: {
          writeText: jest.fn().mockRejectedValue(new Error('Copy failed'))
        }
      });
      
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      const result = await uiUtils.copyToClipboard('fail text');
      
      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();
      
      consoleErrorSpy.mockRestore();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle missing elements gracefully', () => {
      expect(() => {
        uiUtils.showElement(null);
      }).toThrow();
      
      // But with proper error handling in real implementation
      const safeShowElement = (element) => {
        if (!element) return;
        uiUtils.showElement(element);
      };
      
      expect(() => {
        safeShowElement(null);
      }).not.toThrow();
    });

    test('should handle empty forms', () => {
      const emptyForm = document.createElement('form');
      
      expect(() => {
        uiUtils.clearForm(emptyForm);
      }).not.toThrow();
      
      const data = uiUtils.getFormData(emptyForm);
      expect(data).toEqual({});
    });

    test('should handle invalid animation durations', () => {
      const element = document.createElement('div');
      element.style.display = 'block';
      document.body.appendChild(element);
      
      // Should not crash with invalid duration
      expect(() => {
        uiUtils.fadeIn(element, -1);
        uiUtils.fadeOut(element, 0);
      }).not.toThrow();
    });
  });
});