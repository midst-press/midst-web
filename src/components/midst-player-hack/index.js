// ================================================================================
// Imports
// ================================================================================
const { basename, join } = require('path')
const { watch, writeFileSync, readFileSync } = require('fs')
const { app, BrowserWindow, dialog, Menu } = require('electron')

// ================================================================================
// Windows
// ================================================================================
let mainWindow
let okToCloseWindow = false

// ================================================================================
// Config
// ================================================================================
const FILE_EXT = 'midst'

// ================================================================================
// Globals
// ================================================================================
global['setOkToCloseWindow'] = (val) => {
  okToCloseWindow = val
}

global['quit'] = () => {
  app.quit()
}

global['confirm'] = (message, buttons) => {
  return new Promise((resolve) => {
    dialog.showMessageBox({
      title: 'Warning',
      message,
      buttons,
    },

    res => {
      resolve(res)
    })
  })
}

// ================================================================================
// File Handling
// ================================================================================
global['saveFileAs'] = (fileData) => {
  return new Promise((resolve) => {
    dialog.showSaveDialog(
      mainWindow,
      {filters: [{name: 'Midst Files', extensions: [FILE_EXT]}]},
      fileAbsPath => {
        if (fileAbsPath) {
          writeFileSync(fileAbsPath, JSON.stringify(fileData))
          resolve({fileAbsPath, fileName: basename(fileAbsPath)})
        }

        else {
          resolve(false)
        }
      },
    )
  }).then()
}

global['saveFile'] = (fileAbsPath, fileData) => {
  writeFileSync(fileAbsPath, JSON.stringify(fileData))
}

global['openFile'] = () => {
  dialog.showOpenDialog({properties: ['openFile'], filters: [{name: FILE_EXT, extensions: [FILE_EXT]}]}, (filePaths) => {
    if (filePaths) {
      app.addRecentDocument(filePaths[0])
      const fileName = basename(filePaths[0])
      let data

      try {
        data = JSON.parse(readFileSync(filePaths[0], 'utf8'))
      }

      catch (err) {
        console.log(err)
        data = false
      }

      mainWindow.webContents.send('fileOpened', {fileName, data, path: filePaths[0]})
    }
  })
}

// ================================================================================
// Bootstrap
// ================================================================================
const bootstrap = (menuItems, cb) => {
  const {systemPreferences} = require('electron')
  systemPreferences.setUserDefault('NSDisabledDictationMenuItem', 'boolean', true)
  systemPreferences.setUserDefault('NSDisabledCharacterPaletteMenuItem', 'boolean', true)

  app.on('ready', () => {
    const { size: { height: size }} = require('electron').screen.getPrimaryDisplay()

    mainWindow = new BrowserWindow({
      x: 20,
      y: 70,
      width: size - 20,
      height: size - 100,
      resizable: true,
      transparent: true,
      titleBarStyle: 'hidden',
    })

    mainWindow.setMinimumSize(500, 500)

    mainWindow.on('close', (evt) => {
      if (!okToCloseWindow) {
        evt.preventDefault()
        mainWindow.webContents.send('menu.quit')
      }
    })

    mainWindow.on('closed', () => app.quit())

    mainWindow.loadURL(`file://${__dirname}/index.html`)

    if (process.env.NODE_ENV === 'development') {
      mainWindow.toggleDevTools()
      watch(__dirname, {recursive: true}, () => {
        mainWindow.webContents.reloadIgnoringCache()
      })
    }

    if (menuItems) {
      Menu.setApplicationMenu(
        Menu.buildFromTemplate(menuItems(mainWindow))
      )
    }

    if (cb) {
      cb()
    }
  })
}

// ================================================================================
// Menu
// ================================================================================
const menu = (mainWindow) => {
  const appMenu = {
    label: 'App',
    submenu: [
      {label: 'About Midst', click: () => mainWindow.webContents.send('menu.about')},
      {type: 'separator'},
      {role: 'services'},
      {type: 'separator'},
      {role: 'hide'},
      {role: 'hideothers'},
      {role: 'unhide'},
      {type: 'separator'},
      {label: 'Quit', accelerator: 'Cmd+Q', click: () => mainWindow.webContents.send('menu.quit')},
    ]
  }

  const fileMenu = {
    label: 'File',
    submenu: [
      {label: 'New', accelerator: 'Cmd+N', click: () => mainWindow.webContents.send('menu.newFile')},
      {type: 'separator'},
      {label: 'Open...', accelerator: 'Cmd+O', click: () => mainWindow.webContents.send('menu.openFile')},
      {type: 'separator'},
      {label: 'Save', accelerator: 'Cmd+S', click: () => mainWindow.webContents.send('menu.saveFile')},
      {label: 'Save As...', accelerator: 'Shift+Cmd+S', click: () => mainWindow.webContents.send('menu.saveFileAs')},
    ],
  }

  const editMenu = {
    label: 'Edit',
    submenu: [
      {role: 'undo'},
      {role: 'redo'},
      { type: 'separator' },
      { label: 'Cut', accelerator: 'Command+X', selector: 'cut:' },
      { label: 'Copy', accelerator: 'Command+C', selector: 'copy:' },
      { label: 'Paste', accelerator: 'Command+V', selector: 'paste:' },
      { type: 'separator' },
      { label: 'Select All', accelerator: 'Command+A', selector: 'selectAll:' },
    ]
  }

  const fontMenu = {
    label: 'Font',
    submenu: [
      { label: 'Bold', click: () => mainWindow.webContents.send('menu.toggleFontFormatBold')},
      { label: 'Italic', click: () => mainWindow.webContents.send('menu.toggleFontFormatItalic')},
      { label: 'Font Family', submenu: [
        { label: 'Bell', click: () => mainWindow.webContents.send('menu.setFontFamily', 'Bell')},
        { label: 'Courier', click: () => mainWindow.webContents.send('menu.setFontFamily', 'Courier')},
        { label: 'Garamond', click: () => mainWindow.webContents.send('menu.setFontFamily', 'Garamond')},
        { label: 'Helvetica', click: () => mainWindow.webContents.send('menu.setFontFamily', 'Helvetica')},
        { label: 'Lato', click: () => mainWindow.webContents.send('menu.setFontFamily', 'Lato')},
        { label: 'Times New Roman', click: () => mainWindow.webContents.send('menu.setFontFamily', 'Times New Roman')},
      ]},
    ]
  }

  const viewMenu = {
    label: 'Options',
    submenu: [
      { label: 'Focus Mode', click: () => mainWindow.webContents.send('menu.toggleFocusMode')},
      { label: 'Cursor Following', click: () => mainWindow.webContents.send('menu.editorToggleCursorFollowing')},
      { type: 'separator' },
      { label: 'Increase Zoom', accelerator: 'Command+L', click: () => {
        mainWindow.webContents.send('menu.fontSizeUp')
      }},
      { label: 'Decrease Zoom', accelerator: 'Command+-', click: () => mainWindow.webContents.send('menu.fontSizeDown')},
      { label: 'Default Zoom', accelerator: 'Command+M', click: () => mainWindow.webContents.send('menu.fontSizeDefault')},
      { type: 'separator' },
      { label: 'Zoom Level', submenu: [
        { label: 'Tiny', click: () => mainWindow.webContents.send('menu.setFontSize', 10)},
        { label: 'Small', click: () => mainWindow.webContents.send('menu.setFontSize', 12)},
        { label: 'Medium', click: () => mainWindow.webContents.send('menu.setFontSize', 14)},
        { label: 'Large', click: () => mainWindow.webContents.send('menu.setFontSize', 24)},
        { label: 'Extra Large', click: () => mainWindow.webContents.send('menu.setFontSize', 36)},
      ]}
    ],
  }

  return [
    appMenu,
    fileMenu,
    editMenu,
    fontMenu,
    viewMenu,
  ]
}

// ================================================================================
// Go
// ================================================================================
bootstrap(menu)
