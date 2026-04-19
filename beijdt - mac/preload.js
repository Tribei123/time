const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close'),

    setOpacity: (value) => ipcRenderer.send('set-opacity', value),
    setAlwaysOnTop: (flag) => ipcRenderer.send('set-always-on-top', flag),

    send: (channel, ...args) => ipcRenderer.send(channel, ...args),

    onMaximizeChange: (callback) => ipcRenderer.on('maximize-change', (event, value) => callback(value)),
    onAlwaysOnTopChanged: (callback) => ipcRenderer.on('always-on-top-changed', (event, value) => callback(value)),
    onLockChanged: (callback) => ipcRenderer.on('lock-changed', (event, value) => callback(value)),

    onMenuPlayPause: (callback) => ipcRenderer.on('menu-play-pause', () => callback()),
    onMenuReset: (callback) => ipcRenderer.on('menu-reset', () => callback()),
    onMenuSwitchState: (callback) => ipcRenderer.on('menu-switch-state', (event, state) => callback(state)),
    onToggleDesktopMode: (callback) => ipcRenderer.on('toggle-desktop-mode', (event, enable) => callback(enable)),
    onSetOpacityPreset: (callback) => ipcRenderer.on('set-opacity-preset', (event, value) => callback(value)),

    sendCurrentState: (state) => ipcRenderer.send('current-state-changed', state)
});