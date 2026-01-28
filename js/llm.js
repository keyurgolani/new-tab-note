/**
 * LLM Service for AI-powered features
 * Supports OpenAI, Anthropic, OpenRouter, Gemini, and Ollama providers
 * with dynamic model loading from APIs
 */

class LLMService {
  constructor() {
    this.provider = 'none';
    this.apiKey = '';
    this.model = '';
    this.ollamaUrl = 'http://localhost:11434';
    this.cachedModels = {};
    this.loadingModels = false;
  }

  async init() {
    this.provider = await Storage.getSetting('llmProvider', 'none');
    this.apiKey = await Storage.getSetting('llmApiKey', '');
    this.model = await Storage.getSetting('llmModel', '');
    this.ollamaUrl = await Storage.getSetting('ollamaUrl', 'http://localhost:11434');
  }

  isConfigured() {
    if (this.provider === 'none') return false;
    if (this.provider === 'ollama') return true; // Ollama doesn't need API key
    return !!this.apiKey;
  }

  /**
   * Make an API request via the background service worker to bypass CORS
   * Falls back to direct fetch if background worker is unavailable
   */
  async fetchViaBackground(url, options = {}) {
    // Check if chrome.runtime is available (extension context)
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      try {
        return await new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            reject(new Error('Background worker timeout'));
          }, 30000); // 30 second timeout
          
          chrome.runtime.sendMessage(
            { type: 'API_REQUEST', url, options },
            (response) => {
              clearTimeout(timeoutId);
              
              if (chrome.runtime.lastError) {
                console.warn('Background worker error:', chrome.runtime.lastError.message);
                reject(new Error(chrome.runtime.lastError.message));
                return;
              }
              if (!response) {
                reject(new Error('No response from background worker'));
                return;
              }
              if (response.error) {
                reject(new Error(response.error));
                return;
              }
              resolve(response);
            }
          );
        });
      } catch (bgError) {
        console.warn('Background fetch failed, trying direct fetch:', bgError.message);
        // Fall through to direct fetch
      }
    }

    // Fallback to direct fetch (may fail due to CORS for some endpoints)
    const response = await fetch(url, options);
    const contentType = response.headers.get('content-type') || '';
    
    let data;
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }
    
    return {
      ok: response.ok,
      status: response.status,
      data: data
    };
  }

  /**
   * Get fallback models for a provider (used when API fetch fails)
   */
  getFallbackModels(provider) {
    const models = {
      openai: [
        { id: 'gpt-4o', name: 'GPT-4o' },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
        { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
        { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
      ],
      anthropic: [
        { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
        { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
        { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
        { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' },
      ],
      gemini: [
        { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
        { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
        { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
      ],
      openrouter: [
        { id: 'openai/gpt-4o', name: 'GPT-4o' },
        { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
        { id: 'google/gemini-pro-1.5', name: 'Gemini Pro 1.5' },
        { id: 'meta-llama/llama-3.1-70b-instruct', name: 'Llama 3.1 70B' },
      ],
      ollama: [],
    };
    return models[provider] || [];
  }

  /**
   * Fetch models dynamically from provider API
   */
  async fetchModels(provider, apiKey) {
    if (!provider || provider === 'none') return [];
    
    // For Ollama, no API key needed
    if (provider === 'ollama') {
      return this.fetchOllamaModels();
    }
    
    // Other providers need API key
    if (!apiKey) return this.getFallbackModels(provider);

    try {
      switch (provider) {
        case 'openai':
          return await this.fetchOpenAIModels(apiKey);
        case 'anthropic':
          return await this.fetchAnthropicModels(apiKey);
        case 'gemini':
          return await this.fetchGeminiModels(apiKey);
        case 'openrouter':
          return await this.fetchOpenRouterModels(apiKey);
        default:
          return this.getFallbackModels(provider);
      }
    } catch (error) {
      console.warn(`Failed to fetch models for ${provider}:`, error);
      return this.getFallbackModels(provider);
    }
  }

  async fetchOpenAIModels(apiKey) {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    
    if (!response.ok) throw new Error('Failed to fetch OpenAI models');
    
    const data = await response.json();
    const chatModels = data.data
      .filter(m => m.id.includes('gpt') && !m.id.includes('instruct'))
      .sort((a, b) => b.created - a.created)
      .slice(0, 10)
      .map(m => ({ id: m.id, name: this.formatModelName(m.id) }));
    
    return chatModels.length > 0 ? chatModels : this.getFallbackModels('openai');
  }

  async fetchAnthropicModels(apiKey) {
    // Anthropic doesn't have a public models endpoint, use fallback
    return this.getFallbackModels('anthropic');
  }

  async fetchGeminiModels(apiKey) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );
    
    if (!response.ok) throw new Error('Failed to fetch Gemini models');
    
    const data = await response.json();
    const chatModels = data.models
      .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
      .map(m => ({
        id: m.name.replace('models/', ''),
        name: m.displayName || this.formatModelName(m.name),
      }));
    
    return chatModels.length > 0 ? chatModels : this.getFallbackModels('gemini');
  }

  async fetchOpenRouterModels(apiKey) {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    
    if (!response.ok) throw new Error('Failed to fetch OpenRouter models');
    
    const data = await response.json();
    const models = data.data
      .filter(m => m.context_length > 0)
      .sort((a, b) => (b.top_provider?.max_completion_tokens || 0) - (a.top_provider?.max_completion_tokens || 0))
      .slice(0, 30)
      .map(m => ({ id: m.id, name: m.name || m.id }));
    
    return models.length > 0 ? models : this.getFallbackModels('openrouter');
  }

  async fetchOllamaModels() {
    try {
      const response = await this.fetchViaBackground(`${this.ollamaUrl}/api/tags`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) {
        if (response.status === 403) {
          console.warn('Ollama CORS error: Run Ollama with OLLAMA_ORIGINS=chrome-extension://* ollama serve');
        }
        throw new Error('Failed to connect to Ollama');
      }
      
      const data = response.data;
      return data.models?.map(m => ({
        id: m.name,
        name: `${m.name} (${this.formatBytes(m.size)})`,
      })) || [];
    } catch (error) {
      console.warn('Ollama not available:', error);
      return [];
    }
  }

  formatModelName(id) {
    return id
      .replace(/^models\//, '')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  formatBytes(bytes) {
    if (!bytes) return '';
    const gb = bytes / (1024 * 1024 * 1024);
    return gb >= 1 ? `${gb.toFixed(1)}GB` : `${(bytes / (1024 * 1024)).toFixed(0)}MB`;
  }

  getDefaultModelForProvider(provider) {
    const defaults = {
      openai: 'gpt-4o-mini',
      anthropic: 'claude-3-5-sonnet-20241022',
      gemini: 'gemini-1.5-flash',
      openrouter: 'openai/gpt-4o-mini',
      ollama: 'llama3.2',
    };
    return defaults[provider] || '';
  }

  async setProvider(provider) {
    this.provider = provider;
    await Storage.setSetting('llmProvider', provider);
    
    // Clear cached models for this provider to force refresh
    delete this.cachedModels[provider];
    
    // Set default model for the provider
    const defaultModel = this.getDefaultModelForProvider(provider);
    await this.setModel(defaultModel);
  }

  async setApiKey(apiKey) {
    this.apiKey = apiKey;
    await Storage.setSetting('llmApiKey', apiKey);
    
    // Clear cached models to force refresh with new key
    delete this.cachedModels[this.provider];
  }

  async setModel(model) {
    this.model = model;
    await Storage.setSetting('llmModel', model);
  }

  async setOllamaUrl(url) {
    this.ollamaUrl = url;
    await Storage.setSetting('ollamaUrl', url);
    delete this.cachedModels['ollama'];
  }

  async chat(messages) {
    if (!this.isConfigured()) {
      throw new Error('LLM not configured. Please set up API key in settings.');
    }

    switch (this.provider) {
      case 'openai':
        return this.chatOpenAI(messages);
      case 'anthropic':
        return this.chatAnthropic(messages);
      case 'gemini':
        return this.chatGemini(messages);
      case 'openrouter':
        return this.chatOpenRouter(messages);
      case 'ollama':
        return this.chatOllama(messages);
      default:
        throw new Error('Unknown provider');
    }
  }

  async chatOpenAI(messages) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model || 'gpt-4o-mini',
        messages: messages,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'OpenAI API error');
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  async chatAnthropic(messages) {
    const systemMessage = messages.find(m => m.role === 'system')?.content || '';
    const userMessages = messages.filter(m => m.role !== 'system');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: this.model || 'claude-3-5-sonnet-20241022',
        max_tokens: 2000,
        system: systemMessage,
        messages: userMessages.map(m => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Anthropic API error');
    }

    const data = await response.json();
    return data.content[0].text;
  }

  async chatGemini(messages) {
    const systemMessage = messages.find(m => m.role === 'system')?.content || '';
    const userMessages = messages.filter(m => m.role !== 'system');
    
    // Convert to Gemini format
    const contents = userMessages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const model = this.model || 'gemini-1.5-flash';
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          systemInstruction: systemMessage ? { parts: [{ text: systemMessage }] } : undefined,
          generationConfig: { maxOutputTokens: 2000 },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Gemini API error');
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
  }

  async chatOpenRouter(messages) {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'chrome-extension://new-tab-note',
        'X-Title': 'New Tab Note',
      },
      body: JSON.stringify({
        model: this.model || 'openai/gpt-4o-mini',
        messages: messages,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'OpenRouter API error');
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  async chatOllama(messages) {
    const requestBody = {
      model: this.model || 'llama3.2',
      messages: messages,
      stream: false,
    };
    
    const response = await this.fetchViaBackground(`${this.ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      // Check for CORS/403 error and provide helpful message
      if (response.status === 403) {
        throw new Error(
          'Ollama blocked the request (403 Forbidden). ' +
          'To fix this, restart Ollama with: OLLAMA_ORIGINS=chrome-extension://* ollama serve'
        );
      }
      const errorMessage = response.data?.error || response.error || `Ollama API error (status: ${response.status})`;
      throw new Error(errorMessage);
    }

    return response.data.message.content;
  }

  async summarize(content) {
    const messages = [
      {
        role: 'system',
        content: 'You are a helpful assistant that summarizes notes concisely. Provide a clear, well-structured summary.',
      },
      {
        role: 'user',
        content: `Please summarize the following note:\n\n${content}`,
      },
    ];
    return this.chat(messages);
  }

  async expand(content) {
    const messages = [
      {
        role: 'system',
        content: 'You are a helpful assistant that expands on notes with additional details, examples, and explanations.',
      },
      {
        role: 'user',
        content: `Please expand on the following note with more details:\n\n${content}`,
      },
    ];
    return this.chat(messages);
  }

  async ask(content, question) {
    const messages = [
      {
        role: 'system',
        content: 'You are a helpful assistant that answers questions about notes. Use the note content as context to provide accurate answers.',
      },
      {
        role: 'user',
        content: `Note content:\n${content}\n\nQuestion: ${question}`,
      },
    ];
    return this.chat(messages);
  }

  /**
   * Generate a title for a note based on its content
   * Returns a concise, descriptive title (max 50 chars)
   */
  async generateTitle(content) {
    if (!content || content.trim().length < 10) {
      return null; // Not enough content to generate a meaningful title
    }

    const messages = [
      {
        role: 'system',
        content: `You are a title generator. Generate a concise, descriptive title for the given note content.
Rules:
- Maximum 50 characters
- No quotes or special formatting
- Capture the main topic or theme
- Be specific but brief
- Return ONLY the title, nothing else`,
      },
      {
        role: 'user',
        content: `Generate a title for this note:\n\n${content.substring(0, 2000)}`, // Limit content to avoid token limits
      },
    ];

    try {
      const title = await this.chat(messages);
      // Clean up the response - remove quotes, trim, limit length
      return title
        .replace(/^["']|["']$/g, '')
        .replace(/^Title:\s*/i, '')
        .trim()
        .substring(0, 50);
    } catch (error) {
      console.error('Failed to generate title:', error);
      return null;
    }
  }
}

// Create global instance
window.LLM = new LLMService();
