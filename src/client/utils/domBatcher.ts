/**
 * DOM Batching Utility for Performance Optimization
 * Batches DOM operations to reduce reflows and repaints
 */

interface DOMOperation {
  type: 'read' | 'write';
  operation: () => any;
  callback?: (result?: any) => void;
}

class DOMBatcher {
  private readQueue: DOMOperation[] = [];
  private writeQueue: DOMOperation[] = [];
  private scheduled = false;

  /**
   * Schedule a DOM read operation
   */
  read(operation: () => any, callback?: (result: any) => void): void {
    this.readQueue.push({ type: 'read', operation, callback });
    this.scheduleFlush();
  }

  /**
   * Schedule a DOM write operation
   */
  write(operation: () => any, callback?: () => void): void {
    this.writeQueue.push({ type: 'write', operation, callback });
    this.scheduleFlush();
  }

  /**
   * Batch multiple DOM operations together
   */
  batch(operations: { reads?: (() => any)[]; writes?: (() => any)[] }): void {
    // Add all read operations first
    if (operations.reads) {
      operations.reads.forEach(read => this.read(read));
    }

    // Add all write operations
    if (operations.writes) {
      operations.writes.forEach(write => this.write(write));
    }
  }

  /**
   * Schedule the flush operation using requestAnimationFrame
   */
  private scheduleFlush(): void {
    if (!this.scheduled) {
      this.scheduled = true;
      requestAnimationFrame(() => this.flush());
    }
  }

  /**
   * Flush all queued operations in the optimal order
   */
  private flush(): void {
    this.scheduled = false;

    // Process all reads first to avoid layout thrashing
    const readResults: any[] = [];
    while (this.readQueue.length > 0) {
      const operation = this.readQueue.shift()!;
      try {
        const result = operation.operation();
        readResults.push({ result, callback: operation.callback });
      } catch (error) {
        console.error('DOM read operation failed:', error);
      }
    }

    // Process all writes after reads
    while (this.writeQueue.length > 0) {
      const operation = this.writeQueue.shift()!;
      try {
        operation.operation();
        if (operation.callback) {
          operation.callback();
        }
      } catch (error) {
        console.error('DOM write operation failed:', error);
      }
    }

    // Execute read callbacks after all writes are done
    readResults.forEach(({ result, callback }) => {
      if (callback) {
        try {
          callback(result);
        } catch (error) {
          console.error('DOM read callback failed:', error);
        }
      }
    });
  }

  /**
   * Immediately flush all pending operations
   */
  flushSync(): void {
    if (this.scheduled) {
      this.flush();
    }
  }
}

// Create a singleton instance
export const domBatcher = new DOMBatcher();

/**
 * Utility function to batch DOM measurements
 */
export function measureDOM<T>(fn: () => T): Promise<T> {
  return new Promise(resolve => {
    domBatcher.read(fn, resolve);
  });
}

/**
 * Utility function to batch DOM mutations
 */
export function mutateDOM(fn: () => void): Promise<void> {
  return new Promise(resolve => {
    domBatcher.write(fn, resolve);
  });
}

/**
 * Utility function to update element properties efficiently
 */
export function updateElement(
  element: HTMLElement,
  updates: {
    text?: string;
    html?: string;
    className?: string;
    style?: Partial<CSSStyleDeclaration>;
    attributes?: Record<string, string>;
  }
): Promise<void> {
  return mutateDOM(() => {
    if (updates.text !== undefined) {
      element.textContent = updates.text;
    }
    if (updates.html !== undefined) {
      element.innerHTML = updates.html;
    }
    if (updates.className !== undefined) {
      element.className = updates.className;
    }
    if (updates.style) {
      Object.assign(element.style, updates.style);
    }
    if (updates.attributes) {
      Object.entries(updates.attributes).forEach(([key, value]) => {
        element.setAttribute(key, value);
      });
    }
  });
}

/**
 * Batch multiple element updates
 */
export function updateElements(
  updates: Array<{
    element: HTMLElement;
    changes: Parameters<typeof updateElement>[1];
  }>
): Promise<void> {
  return mutateDOM(() => {
    updates.forEach(({ element, changes }) => {
      if (changes.text !== undefined) {
        element.textContent = changes.text;
      }
      if (changes.html !== undefined) {
        element.innerHTML = changes.html;
      }
      if (changes.className !== undefined) {
        element.className = changes.className;
      }
      if (changes.style) {
        Object.assign(element.style, changes.style);
      }
      if (changes.attributes) {
        Object.entries(changes.attributes).forEach(([key, value]) => {
          element.setAttribute(key, value);
        });
      }
    });
  });
}
