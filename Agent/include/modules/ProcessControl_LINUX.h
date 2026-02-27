#pragma once

#ifdef __linux__

#include "FeatureLibrary.h"

struct LinuxProcess {
    int pid;
    std::string name;
    std::string cmdline;
};

NLOHMANN_DEFINE_TYPE_NON_INTRUSIVE(LinuxProcess, pid, name, cmdline)

class LinuxProcessController {
private:
    std::vector<LinuxProcess> procList;
public:
    std::vector<LinuxProcess> listProcesses();
    LinuxProcess getProcess(int i);
    bool startProcess(const LinuxProcess& proc);
    bool stopProcess(const LinuxProcess& proc);
private:
    std::string readProcessName(int pid);
    std::string readProcessCmdline(int pid);
};

#endif

