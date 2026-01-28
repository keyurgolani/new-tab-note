/**
 * Popup script for New Tab Note extension
 */

class PopupStorage {
  constructor() {
    this.dbName = 'CanvasTabDB';
    this.dbVersion = 2;
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        // Store name 'canvases' kept for backward compatibility
        if (!db.objectStoreNames.contains('canvases')) {
          const store = db.createObjectStore('canvases', { keyPath: 'id' });
          store.createIndex('name', 'name', { unique: false });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
        if (!db.objectStoreNames.contains('elements')) {
          const store = db.createObjectStore('elements', { keyPath: 'id' });
          // Index name 'canvasId' kept for backward compatibility
          store.createIndex('canvasId', 'canvasId', { unique: false });
          store.createIndex('type', 'type', { unique: false });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('media')) {
          const store = db.createObjectStore('media', { keyPath: 'id' });
          // Index name 'canvasId' kept for backward compatibility
          store.createIndex('canvasId', 'canvasId', { unique: false });
        }
      };
    });
  }

  async getAllNotes() {
    return new Promise((resolve, reject) => {
      // Store name 'canvases' kept for backward compatibility
      const tx = this.db.transaction('canvases', 'readonly');
      const store = tx.objectStore('canvases');
      const request = store.index('updatedAt').getAll();
      request.onsuccess = () => resolve(request.result.reverse());
      request.onerror = () => reject(request.error);
    });
  }

  async createNote(name) {
    const note = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    return new Promise((resolve, reject) => {
      // Store name 'canvases' kept for backward compatibility
      const tx = this.db.transaction('canvases', 'readwrite');
      const store = tx.objectStore('canvases');
      const request = store.add(note);
      request.onsuccess = () => resolve(note);
      request.onerror = () => reject(request.error);
    });
  }
}

function formatDate(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;

  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;

  return date.toLocaleDateString();
}

async function init() {
  const storage = new PopupStorage();

  try {
    await storage.init();
    const notes = await storage.getAllNotes();

    const list = document.getElementById('page-list');

    if (notes.length === 0) {
      list.innerHTML = '<div class="empty">No notes yet</div>';
    } else {
      list.innerHTML = '';
      const recentNotes = notes.slice(0, 5);

      for (const note of recentNotes) {
        const item = document.createElement('div');
        item.className = 'page-item';
        item.innerHTML = `
          <span class="name">${note.name || 'Untitled'}</span>
          <span class="date">${formatDate(note.updatedAt)}</span>
        `;
        item.addEventListener('click', () => {
          chrome.tabs.create({ url: 'newtab.html' });
        });
        list.appendChild(item);
      }
    }
  } catch (error) {
    console.error('Failed to load notes:', error);
    document.getElementById('page-list').innerHTML =
      '<div class="empty">Failed to load notes</div>';
  }

  document.getElementById('open-tab').addEventListener('click', () => {
    chrome.tabs.create({ url: 'newtab.html' });
  });

  document.getElementById('new-page').addEventListener('click', async () => {
    try {
      await storage.createNote('Untitled');
      chrome.tabs.create({ url: 'newtab.html' });
    } catch (error) {
      console.error('Failed to create note:', error);
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
