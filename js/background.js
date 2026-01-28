/**
 * Background service worker for New Tab Note
 * Handles API requests via offscreen document to bypass CORS restrictions
 */

let creatingOffscreen;

async function ensureOffscreenDocument() {
  const offscreenUrl = 'offscreen.html';
  
  // Check if offscreen document already exists
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(offscreenUrl)]
  });

  if (existingContexts.length > 0) {
    return;
  }

  // Create offscreen document if it doesn't exist
  if (creatingOffscreen) {
    await creatingOffscreen;
  } else {
    creatingOffscreen = chrome.offscreen.createDocument({
      url: offscreenUrl,
      reasons: ['DOM_SCRAPING'],
      justification: 'Making API requests to bypass CORS for Ollama and other LLM providers'
    });
    await creatingOffscreen;
    creatingOffscreen = null;
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'PING') {
    sendResponse({ status: 'ok' });
    return true;
  }
  
  if (request.type === 'API_REQUEST') {
    console.log('Background: Received API_REQUEST for', request.url);
    handleApiRequest(request)
      .then(response => {
        console.log('Background: API response status:', response.status, 'ok:', response.ok);
        sendResponse(response);
      })
      .catch(error => {
        console.error('Background: API error:', error.message);
        sendResponse({ error: error.message });
      });
    return true;
  }
});

async function handleApiRequest(request) {
  const { url, options } = request;
  
  console.log('Background: Making fetch to', url);
  
  // For localhost requests, try to use the offscreen document
  if (url.includes('localhost') || url.includes('127.0.0.1')) {
    try {
      await ensureOffscreenDocument();
      // Forward the request to the offscreen document
      const response = await chrome.runtime.sendMessage({
        type: 'OFFSCREEN_API_REQUEST',
        url,
        options
      });
      if (response && !response.error) {
        return response;
      }
    } catch (e) {
      console.log('Background: Offscreen failed, trying direct fetch:', e.message);
    }
  }
  
  try {
    const fetchOptions = {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    };
    
    if (options.body) {
      fetchOptions.body = options.body;
    }
    
    const response = await fetch(url, fetchOptions);
    console.log('Background: Fetch response status:', response.status);
    
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
  } catch (error) {
    console.error('Background: Fetch error:', error.message);
    return {
      ok: false,
      status: 0,
      error: error.message
    };
  }
}
