import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { authenticate } from '../middleware/auth.js';
import { generateRealtimeSuggestion, generateStreamingSuggestion } from './realtimeService.js';
import { getLongTermMemory } from './contextMemory.js';
import { generateInterviewResponse as generateAIResponse, getAvailableModels, getAllModels, validateProvider } from './aiService.js';
import OpenAI from 'openai';
import Groq from 'groq-sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Initialize WebSocket server for real-time interview assistance
 * @param {http.Server} httpServer - HTTP server instance
 * @returns {Server} Socket.IO server instance
 */
export const initializeWebSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: [process.env.CLIENT_URL || 'http://localhost:5173', 'http://127.0.0.1:5173'],
      credentials: true,
      methods: ['GET', 'POST']
    },
    transports: ['websocket', 'polling']
  });

  // Socket authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      return next(new Error('Authentication error: No token provided'));
    }

    // Allow simple tokens for desktop app and testing
    const allowedTokens = [
      'test-token-for-development',
      'desktop-app-token',
      'extension-user-token'
    ];
    
    if (allowedTokens.includes(token)) {
      socket.userId = 'desktop-user';
      socket.userEmail = 'desktop@app.local';
      console.log('✅ Desktop app authenticated');
      return next();
    }

    // Verify JWT token for regular users
    try {
      const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.userId = decoded.id;
      socket.userEmail = decoded.email;
      next();
    } catch (error) {
      console.error('WebSocket auth error:', error.message);
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`✅ Real-time client connected: ${socket.userEmail} (${socket.id})`);

    // Store conversation history per socket
    const conversationHistory = [];
    let currentRoleType = 'general';
    let userContext = null;
    let deepgramConnection = null;
    let currentTranscript = '';
    let isProcessingQuestion = false;
    let audioBuffer = [];
    let whisperInterval = null;
    let isInitializingSTT = false;
    let isSTTReady = false;
    
    // AI Provider and Model settings (can be changed per socket)
    let currentProvider = process.env.AI_PROVIDER || 'groq';
    let currentModel = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
    let customPersona = null; // Custom system prompt/persona

    // Handle authentication
    socket.on('authenticate', async (data) => {
      try {
        const { token } = data;
        const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
        const decoded = jwt.verify(token, JWT_SECRET);
        socket.userId = decoded.id;
        socket.userEmail = decoded.email;
        socket.emit('authenticated', { success: true });
        console.log(`✅ Client authenticated: ${socket.userEmail}`);
      } catch (error) {
        socket.emit('error', { type: 'auth_error', message: 'Authentication failed' });
      }
    });

    // Handle provider change
    socket.on('change_provider', async (data) => {
      try {
        const { provider } = data;
        console.log(`🔄 Changing provider to: ${provider}`);
        
        if (provider !== 'groq' && provider !== 'gemini') {
          throw new Error('Invalid provider. Must be "groq" or "gemini"');
        }
        
        currentProvider = provider;
        
        // Update default model for the provider
        if (provider === 'groq') {
          currentModel = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
        } else if (provider === 'gemini') {
          currentModel = process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp';
        }
        
        const models = getAvailableModels(provider);
        
        socket.emit('provider_changed', {
          success: true,
          provider: currentProvider,
          model: currentModel,
          models: models
        });
        
        console.log(`✅ Provider changed to ${provider}, model: ${currentModel}`);
        
      } catch (error) {
        console.error('❌ Error changing provider:', error.message);
        socket.emit('error', {
          type: 'provider_error',
          message: error.message
        });
      }
    });

    // Handle model change
    socket.on('change_model', (data) => {
      try {
        const { model } = data;
        console.log(`🔄 Changing model to: ${model}`);
        
        currentModel = model;
        
        socket.emit('model_changed', {
          success: true,
          model: currentModel,
          provider: currentProvider
        });
        
        console.log(`✅ Model changed to ${model}`);
        
      } catch (error) {
        console.error('❌ Error changing model:', error.message);
        socket.emit('error', {
          type: 'model_error',
          message: error.message
        });
      }
    });

    // Handle get models request
    socket.on('get_models', () => {
      try {
        const allModels = getAllModels();
        
        socket.emit('models_list', {
          success: true,
          currentProvider: currentProvider,
          currentModel: currentModel,
          models: allModels
        });
        
        console.log(`📋 Sent models list to client`);
        
      } catch (error) {
        console.error('❌ Error getting models:', error.message);
        socket.emit('error', {
          type: 'models_error',
          message: error.message
        });
      }
    });

    // Handle validate provider request
    socket.on('validate_provider', async (data) => {
      try {
        const { provider, apiKey } = data;
        console.log(`🔍 Validating provider: ${provider}`);
        
        const isValid = await validateProvider(provider, apiKey);
        
        socket.emit('provider_validated', {
          success: true,
          provider: provider,
          isValid: isValid
        });
        
        console.log(`✅ Provider ${provider} validation: ${isValid ? 'VALID' : 'INVALID'}`);
        
      } catch (error) {
        console.error('❌ Error validating provider:', error.message);
        socket.emit('error', {
          type: 'validation_error',
          message: error.message
        });
      }
    });

    // Handle set persona
    socket.on('set_persona', (data) => {
      try {
        const { persona } = data;
        console.log(`🎭 Setting custom persona: ${persona ? persona.substring(0, 50) + '...' : 'none'}`);
        
        customPersona = persona;
        
        socket.emit('persona_set', {
          success: true
        });
        
        console.log(`✅ Persona set successfully`);
        
      } catch (error) {
        console.error('❌ Error setting persona:', error.message);
        socket.emit('error', {
          type: 'persona_error',
          message: error.message
        });
      }
    });

    // Handle complete audio file (from desktop app - batch mode)
    socket.on('audio_file', async (data) => {
      try {
        const { audio, format = 'webm' } = data;
        
        console.log('🎤 Complete audio file received for transcription');
        
        // Decode base64 to buffer
        const audioBuffer = Buffer.from(audio, 'base64');
        console.log(`📦 Audio buffer size: ${audioBuffer.length} bytes`);
        
        // Try Groq Whisper first (FREE and faster!)
        const GROQ_API_KEY = process.env.GROQ_API_KEY;
        const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
        
        if (!GROQ_API_KEY && !OPENAI_API_KEY) {
          console.error('❌ No GROQ_API_KEY or OPENAI_API_KEY found');
          socket.emit('error', { type: 'stt_error', message: 'STT API key not configured' });
          return;
        }
        
        // Create temp file
        const tempDir = path.join(__dirname, '../../temp');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        
        const tempFile = path.join(tempDir, `audio_${Date.now()}.${format}`);
        fs.writeFileSync(tempFile, audioBuffer);
        console.log(`💾 Saved temp audio file: ${tempFile}`);
        
        // Transcribe with Groq or OpenAI Whisper
        try {
          let transcript;
          
          // Try Groq first (FREE!)
          if (GROQ_API_KEY) {
            try {
              const groq = new Groq({ apiKey: GROQ_API_KEY.trim() });
              console.log('🎯 Sending to Groq Whisper (FREE & FAST!)...');
              
              const transcription = await groq.audio.transcriptions.create({
                file: fs.createReadStream(tempFile),
                model: 'whisper-large-v3-turbo',
                language: 'en',
                response_format: 'json'
              });
              
              transcript = transcription.text.trim();
              console.log(`✅ Groq Whisper transcription: "${transcript}"`);
              
            } catch (groqError) {
              console.warn('⚠️ Groq Whisper failed:', groqError.message);
              console.log('🔄 Falling back to OpenAI Whisper...');
              
              // Fallback to OpenAI
              if (OPENAI_API_KEY) {
                const openai = new OpenAI({ apiKey: OPENAI_API_KEY.trim() });
                const transcription = await openai.audio.transcriptions.create({
                  file: fs.createReadStream(tempFile),
                  model: 'whisper-1',
                  language: 'en'
                });
                transcript = transcription.text.trim();
                console.log(`✅ OpenAI Whisper transcription: "${transcript}"`);
              } else {
                throw groqError;
              }
            }
          } else {
            // Use OpenAI directly
            const openai = new OpenAI({ apiKey: OPENAI_API_KEY.trim() });
            console.log('🎯 Sending to OpenAI Whisper...');
            
            const transcription = await openai.audio.transcriptions.create({
              file: fs.createReadStream(tempFile),
              model: 'whisper-1',
              language: 'en'
            });
            
            transcript = transcription.text.trim();
            console.log(`✅ OpenAI Whisper transcription: "${transcript}"`);
          }
          
          // Delete temp file
          fs.unlinkSync(tempFile);
          
          if (transcript) {
            // Send transcript to frontend
            socket.emit('transcript_final', { text: transcript });
            
            // Generate AI answer using selected provider and model
            console.log(`🤖 Generating AI answer with ${currentProvider} (${currentModel})...`);
            if (customPersona) {
              console.log(`🎭 Using custom persona: ${customPersona.substring(0, 50)}...`);
            }
            const result = await generateAIResponse(
              transcript,           // question
              currentProvider,      // provider (groq or gemini)
              currentModel,         // model ID
              conversationHistory,  // conversation history
              currentRoleType,      // role type
              userContext,          // user context
              customPersona         // custom persona/system prompt
            );
            
            if (result && result.answer) {
              const answer = result.answer;
              console.log('✅ Answer generated:', answer.substring(0, 100) + '...');
              socket.emit('answer_final', { 
                answer,
                provider: currentProvider,
                model: currentModel,
                keyPoints: result.key_technologies || [],
                experienceMentioned: result.experience_mentioned || [],
                followUpTopics: result.follow_up_topics || []
              });
              
              // Update conversation history
              conversationHistory.push({
                role: 'user',
                content: transcript
              });
              conversationHistory.push({
                role: 'assistant',
                content: answer
              });
            } else {
              console.error('❌ No answer generated');
              socket.emit('error', { type: 'answer_error', message: 'Failed to generate answer' });
            }
          } else {
            console.warn('⚠️ Empty transcription');
            socket.emit('error', { type: 'stt_error', message: 'No speech detected' });
          }
          
        } catch (error) {
          console.error('❌ Whisper API error:', error.message);
          socket.emit('error', { type: 'stt_error', message: error.message });
          
          // Clean up temp file
          if (fs.existsSync(tempFile)) {
            fs.unlinkSync(tempFile);
          }
        }
        
      } catch (error) {
        console.error('❌ Error processing audio file:', error);
        socket.emit('error', { type: 'stt_error', message: 'Failed to process audio file' });
      }
    });

    // Handle audio chunk (from extension - streaming mode)
    socket.on('audio_chunk', async (data) => {
      try {
        const { audio, sampleRate, timestamp } = data;
        
        // Initialize STT if needed (only once)
        if (!deepgramConnection && !isInitializingSTT) {
          console.log('🔊 First audio chunk received, initializing STT...');
          isInitializingSTT = true;
          await initializeSTTConnection(socket);
          isInitializingSTT = false;
        }
        
        // Convert array back to Float32Array
        const audioData = new Float32Array(audio);
        
        // Convert Float32Array to Int16 PCM (Deepgram expects)
        const int16Data = float32ToInt16(audioData);
        
        // Wait for STT to be ready before sending audio
        if (!isSTTReady) {
          // Buffer audio while initializing (keep last 50 chunks only)
          audioBuffer.push(int16Data);
          if (audioBuffer.length > 50) {
            audioBuffer.shift();
          }
          return;
        }
        
        // Send buffered audio first (if any)
        if (audioBuffer.length > 0) {
          console.log(`📤 Sending ${audioBuffer.length} buffered audio chunks...`);
          for (const bufferedChunk of audioBuffer) {
            if (deepgramConnection && deepgramConnection.send) {
              deepgramConnection.send(bufferedChunk);
            }
          }
          audioBuffer = [];
        }
        
        // Send current audio
        if (deepgramConnection && deepgramConnection.send) {
          // Check audio level before sending
          const maxAmplitude = Math.max(...Array.from(audioData).map(Math.abs));
          
          deepgramConnection.send(int16Data);
          
          // Log occasionally with audio level
          if (Math.random() < 0.02) { // 2% chance
            console.log(`🎵 Audio sent - Max amplitude: ${maxAmplitude.toFixed(4)} (${maxAmplitude > 0.01 ? 'GOOD' : 'TOO QUIET'})`);
          }
        }
        
      } catch (error) {
        console.error('❌ Error processing audio chunk:', error);
        socket.emit('error', { type: 'stt_error', message: 'Failed to process audio' });
      }
    });

    // Initialize STT connection (Deepgram or OpenAI Whisper)
    async function initializeSTTConnection(socket) {
      try {
        // Try Deepgram first (faster, real-time)
        const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
        if (DEEPGRAM_API_KEY) {
          console.log('📡 Initializing Deepgram STT (real-time)');
          return await initializeDeepgramSTT(socket, DEEPGRAM_API_KEY);
        }
        
        // Fallback to OpenAI Whisper
        const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
        if (OPENAI_API_KEY) {
          console.log('📡 Initializing OpenAI Whisper STT (batch mode)');
          return await initializeWhisperSTT(socket, OPENAI_API_KEY);
        }
        
        // No API keys - use mock
        console.warn('⚠️ No STT API keys found (DEEPGRAM_API_KEY or OPENAI_API_KEY)');
        console.warn('⚠️ Using mock STT for testing');
        initializeMockSTT(socket);
        
      } catch (error) {
        console.error('Failed to initialize STT:', error);
        console.warn('⚠️ Falling back to mock STT');
        initializeMockSTT(socket);
      }
    }
    
    // Initialize Deepgram STT (real-time streaming)
    async function initializeDeepgramSTT(socket, apiKey) {
      const { createClient } = await import('@deepgram/sdk');
      const deepgram = createClient(apiKey);
      
      deepgramConnection = deepgram.listen.live({
        model: 'nova-2',
        language: 'en',
        smart_format: true,
        interim_results: true,
        punctuate: true,
        encoding: 'linear16',
        sample_rate: 16000
      });
      
      deepgramConnection.on('open', () => {
        console.log('✅ Deepgram connection opened - ready to receive audio!');
        isSTTReady = true;
        
        // Send keepalive every 5 seconds to prevent timeout
        const keepAliveInterval = setInterval(() => {
          if (deepgramConnection && deepgramConnection.getReadyState() === 1) {
            // Deepgram needs audio to stay alive
            console.log('📡 Keepalive: Connection still open');
          } else {
            console.warn('⚠️ Keepalive: Connection lost');
            clearInterval(keepAliveInterval);
          }
        }, 5000);
        
        // Store interval for cleanup
        socket.deepgramKeepalive = keepAliveInterval;
      });
      
      // Listen for transcription results - use 'Results' (capital R!)
      deepgramConnection.on('Results', (data) => {
        const transcript = data.channel?.alternatives?.[0]?.transcript || data.alternatives?.[0]?.transcript;
        
        // Log ALL results for debugging
        console.log('📝 Results event:', {
          transcript: transcript || '(empty)',
          is_final: data.is_final,
          speech_final: data.speech_final,
          duration: data.duration
        });
        
        if (!transcript || transcript.trim().length === 0) {
          // Empty transcript - audio might be silent
          return;
        }
        
        const isFinal = data.is_final;
        const speechFinal = data.speech_final;
        const confidence = data.channel?.alternatives?.[0]?.confidence || data.alternatives?.[0]?.confidence || 0;
        
        if (isFinal) {
          currentTranscript += ' ' + transcript;
          const fullText = currentTranscript.trim();
          
          socket.emit('transcript_final', {
            data: { text: fullText, confidence, speaker: 0 }
          });
          
          console.log('📝 Final transcript:', fullText);
          
          const wordCount = fullText.split(' ').length;
          if (fullText.includes('?') || wordCount >= 8) {
            if (!isProcessingQuestion) {
              isProcessingQuestion = true;
              handleQuestionDetected(fullText, socket);
              currentTranscript = '';
              setTimeout(() => { isProcessingQuestion = false; }, 2000);
            }
          }
        } else {
          socket.emit('transcript_interim', {
            data: { text: (currentTranscript + ' ' + transcript).trim(), confidence }
          });
        }
      });
      
      deepgramConnection.on('error', (error) => {
        console.error('❌ Deepgram error:', error);
        console.error('Error details:', error.message || error);
        isSTTReady = false;
        socket.emit('error', { type: 'stt_error', message: 'Transcription error' });
      });
      
      deepgramConnection.on('close', (closeEvent) => {
        console.log('🔌 Deepgram connection closed');
        console.log('Close reason:', closeEvent);
        isSTTReady = false;
        deepgramConnection = null;
      });
      
      deepgramConnection.on('warning', (warning) => {
        console.warn('⚠️ Deepgram warning:', warning);
      });
      
      deepgramConnection.on('Metadata', (metadata) => {
        console.log('📊 Deepgram metadata:', metadata);
      });
      
      // Add debug listener for ALL events
      const originalEmit = deepgramConnection.emit;
      deepgramConnection.emit = function(event, ...args) {
        if (!['Metadata', 'metadata'].includes(event)) {
          console.log('🔔 Deepgram event:', event, 'with data:', args[0] ? JSON.stringify(args[0]).substring(0, 150) : 'none');
        }
        return originalEmit.apply(this, [event, ...args]);
      };
      
      console.log('✅ Deepgram STT initialized');
    }
    
    // Initialize OpenAI Whisper STT (batch processing)
    async function initializeWhisperSTT(socket, apiKey) {
      const openai = new OpenAI({ apiKey: apiKey.trim() });
      
      whisperInterval = setInterval(async () => {
          if (audioBuffer.length === 0) return;
          
          try {
            // Combine audio chunks
            const totalLength = audioBuffer.reduce((sum, chunk) => sum + chunk.length, 0);
            const combinedBuffer = Buffer.concat(audioBuffer, totalLength);
            
            // Clear buffer
            audioBuffer = [];
            
            // Skip if too short (less than 1 second of audio)
            if (combinedBuffer.length < 16000 * 2) {
              return;
            }
            
            // Create temp file for Whisper API
            const tempDir = path.join(__dirname, '../../temp');
            if (!fs.existsSync(tempDir)) {
              fs.mkdirSync(tempDir, { recursive: true });
            }
            
            const tempFile = path.join(tempDir, `audio_${Date.now()}.wav`);
            
            // Write WAV file
            const wavBuffer = createWavBuffer(combinedBuffer, 16000);
            fs.writeFileSync(tempFile, wavBuffer);
            
            // Send to Whisper API
            const transcription = await openai.audio.transcriptions.create({
              file: fs.createReadStream(tempFile),
              model: 'whisper-1',
              language: 'en',
              response_format: 'verbose_json'
            });
            
            // Clean up temp file
            fs.unlinkSync(tempFile);
            
            const transcript = transcription.text?.trim();
            
            if (transcript && transcript.length > 0) {
              // Emit interim result
              socket.emit('transcript_interim', {
                data: {
                  text: transcript,
                  confidence: 0.9
                }
              });
              
              // Add to current transcript
              currentTranscript += ' ' + transcript;
              const fullText = currentTranscript.trim();
              
              // Check if it's a complete question
              const wordCount = fullText.split(' ').length;
              if (fullText.includes('?') || wordCount >= 8) {
                // Emit final transcript
                socket.emit('transcript_final', {
                  data: {
                    text: fullText,
                    confidence: 0.9,
                    speaker: 0
                  }
                });
                
                console.log('📝 Final transcript:', fullText);
                
                if (!isProcessingQuestion) {
                  isProcessingQuestion = true;
                  handleQuestionDetected(fullText, socket);
                  currentTranscript = ''; // Reset for next question
                  
                  setTimeout(() => {
                    isProcessingQuestion = false;
                  }, 2000);
                }
              }
            }
            
          } catch (error) {
            console.error('❌ Whisper transcription error:', error.message);
          }
        }, 3000); // Process every 3 seconds
        
        // Mark as ready
        deepgramConnection = {
          send: (data) => {
            // Store audio chunks in buffer
            audioBuffer.push(data);
          },
          getReadyState: () => 1,
          close: () => {
            if (whisperInterval) {
              clearInterval(whisperInterval);
              whisperInterval = null;
            }
          }
        };
        
      console.log('✅ OpenAI Whisper STT initialized');
    }
    
    // Create WAV file buffer from PCM data
    function createWavBuffer(pcmBuffer, sampleRate) {
      const header = Buffer.alloc(44);
      
      // WAV header
      header.write('RIFF', 0);
      header.writeUInt32LE(36 + pcmBuffer.length, 4);
      header.write('WAVE', 8);
      header.write('fmt ', 12);
      header.writeUInt32LE(16, 16); // Subchunk size
      header.writeUInt16LE(1, 20); // Audio format (1 = PCM)
      header.writeUInt16LE(1, 22); // Num channels (1 = mono)
      header.writeUInt32LE(sampleRate, 24); // Sample rate
      header.writeUInt32LE(sampleRate * 2, 28); // Byte rate
      header.writeUInt16LE(2, 32); // Block align
      header.writeUInt16LE(16, 34); // Bits per sample
      header.write('data', 36);
      header.writeUInt32LE(pcmBuffer.length, 40);
      
      return Buffer.concat([header, pcmBuffer]);
    }
    
    // Mock STT fallback
    function initializeMockSTT(socket) {
      deepgramConnection = {
        send: (data) => {
          setTimeout(() => {
            currentTranscript += ' mock_word';
            socket.emit('transcript_interim', {
              data: {
                text: currentTranscript.trim(),
                confidence: 0.8
              }
            });
            
            if (currentTranscript.split(' ').length >= 10 && !isProcessingQuestion) {
              isProcessingQuestion = true;
              socket.emit('transcript_final', {
                data: {
                  text: currentTranscript.trim(),
                  confidence: 0.9,
                  speaker: 0
                }
              });
              
              handleQuestionDetected(currentTranscript.trim(), socket);
              currentTranscript = '';
              isProcessingQuestion = false;
            }
          }, 100);
        },
        getReadyState: () => 1,
        close: () => {}
      };
    }

    // Handle question detected
    async function handleQuestionDetected(question, socket) {
      try {
        console.log(`❓ Question detected: ${question.substring(0, 50)}...`);
        
        // Emit question detected event
        socket.emit('question_detected', {
          data: {
            question: question,
            questionId: Date.now().toString(),
            timestamp: Date.now()
          }
        });
        
        // Generate answer
        const suggestion = await generateRealtimeSuggestion(
          question,
          currentRoleType,
          conversationHistory,
          userContext
        );
        
        // Send answer
        socket.emit('answer_final', {
          data: {
            questionId: Date.now().toString(),
            answer: suggestion.suggestion,
            key_points: suggestion.keyPoints,
            tone: suggestion.tone,
            confidence_score: 0.85,
            timestamp: Date.now()
          }
        });
        
        // Add to history
        conversationHistory.push({
          role: 'interviewer',
          content: question,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.error('Error handling question:', error);
        socket.emit('error', { type: 'llm_error', message: 'Failed to generate answer' });
      }
    }

    // Convert Float32Array to Int16 PCM
    function float32ToInt16(float32Array) {
      const int16Array = new Int16Array(float32Array.length);
      for (let i = 0; i < float32Array.length; i++) {
        const s = Math.max(-1, Math.min(1, float32Array[i]));
        int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      return Buffer.from(int16Array.buffer);
    }

    // Handle real-time question (from speech-to-text)
    socket.on('interviewer_question', async (data) => {
      try {
        const { question, roleType, sessionId } = data;

        if (!question || question.trim().length === 0) {
          return;
        }

        // Update role type if provided
        if (roleType) {
          currentRoleType = roleType;
        }

        // Load user context if not loaded
        if (!userContext && socket.userId) {
          userContext = await getLongTermMemory(socket.userId, sessionId || '', currentRoleType);
        }

        // Add to conversation history
        conversationHistory.push({
          role: 'interviewer',
          content: question,
          timestamp: new Date().toISOString()
        });

        // Keep only last 10 messages
        if (conversationHistory.length > 10) {
          conversationHistory.shift();
        }

        // Generate real-time suggestion
        const suggestion = await generateRealtimeSuggestion(
          question,
          currentRoleType,
          conversationHistory,
          userContext
        );

        // Send suggestion to client
        socket.emit('suggestion', {
          question,
          suggestion: suggestion.suggestion,
          keyPoints: suggestion.keyPoints,
          tone: suggestion.tone,
          timestamp: suggestion.timestamp
        });

        console.log(`💡 Suggestion sent for question: ${question.substring(0, 50)}...`);

      } catch (error) {
        console.error('Error handling interviewer question:', error);
        socket.emit('error', {
          message: 'Failed to generate suggestion',
          error: error.message
        });
      }
    });

    // Handle streaming request
    socket.on('stream_suggestion', async (data) => {
      try {
        const { question, roleType, sessionId } = data;

        if (roleType) {
          currentRoleType = roleType;
        }

        if (!userContext && socket.userId) {
          userContext = await getLongTermMemory(socket.userId, sessionId || '', currentRoleType);
        }

        // Generate streaming suggestion
        await generateStreamingSuggestion(
          question,
          {
            roleType: currentRoleType,
            conversationHistory,
            userContext
          },
          (chunk) => {
            // Send each chunk to client
            socket.emit('suggestion_chunk', {
              chunk,
              question
            });
          }
        );

        socket.emit('suggestion_complete', {
          question,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        console.error('Error in streaming suggestion:', error);
        socket.emit('error', {
          message: 'Streaming failed',
          error: error.message
        });
      }
    });

    // Handle user answer (for context)
    socket.on('user_answer', (data) => {
      const { answer } = data;
      if (answer) {
        conversationHistory.push({
          role: 'user',
          content: answer,
          timestamp: new Date().toISOString()
        });

        // Keep only last 10 messages
        if (conversationHistory.length > 10) {
          conversationHistory.shift();
        }
      }
    });

    // Handle role type update
    socket.on('update_role_type', (data) => {
      const { roleType } = data;
      if (roleType) {
        currentRoleType = roleType;
        console.log(`📝 Role type updated to: ${roleType}`);
      }
    });

    // Handle context update (e.g., resume upload)
    socket.on('update_context', async (data) => {
      try {
        const { sessionId } = data;
        if (socket.userId) {
          userContext = await getLongTermMemory(socket.userId, sessionId || '', currentRoleType);
          socket.emit('context_updated', { success: true });
        }
      } catch (error) {
        console.error('Error updating context:', error);
      }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      console.log(`❌ Real-time client disconnected: ${socket.userEmail} (${socket.id})`);
      
      // Clean up STT connection
      if (deepgramConnection) {
        if (deepgramConnection.close) {
          deepgramConnection.close();
        }
        deepgramConnection = null;
      }
      
      // Clean up Whisper interval
      if (whisperInterval) {
        clearInterval(whisperInterval);
        whisperInterval = null;
      }
      
      // Clean up Deepgram keepalive
      if (socket.deepgramKeepalive) {
        clearInterval(socket.deepgramKeepalive);
        socket.deepgramKeepalive = null;
      }
      
      // Clear audio buffer
      audioBuffer = [];
    });

    // Send connection confirmation
    socket.emit('connected', {
      message: 'Connected to real-time interview assistant',
      userId: socket.userId,
      timestamp: new Date().toISOString()
    });
  });

  console.log('🔌 WebSocket server initialized');
  return io;
};

export default initializeWebSocket;

