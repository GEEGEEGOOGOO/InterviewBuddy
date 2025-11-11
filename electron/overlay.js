// Overlay Window Logic - Uses Web Speech API (FREE!)
// Note: socket.io-client is loaded from CDN in HTML, not require()

// State
let isListening = false;
let recognition = null;
let socket = null;
let currentTranscript = '';
let currentAnswer = null;

// UI Elements
const statusText = document.getElementById('status-text');
const statusHint = document.getElementById('status-hint');
const recordingIndicator = document.getElementById('recording-indicator');
const transcriptCard = document.getElementById('transcript-card');
const transcriptText = document.getElementById('transcript-text');
const answerCard = document.getElementById('answer-card');
const answerText = document.getElementById('answer-text');
const keyPointsList = document.getElementById('key-points');
const errorCard = document.getElementById('error-card');
const errorText = document.getElementById('error-text');
const mainBtn = document.getElementById('main-btn');
const minimizeBtn = document.getElementById('minimize-btn');
const closeBtn = document.getElementById('close-btn');
const copyBtn = document.getElementById('copy-btn');
const continueBtn = document.getElementById('continue-btn');

// Monitor network state changes
window.addEventListener('online', () => {
  console.log('✅ Network connected');
  showError('Network restored!');
  setTimeout(() => hideError(), 2000);
});

window.addEventListener('offline', () => {
  console.log('❌ Network disconnected');
  if (isListening) {
    stopListening();
  }
  showError('Network disconnected! Speech recognition stopped.');
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  console.log('🎤 InterviewBuddy Overlay loaded');
  console.log('🔍 Checking Socket.IO:', typeof io);
  console.log('🔍 Checking SpeechRecognition:', typeof (window.SpeechRecognition || window.webkitSpeechRecognition));
  console.log('🌐 Network status:', navigator.onLine ? 'Online' : 'Offline');
  
  initializeSpeechRecognition();
  connectToBackend();
  setupEventListeners();
  
  console.log('✅ Initialization complete');
});

// Initialize Web Speech API (FREE!)
function initializeSpeechRecognition() {
  console.log('🔧 Initializing speech recognition...');
  
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  
  if (!SpeechRecognition) {
    console.error('❌ SpeechRecognition not available!');
    showError('Speech recognition not supported in this browser. Electron should support this!');
    return;
  }
  
  console.log('✅ SpeechRecognition API found');
  recognition = new SpeechRecognition();
  console.log('✅ Recognition object created:', recognition);
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';
  
  recognition.onstart = () => {
    console.log('🎤 Speech recognition started');
    isListening = true;
    updateUI('listening');
  };
  
  recognition.onresult = (event) => {
    let interimTranscript = '';
    let finalTranscript = '';
    
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      
      if (event.results[i].isFinal) {
        finalTranscript += transcript + ' ';
      } else {
        interimTranscript += transcript;
      }
    }
    
    // Show interim results
    if (interimTranscript) {
      transcriptText.textContent = (currentTranscript + ' ' + interimTranscript).trim();
      transcriptCard.classList.add('active');
    }
    
    // Handle final transcript
    if (finalTranscript.trim()) {
      currentTranscript += finalTranscript;
      transcriptText.textContent = currentTranscript.trim();
      
      console.log('📝 Final transcript:', currentTranscript);
      
      // Check if it's a question (has ? or >= 5 words)
      const wordCount = currentTranscript.trim().split(' ').length;
      if (currentTranscript.includes('?') || wordCount >= 5) {
        updateUI('generating');
        sendQuestionToBackend(currentTranscript.trim());
        currentTranscript = ''; // Reset for next question
      }
    }
  };
  
  recognition.onerror = (event) => {
    console.error('❌ Speech recognition error:', event.error);
    
    switch(event.error) {
      case 'network':
        console.log('🔄 Network error - retrying in 2 seconds...');
        showError('Network error - retrying...');
        setTimeout(() => {
          if (isListening) {
            console.log('🔁 Attempting to restart recognition...');
            try {
              recognition.start();
            } catch (e) {
              console.error('Failed to restart:', e);
            }
          }
        }, 2000);
        break;
      case 'not-allowed':
        isListening = false;
        updateUI('idle');
        showError('Microphone denied! Check Windows Settings → Privacy → Microphone');
        break;
      case 'no-speech':
        console.log('⚠️ No speech detected, continuing to listen...');
        if (isListening) {
          try {
            recognition.start();
          } catch (e) {
            console.error('Failed to restart after no-speech:', e);
          }
        }
        break;
      case 'audio-capture':
        isListening = false;
        updateUI('idle');
        showError('No microphone found! Check your audio devices.');
        break;
      default:
        isListening = false;
        updateUI('idle');
        showError(`Speech recognition error: ${event.error}`);
    }
  };
  
  recognition.onend = () => {
    console.log('🔌 Speech recognition ended');
    if (isListening) {
      // Restart if we're supposed to be listening
      recognition.start();
    }
  };
  
  console.log('✅ Web Speech API initialized (FREE!)');
}

// Connect to backend
function connectToBackend() {
  socket = io('http://localhost:3000', {
    auth: {
      token: 'desktop-app-token'
    }
  });
  
  socket.on('connect', () => {
    console.log('✅ Connected to backend');
  });
  
  socket.on('suggestion', (data) => {
    console.log('💡 Answer received:', data);
    currentAnswer = data;
    displayAnswer(data);
  });
  
  socket.on('error', (data) => {
    console.error('❌ Backend error:', data);
    showError(data.message || 'Unknown error');
  });
  
  socket.on('disconnect', () => {
    console.log('🔌 Disconnected from backend');
  });
}

// Send question to backend
function sendQuestionToBackend(question) {
  if (!socket || !socket.connected) {
    showError('Not connected to backend');
    return;
  }
  
  socket.emit('interviewer_question', {
    question: question,
    roleType: 'frontend-developer',
    sessionId: Date.now().toString()
  });
}

// Setup event listeners
function setupEventListeners() {
  mainBtn.addEventListener('click', () => {
    console.log('🖱️ Button clicked! isListening:', isListening);
    try {
      if (isListening) {
        stopListening();
      } else {
        startListening();
      }
    } catch (error) {
      console.error('❌ Button click error:', error);
      showError('Button error: ' + error.message);
    }
  });
  
  minimizeBtn.addEventListener('click', () => {
    window.electron.minimizeWindow();
  });
  
  closeBtn.addEventListener('click', () => {
    window.electron.closeWindow();
  });
  
  copyBtn.addEventListener('click', () => {
    const text = answerText.textContent;
    navigator.clipboard.writeText(text).then(() => {
      copyBtn.textContent = '✓ Copied!';
      setTimeout(() => {
        copyBtn.textContent = '📋 Copy';
      }, 2000);
    });
  });
  
  continueBtn.addEventListener('click', () => {
    answerCard.classList.remove('active');
    transcriptCard.classList.remove('active');
    currentTranscript = '';
    startListening();
  });
}

// Check network connectivity
async function checkNetworkConnectivity() {
  try {
    console.log('🌐 Checking network connectivity...');
    const response = await fetch('https://www.google.com', { 
      method: 'HEAD',
      mode: 'no-cors'
    });
    console.log('✅ Network is online');
    return true;
  } catch (error) {
    console.error('❌ No network connectivity:', error);
    return false;
  }
}

// Start listening
async function startListening() {
  console.log('🎤 startListening() called');
  console.log('🔍 recognition object:', recognition);
  
  if (!recognition) {
    console.error('❌ Speech recognition not initialized!');
    showError('Speech recognition not initialized. Browser may not support it.');
    return;
  }
  
  // Check network connectivity first
  const isOnline = await checkNetworkConnectivity();
  if (!isOnline) {
    console.error('❌ No internet connection');
    showError('Speech recognition requires internet connection! Check your network.');
    return;
  }
  
  try {
    console.log('▶️ Calling recognition.start()...');
    recognition.start();
    console.log('✅ recognition.start() called successfully');
  } catch (error) {
    console.error('❌ Failed to start recognition:', error);
    showError('Speech error: ' + error.message);
  }
}

// Stop listening
function stopListening() {
  if (recognition) {
    recognition.stop();
  }
  isListening = false;
  updateUI('idle');
}

// Update UI state
function updateUI(state) {
  switch (state) {
    case 'idle':
      statusText.textContent = 'Ready to Listen';
      statusHint.textContent = 'Click below to start';
      recordingIndicator.classList.remove('active');
      mainBtn.textContent = '🎤 Start Listening';
      mainBtn.className = 'btn-primary';
      break;
      
    case 'listening':
      statusText.textContent = 'Listening...';
      statusHint.textContent = 'Speak your question';
      recordingIndicator.classList.add('active');
      mainBtn.textContent = '⏸ Stop Listening';
      mainBtn.className = 'btn-primary btn-stop';
      break;
      
    case 'generating':
      statusText.textContent = 'Generating Answer...';
      statusHint.textContent = 'AI is thinking...';
      recordingIndicator.classList.remove('active');
      break;
  }
}

// Display answer
function displayAnswer(data) {
  statusText.textContent = 'Answer Ready!';
  statusHint.textContent = '';
  
  answerText.textContent = data.suggestion || data.answer;
  
  // Show key points
  keyPointsList.innerHTML = '';
  if (data.keyPoints && data.keyPoints.length > 0) {
    data.keyPoints.forEach(point => {
      const li = document.createElement('li');
      li.textContent = '• ' + point;
      keyPointsList.appendChild(li);
    });
  }
  
  answerCard.classList.add('active');
  updateUI('idle');
}

// Show error
function showError(message) {
  errorText.textContent = message;
  errorCard.classList.add('active');
}

// Hide error
function hideError() {
  errorCard.classList.remove('active');
  
  setTimeout(() => {
    errorCard.classList.remove('active');
  }, 5000);
}

console.log('✅ Overlay script initialized');
