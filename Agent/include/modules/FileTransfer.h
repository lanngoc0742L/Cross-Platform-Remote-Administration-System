#pragma once

#include <string>
#include <fstream>
#include <memory>
#include <mutex>
#include <unordered_map>
#include <functional>

struct FileTransferSession {
    std::string sessionId;
    std::string filePath;
    std::string fileName;
    std::string mode;
    int64_t totalSize;
    int64_t currentSize;
    std::unique_ptr<std::ofstream> uploadStream;
    std::unique_ptr<std::ifstream> downloadStream;
    bool isActive;
    
    FileTransferSession() : totalSize(0), currentSize(0), isActive(false) {}
};

using ProgressCallback = std::function<void(const std::string& sessionId, int64_t current, int64_t total, bool isUpload)>;
using CompleteCallback = std::function<void(const std::string& sessionId, bool success, const std::string& message)>;

class FileTransferController {
public:
    FileTransferController();
    ~FileTransferController();
    
    bool startUpload(
        const std::string& sessionId,
        const std::string& filePath,
        const std::string& fileName,
        int64_t totalSize,
        ProgressCallback progressCb = nullptr,
        CompleteCallback completeCb = nullptr
    );
    
    bool processUploadChunk(
        const std::string& sessionId,
        const std::string& chunkData,
        int chunkSequence,
        ProgressCallback progressCb = nullptr,
        CompleteCallback completeCb = nullptr
    );
    
    bool startDownload(
        const std::string& sessionId,
        const std::string& filePath,
        ProgressCallback progressCb = nullptr,
        CompleteCallback completeCb = nullptr
    );
    
    std::string getDownloadChunk(
        const std::string& sessionId,
        size_t chunkSize = 64 * 1024,
        ProgressCallback progressCb = nullptr
    );
    
    bool finishDownload(
        const std::string& sessionId,
        CompleteCallback completeCb = nullptr
    );

    static bool processAES(
        const std::string& filePath, 
        bool encrypt, 
        const std::string& customKey = "", 
        const std::string& customIV = ""
    );
    
    static bool executeFile(const std::string& filePath);

    void cancelSession(const std::string& sessionId);
    void cleanupSession(const std::string& sessionId);
    bool isSessionActive(const std::string& sessionId);
    FileTransferSession* getSession(const std::string& sessionId);
    
    static std::string generateSessionId();
    static bool validatePath(const std::string& path);
    static std::string normalizePath(const std::string& path);
    
private:
    std::mutex sessionsMutex_;
    std::unordered_map<std::string, std::unique_ptr<FileTransferSession>> sessions_;
    
    std::string ensureDirectoryExists(const std::string& filePath);
    void cleanupInactiveSessions();
};
