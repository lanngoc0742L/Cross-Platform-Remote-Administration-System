#pragma once
#include "FeatureLibrary.h"

struct FileListItem {
    std::string name;
    std::string path;
    std::string type;
    int64_t size;
    std::string permissions;
    std::string modified;
    bool isDirectory;
    bool isFile;
};

class FileListController {
public:
    std::vector<FileListItem> listFiles(const std::string& path);
    
private:
    std::string normalizePath(const std::string& path);
    FileListItem createFileInfo(const std::filesystem::directory_entry& entry);
};
