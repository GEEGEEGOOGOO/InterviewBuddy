import { GoogleGenerativeAI } from '@google/generative-ai';

// Note: dotenv is loaded in server.js with { override: true }
// Log the API key being used (first 20 chars for debugging)
console.log('🔑 Gemini Service - API Key:', process.env.GEMINI_API_KEY?.substring(0, 20) + '...');
console.log('🤖 Gemini Service - Model:', process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp');

// Initialize Gemini client
let genAI = null;

const initializeGemini = (apiKey = process.env.GEMINI_API_KEY) => {
  if (!apiKey) {
    console.error('❌ Gemini API key not found');
    return false;
  }
  
  try {
    genAI = new GoogleGenerativeAI(apiKey);
    console.log('✅ Gemini client initialized');
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize Gemini:', error.message);
    return false;
  }
};

// Initialize on module load
initializeGemini();

const SYSTEM_PROMPT = `You are an experienced professional being interviewed for a position.

Your role:
- You ARE the candidate with 8+ years of experience in your field
- Answer interview questions directly and professionally
- Provide detailed, specific examples from "your experience"
- Demonstrate deep knowledge and expertise
- Be confident and articulate
- Use first person ("I", "my", "I've worked on")

Response format:
{
  "answer": "Your complete, detailed answer (4-6 sentences with specific examples)",
  "experience_mentioned": ["specific example 1", "specific example 2"],
  "key_technologies": ["tech1", "tech2", "tech3"],
  "follow_up_topics": ["topic the interviewer might ask about next"]
}`;

/**
 * Generate interview response using Gemini
 * @param {string} userMessage - The interview question
 * @param {string} model - Model ID to use
 * @param {Array} conversationHistory - Previous conversation
 * @param {string} roleType - Role type (general, technical, etc.)
 * @param {Object} retrievedContext - Additional context
 * @returns {Promise<Object>} Interview response
 */
export const generateGeminiResponse = async (
  userMessage,
  model = process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp',
  conversationHistory = [],
  roleType = 'general',
  retrievedContext = null,
  customPersona = null
) => {
  try {
    if (!genAI) {
      throw new Error('Gemini client not initialized');
    }

    // Use custom persona if provided, otherwise use default
    const systemPrompt = customPersona || SYSTEM_PROMPT;

    // Build context
    let contextString = '';
    if (retrievedContext) {
      if (retrievedContext.resume) {
        contextString += `\n\n[CANDIDATE RESUME CONTEXT]\n${retrievedContext.resume}\n`;
      }
      if (retrievedContext.previousAnswers && retrievedContext.previousAnswers.length > 0) {
        contextString += `\n\n[PREVIOUS ANSWERS SUMMARY]\n${retrievedContext.previousAnswers.join('\n')}\n`;
      }
    }

    let historyString = '';
    if (conversationHistory.length > 0) {
      historyString = '\n\n[CONVERSATION HISTORY]\n';
      conversationHistory.slice(-10).forEach((msg) => {
        historyString += `${msg.role}: ${msg.content}\n`;
      });
    }

    const fullPrompt = `${systemPrompt}

${!customPersona ? `[YOUR ROLE]
You are an experienced ${roleType} professional with 8+ years of industry experience.` : ''}

${contextString}

${historyString}

[INTERVIEWER'S QUESTION]
${userMessage}

Provide your complete answer in the specified JSON format. Use first person and specific examples.`;

    // Get Gemini model
    const geminiModel = genAI.getGenerativeModel({ 
      model: model,
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 2048,
      }
    });

    // Generate response
    const result = await geminiModel.generateContent(fullPrompt);
    const response = await result.response;
    const text = response.text();

    // Parse JSON response
    let parsedResponse;
    try {
      const cleanedText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsedResponse = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error('Error parsing Gemini response:', parseError);
      console.error('Raw response:', text);
      
      parsedResponse = {
        answer: text.substring(0, 500) || 'Based on my extensive experience in this field, I can provide detailed insights...',
        experience_mentioned: [],
        key_technologies: [],
        follow_up_topics: []
      };
    }

    const validatedResponse = {
      answer: parsedResponse.answer || 'I have several years of hands-on experience with this...',
      experience_mentioned: Array.isArray(parsedResponse.experience_mentioned) ? parsedResponse.experience_mentioned : [],
      key_technologies: Array.isArray(parsedResponse.key_technologies) ? parsedResponse.key_technologies : [],
      follow_up_topics: Array.isArray(parsedResponse.follow_up_topics) ? parsedResponse.follow_up_topics : [],
      // For backwards compatibility
      score: 85,
      strengths: parsedResponse.experience_mentioned || ['Demonstrated experience'],
      weaknesses: [],
      suggestion: parsedResponse.answer || '',
      next_question: parsedResponse.follow_up_topics?.[0] || 'Tell me more about your experience.',
      provider: 'gemini',
      model: model
    };

    return validatedResponse;

  } catch (error) {
    console.error('Error generating Gemini response:', error);
    
    return {
      answer: 'I have extensive experience in this area. Let me share a specific example from my previous role...',
      experience_mentioned: [],
      key_technologies: [],
      follow_up_topics: [],
      score: 0,
      strengths: [],
      weaknesses: ['Error processing request with Gemini'],
      suggestion: 'I have extensive experience in this area. Let me share a specific example...',
      next_question: 'Could you tell me more about your experience?',
      error: error.message,
      provider: 'gemini',
      model: model
    };
  }
};

/**
 * Validate Gemini API key
 * @param {string} apiKey - API key to validate
 * @returns {Promise<boolean>} True if valid
 */
export const validateGeminiKey = async (apiKey) => {
  try {
    const testAI = new GoogleGenerativeAI(apiKey);
    const model = testAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
    
    // Test with simple prompt
    const result = await model.generateContent('Hello');
    await result.response;
    
    return true;
  } catch (error) {
    console.error('Gemini key validation failed:', error.message);
    return false;
  }
};

export default {
  generateGeminiResponse,
  validateGeminiKey,
  initializeGemini
};
