#include "GatewayDiscovery.h"


const int DISCOVERY_PORT = 9999;
const char* DISCOVERY_REQUEST = "WHO_IS_GATEWAY?";
const char* DISCOVERY_RESPONSE_PREFIX = "I_AM_GATEWAY:";

static std::pair<std::string, std::string> parseDiscoveryResponse(
    const std::string& response, 
    const struct sockaddr_in& from) {
    
    std::pair<std::string, std::string> result = {"", ""};
    
    std::string data = response.substr(strlen(DISCOVERY_RESPONSE_PREFIX));
    
    size_t start = data.find_first_not_of(" \t\r\n");
    if (start != std::string::npos) {
        data = data.substr(start);
    }
    
    // Parse format: "IP:PORT" or "wss://IP:PORT" or "ws://IP:PORT"
    size_t protocolPos = data.find("://");
    if (protocolPos != std::string::npos) {
        size_t ipStart = data.find_first_not_of(" \t", protocolPos + 3);
        if (ipStart != std::string::npos) {
            data = data.substr(ipStart);
        }
    }
    
    size_t colon = data.find(':');
    if (colon != std::string::npos) {
        result.first = data.substr(0, colon);
        size_t portEnd = data.find_first_of(" \r\n\t", colon + 1);
        if (portEnd != std::string::npos) {
            result.second = data.substr(colon + 1, portEnd - colon - 1);
        } else {
            result.second = data.substr(colon + 1);
        }
    } else {
        #ifdef _WIN32
            char ip[INET_ADDRSTRLEN];
            inet_ntop(AF_INET, &from.sin_addr, ip, INET_ADDRSTRLEN);
            result.first = ip;
        #else
            char ip[INET_ADDRSTRLEN];
            inet_ntop(AF_INET, &from.sin_addr, ip, INET_ADDRSTRLEN);
            result.first = ip;
        #endif
        result.second = "8080";
    }
    
    return result;
}


std::string GatewayDiscovery::getLocalIP() {
    std::string ip;
    
    #ifdef _WIN32
        char hostname[256];
        if (gethostname(hostname, sizeof(hostname)) == 0) {
            struct hostent* host = gethostbyname(hostname);
            if (host != nullptr && host->h_addr_list[0] != nullptr) {
                struct in_addr addr;
                memcpy(&addr, host->h_addr_list[0], sizeof(struct in_addr));
                ip = inet_ntoa(addr);
            }
        }
    #else
        struct ifaddrs* ifaddr;
        if (getifaddrs(&ifaddr) == 0) {
            for (struct ifaddrs* ifa = ifaddr; ifa != nullptr; ifa = ifa->ifa_next) {
                if (ifa->ifa_addr == nullptr) continue;
                
                if (ifa->ifa_addr->sa_family == AF_INET) {
                    struct sockaddr_in* sa = (struct sockaddr_in*)ifa->ifa_addr;
                    char ipStr[INET_ADDRSTRLEN];
                    inet_ntop(AF_INET, &(sa->sin_addr), ipStr, INET_ADDRSTRLEN);
                    
                    std::string ipCandidate = ipStr;
                    if (ipCandidate != "127.0.0.1" && ipCandidate.find("169.254") != 0) {
                        ip = ipCandidate;
                        break;
                    }
                }
            }
            freeifaddrs(ifaddr);
        }
    #endif
    
    return ip;
}

bool GatewayDiscovery::sendDiscoveryBroadcast() {
    try {
        #ifdef _WIN32
            
            SOCKET sock = socket(AF_INET, SOCK_DGRAM, 0);
            if (sock == INVALID_SOCKET) {
                return false;
            }
            
            int broadcast = 1;
            if (setsockopt(sock, SOL_SOCKET, SO_BROADCAST, (char*)&broadcast, sizeof(broadcast)) == SOCKET_ERROR) {
                closesocket(sock);
                return false;
            }
            
            struct sockaddr_in addr;
            memset(&addr, 0, sizeof(addr));
            addr.sin_family = AF_INET;
            addr.sin_port = htons(DISCOVERY_PORT);
            addr.sin_addr.s_addr = INADDR_BROADCAST;
            
            int len = strlen(DISCOVERY_REQUEST);
            if (sendto(sock, DISCOVERY_REQUEST, len, 0, (struct sockaddr*)&addr, sizeof(addr)) == SOCKET_ERROR) {
                closesocket(sock);
                return false;
            }
            
            closesocket(sock);
            return true;
        #else
            int sock = socket(AF_INET, SOCK_DGRAM, 0);
            if (sock < 0) return false;
            
            int broadcast = 1;
            if (setsockopt(sock, SOL_SOCKET, SO_BROADCAST, &broadcast, sizeof(broadcast)) < 0) {
                close(sock);
                return false;
            }
            
            struct sockaddr_in addr;
            memset(&addr, 0, sizeof(addr));
            addr.sin_family = AF_INET;
            addr.sin_port = htons(DISCOVERY_PORT);
            addr.sin_addr.s_addr = INADDR_BROADCAST;
            
            int len = strlen(DISCOVERY_REQUEST);
            if (sendto(sock, DISCOVERY_REQUEST, len, 0, (struct sockaddr*)&addr, sizeof(addr)) < 0) {
                close(sock);
                return false;
            }
            
            close(sock);
            return true;
        #endif
    } catch (...) {
        return false;
    }
}

std::pair<std::string, std::string> GatewayDiscovery::waitForDiscoveryResponse(int timeoutMs) {
    std::pair<std::string, std::string> result = {"", ""};
    
    try {
        #ifdef _WIN32
            
            SOCKET sock = socket(AF_INET, SOCK_DGRAM, 0);
            if (sock == INVALID_SOCKET) {
                return result;
            }
            
            int reuse = 1;
            if (setsockopt(sock, SOL_SOCKET, SO_REUSEADDR, (char*)&reuse, sizeof(reuse)) == SOCKET_ERROR) {
                closesocket(sock);
                return result;
            }
            
            struct sockaddr_in bindAddr;
            memset(&bindAddr, 0, sizeof(bindAddr));
            bindAddr.sin_family = AF_INET;
            bindAddr.sin_port = 0;  
            bindAddr.sin_addr.s_addr = INADDR_ANY;
            
            if (::bind(sock, (struct sockaddr*)&bindAddr, sizeof(bindAddr)) == SOCKET_ERROR) {
                closesocket(sock);
                return result;
            }
            
            u_long mode = 1;
            ioctlsocket(sock, FIONBIO, &mode);
            
            fd_set readSet;
            struct timeval timeout;
            timeout.tv_sec = timeoutMs / 1000;
            timeout.tv_usec = (timeoutMs % 1000) * 1000;
            
            FD_ZERO(&readSet);
            FD_SET(sock, &readSet);
            
            int selectResult = select(0, &readSet, nullptr, nullptr, &timeout);
            if (selectResult > 0) {
                char buffer[256];
                struct sockaddr_in from;
                int fromLen = sizeof(from);
                int recvLen = recvfrom(sock, buffer, sizeof(buffer) - 1, 0, (struct sockaddr*)&from, &fromLen);
                
                if (recvLen > 0) {
                    buffer[recvLen] = '\0';
                    std::string response = buffer;
                    
                    if (response.find(DISCOVERY_RESPONSE_PREFIX) == 0) {
                        result = parseDiscoveryResponse(response, from);
                    }
                }
            }
            
            closesocket(sock);
        #else
            int sock = socket(AF_INET, SOCK_DGRAM, 0);
            if (sock < 0) return result;
            
            int reuse = 1;
            if (setsockopt(sock, SOL_SOCKET, SO_REUSEADDR, &reuse, sizeof(reuse)) < 0) {
                close(sock);
                return result;
            }
            
            struct sockaddr_in bindAddr;
            memset(&bindAddr, 0, sizeof(bindAddr));
            bindAddr.sin_family = AF_INET;
            bindAddr.sin_port = 0; 
            bindAddr.sin_addr.s_addr = INADDR_ANY;
            
            if (::bind(sock, (struct sockaddr*)&bindAddr, sizeof(bindAddr)) < 0) {
                close(sock);
                return result;
            }
            
            // Set non-blocking mode
            int flags = fcntl(sock, F_GETFL, 0);
            fcntl(sock, F_SETFL, flags | O_NONBLOCK);
            
            // Wait for response with timeout
            struct timeval timeout;
            timeout.tv_sec = timeoutMs / 1000;
            timeout.tv_usec = (timeoutMs % 1000) * 1000;
            
            fd_set readSet;
            FD_ZERO(&readSet);
            FD_SET(sock, &readSet);
            
            if (select(sock + 1, &readSet, nullptr, nullptr, &timeout) > 0) {
                char buffer[256];
                struct sockaddr_in from;
                socklen_t fromLen = sizeof(from);
                int recvLen = recvfrom(sock, buffer, sizeof(buffer) - 1, 0, (struct sockaddr*)&from, &fromLen);
                
                if (recvLen > 0) {
                    buffer[recvLen] = '\0';
                    std::string response = buffer;
                    
                    if (response.find(DISCOVERY_RESPONSE_PREFIX) == 0) {
                        result = parseDiscoveryResponse(response, from);
                    }
                }
            }
            
            close(sock);
        #endif
    } catch (...) {
    }
    
    return result;
}

std::pair<std::string, std::string> GatewayDiscovery::discoverViaUDP(int timeoutMs) {
    std::pair<std::string, std::string> result = {"", ""};
    
    try {
        #ifdef _WIN32
            
            SOCKET sock = socket(AF_INET, SOCK_DGRAM, 0);
            if (sock == INVALID_SOCKET) {
                return result;
            }
            
            int reuse = 1;
            if (setsockopt(sock, SOL_SOCKET, SO_REUSEADDR, (char*)&reuse, sizeof(reuse)) == SOCKET_ERROR) {
                closesocket(sock);
                return result;
            }
            
            struct sockaddr_in bindAddr;
            memset(&bindAddr, 0, sizeof(bindAddr));
            bindAddr.sin_family = AF_INET;
            bindAddr.sin_port = 0;
            bindAddr.sin_addr.s_addr = INADDR_ANY;
            
            if (::bind(sock, (struct sockaddr*)&bindAddr, sizeof(bindAddr)) == SOCKET_ERROR) {
                closesocket(sock);
                return result;
            }
            
            int broadcast = 1;
            if (setsockopt(sock, SOL_SOCKET, SO_BROADCAST, (char*)&broadcast, sizeof(broadcast)) == SOCKET_ERROR) {
                closesocket(sock);
                return result;
            }
            
            u_long mode = 1;
            ioctlsocket(sock, FIONBIO, &mode);
            
            struct sockaddr_in sendAddr;
            memset(&sendAddr, 0, sizeof(sendAddr));
            sendAddr.sin_family = AF_INET;
            sendAddr.sin_port = htons(DISCOVERY_PORT);
            sendAddr.sin_addr.s_addr = INADDR_BROADCAST;
            
            int len = strlen(DISCOVERY_REQUEST);
            sendto(sock, DISCOVERY_REQUEST, len, 0, (struct sockaddr*)&sendAddr, sizeof(sendAddr));
            
            std::this_thread::sleep_for(std::chrono::milliseconds(100));
            
            fd_set readSet;
            struct timeval timeout;
            timeout.tv_sec = timeoutMs / 1000;
            timeout.tv_usec = (timeoutMs % 1000) * 1000;
            
            FD_ZERO(&readSet);
            FD_SET(sock, &readSet);
            
            int selectResult = select(0, &readSet, nullptr, nullptr, &timeout);
            if (selectResult > 0) {
                char buffer[256];
                struct sockaddr_in from;
                int fromLen = sizeof(from);
                int recvLen = recvfrom(sock, buffer, sizeof(buffer) - 1, 0, (struct sockaddr*)&from, &fromLen);
                
                if (recvLen > 0) {
                    buffer[recvLen] = '\0';
                    std::string response = buffer;
                    
                    if (response.find(DISCOVERY_RESPONSE_PREFIX) == 0) {
                        std::string data = response.substr(strlen(DISCOVERY_RESPONSE_PREFIX));
                        
                        // Trim whitespace
                        size_t start = data.find_first_not_of(" \t\r\n");
                        if (start != std::string::npos) {
                            data = data.substr(start);
                        }
                        
                        // Parse format: "IP:PORT" or "wss://IP:PORT" or "ws://IP:PORT"
                        size_t protocolPos = data.find("://");
                        if (protocolPos != std::string::npos) {
                            // Has protocol prefix, skip it
                            size_t ipStart = data.find_first_not_of(" \t", protocolPos + 3);
                            if (ipStart != std::string::npos) {
                                data = data.substr(ipStart);
                                }
                            }
                        
                        // Parse IP:PORT
                            size_t colon = data.find(':');
                            if (colon != std::string::npos) {
                                result.first = data.substr(0, colon);
                                size_t portEnd = data.find_first_of(" \r\n\t", colon + 1);
                                if (portEnd != std::string::npos) {
                                    result.second = data.substr(colon + 1, portEnd - colon - 1);
                                } else {
                                    result.second = data.substr(colon + 1);
                                }
                            } else {
                            // No port specified, use sender IP and default port
                                char ip[INET_ADDRSTRLEN];
                                inet_ntop(AF_INET, &from.sin_addr, ip, INET_ADDRSTRLEN);
                                result.first = ip;
                                result.second = "8080";
                        }
                    }
                }
            }
            
            closesocket(sock);
        #else
            int sock = socket(AF_INET, SOCK_DGRAM, 0);
            if (sock < 0) return result;
            
            int reuse = 1;
            if (setsockopt(sock, SOL_SOCKET, SO_REUSEADDR, &reuse, sizeof(reuse)) < 0) {
                close(sock);
                return result;
            }
            
            struct sockaddr_in bindAddr;
            memset(&bindAddr, 0, sizeof(bindAddr));
            bindAddr.sin_family = AF_INET;
            bindAddr.sin_port = 0;
            bindAddr.sin_addr.s_addr = INADDR_ANY;
            
            if (::bind(sock, (struct sockaddr*)&bindAddr, sizeof(bindAddr)) < 0) {
                close(sock);
                return result;
            }
            
            int broadcast = 1;
            if (setsockopt(sock, SOL_SOCKET, SO_BROADCAST, &broadcast, sizeof(broadcast)) < 0) {
                close(sock);
                return result;
            }
            
            int flags = fcntl(sock, F_GETFL, 0);
            fcntl(sock, F_SETFL, flags | O_NONBLOCK);
            
            struct sockaddr_in sendAddr;
            memset(&sendAddr, 0, sizeof(sendAddr));
            sendAddr.sin_family = AF_INET;
            sendAddr.sin_port = htons(DISCOVERY_PORT);
            sendAddr.sin_addr.s_addr = INADDR_BROADCAST;
            
            int len = strlen(DISCOVERY_REQUEST);
            sendto(sock, DISCOVERY_REQUEST, len, 0, (struct sockaddr*)&sendAddr, sizeof(sendAddr));
            
            std::this_thread::sleep_for(std::chrono::milliseconds(100));
            
            struct timeval timeout;
            timeout.tv_sec = timeoutMs / 1000;
            timeout.tv_usec = (timeoutMs % 1000) * 1000;
            
            fd_set readSet;
            FD_ZERO(&readSet);
            FD_SET(sock, &readSet);
            
            if (select(sock + 1, &readSet, nullptr, nullptr, &timeout) > 0) {
                char buffer[256];
                struct sockaddr_in from;
                socklen_t fromLen = sizeof(from);
                int recvLen = recvfrom(sock, buffer, sizeof(buffer) - 1, 0, (struct sockaddr*)&from, &fromLen);
                
                if (recvLen > 0) {
                    buffer[recvLen] = '\0';
                    std::string response = buffer;
                    
                    if (response.find(DISCOVERY_RESPONSE_PREFIX) == 0) {
                        std::string data = response.substr(strlen(DISCOVERY_RESPONSE_PREFIX));
                        
                        // Trim whitespace
                        size_t start = data.find_first_not_of(" \t\r\n");
                        if (start != std::string::npos) {
                            data = data.substr(start);
                        }
                        
                        // Parse format: "IP:PORT" or "wss://IP:PORT" or "ws://IP:PORT"
                        size_t protocolPos = data.find("://");
                        if (protocolPos != std::string::npos) {
                            // Has protocol prefix, skip it
                            size_t ipStart = data.find_first_not_of(" \t", protocolPos + 3);
                            if (ipStart != std::string::npos) {
                                data = data.substr(ipStart);
                                }
                            }
                        
                            size_t colon = data.find(':');
                            if (colon != std::string::npos) {
                                result.first = data.substr(0, colon);
                                size_t portEnd = data.find_first_of(" \r\n\t", colon + 1);
                                if (portEnd != std::string::npos) {
                                    result.second = data.substr(colon + 1, portEnd - colon - 1);
                                } else {
                                    result.second = data.substr(colon + 1);
                                }
                            } else {
                                char ip[INET_ADDRSTRLEN];
                                inet_ntop(AF_INET, &from.sin_addr, ip, INET_ADDRSTRLEN);
                                result.first = ip;
                                result.second = "8080";
                        }
                    }
                }
            }
            
            close(sock);
        #endif
    } catch (...) {
    }
    
    return result;
}


