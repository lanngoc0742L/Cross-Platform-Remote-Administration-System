#include "FeatureLibrary.h"
#include "Agent.hpp"
#include "../../config/Config.hpp"
#include "PlatformModules.h"
#include <ctime>

#ifdef _WIN32
#include <winsock2.h>
#pragma comment(lib, "ws2_32.lib")
void hideConsole() {
    HWND hwnd = GetConsoleWindow();
    if (hwnd != NULL) {
        ShowWindow(hwnd, SW_HIDE);
    }
}

#elif defined(__APPLE__) || defined(__linux__)
void hideConsole() {
    freopen("/dev/null", "r", stdin);
    freopen("/dev/null", "w", stdout);
    freopen("/dev/null", "w", stderr);
}
#else
void hideConsole() {}
#endif

int main(int argc, char** argv) {

    if (!PrivilegeEscalation::escalatePrivileges()) {
        std::cerr << "[Main] Warning: Could not escalate privileges at startup.\n";
    }

#ifdef _WIN32
    WSADATA wsaData;
    if (WSAStartup(MAKEWORD(2, 2), &wsaData) != 0) {
        std::cerr << "Failed to initialize Winsock.\n";
        return 1;
    }
#endif

    hideConsole();
    
    setupConsole();

    std::cout << "[Main] Loading configuration...\n";
    
    Config::loadConfig(argc, argv);
    
    std::cout << "[Main] Configuration loaded successfully.\n";
    std::cout << "[Main] Agent will discover Gateway via UDP Discovery\n";
    try {
        boost::asio::io_context io;

        boost::asio::signal_set signals(io, SIGINT, SIGTERM);
        signals.async_wait([&io](const boost::system::error_code&, int) {
            std::cout << "\n[Main] Signal received. Stopping Agent...\n";
            io.stop();
        });
        
        auto agent = std::make_shared<Agent>(io);
        
        agent->run();

        std::cout << "===========================================\n";
        std::cout << "   AGENT CLIENT STARTED - RUNNING...       \n";
        std::cout << "===========================================\n" << std::flush;

        io.run();

    } catch (const std::exception& e) {
        std::cerr << "\n[FATAL ERROR] " << e.what() << "\n";
        return 1;
    } catch (...) {
        std::cerr << "\n[CRITICAL] Unknown Crash!\n";
        return 1;
    }

#ifdef _WIN32
    WSACleanup();
#endif

    return 0;
}