#pragma once
#include "FeatureLibrary.h"

class GatewayDiscovery {
public:
    static std::pair<std::string, std::string> discoverViaUDP(int timeoutMs = 3000);
private:
    static std::string getLocalIP();
    static bool sendDiscoveryBroadcast();
    static std::pair<std::string, std::string> waitForDiscoveryResponse(int timeoutMs);
};
