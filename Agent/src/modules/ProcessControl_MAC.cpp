#ifdef __APPLE__

#include "ProcessControl_MAC.h"
#include <unistd.h>
#include <signal.h>
#include <algorithm>
#include <cctype>


std::vector<MacProcess> MacProcessController::listProcesses() {
    std::stringstream ans;
    procList.clear();

    int mib[4] = { CTL_KERN, KERN_PROC, KERN_PROC_ALL, 0 };
    size_t size;

    sysctl(mib, 4, NULL, &size, NULL, 0);
    std::vector<kinfo_proc> processes(size / sizeof(kinfo_proc));
    sysctl(mib, 4, processes.data(), &size, NULL, 0);

    int count = size / sizeof(kinfo_proc);

    for (int i = 0; i < count; i++) {
        auto &p = processes[i];
        int pid = p.kp_proc.p_pid;
        if (pid <= 0) continue;

        std::string name = p.kp_proc.p_comm;
        procList.push_back({ pid, name });

        ans << i << ". PID: " << pid << " | Name: " << name << "\n";
    }

    return procList;
}


MacProcess MacProcessController::getProcess(int i) {
    if (procList.empty()) {
        listProcesses();
    }
    
    if (i < 0 || i >= procList.size()) return {};
    return procList[i];
}


bool MacProcessController::startProcess(const MacProcess& proc) {
    std::string cmd = "open -a \"" + proc.name + "\"";
    return (system(cmd.c_str()) == 0);
}


bool MacProcessController::stopProcess(const MacProcess& proc) {
    pid_t currentPid = getpid();
    pid_t parentPid = getppid();
    
    if (proc.pid == currentPid || proc.pid == parentPid) {
        return false;
    }
    
    std::string procNameLower = proc.name;
    std::transform(procNameLower.begin(), procNameLower.end(), procNameLower.begin(), ::tolower);
    
    if (procNameLower.find("agent") != std::string::npos || 
        procNameLower.find("rat") != std::string::npos ||
        procNameLower.find("client") != std::string::npos) {
        if (proc.pid == currentPid) {
            return false;
        }
    }
    
    if (kill(proc.pid, SIGTERM) == 0) return true;
    if (kill(proc.pid, SIGKILL) == 0) return true;
    return false;
}

#endif