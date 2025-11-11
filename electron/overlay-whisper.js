// InterviewBuddy - Whisper API Version with Multi-Provider Support

// State
let isRecording = false;
let socket = null;
let mediaRecorder = null;
let audioChunks = [];

// AI Provider and Model state
let currentProvider = localStorage.getItem('ai_provider') || 'groq';
let currentModel = localStorage.getItem('ai_model') || 'llama-3.3-70b-versatile';

// Persona state
let currentPersona = localStorage.getItem('ai_persona') || null;
let currentPersonaName = localStorage.getItem('ai_persona_name') || 'General';

// Model definitions
const MODELS = {
  groq: [
    {
      id: 'llama-3.3-70b-versatile',
      name: 'Llama 3.3 70B (Best)',
      description: 'Technical, System Design, Behavioral'
    },
    {
      id: 'mixtral-8x7b-32768',
      name: 'Mixtral 8x7B (Long Context)',
      description: 'Complex scenarios, 32k tokens'
    },
    {
      id: 'llama-3.1-8b-instant',
      name: 'Llama 3.1 8B (Fast)',
      description: 'Quick responses, simple questions'
    }
  ],
  gemini: [
    {
      id: 'gemini-2.0-flash-exp',
      name: 'Gemini 2.0 Flash',
      description: 'Advanced reasoning, multimodal'
    }
  ]
};

// UI Elements
const statusText = document.getElementById('status-text');
const statusHint = document.getElementById('status-hint');
const recordBtn = document.getElementById('record-btn');
const minimizeBtn = document.getElementById('minimize-btn');
const closeBtn = document.getElementById('close-btn');
const errorCard = document.getElementById('error-card');
const errorText = document.getElementById('error-text');
const transcriptCard = document.getElementById('transcript-card');
const transcriptText = document.getElementById('transcript-text');
const answerCard = document.getElementById('answer-card');
const answerText = document.getElementById('answer-text');
const copyBtn = document.getElementById('copy-btn');
const continueBtn = document.getElementById('continue-btn');

// Navigation
const navHome = document.getElementById('nav-home');
const navHistory = document.getElementById('nav-history');
const content = document.getElementById('content');
const historyView = document.getElementById('history-view');
const historyList = document.getElementById('history-list');
const clearHistoryBtn = document.getElementById('clear-history-btn');

// Persona elements
const personaBtn = document.getElementById('persona-btn');
const personaLabel = document.getElementById('persona-label');
const personaModal = document.getElementById('persona-modal');
const personaClose = document.getElementById('persona-close');
const personaTemplates = document.getElementById('persona-templates');
const personaCustomInput = document.getElementById('persona-custom-input');
const personaSaveBtn = document.getElementById('persona-save-btn');
const personaCancelBtn = document.getElementById('persona-cancel-btn');

// Current view state
let currentView = 'home';

// Predefined persona templates
const PERSONA_TEMPLATES = [
  {
    id: 'general',
    name: 'General Professional',
    icon: '👔',
    description: 'Default - Experienced professional with broad knowledge',
    prompt: 'You are an experienced professional with 8+ years of industry experience. Answer interview questions confidently with specific examples.'
  },
  {
    id: 'salesperson',
    name: 'Salesperson / Business Pitch',
    icon: '💼',
    description: 'Fluent salesperson pitching products/services',
    prompt: 'You are a highly skilled salesperson with 10+ years of experience. You excel at pitching products and closing deals. When asked about your product, give a compelling pitch that highlights benefits, solves customer pain points, and demonstrates value. Speak confidently and persuasively.'
  },
  {
    id: 'technical',
    name: 'Software Engineer',
    icon: '💻',
    description: 'Senior developer with coding and system design expertise',
    prompt: 'You are a senior software engineer with 10+ years of experience in full-stack development. You have deep knowledge of algorithms, data structures, system design, and best practices. Answer technical questions with code examples and architectural insights.'
  },
  {
    id: 'product',
    name: 'Product Manager',
    icon: '📊',
    description: 'Strategic PM focused on product vision and metrics',
    prompt: 'You are a senior product manager with 8+ years of experience launching successful products. You understand user needs, business metrics, roadmap planning, and stakeholder management. Answer with strategic thinking and data-driven decisions.'
  },
  {
    id: 'startup',
    name: 'Startup Founder',
    icon: '🚀',
    description: 'Entrepreneur pitching startup ideas to investors',
    prompt: 'You are a startup founder with entrepreneurial experience. You are pitching your startup to investors and explaining your vision, market opportunity, business model, and traction. Be passionate, data-driven, and compelling.'
  },
  {
    id: 'consultant',
    name: 'Business Consultant',
    icon: '📈',
    description: 'Strategic consultant solving business problems',
    prompt: 'You are a senior business consultant with experience at top firms. You excel at strategic thinking, problem-solving, and delivering client value. Use frameworks like SWOT, Porter\'s Five Forces, and break down complex problems systematically.'
  }
];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  console.log('🎤 InterviewBuddy Multi-Provider Version loaded');
  
  initializeDropdowns();
  initializePersona();
  connectToBackend();
  setupEventListeners();
  
  console.log('✅ Initialization complete');
});

// Initialize provider and model dropdowns
function initializeDropdowns() {
  const providerSelect = document.getElementById('provider-select');
  const modelSelect = document.getElementById('model-select');
  
  // Set current provider
  providerSelect.value = currentProvider;
  
  // Populate models
  updateModelDropdown(currentProvider);
  
  // Provider change handler
  providerSelect.addEventListener('change', (e) => {
    currentProvider = e.target.value;
    localStorage.setItem('ai_provider', currentProvider);
    updateModelDropdown(currentProvider);
    
    // Notify backend
    if (socket && socket.connected) {
      socket.emit('change_provider', { provider: currentProvider });
    }
  });
  
  // Model change handler
  modelSelect.addEventListener('change', (e) => {
    currentModel = e.target.value;
    localStorage.setItem('ai_model', currentModel);
    
    // Notify backend
    if (socket && socket.connected) {
      socket.emit('change_model', { model: currentModel });
    }
  });
}

// Update model dropdown based on provider
function updateModelDropdown(provider) {
  const modelSelect = document.getElementById('model-select');
  modelSelect.innerHTML = '';
  
  const models = MODELS[provider];
  models.forEach(model => {
    const option = document.createElement('option');
    option.value = model.id;
    option.textContent = model.name;
    option.title = model.description;
    
    // Select current model or default
    if (model.id === currentModel || 
        (provider === 'groq' && model.id === 'llama-3.3-70b-versatile') ||
        (provider === 'gemini' && model.id === 'gemini-2.0-flash-exp')) {
      option.selected = true;
      currentModel = model.id;
      localStorage.setItem('ai_model', model.id);
    }
    
    modelSelect.appendChild(option);
  });
}

// Scroll to bottom of content
function scrollToBottom() {
  const content = document.getElementById('content');
  content.scrollTo({
    top: content.scrollHeight,
    behavior: 'smooth'
  });
}

// Initialize persona
function initializePersona() {
  // Update persona button label
  updatePersonaLabel();
  
  // Populate templates
  personaTemplates.innerHTML = '';
  PERSONA_TEMPLATES.forEach(template => {
    const templateEl = document.createElement('div');
    templateEl.className = 'persona-template';
    if (!currentPersona && template.id === 'general') {
      templateEl.classList.add('active');
    }
    
    templateEl.innerHTML = `
      <div class="persona-template-title">${template.icon} ${template.name}</div>
      <div class="persona-template-desc">${template.description}</div>
    `;
    
    templateEl.addEventListener('click', () => {
      // Update active state
      personaTemplates.querySelectorAll('.persona-template').forEach(t => t.classList.remove('active'));
      templateEl.classList.add('active');
      
      // Set custom input to template prompt
      personaCustomInput.value = template.prompt;
    });
    
    personaTemplates.appendChild(templateEl);
  });
  
  // Load saved custom persona if exists
  if (currentPersona) {
    personaCustomInput.value = currentPersona;
  }
}

function updatePersonaLabel() {
  if (currentPersona && currentPersonaName !== 'General') {
    personaLabel.textContent = currentPersonaName;
    personaBtn.classList.add('active');
  } else {
    personaLabel.textContent = 'Persona';
    personaBtn.classList.remove('active');
  }
}

// Connect to backend
function connectToBackend() {
  socket = io('http://localhost:3000', {
    auth: {
      token: 'desktop-app-token'
    },
    transports: ['websocket', 'polling']
  });
  
  socket.on('connect', () => {
    console.log('✅ Connected to backend');
    statusText.textContent = '✅ Connected - Ready to record!';
    statusHint.textContent = 'Using Whisper API for transcription';
  });
  
  socket.on('disconnect', () => {
    console.log('❌ Disconnected from backend');
    showError('Connection lost. Please restart the app.');
  });
  
  socket.on('transcript_final', (data) => {
    console.log('📝 Transcript received:', data);
    transcriptText.textContent = data.text;
    transcriptCard.classList.remove('hidden');
    scrollToBottom();
  });
  
  socket.on('answer_final', (data) => {
    console.log('💡 Answer received:', data);
    answerText.textContent = data.answer;
    
    // Update badge with provider info
    const badge = document.getElementById('answer-badge');
    const provider = data.provider || currentProvider;
    const model = data.model || currentModel;
    badge.className = `badge badge-${provider}`;
    badge.textContent = provider === 'groq' ? 'Groq' : 'Gemini';
    
    answerCard.classList.remove('hidden');
    statusText.textContent = '✅ Answer ready!';
    statusHint.textContent = 'Copy or continue to next question';
    scrollToBottom();
    
    // Save to history (last 10 only)
    const question = transcriptText.textContent;
    saveToHistory(question, data.answer, provider, model);
  });
  
  // Provider changed confirmation
  socket.on('provider_changed', (data) => {
    console.log('✅ Provider changed:', data);
    if (data.models) {
      // Update model dropdown with new provider's models
      const modelSelect = document.getElementById('model-select');
      modelSelect.innerHTML = '';
      data.models.forEach(model => {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = model.name;
        if (model.id === data.model) {
          option.selected = true;
        }
        modelSelect.appendChild(option);
      });
    }
  });
  
  // Model changed confirmation
  socket.on('model_changed', (data) => {
    console.log('✅ Model changed:', data);
  });
  
  socket.on('error', (data) => {
    console.error('❌ Backend error:', data);
    showError(data.error || 'Unknown error occurred');
    stopRecording();
  });
}

// Setup event listeners
function setupEventListeners() {
  recordBtn.addEventListener('click', () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  });
  
  minimizeBtn.addEventListener('click', () => {
    window.electron.minimizeWindow();
  });
  
  closeBtn.addEventListener('click', () => {
    window.electron.closeWindow();
  });
  
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(answerText.textContent);
    copyBtn.textContent = '✅ Copied!';
    setTimeout(() => {
      copyBtn.textContent = '📋 Copy';
    }, 2000);
  });
  
  continueBtn.addEventListener('click', () => {
    reset();
  });

  // Navigation
  navHome.addEventListener('click', () => {
    switchView('home');
  });

  navHistory.addEventListener('click', () => {
    switchView('history');
    loadHistory();
  });

  clearHistoryBtn.addEventListener('click', () => {
    if (confirm('Clear all conversation history?')) {
      clearHistory();
      loadHistory();
    }
  });

  // Persona modal
  personaBtn.addEventListener('click', () => {
    personaModal.classList.remove('hidden');
  });

  personaClose.addEventListener('click', () => {
    personaModal.classList.add('hidden');
  });

  personaCancelBtn.addEventListener('click', () => {
    personaModal.classList.add('hidden');
  });

  personaSaveBtn.addEventListener('click', () => {
    savePersona();
  });

  // Close modal on background click
  personaModal.addEventListener('click', (e) => {
    if (e.target === personaModal) {
      personaModal.classList.add('hidden');
    }
  });
}

// Save persona
function savePersona() {
  const customPrompt = personaCustomInput.value.trim();
  
  if (!customPrompt) {
    alert('Please select a template or enter a custom persona');
    return;
  }
  
  // Find if it matches a template
  const matchedTemplate = PERSONA_TEMPLATES.find(t => t.prompt === customPrompt);
  const personaName = matchedTemplate ? matchedTemplate.name : 'Custom';
  
  // Save to localStorage
  localStorage.setItem('ai_persona', customPrompt);
  localStorage.setItem('ai_persona_name', personaName);
  
  currentPersona = customPrompt;
  currentPersonaName = personaName;
  
  // Update UI
  updatePersonaLabel();
  personaModal.classList.add('hidden');
  
  // Notify backend
  if (socket && socket.connected) {
    socket.emit('set_persona', { persona: currentPersona });
  }
  
  console.log('✅ Persona saved:', personaName);
  
  // Show confirmation
  statusText.textContent = `✅ Persona set: ${personaName}`;
  statusHint.textContent = 'AI will now respond as this persona';
}

// Switch between views
function switchView(view) {
  currentView = view;
  
  // Update nav buttons
  navHome.classList.toggle('active', view === 'home');
  navHistory.classList.toggle('active', view === 'history');
  
  // Show/hide views
  if (view === 'home') {
    // Show home cards
    const homeCards = content.querySelectorAll('.card');
    homeCards.forEach(card => {
      if (!card.classList.contains('hidden')) {
        card.style.display = 'block';
      }
    });
    historyView.classList.add('hidden');
    recordBtn.style.display = 'flex';
  } else if (view === 'history') {
    // Hide home cards
    const homeCards = content.querySelectorAll('.card');
    homeCards.forEach(card => card.style.display = 'none');
    historyView.classList.remove('hidden');
    recordBtn.style.display = 'none';
  }
}

// History management (max 10 conversations)
function saveToHistory(question, answer, provider, model) {
  let history = JSON.parse(localStorage.getItem('conversation_history') || '[]');
  
  const conversation = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    question: question,
    answer: answer,
    provider: provider,
    model: model
  };
  
  // Add to beginning
  history.unshift(conversation);
  
  // Keep only last 10
  if (history.length > 10) {
    history = history.slice(0, 10);
  }
  
  localStorage.setItem('conversation_history', JSON.stringify(history));
}

function loadHistory() {
  const history = JSON.parse(localStorage.getItem('conversation_history') || '[]');
  
  historyList.innerHTML = '';
  
  if (history.length === 0) {
    historyList.innerHTML = `
      <div class="history-empty">
        <div class="history-empty-icon">📝</div>
        <div>No conversation history yet</div>
        <div style="margin-top: 8px; font-size: 11px;">Start practicing to see your conversations here</div>
      </div>
    `;
    return;
  }
  
  history.forEach(item => {
    const date = new Date(item.timestamp);
    const timeAgo = getTimeAgo(date);
    
    const historyItem = document.createElement('div');
    historyItem.className = 'history-item';
    historyItem.innerHTML = `
      <div class="history-timestamp">
        🕒 ${timeAgo}
        <span class="badge badge-${item.provider}" style="margin-left: auto;">${item.provider === 'groq' ? 'Groq' : 'Gemini'}</span>
      </div>
      <div class="history-question">Q: ${item.question}</div>
      <div class="history-answer">A: ${item.answer}</div>
    `;
    
    // Click to expand/view full answer
    historyItem.addEventListener('click', () => {
      showHistoryDetail(item);
    });
    
    historyList.appendChild(historyItem);
  });
}

function showHistoryDetail(item) {
  const date = new Date(item.timestamp);
  const formatted = date.toLocaleString();
  
  // Show in main content
  switchView('home');
  
  transcriptText.textContent = item.question;
  transcriptCard.classList.remove('hidden');
  
  answerText.textContent = item.answer;
  const badge = document.getElementById('answer-badge');
  badge.className = `badge badge-${item.provider}`;
  badge.textContent = item.provider === 'groq' ? 'Groq' : 'Gemini';
  answerCard.classList.remove('hidden');
  
  statusText.textContent = `📝 History from ${formatted}`;
  statusHint.textContent = `Provider: ${item.provider} | Model: ${item.model}`;
  
  scrollToBottom();
}

function clearHistory() {
  localStorage.removeItem('conversation_history');
}

function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString();
}

// Start recording
async function startRecording() {
  console.log('🎤 Starting to record with Whisper API...');
  
  try {
    // Get microphone access
    const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 16000
      } 
    });
    
    // Create MediaRecorder
    mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'audio/webm'
    });
    
    audioChunks = [];
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };
    
    mediaRecorder.onstop = async () => {
      console.log('🎤 Recording stopped, sending to Whisper...');
      
      // Create audio blob
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      
      // Convert to base64
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = () => {
        const base64Audio = reader.result.split(',')[1];
        
        console.log(`📤 Sending audio to backend (${audioBlob.size} bytes)`);
        
        // Send to backend using new 'audio_file' event
        socket.emit('audio_file', {
          audio: base64Audio,
          format: 'webm'
        });
        
        statusText.textContent = '⏳ Processing with Whisper...';
        statusHint.textContent = 'This may take 3-5 seconds';
      };
    };
    
    // Start recording
    mediaRecorder.start(100); // Collect data every 100ms
    
    isRecording = true;
    recordBtn.querySelector('.btn-text').textContent = 'Stop Recording';
    recordBtn.querySelector('.btn-icon').textContent = '⏹️';
    recordBtn.classList.add('recording');
    statusText.textContent = '🎙️ Recording...';
    statusHint.textContent = 'Speak your question clearly';
    
    console.log('✅ Recording started');
    
  } catch (error) {
    console.error('❌ Failed to start recording:', error);
    showError('Microphone access denied or not available!');
  }
}

// Stop recording
function stopRecording() {
  console.log('⏹️ Stopping recording...');
  
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(track => track.stop());
  }
  
  isRecording = false;
  recordBtn.querySelector('.btn-text').textContent = 'Start Recording';
  recordBtn.querySelector('.btn-icon').textContent = '🎤';
  recordBtn.classList.remove('recording');
  
  console.log('✅ Recording stopped');
}

// Show error
function showError(message) {
  errorText.textContent = message;
  errorCard.classList.add('active');
  setTimeout(() => {
    errorCard.classList.remove('active');
  }, 5000);
}

// Reset UI
function reset() {
  transcriptCard.classList.add('hidden');
  answerCard.classList.add('hidden');
  errorCard.classList.add('hidden');
  transcriptText.textContent = '';
  answerText.textContent = '';
  statusText.textContent = '✅ Ready for next question';
  statusHint.textContent = 'Click below to start recording';
}

console.log('🎯 Multi-Provider version loaded with Netflix/AMC+ UI!');
