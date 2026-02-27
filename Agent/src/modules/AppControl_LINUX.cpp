#ifdef __linux__

#include "AppControl_LINUX.h"

std::vector<LinuxApp> LinuxAppController::listApps() {
    appList.clear();
    
    std::vector<std::string> dirs = {
        "/usr/share/applications",
        "/usr/local/share/applications",
        std::string(getenv("HOME")) + "/.local/share/applications"
    };
    
    for (auto& dir : dirs) {
        scanDesktopFiles(dir);
    }
    
    return appList;
}

void LinuxAppController::scanDesktopFiles(const std::string& dir) {
    DIR* d = opendir(dir.c_str());
    if (!d) return;
    
    struct dirent* entry;
    while ((entry = readdir(d)) != nullptr) {
        if (entry->d_name[0] == '.') continue;
        
        std::string filePath = dir + "/" + entry->d_name;
        if (filePath.substr(filePath.length() - 8) != ".desktop") continue;
        
        std::string exec = parseDesktopFile(filePath);
        if (exec.empty()) continue;
        
        LinuxApp app;
        app.name = entry->d_name;
        app.name = app.name.substr(0, app.name.length() - 8);
        app.path = filePath;
        app.exec = exec;
        
        appList.push_back(app);
    }
    
    closedir(d);
}

std::string LinuxAppController::parseDesktopFile(const std::string& filePath) {
    std::ifstream file(filePath);
    if (!file.is_open()) return "";
    
    std::string line;
    bool inDesktopEntry = false;
    std::string exec;
    
    while (std::getline(file, line)) {
        if (line == "[Desktop Entry]") {
            inDesktopEntry = true;
            continue;
        }
        
        if (!inDesktopEntry) continue;
        if (line.empty() || line[0] == '[') break;
        
        if (line.substr(0, 5) == "Exec=") {
            exec = line.substr(5);
            size_t pos = exec.find(" %");
            if (pos != std::string::npos) {
                exec = exec.substr(0, pos);
            }
            break;
        }
    }
    
    return exec;
}

LinuxApp LinuxAppController::getApp(int index) {
    if (appList.empty()) {
        listApps();
    }
    
    if (index < 0 || index >= appList.size()) return {};
    return appList[index];
}

bool LinuxAppController::startApp(const LinuxApp& app) {
    if (app.exec.empty()) return false;
    
    std::string cmd = app.exec + " &";
    return (system(cmd.c_str()) == 0);
}

bool LinuxAppController::stopApp(const LinuxApp& app) {
    if (app.name.empty()) return false;
    
    std::string killCmd = "pkill -f \"" + app.name + "\"";
    system(killCmd.c_str());
    sleep(1);
    
    std::string checkCmd = "pgrep -f \"" + app.name + "\" > /dev/null";
    int status = system(checkCmd.c_str());
    return (status != 0);
}

#endif

