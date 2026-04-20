/**
 * @jest-environment jsdom
 */

const {
  setStorageItem,
  getStorageItem,
  getStorageItemParsed,
  removeStorageItem,
  clearAllStorage,
} = require('../../src/client/utils/storageOptimizer.ts');

describe('Storage Optimizer', () => {
  beforeEach(() => {
    // Clear storage before each test
    localStorage.clear();
    sessionStorage.clear();
  });

  describe('setStorageItem', () => {
    test('should store string values in localStorage', () => {
      setStorageItem('testKey', 'testValue');
      expect(localStorage.getItem('testKey')).toBe('testValue');
    });

    test('should store object values as JSON in localStorage', () => {
      const testObj = { name: 'test', value: 123 };
      setStorageItem('testObj', testObj);
      
      const stored = localStorage.getItem('testObj');
      expect(JSON.parse(stored)).toEqual(testObj);
    });

    test('should store array values as JSON in localStorage', () => {
      const testArray = [1, 2, 3, 'test'];
      setStorageItem('testArray', testArray);
      
      const stored = localStorage.getItem('testArray');
      expect(JSON.parse(stored)).toEqual(testArray);
    });

    test('should fallback to sessionStorage when localStorage fails', () => {
      // Mock localStorage to throw an error
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = jest.fn(() => {
        throw new Error('LocalStorage quota exceeded');
      });
      
      // Restore sessionStorage functionality
      const sessionStorageSetItem = sessionStorage.setItem.bind(sessionStorage);
      sessionStorage.setItem = sessionStorageSetItem;

      setStorageItem('testKey', 'testValue');
      
      expect(sessionStorage.getItem('testKey')).toBe('testValue');
      
      // Restore original method
      Storage.prototype.setItem = originalSetItem;
    });

    test('should handle storage failures gracefully', () => {
      // Mock both storages to fail
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = jest.fn(() => {
        throw new Error('Storage not available');
      });

      expect(() => {
        setStorageItem('testKey', 'testValue');
      }).not.toThrow();
      
      // Restore original method
      Storage.prototype.setItem = originalSetItem;
    });
  });

  describe('getStorageItem', () => {
    test('should retrieve string values from localStorage', () => {
      localStorage.setItem('testKey', 'testValue');
      
      const result = getStorageItem('testKey');
      expect(result).toBe('testValue');
    });

    test('should fallback to sessionStorage when localStorage fails', () => {
      sessionStorage.setItem('testKey', 'testValue');
      
      // Mock localStorage to return null
      const originalGetItem = localStorage.getItem;
      localStorage.getItem = jest.fn(() => null);
      
      const result = getStorageItem('testKey');
      expect(result).toBe('testValue');
      
      // Restore original method
      localStorage.getItem = originalGetItem;
    });

    test('should return null for non-existent keys', () => {
      const result = getStorageItem('nonExistentKey');
      expect(result).toBe(null);
    });

    test('should handle storage access errors gracefully', () => {
      // Mock both storages to fail
      const originalGetItem = Storage.prototype.getItem;
      Storage.prototype.getItem = jest.fn(() => {
        throw new Error('Storage not available');
      });

      const result = getStorageItem('testKey');
      expect(result).toBe(null);
      
      // Restore original method
      Storage.prototype.getItem = originalGetItem;
    });
  });

  describe('getStorageItemParsed', () => {
    test('should parse JSON objects from storage', () => {
      const testObj = { name: 'test', value: 123 };
      localStorage.setItem('testObj', JSON.stringify(testObj));
      
      const result = getStorageItemParsed('testObj');
      expect(result).toEqual(testObj);
    });

    test('should parse JSON arrays from storage', () => {
      const testArray = [1, 2, 3, 'test'];
      localStorage.setItem('testArray', JSON.stringify(testArray));
      
      const result = getStorageItemParsed('testArray');
      expect(result).toEqual(testArray);
    });

    test('should return null for invalid JSON', () => {
      localStorage.setItem('invalidJson', 'not valid json {');
      
      const result = getStorageItemParsed('invalidJson');
      expect(result).toBe(null);
    });

    test('should return null for non-existent keys', () => {
      const result = getStorageItemParsed('nonExistentKey');
      expect(result).toBe(null);
    });

    test('should handle storage access errors gracefully', () => {
      const originalGetItem = Storage.prototype.getItem;
      Storage.prototype.getItem = jest.fn(() => {
        throw new Error('Storage not available');
      });

      const result = getStorageItemParsed('testKey');
      expect(result).toBe(null);
      
      Storage.prototype.getItem = originalGetItem;
    });
  });

  describe('removeStorageItem', () => {
    test('should remove items from localStorage', () => {
      localStorage.setItem('testKey', 'testValue');
      expect(localStorage.getItem('testKey')).toBe('testValue');
      
      removeStorageItem('testKey');
      expect(localStorage.getItem('testKey')).toBe(null);
    });

    test('should remove items from sessionStorage as fallback', () => {
      sessionStorage.setItem('testKey', 'testValue');
      
      // Mock localStorage to not have the item
      const originalRemoveItem = localStorage.removeItem;
      localStorage.removeItem = jest.fn();
      
      removeStorageItem('testKey');
      expect(sessionStorage.getItem('testKey')).toBe(null);
      
      localStorage.removeItem = originalRemoveItem;
    });

    test('should handle removal errors gracefully', () => {
      const originalRemoveItem = Storage.prototype.removeItem;
      Storage.prototype.removeItem = jest.fn(() => {
        throw new Error('Storage not available');
      });

      expect(() => {
        removeStorageItem('testKey');
      }).not.toThrow();
      
      Storage.prototype.removeItem = originalRemoveItem;
    });
  });

  describe('clearAllStorage', () => {
    test('should clear both localStorage and sessionStorage', () => {
      localStorage.setItem('localKey', 'localValue');
      sessionStorage.setItem('sessionKey', 'sessionValue');
      
      expect(localStorage.getItem('localKey')).toBe('localValue');
      expect(sessionStorage.getItem('sessionKey')).toBe('sessionValue');
      
      clearAllStorage();
      
      expect(localStorage.getItem('localKey')).toBe(null);
      expect(sessionStorage.getItem('sessionKey')).toBe(null);
    });

    test('should handle clear errors gracefully', () => {
      const originalClear = Storage.prototype.clear;
      Storage.prototype.clear = jest.fn(() => {
        throw new Error('Storage not available');
      });

      expect(() => {
        clearAllStorage();
      }).not.toThrow();
      
      Storage.prototype.clear = originalClear;
    });
  });

  describe('Edge Cases', () => {
    test('should handle undefined values', () => {
      setStorageItem('undefinedKey', undefined);
      const result = getStorageItem('undefinedKey');
      expect(result).toBe('undefined');
    });

    test('should handle null values', () => {
      setStorageItem('nullKey', null);
      const result = getStorageItem('nullKey');
      expect(result).toBe('null');
    });

    test('should handle empty string values', () => {
      setStorageItem('emptyKey', '');
      const result = getStorageItem('emptyKey');
      expect(result).toBe('');
    });

    test('should handle boolean values', () => {
      setStorageItem('boolKey', true);
      const result = getStorageItemParsed('boolKey');
      expect(result).toBe(true);
    });

    test('should handle number values', () => {
      setStorageItem('numberKey', 42);
      const result = getStorageItemParsed('numberKey');
      expect(result).toBe(42);
    });
  });
});