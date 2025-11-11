import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  roleType: {
    type: String,
    default: 'general',
  },
  status: {
    type: String,
    default: 'active', // 'active', 'completed', 'paused'
  },
}, {
  timestamps: true,
});

const Session = mongoose.model('Session', sessionSchema);

export default Session;
