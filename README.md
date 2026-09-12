<div align="center">

# 🚀 DiskScanner Turbo

**A modern, blazing-fast, and beautiful storage analyzer for Windows.**

[![Python](https://img.shields.io/badge/Python-3.11+-blue.svg?logo=python&logoColor=white)](https://www.python.org)
[![Flask](https://img.shields.io/badge/Flask-Backend-black?logo=flask)](https://flask.palletsprojects.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Status: Active](https://img.shields.io/badge/Status-Active-success.svg)]()

<p align="center">
  <em>Say goodbye to boring and slow disk analyzers. DiskScanner Turbo combines a low-level scanning engine (<code>os.scandir</code>) with a stunning <b>Glassmorphism</b> interface.</em>
</p>

---

<!-- 📸 YOU CAN PLACE A GIF OR SCREENSHOT OF YOUR APP HERE 📸 -->
<!-- <img src="docs/screenshot.png" alt="DiskScanner Turbo Interface" width="800"/> -->

</div>

## ✨ Key Features

Unlike classic tools like *WinDirStat* or *TreeSize*, DiskScanner Turbo is designed for the modern user, developers, and gamers:

*   ⚡ **Ultra-Fast Scanning (Turbo Engine):** Uses `os.scandir` to communicate directly with the OS cache, scanning millions of files in seconds. Automatically filters out "black holes" like `.git` or `.env`.
*   📡 **Real-Time Feedback:** Forget about frozen loading screens. Thanks to **Server-Sent Events (SSE)**, you see exactly which folder is being analyzed millisecond by millisecond.
*   🗑️ **Built-in `node_modules` Destroyer:** Web developer? Find and purge gigabytes of old Node.js dependencies across your entire drive with a single click.
*   🤖 **Gradle Cache Cleaner:** Free up massive amounts of space by safely deleting the Android Studio build cache (`.gradle/caches`).
*   🎮 **Game Store Radar:** Automatically detects and groups massive installations from **Epic Games, Microsoft Store (Xbox), Steam, Riot Games, and Ubisoft**. Find those lost 150GB!
*   🧟 **Zombie File Hunter:** Finds files larger than 50 MB that haven't been opened or modified in over 1 year.
*   📊 **Report Export:** Instantly generate a detailed `.txt` report, processed 100% in the client's browser.
*   💎 **Premium Design:** Dark, fluid interface featuring a modern Glassmorphism UI.

## 📥 Installation and Usage

### Option 1: For Regular Users (Recommended)
You don't need to know how to code or install Python.

1. Go to the **[Releases](#)** section (Coming soon).
2. Download `DiskScannerTurbo.exe`.
3. Double-click it and you're done! It will open as a native Windows application.

### Option 2: For Developers (Source Code)
If you want to modify the code, run the local web server, or compile your own executable:

```bash
# 1. Clone the repository
git clone https://github.com/YOUR_USERNAME/DiskScannerWeb.git
cd DiskScannerWeb

# 2. Create a virtual environment (optional but recommended)
python -m venv venv
venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Start the desktop application (PyWebView)
python main.py

# (Optional) If you just want to run the web server on port 5000:
python app.py
```

## 🛠️ Compiling the Executable (.exe)
If you've made changes and want to generate your own portable `.exe` using PyInstaller:

```bash
pip install pyinstaller
pyinstaller --noconsole --onefile --name "DiskScannerTurbo" --add-data "templates;templates" --add-data "static;static" main.py
```
The final file will be located in the `dist/` folder.

## 🧠 Tech Architecture
*   **Backend:** Python 3, Flask, Python generators for data streaming (SSE).
*   **Frontend:** HTML5, Vanilla JavaScript, CSS3 (Custom Glassmorphism design).
*   **Data Visualization:** Apache ECharts (Interactive Treemap).
*   **Desktop Wrapper:** PyWebView to integrate the web server into a native OS window without needing browsers.

## 🤝 Contributing
PRs (Pull Requests) are welcome! If you have ideas for new "1-Click Cleaners" (e.g. Docker, pip cache, etc.) or performance improvements, feel free to contribute.

## 📄 License
This project is licensed under the MIT License. Feel free to use it, modify it, and share it.
