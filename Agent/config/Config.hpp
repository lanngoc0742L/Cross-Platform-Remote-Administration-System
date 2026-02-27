#pragma once
#include <string>
#include <fstream>
#include <iostream>
#include <cstdlib>

namespace Config {
    inline std::string SERVER_HOST = "10.217.11.21";
    inline std::string SERVER_PORT = "8080";
    const int RECONNECT_DELAY_MS = 3000;

    inline std::string AGENT_TOKEN = "";

    inline std::string generateDefaultToken() {
        return "DEFAULT_AGENT_TOKEN_2024";
    }

    inline bool loadConfig(int argc = 0, char** argv = nullptr) {
        if (argc > 1 && argv != nullptr) {
            SERVER_HOST = argv[1];
        }
        
        if (argc > 2 && argv != nullptr) {
            SERVER_PORT = argv[2];
        }
        
        std::ifstream file("config.txt");
        if (file.is_open()) {
            std::string line;
            while (std::getline(file, line)) {
                if (line.empty() || line[0] == '#') continue;
                
                if (line.find("SERVER_HOST=") == 0) {
                    SERVER_HOST = line.substr(12);
                    if (!SERVER_HOST.empty() && SERVER_HOST.back() == '\r') {
                        SERVER_HOST.pop_back();
                    }
                } else if (line.find("SERVER_PORT=") == 0) {
                    SERVER_PORT = line.substr(12);
                    if (!SERVER_PORT.empty() && SERVER_PORT.back() == '\r') {
                        SERVER_PORT.pop_back();
                    }
                } else if (line.find("AGENT_TOKEN=") == 0) {
                    AGENT_TOKEN = line.substr(12);
                    if (!AGENT_TOKEN.empty() && AGENT_TOKEN.back() == '\r') {
                        AGENT_TOKEN.pop_back();
                    }
                }
            }
            file.close();
        }
        
        if (AGENT_TOKEN.empty()) {
            AGENT_TOKEN = generateDefaultToken();
        }
        
        return true;
    }
    
    inline bool loadToken(int argc = 0, char** argv = nullptr) {
        return loadConfig(argc, argv);
    }
}