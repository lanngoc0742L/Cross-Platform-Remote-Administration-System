macro(apply_platform_config)
    message(STATUS "--- Linux Configuration ---")

    find_package(Boost REQUIRED COMPONENTS system thread)
    find_package(OpenSSL REQUIRED)
    find_package(nlohmann_json REQUIRED)
    
    find_package(X11 REQUIRED)
    find_package(PkgConfig REQUIRED)
    pkg_check_modules(XTST REQUIRED xtst)

    if(TARGET Agent)
        target_include_directories(Agent PRIVATE ${X11_INCLUDE_DIR} ${XTST_INCLUDE_DIRS})

        target_link_libraries(Agent PRIVATE 
            Boost::system 
            Boost::thread
            OpenSSL::SSL 
            OpenSSL::Crypto
            nlohmann_json::nlohmann_json
            pthread
            ${X11_LIBRARIES}    
            ${XTST_LIBRARIES}
        )

        if(CMAKE_BUILD_TYPE STREQUAL "Release")
            target_link_options(Agent PRIVATE "-Wl,--gc-sections" "-s")
            add_compile_options(-O3 -flto -ffunction-sections -fdata-sections)
        endif()
        
        message(STATUS "SUCCESS: Linux Libraries Linked (X11, Xtst, OpenSSL)")
    else()
        message(WARNING "Target 'Agent' not found. Ensure add_executable(Agent ...) is called before apply_platform_config()")
    endif()
endmacro()
