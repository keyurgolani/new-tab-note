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
        if (!db.objectStoreNames.contains('canvases')) {
          const store = db.createObjectStore('canvases', { keyPath: 'id' });
          store.createIndex('name', 'name', { unique: false });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
        if (!db.objectStoreNames.contains('elements')) {
          const store = db.createObjectStore('elements', { keyPath: 'id' });
          store.createIndex('canvasId', 'canvasId', { unique: false });
          store.createIndex('type', 'type', { unique: false });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('media')) {
          const store = db.createObjectStore('media', { keyPath: 'id' });
          store.createIndex('canvasId', 'canvasId', { unique: false });
        }
      };
    });
  }

  async getAllNotes() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('canvases', 'readonly');
      const store = tx.objectStore('canvases');
      const request = store.index('updatedAt').getAll();
      request.onsuccess = () => {
        const activeNotes = request.result.filter(note => !note.archivedAt && !note.trashedAt);
        resolve(activeNotes.reverse());
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getNotesWithInsights() {
    const notes = await this.getAllNotes();
    return notes.filter(note => note.insights && (
      (note.insights.todos && note.insights.todos.length > 0) ||
      (note.insights.reminders && note.insights.reminders.length > 0) ||
      (note.insights.deadlines && note.insights.deadlines.length > 0)
    ));
  }

  async getSetting(key, defaultValue = null) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('settings', 'readonly');
      const store = tx.objectStore('settings');
      const request = store.get(key);
      request.onsuccess = () => {
        resolve(request.result?.value ?? defaultValue);
      };
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

function formatDeadlineDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}


function generateDailySummary(notesWithInsights) {
  if (!notesWithInsights || notesWithInsights.length === 0) {
    return null;
  }

  const today = new Date().toISOString().split('T')[0];
  const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

  const allTodos = [];
  const allReminders = [];
  const todayDeadlines = [];
  const upcomingDeadlines = [];

  for (const note of notesWithInsights) {
    if (!note.insights) continue;

    const prefix = note.name ? `[${note.name}] ` : '';

    if (note.insights.todos) {
      allTodos.push(...note.insights.todos.map(t => prefix + t));
    }
    if (note.insights.reminders) {
      allReminders.push(...note.insights.reminders.map(r => prefix + r));
    }
    if (note.insights.deadlines) {
      for (const d of note.insights.deadlines) {
        const deadline = {
          text: prefix + (typeof d === 'object' ? d.text : d),
          date: typeof d === 'object' ? d.date : null,
          noteId: note.id
        };

        if (deadline.date === today) {
          todayDeadlines.push(deadline);
        } else if (deadline.date && deadline.date > today && deadline.date <= nextWeek) {
          upcomingDeadlines.push(deadline);
        } else if (!deadline.date) {
          upcomingDeadlines.push(deadline);
        }
      }
    }
  }

  upcomingDeadlines.sort((a, b) => {
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date.localeCompare(b.date);
  });

  return {
    todayDeadlines: todayDeadlines.slice(0, 5),
    upcomingDeadlines: upcomingDeadlines.slice(0, 5),
    todos: allTodos.slice(0, 5),
    reminders: allReminders.slice(0, 5)
  };
}


function renderDailySummary(summary) {
  const container = document.getElementById('daily-summary');
  const content = document.getElementById('summary-content');

  if (!summary || (
    summary.todayDeadlines.length === 0 &&
    summary.upcomingDeadlines.length === 0 &&
    summary.todos.length === 0 &&
    summary.reminders.length === 0
  )) {
    container.classList.add('hidden');
    return;
  }

  container.classList.remove('hidden');
  content.innerHTML = '';

  const today = new Date().toISOString().split('T')[0];
  const threeDaysFromNow = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];

  if (summary.todayDeadlines.length > 0) {
    const section = document.createElement('div');
    section.className = 'summary-section';
    section.innerHTML = '<div class="summary-section-title">⚠️ Due Today</div>';
    
    const list = document.createElement('ul');
    list.className = 'summary-list deadlines';
    
    for (const deadline of summary.todayDeadlines) {
      const li = document.createElement('li');
      li.className = 'today';
      li.innerHTML = escapeHtml(deadline.text) + '<span class="deadline-date today">Today</span>';
      list.appendChild(li);
    }
    
    section.appendChild(list);
    content.appendChild(section);
  }

  if (summary.upcomingDeadlines.length > 0) {
    const section = document.createElement('div');
    section.className = 'summary-section';
    section.innerHTML = '<div class="summary-section-title">📅 Upcoming</div>';
    
    const list = document.createElement('ul');
    list.className = 'summary-list deadlines';
    
    for (const deadline of summary.upcomingDeadlines) {
      const li = document.createElement('li');
      let dateHtml = '';
      if (deadline.date) {
        const isSoon = deadline.date <= threeDaysFromNow;
        const soonClass = isSoon ? ' soon' : '';
        dateHtml = '<span class="deadline-date' + soonClass + '">' + formatDeadlineDate(deadline.date) + '</span>';
      }
      li.innerHTML = escapeHtml(deadline.text) + dateHtml;
      list.appendChild(li);
    }
    
    section.appendChild(list);
    content.appendChild(section);
  }

  if (summary.todos.length > 0) {
    const section = document.createElement('div');
    section.className = 'summary-section';
    section.innerHTML = '<div class="summary-section-title">✓ Action Items</div>';
    
    const list = document.createElement('ul');
    list.className = 'summary-list todos';
    
    for (const todo of summary.todos) {
      const li = document.createElement('li');
      li.textContent = todo;
      list.appendChild(li);
    }
    
    section.appendChild(list);
    content.appendChild(section);
  }

  if (summary.reminders.length > 0) {
    const section = document.createElement('div');
    section.className = 'summary-section';
    section.innerHTML = '<div class="summary-section-title">💡 Reminders</div>';
    
    const list = document.createElement('ul');
    list.className = 'summary-list reminders';
    
    for (const reminder of summary.reminders) {
      const li = document.createElement('li');
      li.textContent = reminder;
      list.appendChild(li);
    }
    
    section.appendChild(list);
    content.appendChild(section);
  }
}


async function init() {
  const storage = new PopupStorage();

  try {
    await storage.init();

    const insightsEnabled = await storage.getSetting('insightsEnabled', false);
    if (insightsEnabled) {
      const notesWithInsights = await storage.getNotesWithInsights();
      const summary = generateDailySummary(notesWithInsights);
      renderDailySummary(summary);
    }

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
        item.innerHTML = '<span class="name">' + escapeHtml(note.name || 'Untitled') + '</span>' +
          '<span class="date">' + formatDate(note.updatedAt) + '</span>';
        item.addEventListener('click', () => {
          chrome.tabs.create({ url: 'newtab.html' });
        });
        list.appendChild(item);
      }
    }
  } catch (error) {
    console.error('Failed to load notes:', error);
    document.getElementById('page-list').innerHTML = '<div class="empty">Failed to load notes</div>';
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
