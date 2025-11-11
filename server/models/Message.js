import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Session',
    required: true,
  },
  role: {
    type: String,
    required: true, // 'user' or 'assistant'
  },
  content: {
    type: String,
    required: true,
  },
  score: Number,
  strengths: [String],
  weaknesses: [String],
  suggestion: String,
  modelAnswer: String,
  metadata: mongoose.Schema.Types.Mixed,
}, {
  timestamps: true,
});

const Message = mongoose.model('Message', messageSchema);

export default Message;
