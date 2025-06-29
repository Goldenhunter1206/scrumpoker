/**
 * Storage Optimizer for reducing localStorage operations
 * Batches localStorage writes and implements debouncing
 */

interface StorageOperation {
  key: string;
  value: string;
  timestamp: number;
}

class StorageOptimizer {
  private pendingWrites = new Map<string, StorageOperation>();
  private debounceTimeout: NodeJS.Timeout | null = null;
  private readonly debounceDelay = 500; // 500ms debounce
  private cache = new Map<string, string>();

  constructor() {
    // Load cache from localStorage on initialization
    this.loadCache();
    
    // Flush pending writes on page unload
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.flushSync();
      });
    }
  }

  /**
   * Set a value in localStorage with debouncing
   */
  setItem(key: string, value: string): void {
    // Update cache immediately for reads
    this.cache.set(key, value);
    
    // Queue the write operation
    this.pendingWrites.set(key, {
      key,
      value,
      timestamp: Date.now()
    });

    this.scheduleFlush();
  }

  /**
   * Get a value from localStorage (cached)
   */
  getItem(key: string): string | null {
    // Check cache first
    if (this.cache.has(key)) {
      return this.cache.get(key)!;
    }

    // Fall back to localStorage
    try {
      const value = localStorage.getItem(key);
      if (value !== null) {
        this.cache.set(key, value);
      }
      return value;
    } catch (error) {
      console.warn('Failed to read from localStorage:', error);
      return null;
    }
  }

  /**
   * Remove an item from localStorage
   */
  removeItem(key: string): void {
    this.cache.delete(key);
    this.pendingWrites.delete(key);

    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.warn('Failed to remove from localStorage:', error);
    }
  }

  /**
   * Clear all localStorage items
   */
  clear(): void {
    this.cache.clear();
    this.pendingWrites.clear();

    try {
      localStorage.clear();
    } catch (error) {
      console.warn('Failed to clear localStorage:', error);
    }
  }

  /**
   * Schedule a flush operation
   */
  private scheduleFlush(): void {
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
    }

    this.debounceTimeout = setTimeout(() => {
      this.flush();
    }, this.debounceDelay);
  }

  /**
   * Flush all pending writes to localStorage
   */
  private flush(): void {
    if (this.pendingWrites.size === 0) return;

    const writes = Array.from(this.pendingWrites.values());
    this.pendingWrites.clear();

    // Group writes by key (keep only the latest for each key)
    const latestWrites = new Map<string, StorageOperation>();
    writes.forEach(operation => {
      const existing = latestWrites.get(operation.key);
      if (!existing || operation.timestamp > existing.timestamp) {
        latestWrites.set(operation.key, operation);
      }
    });

    // Perform the actual localStorage writes
    try {
      latestWrites.forEach(({ key, value }) => {
        localStorage.setItem(key, value);
      });
    } catch (error) {
      console.warn('Failed to write to localStorage:', error);
      // Re-queue failed writes
      latestWrites.forEach((operation) => {
        this.pendingWrites.set(operation.key, operation);
      });
    }

    this.debounceTimeout = null;
  }

  /**
   * Immediately flush all pending writes (synchronous)
   */
  flushSync(): void {
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
      this.debounceTimeout = null;
    }
    this.flush();
  }

  /**
   * Load existing localStorage data into cache
   */
  private loadCache(): void {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          const value = localStorage.getItem(key);
          if (value !== null) {
            this.cache.set(key, value);
          }
        }
      }
    } catch (error) {
      console.warn('Failed to load localStorage cache:', error);
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): { cacheSize: number; pendingWrites: number } {
    return {
      cacheSize: this.cache.size,
      pendingWrites: this.pendingWrites.size
    };
  }
}

// Create singleton instance
export const storageOptimizer = new StorageOptimizer();

/**
 * Optimized localStorage wrapper functions
 */
export function setStorageItem(key: string, value: any): void {
  const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
  storageOptimizer.setItem(key, stringValue);
}

export function getStorageItem(key: string): string | null {
  return storageOptimizer.getItem(key);
}

export function getStorageItemParsed<T>(key: string): T | null {
  const value = storageOptimizer.getItem(key);
  if (value === null) return null;
  
  try {
    return JSON.parse(value);
  } catch (error) {
    console.warn(`Failed to parse localStorage value for key "${key}":`, error);
    return null;
  }
}

export function removeStorageItem(key: string): void {
  storageOptimizer.removeItem(key);
}

export function clearStorage(): void {
  storageOptimizer.clear();
}

export function flushStorage(): void {
  storageOptimizer.flushSync();
}