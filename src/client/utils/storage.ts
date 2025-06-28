import { SavedSessionInfo, SavedJiraCredentials } from '@shared/types/index.js';

// User name storage
export function saveUserName(name: string): void {
  try {
    localStorage.setItem('userName', name);
  } catch (e) {
    console.error('Failed to save user name', e);
  }
}

export function loadUserName(): string {
  try {
    return localStorage.getItem('userName') || '';
  } catch (e) {
    return '';
  }
}

// Active session storage
export function saveActiveSession(sessionInfo: SavedSessionInfo): void {
  try {
    localStorage.setItem('activeSession', JSON.stringify(sessionInfo));
  } catch (e) {
    console.error('Failed to save active session', e);
  }
}

export function loadActiveSessionInfo(): SavedSessionInfo | null {
  try {
    const raw = localStorage.getItem('activeSession');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

export function clearActiveSession(): void {
  try {
    localStorage.removeItem('activeSession');
  } catch (e) {
    // Ignore errors
  }
}

// Jira credentials storage (encrypted)
export function saveJiraCredentials(credentials: SavedJiraCredentials): void {
  try {
    const encryptedToken = (window as any).CryptoJS.AES.encrypt(credentials.token, credentials.email).toString();
    const dataToSave = {
      ...credentials,
      token: encryptedToken
    };
    localStorage.setItem('jiraCredentials', JSON.stringify(dataToSave));
  } catch (e) {
    console.error('Failed to save Jira credentials', e);
  }
}

export function loadJiraCredentials(): SavedJiraCredentials | null {
  try {
    const raw = localStorage.getItem('jiraCredentials');
    if (!raw) return null;
    const data = JSON.parse(raw);
    const decryptedToken = (window as any).CryptoJS.AES.decrypt(data.token, data.email).toString((window as any).CryptoJS.enc.Utf8);
    return {
      ...data,
      token: decryptedToken
    };
  } catch (e) {
    console.error('Failed to load Jira credentials', e);
    return null;
  }
}

export function clearJiraCredentials(): void {
  try {
    localStorage.removeItem('jiraCredentials');
  } catch (e) {
    // Ignore errors
  }
}

// Sound settings
export function loadSoundSetting(): boolean {
  try {
    const val = localStorage.getItem('soundEnabled');
    return val === null ? true : val === 'true';
  } catch (e) {
    return true;
  }
}

export function saveSoundSetting(enabled: boolean): void {
  try {
    localStorage.setItem('soundEnabled', enabled ? 'true' : 'false');
  } catch (e) {
    // Ignore errors
  }
}