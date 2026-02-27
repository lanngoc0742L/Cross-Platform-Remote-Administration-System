#ifdef _WIN32

#include "ProcessControl_WIN.h"
#include "Converter.h"


std::string WinProcessController::listProcesses() {
    std::wstringstream ans;
    procList.clear();

    HANDLE snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (snapshot == INVALID_HANDLE_VALUE) {
        std::cerr << "Cannot take process snapshot\n";
        return "Failed\n";
    }

    PROCESSENTRY32W entry{};
    entry.dwSize = sizeof(entry);

    if (Process32FirstW(snapshot, &entry)) {
        int i = 0;
        do {
            WinProcess p;
            p.pid = entry.th32ProcessID;
            p.exeName = entry.szExeFile;
            procList.push_back(p);

            ans << i++ << L". PID: " << entry.th32ProcessID
                       << L" | Name: " << entry.szExeFile << std::endl;
        } while (Process32NextW(snapshot, &entry));
    }

    CloseHandle(snapshot);
    return ws_to_utf8(ans.str());
}


WinProcess WinProcessController::getProcess(int i) {
    if (procList.size() == 0)
        listProcesses();
    
    if (i < 0 || i >= procList.size())
        return {};
    
    return procList[i];
}


bool WinProcessController::startProcess(const WinProcess& proc) {
    listProcesses();
    STARTUPINFOW si = { sizeof(si) };
    PROCESS_INFORMATION pi;

    BOOL success = CreateProcessW(
        proc.exeName.c_str(),
        NULL,
        NULL, NULL, FALSE,
        0, NULL, NULL,
        &si, &pi
    );

    if (!success) {
        return false;
    }

    CloseHandle(pi.hProcess);
    CloseHandle(pi.hThread);
    return true;
}


bool WinProcessController::stopProcess(const WinProcess& proc) {
    DWORD currentPid = GetCurrentProcessId();
    
    // Don't allow killing agent process
    if (proc.pid == currentPid) {
        return false;
    }
    
    HANDLE hProc = OpenProcess(PROCESS_TERMINATE, FALSE, proc.pid);

    if (!hProc) {
        return false;
    }

    if (!TerminateProcess(hProc, 0)) {
        CloseHandle(hProc);
        return false;
    }

    CloseHandle(hProc);
    return true;
}

#endif