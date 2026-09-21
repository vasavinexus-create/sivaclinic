const { app, BrowserWindow, shell } = require("electron");
const { createServer } = require("node:http");
const path = require("node:path");
const next = require("next");

const isDev = !app.isPackaged;
const port = process.env.SIVA_ELECTRON_PORT || "4789";
const appUrl = process.env.SIVA_ELECTRON_URL || `http://127.0.0.1:${port}`;
let nextServer = null;

async function startNextServer() {
  if (process.env.SIVA_ELECTRON_URL) return Promise.resolve();
  const nextApp = next({
    dev: isDev,
    dir: app.getAppPath(),
    hostname: "127.0.0.1",
    port: Number(port),
  });
  const handler = nextApp.getRequestHandler();
  await nextApp.prepare();

  await new Promise((resolve, reject) => {
    nextServer = createServer((req, res) => handler(req, res));
    nextServer.once("error", reject);
    nextServer.listen(Number(port), "127.0.0.1", resolve);
  });
}

function createWindow() {
  const iconPath = path.join(app.getAppPath(), "public", "favicon.ico");
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1100,
    minHeight: 700,
    title: "Siva Clinic",
    icon: iconPath,
    backgroundColor: "#f5f8f6",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.removeMenu();
  win.loadURL(appUrl);
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(async () => {
  await startNextServer();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (nextServer) nextServer.close();
});
