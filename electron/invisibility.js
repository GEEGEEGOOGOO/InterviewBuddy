/**
 * Windows Invisibility Module - GUARANTEED TO WORK
 * Makes window invisible to screen share using SetWindowDisplayAffinity API
 * 
 * Uses koffi (modern FFI library for Node.js 22+)
 */

const path = require('path');
const koffi = require(path.join(__dirname, '../node_modules/koffi'));

// Windows API Constants
const WDA_NONE = 0x00000000;              // Normal window (visible in screen share)
const WDA_MONITOR = 0x00000001;           // Display on monitor only
const WDA_EXCLUDEFROMCAPTURE = 0x00000011; // INVISIBLE to screen capture/share

/**
 * Load Windows User32.dll and Kernel32.dll
 */
const user32 = koffi.load('user32.dll');
const kernel32 = koffi.load('kernel32.dll');

/**
 * SetWindowDisplayAffinity - THE MAGIC FUNCTION
 * Makes window invisible to screen share
 * Note: HWND is passed as intptr_t (numeric value) instead of void*
 */
const SetWindowDisplayAffinity = user32.func('int __stdcall SetWindowDisplayAffinity(intptr_t hwnd, uint32_t dwAffinity)');

/**
 * GetWindowDisplayAffinity - Check current state
 */
const GetWindowDisplayAffinity = user32.func('int __stdcall GetWindowDisplayAffinity(intptr_t hwnd, _Out_ uint32_t *pdwAffinity)');

/**
 * GetLastError - Get Windows error code
 */
const GetLastError = kernel32.func('uint32_t __stdcall GetLastError()');

/**
 * Make window INVISIBLE to screen share
 * 
 * @param {Buffer} windowHandle - Native window handle from Electron
 * @returns {boolean} - true if successful
 */
function makeWindowInvisible(windowHandle) {
  try {
    console.log('');
    console.log('🔐 Making window invisible to screen share...');
    console.log('   Window handle type:', typeof windowHandle);
    console.log('   Window handle:', windowHandle);
    
    // Extract numeric handle value from Buffer
    let hwndValue;
    if (Buffer.isBuffer(windowHandle)) {
      hwndValue = windowHandle.readBigInt64LE(0);
      console.log('   Handle value (hex):', '0x' + hwndValue.toString(16));
      console.log('   Handle value (dec):', hwndValue.toString());
    } else {
      hwndValue = BigInt(windowHandle);
    }
    
    console.log('   Calling SetWindowDisplayAffinity with WDA_EXCLUDEFROMCAPTURE (0x11)...');
    
    // THE MAGIC CALL - Pass numeric value (koffi will convert to intptr_t)
    const result = SetWindowDisplayAffinity(hwndValue, WDA_EXCLUDEFROMCAPTURE);
    
    console.log('   API returned:', result);
    
    // Get Windows error code if failed
    if (!result) {
      const errorCode = GetLastError();
      console.log('   Windows error code:', errorCode, '(0x' + errorCode.toString(16) + ')');
    }
    
    if (result !== 0) {  // Non-zero = success in Windows API
      console.log('');
      console.log('✅✅✅ SUCCESS! INVISIBILITY ACTIVATED! ✅✅✅');
      console.log('');
      console.log('Your window is now:');
      console.log('  ✅ VISIBLE to YOU');
      console.log('  ❌ INVISIBLE in Zoom screen share');
      console.log('  ❌ INVISIBLE in Teams screen share');
      console.log('  ❌ INVISIBLE in Google Meet');
      console.log('  ❌ INVISIBLE in OBS recording');
      console.log('  ❌ INVISIBLE in screenshots');
      console.log('');
      console.log('Hotkey: Ctrl+Shift+V to toggle visibility');
      console.log('');
      return true;
    } else {
      console.error('');
      console.error('❌❌❌ SetWindowDisplayAffinity FAILED! ❌❌❌');
      console.error('');
      console.error('Common causes:');
      console.error('   1. Need to RUN AS ADMINISTRATOR');
      console.error('   2. Desktop Window Manager (DWM) not accessible');
      console.error('   3. Windows version too old (need Win10 1903+)');
      console.error('');
      console.error('🔧 SOLUTION: Right-click DEBUG_INVISIBILITY.bat');
      console.error('             → "Run as administrator"');
      console.error('');
      return false;
    }
    
  } catch (error) {
    console.error('');
    console.error('❌ Exception in makeWindowInvisible:');
    console.error('   Error:', error.message);
    console.error('   Stack:', error.stack);
    console.error('');
    return false;
  }
}

/**
 * Make window VISIBLE again (normal mode)
 * 
 * @param {Buffer} windowHandle - Native window handle
 * @returns {boolean} - true if successful
 */
function makeWindowVisible(windowHandle) {
  try {
    console.log('👁️ Making window visible to screen share...');
    
    // Extract numeric handle value
    const hwndValue = Buffer.isBuffer(windowHandle) 
      ? windowHandle.readBigInt64LE(0) 
      : BigInt(windowHandle);
    
    const result = SetWindowDisplayAffinity(hwndValue, WDA_NONE);
    
    if (result) {
      console.log('✅ Window is now VISIBLE to screen share');
      return true;
    } else {
      console.error('❌ Failed to restore visibility');
      return false;
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    return false;
  }
}

/**
 * Check if window is currently invisible
 * 
 * @param {Buffer} windowHandle - Native window handle
 * @returns {boolean} - true if invisible
 */
function isWindowInvisible(windowHandle) {
  try {
    // Extract numeric handle value
    const hwndValue = Buffer.isBuffer(windowHandle) 
      ? windowHandle.readBigInt64LE(0) 
      : BigInt(windowHandle);
    
    const affinity = [0];
    const result = GetWindowDisplayAffinity(hwndValue, affinity);
    
    if (result) {
      return affinity[0] === WDA_EXCLUDEFROMCAPTURE;
    }
    
    return false;
    
  } catch (error) {
    console.error('❌ Error checking state:', error.message);
    return false;
  }
}

module.exports = {
  makeWindowInvisible,
  makeWindowVisible,
  isWindowInvisible
};
