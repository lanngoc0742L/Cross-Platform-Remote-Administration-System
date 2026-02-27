#include "FileList.h"

std::string FileListController::normalizePath(const std::string& path) {
    if (path.empty()) {
        #ifdef _WIN32
            return "C:\\";
        #else
            return "/";
        #endif
    }
    
    std::string normalized = path;
    
    #ifdef _WIN32
        std::replace(normalized.begin(), normalized.end(), '/', '\\');
        if (normalized.back() != '\\' && !normalized.empty()) {
            normalized += "\\";
        }
    #else
        std::replace(normalized.begin(), normalized.end(), '\\', '/');
        if (normalized.back() != '/' && !normalized.empty()) {
            normalized += "/";
        }
    #endif
    
    return normalized;
}

FileListItem FileListController::createFileInfo(const std::filesystem::directory_entry& entry) {
    FileListItem info;
    
    try {
        info.path = entry.path().string();
        info.name = entry.path().filename().string();
        
        if (entry.is_directory()) {
            info.type = "directory";
            info.isDirectory = true;
            info.isFile = false;
            info.size = 0;
        } else if (entry.is_regular_file()) {
            info.type = "file";
            info.isDirectory = false;
            info.isFile = true;
            info.size = entry.file_size();
        } else {
            info.type = "other";
            info.isDirectory = false;
            info.isFile = false;
            info.size = 0;
        }
        
        #ifdef _WIN32
            auto ftime = std::filesystem::last_write_time(entry);
            auto sctp = std::chrono::time_point_cast<std::chrono::system_clock::duration>(
                ftime - std::filesystem::file_time_type::clock::now() + std::chrono::system_clock::now()
            );
            auto time_t = std::chrono::system_clock::to_time_t(sctp);
            std::tm tm_buf;
            localtime_s(&tm_buf, &time_t);
            char timeStr[64];
            std::strftime(timeStr, sizeof(timeStr), "%Y-%m-%d %H:%M:%S", &tm_buf);
            info.modified = timeStr;
        #else
            auto ftime = std::filesystem::last_write_time(entry);
            auto sctp = std::chrono::time_point_cast<std::chrono::system_clock::duration>(
                ftime - std::filesystem::file_time_type::clock::now() + std::chrono::system_clock::now()
            );
            auto time_t = std::chrono::system_clock::to_time_t(sctp);
            std::tm* tm_buf = std::localtime(&time_t);
            char timeStr[64];
            std::strftime(timeStr, sizeof(timeStr), "%Y-%m-%d %H:%M:%S", tm_buf);
            info.modified = timeStr;
        #endif
        
        #ifdef _WIN32
            DWORD attrs = GetFileAttributesA(info.path.c_str());
            info.permissions = "";
            if (attrs != INVALID_FILE_ATTRIBUTES) {
                if (attrs & FILE_ATTRIBUTE_READONLY) info.permissions += "r";
                else info.permissions += "-";
                if (attrs & FILE_ATTRIBUTE_HIDDEN) info.permissions += "h";
                else info.permissions += "-";
                if (attrs & FILE_ATTRIBUTE_SYSTEM) info.permissions += "s";
                else info.permissions += "-";
            } else {
                info.permissions = "---";
            }
        #else
            std::filesystem::perms perms = entry.status().permissions();
            info.permissions = "";
            info.permissions += (perms & std::filesystem::perms::owner_read) != std::filesystem::perms::none ? "r" : "-";
            info.permissions += (perms & std::filesystem::perms::owner_write) != std::filesystem::perms::none ? "w" : "-";
            info.permissions += (perms & std::filesystem::perms::owner_exec) != std::filesystem::perms::none ? "x" : "-";
            info.permissions += (perms & std::filesystem::perms::group_read) != std::filesystem::perms::none ? "r" : "-";
            info.permissions += (perms & std::filesystem::perms::group_write) != std::filesystem::perms::none ? "w" : "-";
            info.permissions += (perms & std::filesystem::perms::group_exec) != std::filesystem::perms::none ? "x" : "-";
            info.permissions += (perms & std::filesystem::perms::others_read) != std::filesystem::perms::none ? "r" : "-";
            info.permissions += (perms & std::filesystem::perms::others_write) != std::filesystem::perms::none ? "w" : "-";
            info.permissions += (perms & std::filesystem::perms::others_exec) != std::filesystem::perms::none ? "x" : "-";
        #endif
        
    } catch (...) {
        info.name = entry.path().filename().string();
        info.path = entry.path().string();
        info.type = "unknown";
        info.size = 0;
        info.permissions = "---";
        info.modified = "";
        info.isDirectory = false;
        info.isFile = false;
    }
    
    return info;
}

std::vector<FileListItem> FileListController::listFiles(const std::string& path) {
    std::vector<FileListItem> files;
    
    try {
        std::string normalizedPath = normalizePath(path);
        std::filesystem::path dirPath(normalizedPath);
        
        if (!std::filesystem::exists(dirPath)) {
            return files;
        }
        
        if (!std::filesystem::is_directory(dirPath)) {
            return files;
        }
        
        for (const auto& entry : std::filesystem::directory_iterator(dirPath)) {
            try {
                FileListItem info = createFileInfo(entry);
                files.push_back(info);
            } catch (...) {
                continue;
            }
        }
        
        std::sort(files.begin(), files.end(), [](const FileListItem& a, const FileListItem& b) {
            if (a.isDirectory != b.isDirectory) {
                return a.isDirectory > b.isDirectory;
            }
            return a.name < b.name;
        });
        
    } catch (const std::exception& e) {
        return files;
    }
    
    return files;
}
