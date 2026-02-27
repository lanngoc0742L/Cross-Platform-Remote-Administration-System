#pragma once
#include "FeatureLibrary.h"

using json = nlohmann::json;

class SystemInfoController {
public:
    static json getSystemSpecs();

private:
    static std::string trim(const std::string& s);
    static json getCpuInfo();
    static json getRamInfo();
    static json getDiskInfo();
    static json getNetworkInfo();
    static json getBatteryInfo();
    static json getDisplayInfo();
    static double getCpuLoadPercentage();
};
