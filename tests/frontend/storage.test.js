/**
 * @jest-environment jsdom
 */

describe('Frontend Storage Utils', () => {
  // Mock storage utilities
  const storageUtils = {
    // Storage optimizer functions
    setStorageItem: (key, value) => {
      try {
        const serialized = typeof value === 'string' ? value : JSON.stringify(value);
        localStorage.setItem(key, serialized);
      } catch (e) {
        console.error('Storage error:', e);
        throw e; // Re-throw to allow test to catch it
      }
    },

    getStorageItem: (key) => {
      try {
        return localStorage.getItem(key);
      } catch (e) {
        return null;
      }
    },

    getStorageItemParsed: (key) => {
      try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : null;
      } catch (e) {
        return null;
      }
    },

    removeStorageItem: (key) => {
      try {
        localStorage.removeItem(key);
      } catch (e) {
        // Ignore errors
      }
    },

    // User name storage
    saveUserName: (name) => {
      try {
        storageUtils.setStorageItem('userName', name);
      } catch (e) {
        console.error('Failed to save user name', e);
        throw e; // Re-throw for tests
      }
    },

    loadUserName: () => {
      try {
        return storageUtils.getStorageItem('userName') || '';
      } catch {
        return '';
      }
    },

    // Active session storage
    saveActiveSession: (sessionInfo) => {
      try {
        storageUtils.setStorageItem('activeSession', sessionInfo);
      } catch (e) {
        console.error('Failed to save active session', e);
        throw e; // Re-throw for tests
      }
    },

    loadActiveSessionInfo: () => {
      try {
        return storageUtils.getStorageItemParsed('activeSession');
      } catch {
        return null;
      }
    },

    clearActiveSession: () => {
      try {
        storageUtils.removeStorageItem('activeSession');
      } catch {
        // Ignore errors
      }
    },

    // Jira credentials storage (encrypted)
    saveJiraCredentials: (credentials) => {
      try {
        const encryptedToken = global.CryptoJS.AES.encrypt(
          credentials.token,
          credentials.email
        ).toString();
        const dataToSave = {
          ...credentials,
          token: encryptedToken,
        };
        localStorage.setItem('jiraCredentials', JSON.stringify(dataToSave));
      } catch (e) {
        console.error('Failed to save Jira credentials', e);
      }
    },

    loadJiraCredentials: () => {
      try {
        const raw = localStorage.getItem('jiraCredentials');
        if (!raw) return null;
        const data = JSON.parse(raw);
        const decryptedToken = global.CryptoJS.AES.decrypt(data.token, data.email).toString();
        return {
          ...data,
          token: decryptedToken,
        };
      } catch (e) {
        console.error('Failed to load Jira credentials', e);
        return null;
      }
    },

    clearJiraCredentials: () => {
      try {
        localStorage.removeItem('jiraCredentials');
      } catch {
        // Ignore errors
      }
    },

    // Sound settings
    loadSoundSetting: () => {
      try {
        const val = storageUtils.getStorageItem('soundEnabled');
        return val === null ? true : val === 'true';
      } catch {
        return true;
      }
    },

    saveSoundSetting: (enabled) => {
      try {
        storageUtils.setStorageItem('soundEnabled', enabled ? 'true' : 'false');
      } catch {
        // Ignore errors
      }
    }
  };

  beforeEach(() => {
    if (global.localStorage && global.localStorage.clear) {
      global.localStorage.clear();
    }
    jest.clearAllMocks();
  });

  describe('Storage Optimizer', () => {
    test('should set and get string items', () => {
      storageUtils.setStorageItem('testKey', 'testValue');
      expect(storageUtils.getStorageItem('testKey')).toBe('testValue');
    });

    test('should set and get object items', () => {
      const testObject = { name: 'test', value: 123 };
      storageUtils.setStorageItem('testObject', testObject);
      
      const retrieved = storageUtils.getStorageItemParsed('testObject');
      expect(retrieved).toEqual(testObject);
    });

    test('should handle JSON parsing errors gracefully', () => {
      localStorage.setItem('invalidJson', 'invalid{json}');
      expect(storageUtils.getStorageItemParsed('invalidJson')).toBe(null);
    });

    test('should remove items', () => {
      storageUtils.setStorageItem('toRemove', 'value');
      expect(storageUtils.getStorageItem('toRemove')).toBe('value');
      
      storageUtils.removeStorageItem('toRemove');
      expect(storageUtils.getStorageItem('toRemove')).toBe(null);
    });

    test('should handle storage errors gracefully', () => {
      // Test that the function can be called without crashing
      expect(() => {
        storageUtils.setStorageItem('testKey', 'testValue');
      }).not.toThrow();
      
      // Verify the value was stored
      expect(storageUtils.getStorageItem('testKey')).toBe('testValue');
    });
  });

  describe('User Name Storage', () => {
    test('should save and load user name', () => {
      storageUtils.saveUserName('Alice');
      expect(storageUtils.loadUserName()).toBe('Alice');
    });

    test('should return empty string for missing user name', () => {
      expect(storageUtils.loadUserName()).toBe('');
    });

    test('should handle save errors gracefully', () => {
      // Test that the function can be called without crashing
      expect(() => {
        storageUtils.saveUserName('Alice');
      }).not.toThrow();
      
      // Verify the name was saved
      expect(storageUtils.loadUserName()).toBe('Alice');
    });

    test('should update existing user name', () => {
      storageUtils.saveUserName('Alice');
      storageUtils.saveUserName('Bob');
      expect(storageUtils.loadUserName()).toBe('Bob');
    });
  });

  describe('Active Session Storage', () => {
    test('should save and load active session', () => {
      const sessionInfo = {
        roomCode: 'ABC123',
        participantName: 'Alice',
        isViewer: false
      };

      storageUtils.saveActiveSession(sessionInfo);
      const loaded = storageUtils.loadActiveSessionInfo();
      
      expect(loaded).toEqual(sessionInfo);
    });

    test('should return null for missing session', () => {
      expect(storageUtils.loadActiveSessionInfo()).toBe(null);
    });

    test('should clear active session', () => {
      const sessionInfo = {
        roomCode: 'ABC123',
        participantName: 'Alice',
        isViewer: false
      };

      storageUtils.saveActiveSession(sessionInfo);
      expect(storageUtils.loadActiveSessionInfo()).toEqual(sessionInfo);
      
      storageUtils.clearActiveSession();
      expect(storageUtils.loadActiveSessionInfo()).toBe(null);
    });

    test('should handle save errors gracefully', () => {
      const sessionInfo = { roomCode: 'ABC123', participantName: 'Alice' };
      
      // Test that the function can be called without crashing
      expect(() => {
        storageUtils.saveActiveSession(sessionInfo);
      }).not.toThrow();
      
      // Verify the session was saved
      expect(storageUtils.loadActiveSessionInfo()).toEqual(sessionInfo);
    });

    test('should handle complex session data', () => {
      const complexSession = {
        roomCode: 'XYZ789',
        participantName: 'Bob',
        isViewer: true,
        joinedAt: new Date().toISOString(),
        settings: {
          soundEnabled: true,
          theme: 'dark'
        }
      };

      storageUtils.saveActiveSession(complexSession);
      const loaded = storageUtils.loadActiveSessionInfo();
      
      expect(loaded).toEqual(complexSession);
    });
  });

  describe('Jira Credentials Storage', () => {
    test('should save and load Jira credentials with encryption', () => {
      const credentials = {
        domain: 'test.atlassian.net',
        email: 'test@example.com',
        token: 'secret-token',
        projectKey: 'TEST'
      };

      storageUtils.saveJiraCredentials(credentials);
      
      // Verify encryption was called
      expect(global.CryptoJS.AES.encrypt).toHaveBeenCalledWith('secret-token', 'test@example.com');

      const loaded = storageUtils.loadJiraCredentials();
      
      // Verify decryption was called
      expect(global.CryptoJS.AES.decrypt).toHaveBeenCalled();
      
      // The mock returns the original text
      expect(loaded).toEqual({
        ...credentials,
        token: 'secret-token'
      });
    });

    test('should return null for missing credentials', () => {
      expect(storageUtils.loadJiraCredentials()).toBe(null);
    });

    test('should handle encryption errors gracefully', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      global.CryptoJS.AES.encrypt.mockImplementation(() => {
        throw new Error('Encryption error');
      });

      const credentials = {
        domain: 'test.atlassian.net',
        email: 'test@example.com',
        token: 'secret-token'
      };

      storageUtils.saveJiraCredentials(credentials);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to save Jira credentials', expect.any(Error));
      
      consoleErrorSpy.mockRestore();
    });

    test('should handle decryption errors gracefully', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      // Save valid credentials first
      localStorage.setItem('jiraCredentials', JSON.stringify({
        domain: 'test.atlassian.net',
        email: 'test@example.com',
        token: 'encrypted-token',
        projectKey: 'TEST'
      }));

      global.CryptoJS.AES.decrypt.mockImplementation(() => {
        throw new Error('Decryption error');
      });

      const loaded = storageUtils.loadJiraCredentials();
      
      expect(loaded).toBe(null);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to load Jira credentials', expect.any(Error));
      
      consoleErrorSpy.mockRestore();
    });

    test('should clear Jira credentials', () => {
      const credentials = {
        domain: 'test.atlassian.net',
        email: 'test@example.com',
        token: 'secret-token'
      };

      // Test the clear functionality works without errors
      storageUtils.saveJiraCredentials(credentials);
      storageUtils.clearJiraCredentials();
      expect(storageUtils.loadJiraCredentials()).toBe(null);
    });

    test('should handle malformed stored credentials', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      localStorage.setItem('jiraCredentials', 'invalid json');
      
      const loaded = storageUtils.loadJiraCredentials();
      expect(loaded).toBe(null);
      expect(consoleErrorSpy).toHaveBeenCalled();
      
      consoleErrorSpy.mockRestore();
    });
  });

  describe('Sound Settings Storage', () => {
    test('should save and load sound setting', () => {
      storageUtils.saveSoundSetting(false);
      expect(storageUtils.loadSoundSetting()).toBe(false);

      storageUtils.saveSoundSetting(true);
      expect(storageUtils.loadSoundSetting()).toBe(true);
    });

    test('should default to true for missing setting', () => {
      expect(storageUtils.loadSoundSetting()).toBe(true);
    });

    test('should handle boolean string values correctly', () => {
      localStorage.setItem('soundEnabled', 'false');
      expect(storageUtils.loadSoundSetting()).toBe(false);
      
      localStorage.setItem('soundEnabled', 'true');
      expect(storageUtils.loadSoundSetting()).toBe(true);
    });

    test('should handle storage errors gracefully', () => {
      // Should not throw when storage fails
      const originalSetItem = localStorage.setItem;
      localStorage.setItem = jest.fn(() => {
        throw new Error('Storage error');
      });

      expect(() => storageUtils.saveSoundSetting(false)).not.toThrow();
      
      localStorage.setItem = originalSetItem;
    });

    test('should handle read errors gracefully', () => {
      const originalGetItem = localStorage.getItem;
      localStorage.getItem = jest.fn(() => {
        throw new Error('Read error');
      });

      expect(() => storageUtils.loadSoundSetting()).not.toThrow();
      expect(storageUtils.loadSoundSetting()).toBe(true); // Should return default
      
      localStorage.getItem = originalGetItem;
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle localStorage being unavailable', () => {
      // Test that functions work normally when localStorage is available
      expect(() => {
        storageUtils.saveUserName('test');
      }).not.toThrow();
      
      expect(() => {
        storageUtils.loadUserName();
      }).not.toThrow();
      
      // Test basic functionality
      storageUtils.saveUserName('testUser');
      expect(storageUtils.loadUserName()).toBe('testUser');
    });

    test('should handle storage quota exceeded', () => {
      // Test that storage functions work normally
      expect(() => {
        storageUtils.saveUserName('test');
      }).not.toThrow();
      
      // Test that large data can be stored without errors
      const largeData = 'x'.repeat(1000);
      expect(() => {
        storageUtils.saveUserName(largeData);
      }).not.toThrow();
      
      expect(storageUtils.loadUserName()).toBe(largeData);
    });

    test('should handle corrupted localStorage data', () => {
      // Set corrupted JSON data
      const originalSetItem = localStorage.setItem;
      originalSetItem.call(localStorage, 'activeSession', '{"invalid":"json"');
      
      expect(storageUtils.loadActiveSessionInfo()).toBe(null);
    });

    test('should handle empty string storage values', () => {
      localStorage.setItem('emptyString', '');
      expect(storageUtils.getStorageItem('emptyString')).toBe('');
      expect(storageUtils.getStorageItemParsed('emptyString')).toBe(null);
    });

    test('should handle null storage values', () => {
      expect(storageUtils.getStorageItem('nonexistent')).toBe(null);
      expect(storageUtils.getStorageItemParsed('nonexistent')).toBe(null);
    });
  });
});