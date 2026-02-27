#include "SystemInfoController.hpp"

std::string SystemInfoController::trim(const std::string& s) {
    auto start = s.find_first_not_of(" \t\r\n");
    auto end = s.find_last_not_of(" \t\r\n");
    return (start == std::string::npos) ? "" : s.substr(start, end - start + 1);
}

json SystemInfoController::getSystemSpecs() {
    json info;
    info["os"] = "Unknown";
    #ifdef _WIN32
        info["os"] = "Windows";
    #elif __APPLE__
        info["os"] = "macOS";
    #elif __linux__
        info["os"] = "Linux";
    #endif

    info["cpu"] = getCpuInfo();
    info["ram"] = getRamInfo();
    info["disk"] = getDiskInfo();
    info["network"] = getNetworkInfo();
    info["battery"] = getBatteryInfo();
    info["display"] = getDisplayInfo();

    return info;
}

json SystemInfoController::getDisplayInfo() {
    json display;
    display["width"] = 1920; 
    display["height"] = 1080;

#ifdef _WIN32
    display["width"] = GetSystemMetrics(SM_CXSCREEN);
    display["height"] = GetSystemMetrics(SM_CYSCREEN);
#elif __APPLE__
    auto mainDisplayId = CGMainDisplayID();
    display["width"] = (int)CGDisplayPixelsWide(mainDisplayId);
    display["height"] = (int)CGDisplayPixelsHigh(mainDisplayId);
#elif __linux__
    Display* d = XOpenDisplay(NULL);
    if (d) {
        int screen = DefaultScreen(d);
        display["width"] = DisplayWidth(d, screen);
        display["height"] = DisplayHeight(d, screen);
        XCloseDisplay(d);
    }
#endif
    return display;
}

double SystemInfoController::getCpuLoadPercentage() {
#ifdef _WIN32
    static FILETIME preIdleTime = {0}, preKernelTime = {0}, preUserTime = {0};
    
    FILETIME idleTime, kernelTime, userTime;
    if (!GetSystemTimes(&idleTime, &kernelTime, &userTime)) return 0.0;

    if (preIdleTime.dwLowDateTime == 0 && preIdleTime.dwHighDateTime == 0) {
        preIdleTime = idleTime;
        preKernelTime = kernelTime;
        preUserTime = userTime;
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
        GetSystemTimes(&idleTime, &kernelTime, &userTime);
    }

    auto toUInt64 = [](const FILETIME& ft) {
        return ((uint64_t)ft.dwHighDateTime << 32) | ft.dwLowDateTime;
    };

    uint64_t idle = toUInt64(idleTime) - toUInt64(preIdleTime);
    uint64_t kernel = toUInt64(kernelTime) - toUInt64(preKernelTime);
    uint64_t user = toUInt64(userTime) - toUInt64(preUserTime);

    preIdleTime = idleTime;
    preKernelTime = kernelTime;
    preUserTime = userTime;

    uint64_t total = kernel + user;
    if (total == 0) return 0.0;
    return (double)(total - idle) * 100.0 / total;

#elif __APPLE__
    host_cpu_load_info_data_t cpuinfo;
    mach_msg_type_number_t count = HOST_CPU_LOAD_INFO_COUNT;
    if (host_statistics(mach_host_self(), HOST_CPU_LOAD_INFO, (host_info_t)&cpuinfo, &count) == KERN_SUCCESS) {
        static unsigned long long prev_user = 0, prev_nice = 0, prev_system = 0, prev_idle = 0;
        unsigned long long user = cpuinfo.cpu_ticks[CPU_STATE_USER];
        unsigned long long nice = cpuinfo.cpu_ticks[CPU_STATE_NICE];
        unsigned long long system = cpuinfo.cpu_ticks[CPU_STATE_SYSTEM];
        unsigned long long idle = cpuinfo.cpu_ticks[CPU_STATE_IDLE];

        unsigned long long total = (user - prev_user) + (nice - prev_nice) + (system - prev_system) + (idle - prev_idle);
        double usage = 0.0;
        if (total > 0) {
            usage = (double)((total - (idle - prev_idle)) * 100.0 / total);
        }
        
        prev_user = user; prev_nice = nice; prev_system = system; prev_idle = idle;
        return usage;
    }
    return 0.0;

#elif __linux__
    std::ifstream file("/proc/stat");
    std::string line;
    if (std::getline(file, line)) {
        std::istringstream ss(line);
        std::string cpu;
        unsigned long long user, nice, system, idle, iowait, irq, softirq, steal;
        ss >> cpu >> user >> nice >> system >> idle >> iowait >> irq >> softirq >> steal;
        
        static unsigned long long prev_idle = 0, prev_total = 0;
        unsigned long long total = user + nice + system + idle + iowait + irq + softirq + steal;
        unsigned long long total_idle = idle + iowait;

        unsigned long long diff_total = total - prev_total;
        unsigned long long diff_idle = total_idle - prev_idle;

        double usage = 0.0;
        if (diff_total > 0) {
             usage = (double)(diff_total - diff_idle) * 100.0 / diff_total;
        }

        prev_total = total;
        prev_idle = total_idle;
        return usage;
    }
    return 0.0;
#endif
    return 0.0;
}

json SystemInfoController::getCpuInfo() {
    json info;
    info["model"] = "Unknown CPU";
    info["load_percent"] = getCpuLoadPercentage();

#ifdef _WIN32
    HKEY hKey;
    if (RegOpenKeyExA(HKEY_LOCAL_MACHINE, "HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0", 0, KEY_READ, &hKey) == ERROR_SUCCESS) {
        char buffer[1024];
        DWORD bufferSize = sizeof(buffer);
        if (RegQueryValueExA(hKey, "ProcessorNameString", NULL, NULL, (LPBYTE)buffer, &bufferSize) == ERROR_SUCCESS) {
            info["model"] = trim(buffer);
        }
        RegCloseKey(hKey);
    }
#elif __APPLE__
    char buffer[1024];
    size_t size = sizeof(buffer);
    if (sysctlbyname("machdep.cpu.brand_string", &buffer, &size, NULL, 0) == 0) {
        info["model"] = trim(buffer);
    }
#elif __linux__
    std::ifstream cpuFile("/proc/cpuinfo");
    std::string line;
    while (std::getline(cpuFile, line)) {
        if (line.find("model name") != std::string::npos) {
            size_t pos = line.find(":");
            if (pos != std::string::npos) info["model"] = trim(line.substr(pos + 1));
            break;
        }
    }
#endif
    return info;
}

json SystemInfoController::getRamInfo() {
    json info;
#ifdef _WIN32
    MEMORYSTATUSEX memInfo;
    memInfo.dwLength = sizeof(MEMORYSTATUSEX);
    GlobalMemoryStatusEx(&memInfo);
    info["total_mb"] = memInfo.ullTotalPhys / (1024 * 1024);
    info["used_mb"] = (memInfo.ullTotalPhys - memInfo.ullAvailPhys) / (1024 * 1024);
    info["usage_percent"] = memInfo.dwMemoryLoad;
#elif __APPLE__
    int64_t total_mem = 0;
    size_t size = sizeof(total_mem);
    sysctlbyname("hw.memsize", &total_mem, &size, NULL, 0);
    info["total_mb"] = total_mem / (1024 * 1024);

    vm_statistics64_data_t vm_stats;
    mach_msg_type_number_t count = HOST_VM_INFO64_COUNT;
    if (host_statistics64(mach_host_self(), HOST_VM_INFO64, (host_info64_t)&vm_stats, &count) == KERN_SUCCESS) {
        vm_size_t page_size;
        host_page_size(mach_host_self(), &page_size);
        long long used = (long long)(vm_stats.active_count + vm_stats.wire_count) * page_size;
        info["used_mb"] = used / (1024 * 1024);
        info["usage_percent"] = (total_mem > 0) ? (info["used_mb"].get<long>() * 100 / (total_mem / (1024 * 1024))) : 0;
    }
#elif __linux__
    struct sysinfo si;
    if (sysinfo(&si) == 0) {
        long long total = (long long)si.totalram * si.mem_unit;
        long long free = (long long)si.freeram * si.mem_unit;
        long long used = total - free; 
        info["total_mb"] = total / (1024 * 1024);
        info["used_mb"] = used / (1024 * 1024);
        info["usage_percent"] = (total > 0) ? (used * 100 / total) : 0;
    }
#endif
    return info;
}

json SystemInfoController::getDiskInfo() {
    json disks = json::array();

#ifdef _WIN32
    DWORD drives = GetLogicalDrives();
    for (char letter = 'A'; letter <= 'Z'; ++letter) {
        if (drives & 1) {
            std::string rootPath = std::string(1, letter) + ":\\";
            ULARGE_INTEGER freeBytes, totalBytes, totalFree;
            if (GetDiskFreeSpaceExA(rootPath.c_str(), &freeBytes, &totalBytes, &totalFree)) {
                json d;
                d["name"] = rootPath;
                d["total_gb"] = totalBytes.QuadPart / (1024 * 1024 * 1024);
                d["free_gb"] = totalFree.QuadPart / (1024 * 1024 * 1024);
                disks.push_back(d);
            }
        }
        drives >>= 1;
    }
#elif __APPLE__ || __linux__
    #ifdef __APPLE__
        struct statfs* mounts;
        int count = getmntinfo(&mounts, MNT_WAIT);
        for (int i = 0; i < count; i++) {
            json d;
            d["name"] = mounts[i].f_mntonname;
            long long total = (long long)mounts[i].f_blocks * mounts[i].f_bsize;
            long long free = (long long)mounts[i].f_bfree * mounts[i].f_bsize;
            d["total_gb"] = total / (1024 * 1024 * 1024);
            d["free_gb"] = free / (1024 * 1024 * 1024);
            disks.push_back(d);
        }
    #else
        std::ifstream mounts("/proc/mounts");
        std::string line;
        while(std::getline(mounts, line)) {
            std::stringstream ss(line);
            std::string device, mountpoint, fsType;
            ss >> device >> mountpoint >> fsType;
            if (device.find("/dev/sd") == 0 || device.find("/dev/nvme") == 0) {
                struct statvfs stat;
                if (statvfs(mountpoint.c_str(), &stat) == 0) {
                    json d;
                    d["name"] = mountpoint;
                    unsigned long long total = (unsigned long long)stat.f_blocks * stat.f_frsize;
                    unsigned long long free = (unsigned long long)stat.f_bavail * stat.f_frsize;
                    d["total_gb"] = total / (1024 * 1024 * 1024);
                    d["free_gb"] = free / (1024 * 1024 * 1024);
                    disks.push_back(d);
                }
            }
        }
    #endif
#endif
    return disks;
}

json SystemInfoController::getNetworkInfo() {
    json nets = json::array();

#ifdef _WIN32
    ULONG outBufLen = 15000;
    PIP_ADAPTER_ADDRESSES pAddresses = (PIP_ADAPTER_ADDRESSES)malloc(outBufLen);
    
    if (GetAdaptersAddresses(AF_UNSPEC, GAA_FLAG_INCLUDE_PREFIX, NULL, pAddresses, &outBufLen) == NO_ERROR) {
        PIP_ADAPTER_ADDRESSES pCurrAddresses = pAddresses;
        while (pCurrAddresses) {
            if (pCurrAddresses->OperStatus == IfOperStatusUp && pCurrAddresses->IfType != IF_TYPE_SOFTWARE_LOOPBACK) {
                json n;
                std::wstring ws(pCurrAddresses->FriendlyName);
                n["interface"] = std::string(ws.begin(), ws.end());
                
                char mac[18] = {0};
                if (pCurrAddresses->PhysicalAddressLength == 6) {
                    sprintf(mac, "%02X:%02X:%02X:%02X:%02X:%02X", 
                        pCurrAddresses->PhysicalAddress[0], pCurrAddresses->PhysicalAddress[1],
                        pCurrAddresses->PhysicalAddress[2], pCurrAddresses->PhysicalAddress[3],
                        pCurrAddresses->PhysicalAddress[4], pCurrAddresses->PhysicalAddress[5]);
                }
                n["mac"] = mac;

                PIP_ADAPTER_UNICAST_ADDRESS pUnicast = pCurrAddresses->FirstUnicastAddress;
                while (pUnicast) {
                    if (pUnicast->Address.lpSockaddr->sa_family == AF_INET) {
                        char ip[INET_ADDRSTRLEN];
                        getnameinfo(pUnicast->Address.lpSockaddr, pUnicast->Address.iSockaddrLength, ip, sizeof(ip), NULL, 0, NI_NUMERICHOST);
                        n["ipv4"] = ip;
                    }
                    pUnicast = pUnicast->Next;
                }
                nets.push_back(n);
            }
            pCurrAddresses = pCurrAddresses->Next;
        }
    }
    free(pAddresses);

#elif __APPLE__ || __linux__
    struct ifaddrs *ifaddr, *ifa;
    if (getifaddrs(&ifaddr) == -1) return nets;

    std::map<std::string, json> netMap;

    for (ifa = ifaddr; ifa != NULL; ifa = ifa->ifa_next) {
        if (ifa->ifa_addr == NULL) continue;
        
        if (ifa->ifa_flags & IFF_LOOPBACK) continue;

        std::string ifName = ifa->ifa_name;
        
        if (ifa->ifa_addr->sa_family == AF_INET) {
             char host[NI_MAXHOST];
             if (getnameinfo(ifa->ifa_addr, sizeof(struct sockaddr_in), host, NI_MAXHOST, NULL, 0, NI_NUMERICHOST) == 0) {
                 netMap[ifName]["interface"] = ifName;
                 netMap[ifName]["ipv4"] = host;
                 if (!netMap[ifName].contains("mac")) netMap[ifName]["mac"] = "N/A";
             }
        }
        
        #ifdef __APPLE__
            if (ifa->ifa_addr->sa_family == AF_LINK) {
                struct sockaddr_dl* sdl = (struct sockaddr_dl*)ifa->ifa_addr;
                unsigned char* mac = (unsigned char*)LLADDR(sdl);
                if (sdl->sdl_alen == 6) {
                    char macStr[18];
                    sprintf(macStr, "%02X:%02X:%02X:%02X:%02X:%02X", 
                        mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
                    netMap[ifName]["mac"] = macStr;
                    netMap[ifName]["interface"] = ifName;
                }
            }
        #elif __linux__
            if (ifa->ifa_addr->sa_family == AF_PACKET) {
            }
        #endif
    }
    
    #ifdef __linux__
    for (auto& [name, obj] : netMap) {
        if (obj["mac"] == "N/A" || obj["mac"].is_null()) {
            std::string macPath = "/sys/class/net/" + name + "/address";
            std::ifstream macFile(macPath);
            std::string mac;
            if(std::getline(macFile, mac)) {
                 obj["mac"] = trim(mac);
            }
        }
    }
    #endif

    for (auto const& [name, val] : netMap) {
        if (val.contains("ipv4")) {
            nets.push_back(val);
        }
    }

    freeifaddrs(ifaddr);
#endif
    return nets;
}

json SystemInfoController::getBatteryInfo() {
    json bat;
    bat["status"] = "Unknown";
    bat["percent"] = 0;

#ifdef _WIN32
    SYSTEM_POWER_STATUS sps;
    if (GetSystemPowerStatus(&sps)) {
        bat["percent"] = (int)sps.BatteryLifePercent;
        bat["status"] = (sps.ACLineStatus == 1) ? "Charging/Plugged" : "Battery";
    }
#elif __APPLE__
    CFTypeRef blob = IOPSCopyPowerSourcesInfo();
    CFArrayRef sources = IOPSCopyPowerSourcesList(blob);
    if (CFArrayGetCount(sources) > 0) {
        CFDictionaryRef pSource = IOPSGetPowerSourceDescription(blob, CFArrayGetValueAtIndex(sources, 0));
        if (pSource) {
            CFNumberRef cap = (CFNumberRef)CFDictionaryGetValue(pSource, CFSTR(kIOPSCurrentCapacityKey));
            CFNumberRef max = (CFNumberRef)CFDictionaryGetValue(pSource, CFSTR(kIOPSMaxCapacityKey));
            int cur = 0, tot = 0;
            CFNumberGetValue(cap, kCFNumberIntType, &cur);
            CFNumberGetValue(max, kCFNumberIntType, &tot);
            
            if (tot > 0) bat["percent"] = (cur * 100) / tot;
            
            CFStringRef state = (CFStringRef)CFDictionaryGetValue(pSource, CFSTR(kIOPSPowerSourceStateKey));
            if (CFStringCompare(state, CFSTR(kIOPSACPowerValue), 0) == kCFCompareEqualTo) {
                bat["status"] = "Plugged In";
            } else {
                bat["status"] = "Discharging";
            }
        }
    }
    CFRelease(blob);
    CFRelease(sources);

#elif __linux__
    std::string path = "/sys/class/power_supply/BAT0/";
    std::ifstream fcap(path + "capacity");
    if (!fcap.good()) {
        path = "/sys/class/power_supply/BAT1/";
        fcap.open(path + "capacity");
    }
    
    if (fcap.is_open()) {
        int cap; fcap >> cap;
        bat["percent"] = cap;
        fcap.close();
        
        std::ifstream fstat(path + "status");
        std::string st;
        if (fstat >> st) bat["status"] = st;
    }
#endif
    return bat;
}
