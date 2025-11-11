// Electron Main Process - InterviewBuddy Desktop App
const { app, BrowserWindow, ipcMain, globalShortcut, session } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const { spawn } = require('child_process');

// Import invisibility module
let invisibility = null;
try {
  invisibility = require('./invisibility');
  console.log('✅ Invisibility module loaded');
} catch (error) {
  console.warn('⚠️ Invisibility module not available:', error.message);
}

let mainWindow = null;
let overlayWindow = null;
let serverProcess = null;
let isInvisible = false;

// Create overlay window
function createOverlay() {
  overlayWindow = new BrowserWindow({
    width: 400,
    height: 600,
    x: 100,
    y: 100,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    resizable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      // Enable Web Speech API with proper permissions
      webSecurity: false,
      sandbox: false,
      allowRunningInsecureContent: true,
      // Add permissions for media/speech
      additionalArguments: [
        '--enable-features=MediaStreamTrack',
        '--use-fake-ui-for-media-stream'
      ]
    }
  });

  // Set permission handler for microphone
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    console.log('📢 Permission requested:', permission);
    if (permission === 'media' || permission === 'microphone' || permission === 'audioCapture') {
      console.log('✅ Permission granted:', permission);
      callback(true);
    } else {
      console.log('❌ Permission denied:', permission);
      callback(false);
    }
  });

  // Use Whisper version (NO WEB SPEECH API!)
  overlayWindow.loadFile(path.join(__dirname, 'overlay-whisper.html'));

  // Open DevTools only if explicitly requested (avoids console errors)
  if (process.env.DEBUG === 'true') {
    overlayWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // 🔥 INVISIBILITY: Make window invisible to screen share!
  overlayWindow.once('ready-to-show', () => {
    console.log('');
    console.log('🎯 Window ready-to-show event fired');
    
    if (invisibility) {
      console.log('✅ Invisibility module is loaded');
      
      // Try immediately (window is ready)
      try {
        const hwnd = overlayWindow.getNativeWindowHandle();
        console.log('✅ Got native window handle');
        
        const success = invisibility.makeWindowInvisible(hwnd);
        
        if (success) {
          isInvisible = true;
          console.log('🎉 Invisibility activated successfully!');
        } else {
          console.error('⚠️ Invisibility failed to activate');
          
          // Try again after a delay
          console.log('🔄 Retrying in 1 second...');
          setTimeout(() => {
            const hwnd2 = overlayWindow.getNativeWindowHandle();
            const success2 = invisibility.makeWindowInvisible(hwnd2);
            if (success2) {
              isInvisible = true;
              console.log('🎉 Invisibility activated on retry!');
            } else {
              console.error('❌ Retry also failed');
            }
          }, 1000);
        }
        
      } catch (error) {
        console.error('❌ Error in invisibility setup:', error.message);
        console.error('   Stack:', error.stack);
      }
      
    } else {
      console.error('❌ Invisibility module NOT loaded!');
      console.error('   Window will be VISIBLE in screen share');
    }
    console.log('');
  });

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });

  return overlayWindow;
}

// Start backend server as separate process
function startBackendServer() {
  return new Promise((resolve, reject) => {
    console.log('📡 Starting backend server...');
    
    // Determine paths based on whether app is packaged or in dev
    const isPackaged = app.isPackaged;
    const serverPath = isPackaged
      ? path.join(process.resourcesPath, 'server')
      : path.join(__dirname, '..', 'server');
    
    console.log('   Server path:', serverPath);
    console.log('   Is packaged:', isPackaged);
    
    // Use spawn to run the server as a separate process
    // .env file is in the server folder
    // Use start.js entrypoint to clear cached env vars
    serverProcess = spawn('node', ['start.js'], {
      cwd: serverPath,
      stdio: 'pipe',
      env: {
        ...process.env,
        NODE_ENV: isPackaged ? 'production' : 'development',
        // Explicitly clear any cached Groq/Gemini env vars
        GROQ_API_KEY: undefined,
        GROQ_MODEL: undefined
      }
    });

    // Set a timeout - if backend doesn't start in 10 seconds, continue anyway
    const timeout = setTimeout(() => {
      console.log('⚠️ Backend startup timeout - continuing with window creation');
      resolve();
    }, 10000);

    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`[Backend]: ${output.trim()}`);
      if (output.includes('Server ready to accept connections') || output.includes('server running on port')) {
        console.log('✅ Backend server is ready');
        clearTimeout(timeout);
        resolve();
      }
    });

    serverProcess.stderr.on('data', (data) => {
      console.error(`[Backend Error]: ${data.toString().trim()}`);
    });

    serverProcess.on('close', (code) => {
      if (code !== 0) {
        console.error(`Backend server process exited with code ${code}`);
        reject(new Error(`Server process exited with code ${code}`));
      }
    });

    serverProcess.on('error', (err) => {
      console.error('Failed to start backend server process.', err);
      reject(err);
    });
  });
}

// App ready
app.whenReady().then(async () => {
  console.log('🎤 InterviewBuddy Desktop starting...');

  try {
    await startBackendServer();
  } catch (error) {
    console.error('❌ Could not start backend server. App will close.', error);
    app.quit();
    return;
  }

  // Create overlay window
  createOverlay();

  // Global shortcuts
  globalShortcut.register('CommandOrControl+Shift+I', () => {
    if (overlayWindow) {
      overlayWindow.show();
      overlayWindow.focus();
    }
  });

  globalShortcut.register('CommandOrControl+Shift+H', () => {
    if (overlayWindow) {
      if (overlayWindow.isVisible()) {
        overlayWindow.hide();
      } else {
        overlayWindow.show();
      }
    }
  });

  // NEW: Toggle invisibility with Ctrl+Shift+V
  globalShortcut.register('CommandOrControl+Shift+V', () => {
    if (overlayWindow && invisibility) {
      const hwnd = overlayWindow.getNativeWindowHandle();
      
      if (isInvisible) {
        invisibility.makeWindowVisible(hwnd);
        isInvisible = false;
      } else {
        invisibility.makeWindowInvisible(hwnd);
        isInvisible = true;
      }
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createOverlay();
    }
  });
});

// Quit app
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  // Unregister all shortcuts
  globalShortcut.unregisterAll();
  
  // Kill server process
  if (serverProcess) {
    console.log('👋 Stopping backend server...');
    serverProcess.kill('SIGINT');
  }
  
  console.log('👋 App shutting down...');
});

// IPC Handlers
ipcMain.handle('minimize-window', () => {
  if (overlayWindow) {
    overlayWindow.minimize();
  }
});

ipcMain.handle('close-window', () => {
  if (overlayWindow) {
    overlayWindow.close();
  }
});

ipcMain.handle('toggle-always-on-top', (event, enabled) => {
  if (overlayWindow) {
    overlayWindow.setAlwaysOnTop(enabled);
  }
});

console.log('✅ Electron main process loaded');
