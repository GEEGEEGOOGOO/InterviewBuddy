import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const connectDB = async () => {
  try {
    const mongoURL = process.env.MONGODB_URL || 'mongodb://localhost:27017/interviewbuddy';
    
    // For desktop app, MongoDB is optional
    if (!process.env.MONGODB_URL) {
      console.log('⚠️ MongoDB not configured - running WITHOUT database');
      console.log('💡 Session data will NOT be saved (this is fine for desktop app!)');
      console.log('💡 To enable MongoDB, set MONGODB_URL environment variable');
      return; // Skip MongoDB connection - desktop app works without it!
    }
    
    console.log('Attempting to connect to MongoDB...');
    await mongoose.connect(mongoURL);
    console.log('✅ MongoDB connected');
  } catch (error) {
    console.error('⚠️ MongoDB connection failed:', error.message);
    console.log('💡 Continuing without database (this is fine for desktop app!)');
    // Don't exit - desktop app works without MongoDB
  }
};

export default connectDB;

