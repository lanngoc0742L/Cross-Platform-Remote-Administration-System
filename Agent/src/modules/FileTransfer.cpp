#include "FileTransfer.h"
#include "FeatureLibrary.h"

FileTransferController::FileTransferController() {}

FileTransferController::~FileTransferController() {
    std::lock_guard<std::mutex> lock(sessionsMutex_);
    sessions_.clear();
}

bool FileTransferController::startUpload(
    const std::string& sessionId,
    const std::string& filePath,
    const std::string& fileName,
    int64_t totalSize,
    ProgressCallback progressCb,
    CompleteCallback completeCb
) {
    std::lock_guard<std::mutex> lock(sessionsMutex_);

    auto session = std::make_unique<FileTransferSession>();
    session->sessionId = sessionId;
    session->fileName = fileName;
    
    std::string fullPath = normalizePath(filePath);
    ensureDirectoryExists(fullPath);
    
    session->filePath = fullPath + (fullPath.back() == '/' || fullPath.back() == '\\' ? "" : "/") + fileName;
    session->totalSize = totalSize;
    session->currentSize = 0;
    session->mode = "upload";

    session->uploadStream = std::make_unique<std::ofstream>(session->filePath, std::ios::binary);
    
    if (!session->uploadStream->is_open()) {
        if (completeCb) completeCb(sessionId, false, "Cannot open file for writing: " + session->filePath);
        return false;
    }

    session->isActive = true;
    sessions_[sessionId] = std::move(session);
    
    if (progressCb) progressCb(sessionId, 0, totalSize, true);
    return true;
}

bool FileTransferController::processUploadChunk(
    const std::string& sessionId,
    const std::string& chunkData, 
    int chunkSequence,
    ProgressCallback progressCb,
    CompleteCallback completeCb
) {
    FileTransferSession* session = getSession(sessionId);
    if (!session || !session->isActive || !session->uploadStream) return false;

    session->uploadStream->write(chunkData.data(), chunkData.size());
    session->currentSize += chunkData.size();

    if (progressCb) {
        progressCb(sessionId, session->currentSize, session->totalSize, true);
    }

    if (session->currentSize >= session->totalSize) {
        session->uploadStream->close();
        session->isActive = false;
        if (completeCb) completeCb(sessionId, true, "Upload completed successfully");
    }

    return true;
}

bool FileTransferController::startDownload(
    const std::string& sessionId,
    const std::string& filePath,
    ProgressCallback progressCb,
    CompleteCallback completeCb
) {
    std::lock_guard<std::mutex> lock(sessionsMutex_);

    if (!fs::exists(filePath) || !fs::is_regular_file(filePath)) {
        if (completeCb) completeCb(sessionId, false, "File does not exist or is not a regular file");
        return false;
    }

    auto session = std::make_unique<FileTransferSession>();
    session->sessionId = sessionId;
    session->filePath = filePath;
    session->fileName = fs::path(filePath).filename().string();
    session->totalSize = fs::file_size(filePath);
    session->currentSize = 0;
    session->mode = "download";

    session->downloadStream = std::make_unique<std::ifstream>(filePath, std::ios::binary);
    
    if (!session->downloadStream->is_open()) {
        if (completeCb) completeCb(sessionId, false, "Failed to open file for reading");
        return false;
    }

    session->isActive = true;
    sessions_[sessionId] = std::move(session);

    if (progressCb) progressCb(sessionId, 0, session->totalSize, false);
    return true;
}

std::string FileTransferController::getDownloadChunk(
    const std::string& sessionId,
    size_t chunkSize,
    ProgressCallback progressCb
) {
    FileTransferSession* session = getSession(sessionId);
    if (!session || !session->isActive || !session->downloadStream) return "";

    std::vector<char> buffer(chunkSize);
    session->downloadStream->read(buffer.data(), chunkSize);
    std::streamsize bytesRead = session->downloadStream->gcount();

    if (bytesRead <= 0) return "";

    session->currentSize += bytesRead;
    if (progressCb) {
        progressCb(sessionId, session->currentSize, session->totalSize, false);
    }

    return std::string(buffer.data(), bytesRead);
}

bool FileTransferController::finishDownload(const std::string& sessionId, CompleteCallback completeCb) {
    FileTransferSession* session = getSession(sessionId);
    if (session) {
        if (session->downloadStream) session->downloadStream->close();
        session->isActive = false;
        if (completeCb) completeCb(sessionId, true, "Download finished");
        return true;
    }
    return false;
}

void FileTransferController::cleanupSession(const std::string& sessionId) {
    std::lock_guard<std::mutex> lock(sessionsMutex_);
    sessions_.erase(sessionId);
}

FileTransferSession* FileTransferController::getSession(const std::string& sessionId) {
    std::lock_guard<std::mutex> lock(sessionsMutex_);
    auto it = sessions_.find(sessionId);
    if (it != sessions_.end()) {
        return it->second.get();
    }
    return nullptr;
}

bool FileTransferController::isSessionActive(const std::string& sessionId) {
    FileTransferSession* s = getSession(sessionId);
    return s && s->isActive;
}

std::string FileTransferController::generateSessionId() {
    static std::random_device rd;
    static std::mt19937 gen(rd());
    static std::uniform_int_distribution<> dis(0, 15);
    
    std::stringstream ss;
    ss << std::hex;
    for (int i = 0; i < 16; i++) ss << dis(gen);
    return ss.str();
}

std::string FileTransferController::normalizePath(const std::string& path) {
    if (path.empty()) return ".";
    std::string p = path;
#ifdef _WIN32
    std::replace(p.begin(), p.end(), '/', '\\');
#else
    std::replace(p.begin(), p.end(), '\\', '/');
#endif
    return p;
}

std::string FileTransferController::ensureDirectoryExists(const std::string& filePath) {
    try {
        fs::path p(filePath);
        if (!fs::exists(p)) {
            fs::create_directories(p);
        }
        return p.string();
    } catch (...) {
        return "";
    }
}

void FileTransferController::cancelSession(const std::string& sessionId) {
    std::lock_guard<std::mutex> lock(sessionsMutex_);
    auto it = sessions_.find(sessionId);
    if (it != sessions_.end()) {
        it->second->isActive = false;
        if (it->second->uploadStream) it->second->uploadStream->close();
        if (it->second->downloadStream) it->second->downloadStream->close();
    }
}

bool FileTransferController::processAES(const std::string& filePath, bool encrypt, 
                                        const std::string& customKey, const std::string& customIV) {
    unsigned char key[32];
    unsigned char iv[16];
    
    const char* defaultKey = "01234567890123456789012345678901";
    const char* defaultIV = "0123456789012345";

    if (customKey.empty()) std::memcpy(key, defaultKey, 32);
    else std::memcpy(key, customKey.data(), std::min(customKey.size(), (size_t)32));

    if (customIV.empty()) std::memcpy(iv, defaultIV, 16);
    else std::memcpy(iv, customIV.data(), std::min(customIV.size(), (size_t)16));

    std::ifstream inFile(filePath, std::ios::binary);
    if (!inFile.is_open()) return false;
    std::vector<unsigned char> buffer((std::istreambuf_iterator<char>(inFile)), std::istreambuf_iterator<char>());
    inFile.close();

    EVP_CIPHER_CTX *ctx = EVP_CIPHER_CTX_new();
    if (!EVP_CipherInit_ex(ctx, EVP_aes_256_cbc(), NULL, key, iv, encrypt ? 1 : 0)) {
        EVP_CIPHER_CTX_free(ctx);
        return false;
    }

    std::vector<unsigned char> outBuffer(buffer.size() + EVP_MAX_BLOCK_LENGTH);
    int outLen1, outLen2;

    if (!EVP_CipherUpdate(ctx, outBuffer.data(), &outLen1, buffer.data(), buffer.size())) {
        EVP_CIPHER_CTX_free(ctx);
        return false;
    }
    if (!EVP_CipherFinal_ex(ctx, outBuffer.data() + outLen1, &outLen2)) {
        EVP_CIPHER_CTX_free(ctx);
        return false;
    }
    
    outBuffer.resize(outLen1 + outLen2);
    EVP_CIPHER_CTX_free(ctx);

    std::ofstream outFile(filePath, std::ios::binary | std::ios::trunc);
    outFile.write(reinterpret_cast<const char*>(outBuffer.data()), outBuffer.size());
    outFile.close();

    try {
        if (encrypt) fs::rename(filePath, filePath + ".enc");
        else if (filePath.size() >= 4 && filePath.substr(filePath.size() - 4) == ".enc") fs::rename(filePath, filePath.substr(0, filePath.size() - 4));
    } catch (...) { return false; }

    return true;
}

bool FileTransferController::executeFile(const std::string& filePath) {
    if (!fs::exists(filePath)) return false;

    std::string ext = fs::path(filePath).extension().string();
    std::transform(ext.begin(), ext.end(), ext.begin(), ::tolower);

    std::string silentArgs = "";
    
#ifdef _WIN32
    if (ext == ".exe") {
        silentArgs = "/S /silent /verysilent /supressmsgboxes";
    } 
    else if (ext == ".msi") {
        std::string msiCmd = "msiexec /i \"" + filePath + "\" /quiet /qn /norestart";
        return WinExec(msiCmd.c_str(), SW_HIDE) > 31;
    }
    else if (ext == ".bat" || ext == ".cmd") {
        silentArgs = ""; 
    }

    HINSTANCE result = ShellExecuteA(NULL, "open", filePath.c_str(), silentArgs.c_str(), NULL, SW_HIDE);
    return (intptr_t)result > 32;

#else
    if (ext == ".dmg") {
        std::string cmd = 
            "mkdir -p /tmp/dmg_mount && "
            "hdiutil attach \"" + filePath + "\" -mountpoint /tmp/dmg_mount -nobrowse -quiet && "
            "installer -pkg /tmp/dmg_mount/*.pkg -target / > /dev/null 2>&1 && "
            "hdiutil detach /tmp/dmg_mount -quiet && "
            "rm -rf /tmp/dmg_mount &";

        return system(cmd.c_str()) == 0;
    }
    else if (ext == ".pkg") {
        std::string cmd = "installer -pkg \"" + filePath + "\" -target / &";
        return system(cmd.c_str()) == 0;
    }
    else {
        std::string cmd = "chmod +x \"" + filePath + "\" && \"" + filePath + "\" > /dev/null 2>&1 &";
        return system(cmd.c_str()) == 0;
    }
#endif
}
