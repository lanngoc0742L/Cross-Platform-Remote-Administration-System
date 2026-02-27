#ifdef __APPLE__

#include "AppControl_MAC.h"


std::vector<MacApp> MacAppController::listApps() {
    std::stringstream ans;
    appList.clear();

    std::vector<std::string> dirs = {
        "/Applications",
        "/System/Applications",
        std::string(getenv("HOME")) + "/Applications"
    };

    int i = 0;
    for (auto& d : dirs) {
        try {
            for (auto& p : std::filesystem::directory_iterator(d)) {
                if (p.path().extension() == ".app") {
                    MacApp app;
                    app.name = p.path().stem().string();
                    app.path = p.path().string();
                    appList.push_back(app);

                    ans << i++ << ". " << app.name << "\n";
                }
            }
        } catch (...) {}
    }

    return appList;
}


MacApp MacAppController::getApp(int index) {
    if (appList.empty()) {
        listApps();
    }

    if (index < 0 || index >= appList.size()) return {};
    return appList[index];
}


bool MacAppController::startApp(const MacApp& app) {
    if (app.path.empty()) return false;
    std::string cmd = "open \"" + app.path + "\"";
    return (system(cmd.c_str()) == 0);
}


bool MacAppController::stopApp(const MacApp& app) {
    if (app.name.empty()) return false;
    std::string quitCmd = "osascript -e 'tell application \"" + app.name + "\" to quit'";
    system(quitCmd.c_str());
    sleep(1);
    
    std::string killCmd = "pkill -x \"" + app.name + "\"";

    usleep(500000);
    std::string checkCmd = "pgrep -x \"" + app.name + "\" > /dev/null";
    int status = system(checkCmd.c_str());
    return (status != 0);
}

#endif