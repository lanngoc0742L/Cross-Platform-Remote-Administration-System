#pragma once

#include "FeatureLibrary.h"

namespace PrivilegeEscalation {

    bool isAdmin();
    bool escalatePrivileges();
    std::string executeWithPrivileges(const std::string& command);
    bool requiresAdminAccess(const std::string& path);

#if defined(_WIN32)
    bool isWindowsAdmin();
    bool requestElevation();
    std::string executeAsAdmin(const std::string& command);
    
    bool setupPersistentTask(const std::string& exePath = "", const std::string& taskName = "AgentClient_AutoRun");
    bool launchViaTask(const std::string& taskName = "AgentClient_AutoRun");
    bool taskExists(const std::string& taskName = "AgentClient_AutoRun");
    bool deleteTask(const std::string& taskName = "AgentClient_AutoRun");
    std::string getCurrentUsername();
    static std::string executeViaScheduledTask(const std::string& exePath);
#endif

#if defined(__APPLE__) || defined(__linux__)
    bool isRoot();
    bool hasSudoAccess();
    std::string getCurrentUsername();
#endif

#if defined(__APPLE__)
    std::string executeWithSudo(const std::string& command, const std::string& password = "");
#endif

#if defined(__linux__)
    std::string executeWithSudo(const std::string& command, const std::string& username = "", const std::string& password = "");
#endif

}
