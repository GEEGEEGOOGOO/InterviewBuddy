import Groq from 'groq-sdk';

// Note: dotenv is loaded in server.js with { override: true }
// Lazy initialization - groq client is created on first use, not at module load time
let groq = null;

function getGroqClient() {
  if (!groq) {
    // Log only on first initialization (after dotenv has loaded)
    console.log('🔑 Groq Client - API Key:', process.env.GROQ_API_KEY?.substring(0, 20) + '...');
    console.log('🤖 Groq Client - Model:', process.env.GROQ_MODEL || 'llama-3.3-70b-versatile');
    
    groq = new Groq({
      apiKey: process.env.GROQ_API_KEY || ''
    });
  }
  return groq;
}

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

const generateModelAnswer = async (question) => {
  try {
    const prompt = `Provide an ideal, detailed model answer for the following interview question: "${question}"`;
    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'user', content: prompt }
      ],
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      temperature: 0.7,
      max_tokens: 1024,
    });
    return completion.choices[0]?.message?.content || 'Model answer could not be generated.';
  } catch (error) {
    console.error('Error generating model answer:', error);
    return 'Model answer could not be generated.';
  }
};

export const generateInterviewResponse = async (
  userMessage,
  conversationHistory = [],
  roleType = 'general',
  retrievedContext = null,
  customPersona = null
) => {
  try {
    // Use custom persona if provided, otherwise use default
    const systemPrompt = customPersona || SYSTEM_PROMPT;
    
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

    const completion = await getGroqClient().chat.completions.create({
      messages: [
        { role: 'system', content: `You are an experienced ${roleType} professional being interviewed. Answer confidently with specific examples from your ${roleType} experience. Always respond with valid JSON.` },
        { role: 'user', content: fullPrompt }
      ],
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      temperature: 0.8,
      max_tokens: 2048,
      response_format: { type: 'json_object' }
    });

    const text = completion.choices[0]?.message?.content || '{}';

    let parsedResponse;
    try {
      const cleanedText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsedResponse = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error('Error parsing AI response:', parseError);
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
      // For backwards compatibility with the frontend
      score: 85,
      strengths: parsedResponse.experience_mentioned || ['Demonstrated experience'],
      weaknesses: [],
      suggestion: parsedResponse.answer || '',
      next_question: parsedResponse.follow_up_topics?.[0] || 'Tell me more about your experience.'
    };

    return validatedResponse;

  } catch (error) {
    console.error('Error generating interview response:', error);
    
    return {
      answer: 'I have extensive experience in this area. Let me share a specific example from my previous role...',
      experience_mentioned: [],
      key_technologies: [],
      follow_up_topics: [],
      score: 0,
      strengths: [],
      weaknesses: ['Error processing request'],
      suggestion: 'I have extensive experience in this area. Let me share a specific example...',
      next_question: 'Could you tell me more about your experience?',
      error: error.message
    };
  }
};

export const generateSessionSummary = async (messages, roleType = 'general') => {
  // ... (omitted for brevity)
};

export default { generateInterviewResponse, generateSessionSummary };

