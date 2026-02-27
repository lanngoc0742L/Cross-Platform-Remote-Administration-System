REMOTE ADMINISTRATION SYSTEM
==================================================================

PROJECT CONSISTS OF 2 MAIN COMPONENTS:
1. Gateway: Written in Node.js/TypeScript. Acts as the control server and Web Interface.
2. Agent : Written in C++ (using Boost.Asio). Runs on the target machine to collect information.

------------------------------------------------------------------
PART 1: GATEWAY (CONTROL SERVER)
------------------------------------------------------------------

A. SYSTEM REQUIREMENTS
- Node.js (Version 16 or higher)
- NPM or Yarn
- Supported OS: Windows, Linux, macOS(x64).

B. GATEWAY DIRECTORY STRUCTURE
Gateway/
|-- src/                     # TypeScript Source Code (Server logic)
|-- Website/                 # Admin Interface (HTML/CSS/JS)
|-- .env                     # Environment Config (Port, Token)
|-- package.json             # Dependencies manifest
|-- server.cert & server.key # (Must be generated manually for HTTPS/WSS)

C. INSTALLATION & RUNNING
1. Navigate to the Gateway directory:
   cd Gateway

2. Install dependencies:
   npm install

   * Note: The project uses "better-sqlite3". Installation may require 
     Python and C++ Build Tools on Windows to compile the native module.

3. Generate SSL Certificates (Required for HTTPS/WSS):
   You must generate a self-signed certificate to run the Gateway. Open your terminal in the `Gateway` directory and run:
   
   ```bash
   openssl req -nodes -new -x509 -keyout server.key -out server.cert -days 365

4. Configuration (Optional):
   Open the ".env" file to modify the port (PORT) or auth token (AUTH_TOKEN).
   Default: PORT=8080

5. Start the Server:
   npm start
   (Or use command: npx ts-node src/index.ts)

6. Access the Admin Interface:
   Open a browser and navigate to: https://<your ip>:8080
   (Note: You must use HTTPS as the project uses self-signed SSL)

------------------------------------------------------------------
PART 2: AGENT (CLIENT PROGRAM)
------------------------------------------------------------------

A. BUILD REQUIREMENTS (DEVELOPER)
- CMake (3.14 or higher)
- C++ Compiler supporting C++17 (MSVC on Windows, GCC/Clang on Linux/macOS)
- Vcpkg (C++ Package Manager)

B. REQUIRED LIBRARIES (Managed by vcpkg.json)
- Boost (Asio, System, Beast)
- OpenSSL
- nlohmann-json

C. BUILD INSTRUCTIONS
1. Navigate to the Agent directory:
   cd Agent

2. [WINDOWS ONLY] Set Environment Variable:
   **IMPORTANT**: You must set the environment variable "VCPKG_ROOT" pointing 
   to your vcpkg installation folder for the build system to locate libraries.
   
   Example:
   set VCPKG_ROOT=C:\path\to\vcpkg

3. Create build directory:
   mkdir build
   cd build

4. Run CMake (Point to the vcpkg toolchain):
   cmake .. -DCMAKE_TOOLCHAIN_FILE=[Path_to_vcpkg]/scripts/buildsystems/vcpkg.cmake

   * Note for Windows: If VCPKG_ROOT is set correctly, you might only need:
     cmake ..

5. Compile:
   cmake --build . --config Release

D. RUNNING THE AGENT (DEPLOYMENT)
After a successful build, you will have the "Agent" executable (or Agent.exe).
To run with full features, ensure the following files are in the same directory:

1. Agent.exe (The executable)
2. ffmpeg.exe (REQUIRED for Screen/Camera recording. Download from FFmpeg site)
3. "config" folder containing "config.txt" (Optional, if not using UDP Discovery)
4. (Windows only) OpenSSL DLLs: libssl-3-x64.dll, libcrypto-3-x64.dll

* Structure of config/config.txt:
  SERVER_HOST=192.168.1.X
  SERVER_PORT=8080
  AGENT_TOKEN=DEFAULT_AGENT_TOKEN_2024

------------------------------------------------------------------
PART 3: SYSTEM FEATURES
------------------------------------------------------------------

1. Visual Monitoring:
   - Dashboard displaying connected machines (Online/Offline).
   - Detailed info: Hostname, OS, IP, CPU, RAM, Disk.

2. File Manager:
   - Browse directory tree.
   - Upload/Download files.
   - Delete files.
   - File Encryption (AES).
   - Execute files.

3. Media:
   - Screen/Camera shot.
   - Screen/Camera Recording (Saved as MP4).

4. Process & Application Management:
   - View running Process list -> Start/Stop Process.
   - View installed Application list -> Start/Stop apps.

5. Keylogger:
   - Real-time keystroke logging.
   - Save logs to file.

6. Power Control:
   - Remote Shutdown, Restart, Sleep.

------------------------------------------------------------------
PART 4: IMPORTANT NOTES
------------------------------------------------------------------

1. Security:
   - The system uses SSL/TLS encryption (WSS).
   - Please secure the "server.key" and "server.cert" files carefully.

2. FFmpeg:
   - The Agent relies heavily on FFmpeg for Multimedia features.
   - On Linux/macOS: Install ffmpeg via terminal (apt install ffmpeg).
   - On Windows: Must place ffmpeg.exe in the same folder as Agent.exe.

3. Discovery:
   - Agent has an automatic Gateway discovery mode (UDP Broadcast).
   - If not found, it will read the config.txt file.

------------------------------------------------------------------
TECHNICAL TASK ALLOCATION
------------------------------------------------------------------

1. Ngoc Khanh (Backend, Core Architecture & Security)
   - Cross-Platform Infrastructure: Architected and set up the foundational system infrastructure, ensuring full compatibility across Windows, Linux, and macOS environments.
   - Comprehensive Feature Development: Engineered and deployed the core backend features and functionalities across all three operating systems.
   - OS-Specific System Modules: Developed the media capture (photo/video recording) and application/process management modules exclusively for Linux. Implemented the keystroke logging functionality for both Linux and macOS.
   - Data Stream Security: Integrated robust encryption protocols (SSL/TLS) to secure network communications, ensuring end-to-end protection and integrity of data streams in transit.

2. Tuan Khang (Frontend & Windows Operations)
   - User Interface: Developed the interactive web-based dashboard and managed the overall application interaction flow.
   - Windows Process Management: Engineered Windows-specific modules for application and process control, including listing, querying, execution, and termination tasks.

3. Minh Tri (System Monitoring & Integration)
   - Monitoring Modules: Implemented screen and webcam capture capabilities for Windows and macOS, and developed the keystroke logging module for Windows.
   - System Integration: Supported frontend-backend integration and refined the overall user interface experience.

------------------------------------------------------------------
DISCLAIMER
------------------------------------------------------------------
This software is designed for EDUCATIONAL and LEGAL SYSTEM ADMINISTRATION
purposes only. The author is not responsible for any misuse (such as 
installing on unauthorized machines). Please comply with local laws.
