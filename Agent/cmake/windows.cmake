macro(apply_platform_config)
    message(STATUS "--- Windows Configuration ---")

    add_compile_definitions(
        _CRT_SECURE_NO_WARNINGS 
        _WINSOCK_DEPRECATED_NO_WARNINGS
        _WIN32_WINNT=0x0A00 
        WINVER=0x0A00 
        NOMINMAX
    )

    add_compile_options(/utf-8 /bigobj)

    if(TARGET Agent)
        find_package(Boost CONFIG REQUIRED COMPONENTS system)
        find_package(OpenSSL REQUIRED)
        find_package(nlohmann_json CONFIG REQUIRED)

        target_link_libraries(Agent PRIVATE 
            Boost::system 
            OpenSSL::SSL 
            OpenSSL::Crypto
            nlohmann_json::nlohmann_json
            ws2_32
            mswsock
            iphlpapi
            crypt32
            gdi32
            gdiplus
            advapi32
            user32
            shlwapi
        )
        
        message(STATUS "SUCCESS: Windows Libraries Linked (GDI+, Winsock, OpenSSL)")
    else()
        message(WARNING "Target 'Agent' not found. Ensure add_executable(Agent ...) is called before apply_platform_config()")
    endif()
endmacro()
