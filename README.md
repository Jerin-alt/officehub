# OfficeHub - Team Portal

A lightweight, secure, and free communication and file-sharing platform designed for office local networks (intranet).

## Features
- **Real-Time Chat**: Send messages instantly to all online team members.
- **File Sharing**: Drag and drop any file up to 200MB directly into chat.
- **Upload Notifications**: Real-time sound chimes and desktop popups notify everyone when a file is uploaded.
- **Central File Repository**: A dedicated "Shared Files" panel where all files are organized, searchable, and downloadable.
- **Persistent Storage**: Data is saved in a local SQLite database file (`office_hub.db`) on your server. It lasts forever and is easily back-up-able.
- **PWA Ready**: Can be installed as a standalone desktop app on each workstation.
- **100% Private**: Runs entirely within your office network. No internet required after setup, and your data never leaves your server.

---

## Quick Setup Instructions

### 1. On the Office Server:
1. Make sure **Python 3.8 or newer** is installed on the server (check "Add to PATH" during installation).
2. Copy the entire `office-hub` folder to the server.
3. Double-click the **`run.bat`** file.
4. The batch script will automatically:
   - Create a Python virtual environment.
   - Install the necessary dependencies (Flask).
   - Find your server's local network IP.
   - Start the server on port `5000`.
5. Keep the terminal window open to keep the server running.

The console will print a message like this:
```
====================================================================
                  OFFICEHUB CHAT & FILE SYSTEM
====================================================================

 The server is starting up. To access it from any computer in the
 office local network, open a web browser and go to:

     http://192.168.1.10:5000

 (Or on this server computer directly: http://localhost:5000)
====================================================================
```

### 2. On Team Workstations (the 7 Systems):
1. Open your web browser (Chrome, Edge, Opera, or Firefox).
2. Enter the network URL printed by the server (e.g., `http://192.168.1.10:5000`).
3. Enter your name when prompted to join the portal.
4. Click **Allow** when the browser asks for permission to send Desktop Notifications.

### 3. (Optional) Install as a Desktop Application:
- In Google Chrome or Microsoft Edge, look at the right side of the address bar.
- Click the **"Install OfficeHub"** icon (usually looks like a screen with an arrow, or a '+' sign).
- The application will now run in its own standalone window, with its own desktop shortcut, behaving exactly like a desktop app!

---

## Maintenance & Backups
- **Chat history and file index**: Saved inside the `office_hub.db` file.
- **Physical files**: Saved inside the `uploads/` folder.
- **To backup your data**: Simply copy the `office_hub.db` file and the `uploads/` folder to a backup drive.
- **Upload Size Limit**: Currently configured to 200MB. To change this, edit `app.config['MAX_CONTENT_LENGTH']` in the `app.py` file.
