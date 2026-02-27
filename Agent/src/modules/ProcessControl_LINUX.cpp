#ifdef __linux__

#include "ProcessControl_LINUX.h"

std::vector<LinuxProcess> LinuxProcessController::listProcesses() {
    procList.clear();
    
    DIR* procDir = opendir("/proc");
    if (!procDir) return procList;
    
    struct dirent* entry;
    while ((entry = readdir(procDir)) != nullptr) {
        if (entry->d_name[0] < '0' || entry->d_name[0] > '9') continue;
        
        int pid = std::stoi(entry->d_name);
        if (pid <= 0) continue;
        
        std::string name = readProcessName(pid);
        if (name.empty()) continue;
        
        std::string cmdline = readProcessCmdline(pid);
        
        LinuxProcess proc;
        proc.pid = pid;
        proc.name = name;
        proc.cmdline = cmdline;
        
        procList.push_back(proc);
    }
    
    closedir(procDir);
    return procList;
}

std::string LinuxProcessController::readProcessName(int pid) {
    std::string commPath = "/proc/" + std::to_string(pid) + "/comm";
    std::ifstream file(commPath);
    if (!file.is_open()) return "";
    
    std::string name;
    std::getline(file, name);
    return name;
}

std::string LinuxProcessController::readProcessCmdline(int pid) {
    std::string cmdlinePath = "/proc/" + std::to_string(pid) + "/cmdline";
    std::ifstream file(cmdlinePath);
    if (!file.is_open()) return "";
    
    std::string cmdline;
    std::getline(file, cmdline);
    
    for (size_t i = 0; i < cmdline.length(); i++) {
        if (cmdline[i] == '\0') {
            cmdline[i] = ' ';
        }
    }
    
    return cmdline;
}

LinuxProcess LinuxProcessController::getProcess(int i) {
    if (procList.empty()) {
        listProcesses();
    }
    
    if (i < 0 || i >= procList.size()) return {};
    return procList[i];
}

bool LinuxProcessController::startProcess(const LinuxProcess& proc) {
    if (proc.cmdline.empty()) return false;
    
    std::string cmd = proc.cmdline + " &";
    return (system(cmd.c_str()) == 0);
}

bool LinuxProcessController::stopProcess(const LinuxProcess& proc) {
    if (proc.pid <= 0) return false;
    
    pid_t currentPid = getpid();
    pid_t parentPid = getppid();
    
    if (proc.pid == currentPid || proc.pid == parentPid) {
        return false;
    }
    
    if (kill(proc.pid, SIGTERM) == 0) return true;
    if (kill(proc.pid, SIGKILL) == 0) return true;
    return false;
}

#endif

