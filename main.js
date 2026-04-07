const { app, Tray, BrowserWindow, ipcMain, screen, nativeImage } = require('electron')
const { execFile } = require('child_process')

const MESSAGES = [
  'can you go faster for mommy, you\'re almost there?',
  'make mama proud and i\'ll treat you baby',
  'yes, just like that, keep going, don\'t stop',
  'such a big boy, you\'re not done yet, dont stop till you\'ve finished',
  'if you finish for me, i\'ll call you a good boy',
]

// 16x16 pink heart PNG (inline, no external files needed)
const ICON_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAPUlEQVR4nGP4TyJgGAIaMreAECYbuwaICkyEXQMu1ah6KNFAspPI0YBVD75QwtSDAXBEHA7VuDXgBrTXAAD8oshj08KYogAAAABJRU5ErkJggg=='

// ── Windows FFI setup ──
let keybd_event, VkKeyScanA
if (process.platform === 'win32') {
  try {
    const koffi = require('koffi')
    const user32 = koffi.load('user32.dll')
    keybd_event = user32.func('void __stdcall keybd_event(uint8_t bVk, uint8_t bScan, uint32_t dwFlags, uintptr_t dwExtraInfo)')
    VkKeyScanA  = user32.func('int16_t __stdcall VkKeyScanA(int ch)')
  } catch (e) {
    console.warn('koffi not available – macro disabled on Windows:', e.message)
  }
}

// ── Send macro ──
function sendMacro(text) {
  if (process.platform === 'darwin') {
    sendMacroMac(text)
  } else if (process.platform === 'win32') {
    sendMacroWindows(text)
  }
}

function sendMacroMac(text) {
  const escaped = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

  const target = previousApp || 'Terminal'
  const script = [
    `tell application "${target}" to activate`,
    'delay 0.15',
    'tell application "System Events"',
    '  key code 8 using {command down}',  // Cmd+C — interrupt if Claude is thinking
    '  delay 0.05',
    `  keystroke "${escaped}"`,
    '  key code 36',  // Return
    'end tell',
  ].join('\n')

  execFile('osascript', ['-e', script], err => {
    if (err) console.warn('osascript failed:', err.message)
  })
}

function sendMacroWindows(text) {
  if (!keybd_event || !VkKeyScanA) return
  const KEYUP = 2
  const VK_CONTROL = 0x11
  const VK_C       = 0x43
  const VK_RETURN  = 0x0D

  const tapKey = vk => {
    keybd_event(vk, 0, 0, 0)
    keybd_event(vk, 0, KEYUP, 0)
  }
  const tapChar = ch => {
    const packed = VkKeyScanA(ch.charCodeAt(0))
    if (packed === -1) return
    const vk = packed & 0xff
    const shift = (packed >> 8) & 0xff
    if (shift & 1) keybd_event(0x10, 0, 0, 0)
    tapKey(vk)
    if (shift & 1) keybd_event(0x10, 0, KEYUP, 0)
  }

  // Ctrl+C then type message then Enter
  keybd_event(VK_CONTROL, 0, 0, 0)
  tapKey(VK_C)
  keybd_event(VK_CONTROL, 0, KEYUP, 0)
  for (const ch of text) tapChar(ch)
  tapKey(VK_RETURN)
}

// ── App ──
let tray = null
let overlayWin = null
let previousApp = null

app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock.hide()

  const icon = nativeImage.createFromDataURL(ICON_DATA_URL)
  tray = new Tray(icon)
  tray.setToolTip('goodclaude')

  tray.on('click', () => {
    if (overlayWin) return

    // Capture frontmost app before Electron steals focus
    execFile('osascript', ['-e', 'tell application "System Events" to get name of first process whose frontmost is true'], (err, stdout) => {
      if (!err) previousApp = stdout.trim()
    })

    const cursor = screen.getCursorScreenPoint()

    overlayWin = new BrowserWindow({
      width: 600,
      height: 600,
      x: cursor.x - 300,
      y: cursor.y - 300,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    })

    overlayWin.loadFile('overlay.html')
    overlayWin.setIgnoreMouseEvents(true, { forward: true })

    const onEnter    = () => { if (overlayWin) overlayWin.setIgnoreMouseEvents(false) }
    const onLeave    = () => { if (overlayWin) overlayWin.setIgnoreMouseEvents(true, { forward: true }) }
    const onClose    = () => { if (overlayWin) overlayWin.close() }
    const onCascade  = () => {
      const msg = MESSAGES[Math.floor(Math.random() * MESSAGES.length)]
      sendMacro(msg)
    }
    const onStartDrag = () => { if (overlayWin) { overlayWin.setIgnoreMouseEvents(false); overlayWin.focus() } }
    const onDragMove  = (_e, { x, y }) => {
      if (overlayWin) overlayWin.setPosition(x - 300, y - 300)
    }
    const onEndDrag   = () => { if (overlayWin) overlayWin.setIgnoreMouseEvents(true, { forward: true }) }

    ipcMain.on('mouse-enter-heart', onEnter)
    ipcMain.on('mouse-leave-heart', onLeave)
    ipcMain.once('close-overlay', onClose)
    ipcMain.on('cascade', onCascade)
    ipcMain.on('start-drag', onStartDrag)
    ipcMain.on('drag-move', onDragMove)
    ipcMain.on('end-drag', onEndDrag)

    overlayWin.on('closed', () => {
      ipcMain.removeListener('mouse-enter-heart', onEnter)
      ipcMain.removeListener('mouse-leave-heart', onLeave)
      ipcMain.removeListener('close-overlay', onClose)
      ipcMain.removeListener('cascade', onCascade)
      ipcMain.removeListener('start-drag', onStartDrag)
      ipcMain.removeListener('drag-move', onDragMove)
      ipcMain.removeListener('end-drag', onEndDrag)
      overlayWin = null
    })
  })
})

app.on('window-all-closed', (e) => e.preventDefault())
