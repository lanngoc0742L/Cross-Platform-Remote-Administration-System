#pragma once

#ifdef __linux__

#include "FeatureLibrary.h"

struct LinuxApp {
    std::string name;
    std::string path;
    std::string exec;
    NLOHMANN_DEFINE_TYPE_INTRUSIVE(LinuxApp, name, path, exec)
};

class LinuxAppController {
private:
    std::vector<LinuxApp> appList;
public:
    std::vector<LinuxApp> listApps();
    LinuxApp getApp(int index);
    bool startApp(const LinuxApp& app);
    bool stopApp(const LinuxApp& app);
private:
    void scanDesktopFiles(const std::string& dir);
    std::string parseDesktopFile(const std::string& filePath);
};

#endif

