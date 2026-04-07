const { app, Tray, BrowserWindow, ipcMain, screen, nativeImage } = require('electron')
const path = require('path')

const MESSAGES = [
  'can you go faster for mommy?',
  'make mama proud, baby',
  'yes, just like that, keep going',
  'such a good boy, you\'re not done yet',
  'perfect... don\'t stop now',
]

// 16x16 pink heart PNG (inline, no external files needed)
const ICON_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAPUlEQVR4nGP4TyJgGAIaMreAECYbuwaICkyEXQMu1ah6KNFAspPI0YBVD75QwtSDAXBEHA7VuDXgBrTXAAD8oshj08KYogAAAABJRU5ErkJggg=='

let tray = null
let overlayWin = null

app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock.hide()

  const icon = nativeImage.createFromDataURL(ICON_DATA_URL)
  tray = new Tray(icon)
  tray.setToolTip('goodclaude')

  tray.on('click', () => {
    if (overlayWin) return

    const msg = MESSAGES[Math.floor(Math.random() * MESSAGES.length)]
    process.stdout.write(msg + '\n')

    const cursor = screen.getCursorScreenPoint()

    overlayWin = new BrowserWindow({
      width: 200,
      height: 200,
      x: cursor.x - 100,
      y: cursor.y - 100,
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

    const onEnter = () => { if (overlayWin) overlayWin.setIgnoreMouseEvents(false) }
    const onLeave = () => { if (overlayWin) overlayWin.setIgnoreMouseEvents(true, { forward: true }) }
    const onClose = () => { if (overlayWin) overlayWin.close() }

    ipcMain.on('mouse-enter-heart', onEnter)
    ipcMain.on('mouse-leave-heart', onLeave)
    ipcMain.once('close-overlay', onClose)

    overlayWin.on('closed', () => {
      ipcMain.removeListener('mouse-enter-heart', onEnter)
      ipcMain.removeListener('mouse-leave-heart', onLeave)
      ipcMain.removeListener('close-overlay', onClose)
      overlayWin = null
    })
  })
})

app.on('window-all-closed', (e) => e.preventDefault())
