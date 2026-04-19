const { app, BrowserWindow, Tray, Menu, screen, ipcMain, nativeImage, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let buttonWindow = null;
let tray = null;
let isQuitting = false;
let isLocked = false;
let isAlwaysOnTop = true;
let isDesktopMode = false;
let currentState = 'work';
let hideButtonTimeout = null; // 延时隐藏定时器
let isMouseOnButton = false;   // 鼠标是否在按钮窗口上

const BUTTON_WINDOW_WIDTH = 120;
const BUTTON_WINDOW_HEIGHT = 50;

function getTrayIcon() {
    const iconPath = path.join(__dirname, 'icon.ico');
    if (fs.existsSync(iconPath)) {
        const icon = nativeImage.createFromPath(iconPath);
        if (!icon.isEmpty()) {
            const icon16 = icon.resize({ width: 16, height: 16 });
            const icon32 = icon.resize({ width: 32, height: 32 });
            const icon64 = icon.resize({ width: 64, height: 64 });
            const combined = nativeImage.createEmpty();
            combined.addRepresentation({ scaleFactor: 1, buffer: icon16.toPNG(), width: 16, height: 16 });
            combined.addRepresentation({ scaleFactor: 2, buffer: icon32.toPNG(), width: 32, height: 32 });
            combined.addRepresentation({ scaleFactor: 3, buffer: icon64.toPNG(), width: 64, height: 64 });
            return combined;
        }
    }
    return nativeImage.createEmpty();
}

function createMainWindow() {
    const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;
    const winWidth = 900;
    const winHeight = 280;

    mainWindow = new BrowserWindow({
        width: winWidth,
        height: winHeight,
        minWidth: 700,
        minHeight: 240,
        x: Math.floor((screenWidth - winWidth) / 2),
        y: 60,
        transparent: true,
        frame: false,
        alwaysOnTop: isAlwaysOnTop,
        resizable: true,
        skipTaskbar: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    mainWindow.loadFile('index.html');

    mainWindow.on('maximize', () => mainWindow.webContents.send('maximize-change', true));
    mainWindow.on('unmaximize', () => mainWindow.webContents.send('maximize-change', false));

    mainWindow.on('close', (event) => {
        if (!isQuitting) {
            event.preventDefault();
            mainWindow.hide();
            if (buttonWindow) buttonWindow.hide();
        }
        return false;
    });
}

function createButtonWindow() {
    buttonWindow = new BrowserWindow({
        width: BUTTON_WINDOW_WIDTH,
        height: BUTTON_WINDOW_HEIGHT,
        transparent: true,
        frame: false,
        alwaysOnTop: true,
        resizable: false,
        skipTaskbar: true,
        focusable: true,
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    buttonWindow.loadFile('button.html');
    buttonWindow.setIgnoreMouseEvents(false);

    buttonWindow.on('close', (e) => {
        e.preventDefault();
        buttonWindow.hide();
    });

    // 按钮窗口鼠标进入/离开
    buttonWindow.on('focus', () => { /* 不处理 */ });
}

function updateButtonWindowPosition(bubbleRect) {
    if (!buttonWindow || !mainWindow) return;
    const mainBounds = mainWindow.getBounds();
    const bubbleCenterX = mainBounds.x + bubbleRect.x + bubbleRect.width / 2;
    const bubbleTopY = mainBounds.y + bubbleRect.y;
    buttonWindow.setBounds({
        x: Math.round(bubbleCenterX - BUTTON_WINDOW_WIDTH / 2),
        y: Math.round(bubbleTopY - BUTTON_WINDOW_HEIGHT - 5),
        width: BUTTON_WINDOW_WIDTH,
        height: BUTTON_WINDOW_HEIGHT
    });
}

function setLocked(locked) {
    isLocked = locked;
    if (mainWindow) {
        mainWindow.setIgnoreMouseEvents(isLocked, { forward: true });
        mainWindow.webContents.send('lock-changed', isLocked);
    }
    if (!isLocked) {
        if (buttonWindow) buttonWindow.hide();
        if (hideButtonTimeout) clearTimeout(hideButtonTimeout);
        isMouseOnButton = false;
    }
    updateTrayMenu();
}

function scheduleHideButton() {
    if (hideButtonTimeout) clearTimeout(hideButtonTimeout);
    hideButtonTimeout = setTimeout(() => {
        if (!isMouseOnButton && buttonWindow && buttonWindow.isVisible()) {
            buttonWindow.hide();
        }
        hideButtonTimeout = null;
    }, 300);
}

function cancelHideButton() {
    if (hideButtonTimeout) {
        clearTimeout(hideButtonTimeout);
        hideButtonTimeout = null;
    }
}

function showButtonIfNeeded() {
    if (!isLocked || !buttonWindow) return;
    if (!buttonWindow.isVisible()) {
        buttonWindow.show();
    }
    cancelHideButton();
}

function updateTrayMenu() {
    if (!tray) return;
    const contextMenu = Menu.buildFromTemplate([
        {
            label: '开始/暂停计时',
            click: () => { mainWindow?.webContents.send('menu-play-pause'); }
        },
        {
            label: '重置计时器',
            click: () => { mainWindow?.webContents.send('menu-reset'); }
        },
        { type: 'separator' },
        {
            label: '工作',
            type: 'radio',
            checked: currentState === 'work',
            click: () => {
                currentState = 'work';
                mainWindow?.webContents.send('menu-switch-state', 'work');
                updateTrayMenu();
            }
        },
        {
            label: '休息',
            type: 'radio',
            checked: currentState === 'rest',
            click: () => {
                currentState = 'rest';
                mainWindow?.webContents.send('menu-switch-state', 'rest');
                updateTrayMenu();
            }
        },
        {
            label: '用餐',
            type: 'radio',
            checked: currentState === 'meal',
            click: () => {
                currentState = 'meal';
                mainWindow?.webContents.send('menu-switch-state', 'meal');
                updateTrayMenu();
            }
        },
        { type: 'separator' },
        {
            label: '窗口置顶',
            type: 'checkbox',
            checked: isAlwaysOnTop,
            click: (item) => {
                isAlwaysOnTop = item.checked;
                mainWindow?.setAlwaysOnTop(isAlwaysOnTop);
                if (buttonWindow) buttonWindow.setAlwaysOnTop(isAlwaysOnTop);
                mainWindow?.webContents.send('always-on-top-changed', isAlwaysOnTop);
                updateTrayMenu();
            }
        },
        {
            label: '锁定',
            type: 'checkbox',
            checked: isLocked,
            click: (item) => setLocked(item.checked)
        },
        {
            label: '深色模式',
            type: 'checkbox',
            checked: isDesktopMode,
            click: (item) => {
                isDesktopMode = item.checked;
                mainWindow?.webContents.send('toggle-desktop-mode', isDesktopMode);
                updateTrayMenu();
            }
        },
        { type: 'separator' },
        {
            label: '透明度 0%',
            click: () => { mainWindow?.webContents.send('set-opacity-preset', 0); }
        },
        {
            label: '透明度 30%',
            click: () => { mainWindow?.webContents.send('set-opacity-preset', 0.3); }
        },
        {
            label: '透明度 60%',
            click: () => { mainWindow?.webContents.send('set-opacity-preset', 0.6); }
        },
        {
            label: '透明度 100%',
            click: () => { mainWindow?.webContents.send('set-opacity-preset', 1.0); }
        },
        { type: 'separator' },
        {
            label: '退出',
            click: () => { isQuitting = true; app.quit(); }
        }
    ]);
    tray.setContextMenu(contextMenu);
}

function createTray() {
    const icon = getTrayIcon();
    tray = new Tray(icon);
    tray.setToolTip('状态计时器');
    updateTrayMenu();

    tray.on('double-click', () => {
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        }
    });
}

ipcMain.on('current-state-changed', (event, state) => {
    currentState = state;
    updateTrayMenu();
});

ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
    if (!mainWindow) return;
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.on('window-close', () => mainWindow?.hide());
ipcMain.on('set-opacity', (e, v) => mainWindow?.setOpacity(v));
ipcMain.on('set-always-on-top', (e, flag) => {
    isAlwaysOnTop = flag;
    mainWindow?.setAlwaysOnTop(flag);
    if (buttonWindow) buttonWindow.setAlwaysOnTop(flag);
    updateTrayMenu();
    mainWindow?.webContents.send('always-on-top-changed', flag);
});

ipcMain.on('mouse-inside-bubble', (event, { inside, bubbleRect }) => {
    if (!isLocked || !buttonWindow) return;
    if (inside) {
        updateButtonWindowPosition(bubbleRect);
        showButtonIfNeeded();
    } else {
        // 鼠标离开气泡，启动延时隐藏
        scheduleHideButton();
    }
});

ipcMain.on('button-window-mouse-enter', () => {
    isMouseOnButton = true;
    cancelHideButton();
    showButtonIfNeeded();
});

ipcMain.on('button-window-mouse-leave', () => {
    isMouseOnButton = false;
    scheduleHideButton();
});

ipcMain.on('request-unlock', () => {
    setLocked(false);
});

ipcMain.on('toggle-lock', () => {
    setLocked(!isLocked);
});

app.whenReady().then(() => {
    createMainWindow();
    createButtonWindow();
    createTray();

    globalShortcut.register('Control+Shift+P', () => {
        setLocked(!isLocked);
    });

    globalShortcut.register('Control+Shift+U', () => {
        if (isLocked) setLocked(false);
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createMainWindow();
            createButtonWindow();
        } else {
            mainWindow?.show();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') { }
});

app.on('before-quit', () => {
    isQuitting = true;
    globalShortcut.unregisterAll();
});