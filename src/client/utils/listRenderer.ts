/**
 * Incremental List Renderer for optimizing large list updates
 * Implements virtual scrolling and incremental updates to improve performance
 */

interface ListItem {
  id: string;
  data: any;
  element?: HTMLElement;
}

interface RenderOptions<T> {
  container: HTMLElement;
  items: T[];
  getItemId: (item: T) => string;
  renderItem: (item: T, element?: HTMLElement) => HTMLElement;
  onItemClick?: (item: T, element: HTMLElement) => void;
  className?: string;
  containerHeight?: number;
  itemHeight?: number;
  overscan?: number; // Number of items to render outside visible area
}

export class IncrementalListRenderer<T> {
  private container: HTMLElement;
  private items: ListItem[] = [];
  private renderItem: (item: T, element?: HTMLElement) => HTMLElement;
  private getItemId: (item: T) => string;
  private onItemClick?: (item: T, element: HTMLElement) => void;
  private className: string;
  private itemHeight: number;
  private containerHeight: number;
  private overscan: number;
  private scrollTop = 0;
  private isVirtualScrolling = false;

  constructor(options: RenderOptions<T>) {
    this.container = options.container;
    this.renderItem = options.renderItem;
    this.getItemId = options.getItemId;
    this.onItemClick = options.onItemClick;
    this.className = options.className || '';
    this.itemHeight = options.itemHeight || 50;
    this.containerHeight = options.containerHeight || this.container.clientHeight;
    this.overscan = options.overscan || 5;

    // Enable virtual scrolling for large lists
    this.isVirtualScrolling = this.itemHeight > 0 && this.containerHeight > 0;

    if (this.isVirtualScrolling) {
      this.setupVirtualScrolling();
    }
  }

  /**
   * Update the list with new items
   */
  updateItems(newItems: T[]): void {
    const oldItemsMap = new Map(this.items.map(item => [item.id, item]));
    const newItemsMap = new Map<string, ListItem>();

    // Create new items list with reused elements where possible
    const updatedItems: ListItem[] = newItems.map(item => {
      const id = this.getItemId(item);
      const existing = oldItemsMap.get(id);

      if (existing && this.isItemEqual(existing.data, item)) {
        // Item unchanged, reuse existing element
        newItemsMap.set(id, existing);
        return existing;
      } else {
        // Item changed or new, create new list item
        const listItem: ListItem = {
          id,
          data: item,
          element: existing?.element, // Reuse element if possible
        };
        newItemsMap.set(id, listItem);
        return listItem;
      }
    });

    // Remove elements for items that no longer exist
    this.items.forEach(item => {
      if (!newItemsMap.has(item.id) && item.element && item.element.parentNode) {
        item.element.parentNode.removeChild(item.element);
      }
    });

    this.items = updatedItems;
    this.render();
  }

  /**
   * Render the visible items
   */
  private render(): void {
    if (this.isVirtualScrolling) {
      this.renderVirtual();
    } else {
      this.renderAll();
    }
  }

  /**
   * Render all items (for small lists)
   */
  private renderAll(): void {
    // Use document fragment for efficient DOM manipulation
    const fragment = document.createDocumentFragment();

    this.items.forEach(item => {
      if (!item.element) {
        item.element = this.renderItem(item.data);
        if (this.className) {
          item.element.classList.add(this.className);
        }

        if (this.onItemClick) {
          item.element.addEventListener('click', () => {
            this.onItemClick!(item.data, item.element!);
          });
        }
      } else {
        // Update existing element
        const newElement = this.renderItem(item.data, item.element);
        if (newElement !== item.element) {
          item.element = newElement;
        }
      }

      fragment.appendChild(item.element);
    });

    // Clear container and append all items at once
    this.container.innerHTML = '';
    this.container.appendChild(fragment);
  }

  /**
   * Render with virtual scrolling (for large lists)
   */
  private renderVirtual(): void {
    const visibleStart = Math.floor(this.scrollTop / this.itemHeight);
    const visibleEnd = Math.min(
      visibleStart + Math.ceil(this.containerHeight / this.itemHeight),
      this.items.length
    );

    // Add overscan
    const renderStart = Math.max(0, visibleStart - this.overscan);
    const renderEnd = Math.min(this.items.length, visibleEnd + this.overscan);

    // Set container height for scrollbar
    const totalHeight = this.items.length * this.itemHeight;
    this.container.style.height = `${totalHeight}px`;
    this.container.style.position = 'relative';

    // Create fragment for visible items
    const fragment = document.createDocumentFragment();

    for (let i = renderStart; i < renderEnd; i++) {
      const item = this.items[i];

      if (!item.element) {
        item.element = this.renderItem(item.data);
        if (this.className) {
          item.element.classList.add(this.className);
        }

        if (this.onItemClick) {
          item.element.addEventListener('click', () => {
            this.onItemClick!(item.data, item.element!);
          });
        }
      }

      // Position the element
      item.element.style.position = 'absolute';
      item.element.style.top = `${i * this.itemHeight}px`;
      item.element.style.width = '100%';
      item.element.style.height = `${this.itemHeight}px`;

      fragment.appendChild(item.element);
    }

    // Clear and update container
    this.container.innerHTML = '';
    this.container.appendChild(fragment);
  }

  /**
   * Setup virtual scrolling container
   */
  private setupVirtualScrolling(): void {
    this.container.style.overflow = 'auto';
    this.container.style.height = `${this.containerHeight}px`;

    this.container.addEventListener('scroll', () => {
      this.scrollTop = this.container.scrollTop;
      requestAnimationFrame(() => this.render());
    });
  }

  /**
   * Check if two items are equal (shallow comparison)
   */
  private isItemEqual(a: any, b: any): boolean {
    if (a === b) return true;
    if (typeof a !== 'object' || typeof b !== 'object') return false;
    if (a === null || b === null) return false;

    const keysA = Object.keys(a);
    const keysB = Object.keys(b);

    if (keysA.length !== keysB.length) return false;

    for (const key of keysA) {
      if (a[key] !== b[key]) return false;
    }

    return true;
  }

  /**
   * Scroll to a specific item
   */
  scrollToItem(itemId: string): void {
    const index = this.items.findIndex(item => item.id === itemId);
    if (index === -1) return;

    const targetScrollTop = index * this.itemHeight;
    this.container.scrollTop = targetScrollTop;
    this.scrollTop = targetScrollTop;
    this.render();
  }

  /**
   * Get the number of items
   */
  getItemCount(): number {
    return this.items.length;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.items.forEach(item => {
      if (item.element && item.element.parentNode) {
        item.element.parentNode.removeChild(item.element);
      }
    });
    this.items = [];
  }
}

/**
 * Simple incremental list updater for small lists
 */
export function updateListIncrementally<T>(
  container: HTMLElement,
  newItems: T[],
  getItemId: (item: T) => string,
  renderItem: (item: T) => HTMLElement,
  isEqual?: (a: T, b: T) => boolean
): void {
  const existingElements = Array.from(container.children) as HTMLElement[];
  const existingIds = existingElements.map(el => el.dataset.itemId || '');

  // Create maps for efficient lookup
  const existingMap = new Map<string, HTMLElement>();
  existingElements.forEach((el, index) => {
    const id = existingIds[index];
    if (id) existingMap.set(id, el);
  });

  const fragment = document.createDocumentFragment();
  const usedElements = new Set<HTMLElement>();

  newItems.forEach(item => {
    const id = getItemId(item);
    const existingElement = existingMap.get(id);

    if (existingElement && (!isEqual || isEqual(item, (existingElement as any)._itemData))) {
      // Reuse existing element
      fragment.appendChild(existingElement);
      usedElements.add(existingElement);
    } else {
      // Create new element
      const newElement = renderItem(item);
      newElement.dataset.itemId = id;
      (newElement as any)._itemData = item;
      fragment.appendChild(newElement);
      usedElements.add(newElement);
    }
  });

  // Remove unused elements
  existingElements.forEach(el => {
    if (!usedElements.has(el) && el.parentNode) {
      el.parentNode.removeChild(el);
    }
  });

  // Replace container contents
  container.innerHTML = '';
  container.appendChild(fragment);
}
