# 🎤 InterviewBuddy Desktop App

## ✨ Features

- 🗣️ **FREE Speech Recognition** - Uses Web Speech API (no API key needed!)
- 🤖 **AI Answers** - Powered by Groq LLM
- 🎯 **Always-on-Top** - Floating overlay window
- ⌨️ **Global Shortcuts** - Ctrl+Shift+I to show, Ctrl+Shift+H to hide
- 📋 **Copy to Clipboard** - One-click answer copying
- 💰 **Cost Effective** - Only pays for Groq API (~$0.05/hour)

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd D:\PROJECT_101
npm install
```

### 2. Set Environment Variables

**Windows PowerShell:**
```powershell
$env:GROQ_API_KEY="your-groq-api-key"
$env:GROQ_MODEL="llama-3.1-8b-instant"
```

### 3. Run Development Mode

```bash
npm run dev
```

---

## 📦 Build Executable

### Windows (.exe)

```bash
npm run build
```

Output: `dist/InterviewBuddy Setup 1.0.0.exe`

### Mac (.dmg)

```bash
npm run build:mac
```

### Linux (.AppImage)

```bash
npm run build:linux
```

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+I` | Show window |
| `Ctrl+Shift+H` | Hide/Show window |

---

## 🎤 How to Use

1. **Launch app** - Double-click InterviewBuddy.exe
2. **Click "Start Listening"** - Overlay window appears
3. **Speak your question** - "What is React hooks?"
4. **Wait 2-3 seconds** - AI generates answer
5. **Read answer** - Key points displayed
6. **Copy to clipboard** - Click "Copy" button
7. **Continue** - Click "Continue" for next question

---

## 💰 Cost Comparison

| Feature | Extension | Desktop App |
|---------|-----------|-------------|
| **Speech-to-Text** | $0.006/min (Whisper) | **FREE** |
| **LLM** | Groq | Groq |
| **Total/hour** | ~$0.40 | **~$0.05** |

**Desktop app is 8x cheaper!** 🎉

---

## 🛠️ Technology Stack

- **Electron** - Desktop app framework
- **Web Speech API** - Free speech recognition
- **Node.js** - Backend server
- **Socket.IO** - Real-time communication
- **Groq LLM** - AI answer generation

---

## 📁 Project Structure

```
PROJECT_101/
├── electron/
│   ├── main.js          # Electron main process
│   ├── preload.js       # Bridge script
│   ├── overlay.html     # Overlay UI
│   └── overlay.js       # Frontend logic (Web Speech API)
├── server/
│   ├── server.js        # Backend server
│   └── services/        # AI services
├── package.json         # Dependencies & scripts
└── dist/                # Built executables
```

---

## 🐛 Troubleshooting

### Speech recognition not working
- **Check microphone permissions** in Windows Settings
- **Use Chrome/Edge-based browser engine** (built into Electron)
- **Speak clearly** and wait for results

### Backend not connecting
- **Check port 3000** is not in use
- **Verify GROQ_API_KEY** is set
- **Check console** for errors

### Build fails
- **Run `npm install`** first
- **Check Node.js version** >= 16
- **Try `npm run dev`** before building

---

## 🔒 Security

- **API Key**: Store securely, never commit to Git
- **Local Processing**: Speech recognition runs locally (private!)
- **Network**: Only sends transcript to Groq (no audio)

---

## 📝 License

MIT

---

## 🙏 Credits

Built with ❤️ for interview success!
