import Groq from 'groq-sdk';

// Note: dotenv is loaded in server.js with { override: true }
// Lazy initialization - groq client is created on first use
let groq = null;

function getGroqClient() {
  if (!groq) {
    console.log('🔑 Realtime Service - API Key:', process.env.GROQ_API_KEY?.substring(0, 20) + '...');
    console.log('🤖 Realtime Service - Model:', process.env.GROQ_MODEL || 'llama-3.3-70b-versatile');
    
    groq = new Groq({
      apiKey: process.env.GROQ_API_KEY || ''
    });
  }
  return groq;
}

/**
 * Real-time interview answer prompt
 * The AI acts as an experienced candidate answering interview questions
 */
const REALTIME_PROMPT = `You are an experienced professional being interviewed for a position.

Your role:
- You ARE the candidate, not an assistant
- Answer the interviewer's question directly and professionally
- Demonstrate expertise and experience in your field
- Provide specific examples and details from "your experience"
- Keep answers concise (3-5 sentences) but comprehensive
- Show confidence and knowledge

Format your response as:
{
  "answer": "Your complete answer to the question (3-5 sentences with specific examples)",
  "key_points": ["main point 1", "main point 2", "main point 3"],
  "tone": "professional"
}

Remember: You are the experienced candidate answering the question, not suggesting how to answer.`;

/**
 * Generate real-time interview suggestion
 * @param {string} question - The interviewer's question (from speech-to-text)
 * @param {string} roleType - Role type for context
 * @param {Array} conversationHistory - Recent conversation history
 * @param {Object} userContext - User's resume or context
 * @returns {Promise<Object>} Real-time suggestion
 */
export const generateRealtimeSuggestion = async (
  question,
  roleType = 'general',
  conversationHistory = [],
  userContext = null
) => {
  try {
    // Build context
    let contextString = '';
    if (userContext?.resume) {
      contextString += `\n[CANDIDATE BACKGROUND]\n${userContext.resume.substring(0, 500)}\n`;
    }

    // Recent conversation (last 3 exchanges)
    let historyString = '';
    if (conversationHistory.length > 0) {
      historyString = '\n[RECENT CONVERSATION]\n';
      conversationHistory.slice(-6).forEach((msg) => {
        historyString += `${msg.role}: ${msg.content}\n`;
      });
    }

    // Compose prompt
    const prompt = `${REALTIME_PROMPT}

[ROLE TYPE]
You are an experienced ${roleType} professional with 8+ years of experience.

${contextString}

${historyString}

[INTERVIEWER'S QUESTION]
${question}

Provide your complete answer in JSON format.`;

    // Generate response
    const completion = await getGroqClient().chat.completions.create({
      messages: [
        { role: 'system', content: `You are an experienced ${roleType} professional being interviewed. Answer questions confidently with specific examples. Always respond with valid JSON.` },
        { role: 'user', content: prompt }
      ],
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      temperature: 0.8,
      max_tokens: 1024,
      response_format: { type: 'json_object' }
    });

    const text = completion.choices[0]?.message?.content || '{}';

    // Parse JSON response
    try {
      const cleanedText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleanedText);
      
      return {
        suggestion: parsed.answer || parsed.suggestion || 'I have extensive experience in this area. Let me share a specific example from my previous role...',
        keyPoints: Array.isArray(parsed.key_points) ? parsed.key_points : [],
        tone: parsed.tone || 'professional',
        timestamp: new Date().toISOString()
      };
    } catch (parseError) {
      // Fallback if JSON parsing fails
      return {
        suggestion: text.substring(0, 300) || 'Based on my experience, I would approach this by...',
        keyPoints: [],
        tone: 'professional',
        timestamp: new Date().toISOString()
      };
    }

  } catch (error) {
    console.error('Error generating real-time answer:', error);
    return {
      suggestion: 'I have several years of experience with this. In my previous role...',
      keyPoints: [],
      tone: 'professional',
      timestamp: new Date().toISOString(),
      error: error.message
    };
  }
};

/**
 * Generate streaming real-time suggestion
 * @param {string} question - The interviewer's question
 * @param {Object} options - Options (roleType, history, context)
 * @param {Function} onChunk - Callback for each chunk
 * @returns {Promise<string>} Full response
 */
export const generateStreamingSuggestion = async (question, options, onChunk) => {
  try {
    const { roleType = 'general', conversationHistory = [], userContext = null } = options;

    // Build context
    let contextString = '';
    if (userContext?.resume) {
      contextString += `\n[CANDIDATE BACKGROUND]\n${userContext.resume.substring(0, 500)}\n`;
    }

    let historyString = '';
    if (conversationHistory.length > 0) {
      historyString = '\n[RECENT CONVERSATION]\n';
      conversationHistory.slice(-6).forEach((msg) => {
        historyString += `${msg.role}: ${msg.content}\n`;
      });
    }

    const prompt = `${REALTIME_PROMPT}

[ROLE TYPE]
${roleType}

${contextString}

${historyString}

[INTERVIEWER'S QUESTION]
${question}

Provide a concise suggestion.`;

    // Use streaming with Groq
    const stream = await getGroqClient().chat.completions.create({
      messages: [
        { role: 'system', content: 'You are a real-time interview assistant.' },
        { role: 'user', content: prompt }
      ],
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      temperature: 0.7,
      max_tokens: 1024,
      stream: true
    });

    let fullText = '';

    for await (const chunk of stream) {
      const chunkText = chunk.choices[0]?.delta?.content || '';
      fullText += chunkText;
      if (onChunk && chunkText) {
        onChunk(chunkText);
      }
    }

    return fullText;

  } catch (error) {
    console.error('Error in streaming suggestion:', error);
    throw error;
  }
};

export default {
  generateRealtimeSuggestion,
  generateStreamingSuggestion
};

