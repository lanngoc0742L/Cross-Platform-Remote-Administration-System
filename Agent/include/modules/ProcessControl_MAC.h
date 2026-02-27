#pragma once

#ifdef __APPLE__

#include "FeatureLibrary.h"

extern char **environ;

struct MacProcess {
    int pid;
    std::string name;
};

NLOHMANN_DEFINE_TYPE_NON_INTRUSIVE(MacProcess, name, pid)

class MacProcessController {
private:
    std::vector<MacProcess> procList;
public:
    std::vector<MacProcess> listProcesses();
    MacProcess getProcess(int i);
    bool startProcess(const MacProcess& proc);
    bool stopProcess(const MacProcess& proc);
};

#endif