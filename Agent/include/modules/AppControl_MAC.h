#pragma once

#ifdef __APPLE__

#include "utils/FeatureLibrary.h"

struct MacApp {
    std::string name;
    std::string path;
    NLOHMANN_DEFINE_TYPE_INTRUSIVE(MacApp, name, path)
};

class MacAppController {
private:
    std::vector<MacApp> appList;
public:
    std::vector<MacApp> listApps();
    MacApp getApp(int index);
    bool startApp(const MacApp& app);
    bool stopApp(const MacApp& app);
};

#endif