#ifdef _WIN32

#include "AppControl_WIN.h"
#include "Converter.h"

std::wstring WinAppController::resolveShortcut(const std::wstring& lnkPath)
{
    CoInitialize(NULL);

    IShellLinkW* shellLink = nullptr;
    HRESULT hr = CoCreateInstance(CLSID_ShellLink, NULL,
                                  CLSCTX_INPROC_SERVER,
                                  IID_IShellLinkW,
                                  (LPVOID*)&shellLink);

    if (FAILED(hr)) return L"";

    IPersistFile* persistFile = nullptr;
    hr = shellLink->QueryInterface(IID_IPersistFile, (void**)&persistFile);
    if (FAILED(hr)) return L"";

    hr = persistFile->Load(lnkPath.c_str(), STGM_READ);
    if (FAILED(hr)) return L"";

    WCHAR exePath[MAX_PATH];
    hr = shellLink->GetPath(exePath, MAX_PATH, NULL, SLGP_UNCPRIORITY);

    persistFile->Release();
    shellLink->Release();

    return (SUCCEEDED(hr) ? exePath : L"");
}


std::string WinAppController::listApps() {
    std::wstringstream ans;
    appList.clear();

    std::vector<std::wstring> dirs = {
        L"C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs",
        L"%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs"
    };

    WCHAR userSM[MAX_PATH];
    ExpandEnvironmentStringsW(dirs[1].c_str(), userSM, MAX_PATH);
    dirs[1] = userSM;

    appList.clear();
    
    int i = 0;
    for (auto& dir : dirs)
    {
        for (auto& p : fs::recursive_directory_iterator(dir))
        {
            if (p.path().extension() == L".lnk")
            {
                WinApp app;
                app.exeName = p.path().stem().wstring();
                app.shortcutPath = p.path().wstring();
                app.targetExe = resolveShortcut(app.shortcutPath);

                if (!app.targetExe.empty()) {
                    appList.push_back(app);
                    ans << i++ << L". Name: " << app.exeName << '\n';
                }
            }
        }
    }

    return ws_to_utf8(ans.str());
}


WinApp WinAppController::getApp(int i) {
    if (appList.size() <= 0)
        listApps();

    if (i < 0 || i >= appList.size())
        return {};

    return appList[i];
}


bool WinAppController::startApp(const WinApp& app) {
    HINSTANCE h = ShellExecuteW(NULL, L"open", app.shortcutPath.c_str(),
                                NULL, NULL, SW_SHOWNORMAL);
    return ((INT_PTR)h > 32);
}


bool WinAppController::stopApp(const WinApp& app) {
    HANDLE snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (snapshot == INVALID_HANDLE_VALUE)
        return false;

    PROCESSENTRY32W pe;
    pe.dwSize = sizeof(pe);

    bool stopped = false;

    //std::wstring exeName = fs::path(app.targetExe).filename().wstring();
    std::wstring exeName = app.exeName + L".exe";

    if (Process32FirstW(snapshot, &pe)) {
        do {
            if (_wcsicmp(pe.szExeFile, exeName.c_str()) == 0) {
                HANDLE h = OpenProcess(PROCESS_TERMINATE, FALSE, pe.th32ProcessID);
                if (!h) {
                    continue;
                }

                if (!TerminateProcess(h, 0)) {
                    CloseHandle(h);
                    return false;
                }

                CloseHandle(h);
                stopped = true;
            }
        } while (Process32NextW(snapshot, &pe));
    }

    CloseHandle(snapshot);
    return stopped;
}

#endif