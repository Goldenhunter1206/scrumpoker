// UI utility functions

export function showNotification(message: string, type: 'success' | 'error' = 'success'): void {
  // Remove existing notifications
  const existing = document.querySelector('.notification');
  if (existing) existing.remove();

  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.remove();
  }, 4000);
}

export function updateConnectionStatus(connected: boolean): void {
  const status = document.getElementById('connection-status');
  if (!status) return;

  if (connected) {
    status.textContent = '🟢 Connected';
    status.className = 'connection-status connected';
  } else {
    status.textContent = '🔴 Disconnected';
    status.className = 'connection-status disconnected';
  }
}

export function disableButtons(): void {
  const startBtn = document.getElementById('start-btn') as HTMLButtonElement;
  const joinBtn = document.getElementById('join-btn') as HTMLButtonElement;
  if (startBtn) startBtn.disabled = true;
  if (joinBtn) joinBtn.disabled = true;
}

export function enableButtons(): void {
  const startBtn = document.getElementById('start-btn') as HTMLButtonElement;
  const joinBtn = document.getElementById('join-btn') as HTMLButtonElement;
  if (startBtn) startBtn.disabled = false;
  if (joinBtn) joinBtn.disabled = false;
}

export function showElement(elementId: string): void {
  const element = document.getElementById(elementId);
  if (element) {
    element.classList.remove('hidden');
  }
}

export function hideElement(elementId: string): void {
  const element = document.getElementById(elementId);
  if (element) {
    element.classList.add('hidden');
  }
}

export function setElementText(elementId: string, text: string): void {
  const element = document.getElementById(elementId);
  if (element) {
    element.textContent = text;
  }
}

export function setElementHTML(elementId: string, html: string): void {
  const element = document.getElementById(elementId);
  if (element) {
    element.innerHTML = html;
  }
}

export function getInputValue(elementId: string): string {
  const element = document.getElementById(elementId) as HTMLInputElement;
  return element ? element.value.trim() : '';
}

export function setInputValue(elementId: string, value: string): void {
  const element = document.getElementById(elementId) as HTMLInputElement;
  if (element) {
    element.value = value;
  }
}

export function setupClickToCopy(elementId: string, successMessage: string): void {
  const element = document.getElementById(elementId);
  if (!element) return;

  element.addEventListener('click', () => {
    const text = element.textContent?.trim();
    if (!text) return;

    navigator.clipboard
      .writeText(text)
      .then(() => {
        showNotification(successMessage, 'success');
      })
      .catch(() => {
        showNotification(`Failed to copy ${elementId}`, 'error');
      });
  });
}

export function adaptFacilitatorControlsForViewport(): void {
  const controls = document.getElementById('facilitator-controls');
  const toggle = document.getElementById('toggle-controls-btn');
  if (!controls || !toggle) return;

  if (window.innerWidth <= 768) {
    toggle.classList.remove('hidden');
    if (!controls.classList.contains('collapsed')) {
      controls.classList.add('collapsed');
    }
  } else {
    toggle.classList.add('hidden');
    controls.classList.remove('collapsed');
  }
}

export function toggleFacilitatorControlsVisibility(): void {
  const controls = document.getElementById('facilitator-controls');
  if (controls) {
    controls.classList.toggle('collapsed');
  }
}
