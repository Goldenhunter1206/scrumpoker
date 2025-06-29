/**
 * Event Manager for handling event listeners and preventing memory leaks
 */

interface EventListenerInfo {
  element: Element | Window | Document;
  type: string;
  listener: EventListener;
  options?: boolean | AddEventListenerOptions;
}

class EventManager {
  private listeners: Map<string, EventListenerInfo> = new Map();
  private idCounter = 0;

  /**
   * Add an event listener and track it for cleanup
   */
  addEventListener(
    element: Element | Window | Document,
    type: string,
    listener: EventListener,
    options?: boolean | AddEventListenerOptions
  ): string {
    const id = `listener_${++this.idCounter}`;
    
    element.addEventListener(type, listener, options);
    
    this.listeners.set(id, {
      element,
      type,
      listener,
      options
    });
    
    return id;
  }

  /**
   * Remove a specific event listener by ID
   */
  removeEventListener(id: string): boolean {
    const info = this.listeners.get(id);
    if (!info) return false;

    info.element.removeEventListener(info.type, info.listener, info.options);
    this.listeners.delete(id);
    return true;
  }

  /**
   * Remove all event listeners for a specific element
   */
  removeElementListeners(element: Element | Window | Document): number {
    let removed = 0;
    
    for (const [id, info] of this.listeners) {
      if (info.element === element) {
        info.element.removeEventListener(info.type, info.listener, info.options);
        this.listeners.delete(id);
        removed++;
      }
    }
    
    return removed;
  }

  /**
   * Remove all event listeners of a specific type
   */
  removeEventListenersByType(type: string): number {
    let removed = 0;
    
    for (const [id, info] of this.listeners) {
      if (info.type === type) {
        info.element.removeEventListener(info.type, info.listener, info.options);
        this.listeners.delete(id);
        removed++;
      }
    }
    
    return removed;
  }

  /**
   * Remove all tracked event listeners
   */
  removeAllEventListeners(): number {
    let removed = 0;
    
    for (const [id, info] of this.listeners) {
      info.element.removeEventListener(info.type, info.listener, info.options);
      removed++;
    }
    
    this.listeners.clear();
    return removed;
  }

  /**
   * Get the number of tracked listeners
   */
  getListenerCount(): number {
    return this.listeners.size;
  }

  /**
   * Get listeners by element
   */
  getElementListeners(element: Element | Window | Document): EventListenerInfo[] {
    const result: EventListenerInfo[] = [];
    
    for (const info of this.listeners.values()) {
      if (info.element === element) {
        result.push(info);
      }
    }
    
    return result;
  }
}

// Create singleton instance
export const eventManager = new EventManager();

/**
 * Utility function to add event listener with automatic cleanup tracking
 */
export function addTrackedEventListener(
  element: Element | Window | Document,
  type: string,
  listener: EventListener,
  options?: boolean | AddEventListenerOptions
): string {
  return eventManager.addEventListener(element, type, listener, options);
}

/**
 * Utility function to remove tracked event listener
 */
export function removeTrackedEventListener(id: string): boolean {
  return eventManager.removeEventListener(id);
}

/**
 * Cleanup all event listeners on page unload
 */
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    const removed = eventManager.removeAllEventListeners();
    console.log(`Cleaned up ${removed} event listeners before page unload`);
  });
}

/**
 * Observer-based event listener cleanup for dynamic elements
 */
export class ElementEventTracker {
  private eventIds: string[] = [];
  private observer: MutationObserver | null = null;

  constructor(private element: Element) {
    this.setupCleanupObserver();
  }

  /**
   * Add an event listener to the tracked element
   */
  addEventListener(
    type: string,
    listener: EventListener,
    options?: boolean | AddEventListenerOptions
  ): string {
    const id = eventManager.addEventListener(this.element, type, listener, options);
    this.eventIds.push(id);
    return id;
  }

  /**
   * Remove a specific event listener
   */
  removeEventListener(id: string): boolean {
    const index = this.eventIds.indexOf(id);
    if (index > -1) {
      this.eventIds.splice(index, 1);
      return eventManager.removeEventListener(id);
    }
    return false;
  }

  /**
   * Clean up all event listeners for this element
   */
  cleanup(): void {
    this.eventIds.forEach(id => eventManager.removeEventListener(id));
    this.eventIds = [];
    
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }

  /**
   * Setup mutation observer to auto-cleanup when element is removed
   */
  private setupCleanupObserver(): void {
    if (!this.element.parentNode) return;

    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          for (const removedNode of Array.from(mutation.removedNodes)) {
            if (removedNode === this.element || 
                (removedNode instanceof Element && removedNode.contains(this.element))) {
              this.cleanup();
              return;
            }
          }
        }
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
}