macro(apply_platform_config)
    message(STATUS "--- macOS Header-Only Boost Configuration ---")

    execute_process(COMMAND brew --prefix boost OUTPUT_VARIABLE BOOST_PREFIX OUTPUT_STRIP_TRAILING_WHITESPACE)
    execute_process(COMMAND brew --prefix openssl@3 OUTPUT_VARIABLE OPENSSL_PREFIX OUTPUT_STRIP_TRAILING_WHITESPACE)

    if(TARGET Agent)
        target_include_directories(Agent PRIVATE 
            "${BOOST_PREFIX}/include"
            "${OPENSSL_PREFIX}/include"
        )

        target_compile_definitions(Agent PRIVATE 
            BOOST_SYSTEM_NO_LIB 
            BOOST_DATE_TIME_NO_LIB
            BOOST_REGEX_NO_LIB
        )

        find_library(SSL_LIB NAMES ssl PATHS "${OPENSSL_PREFIX}/lib" NO_DEFAULT_PATH)
        find_library(CRYPTO_LIB NAMES crypto PATHS "${OPENSSL_PREFIX}/lib" NO_DEFAULT_PATH)

        find_library(SCREEN_CAPTURE_KIT ScreenCaptureKit)
        find_library(CORE_MEDIA CoreMedia)

        find_program(CODESIGN_CMD codesign)
    
        if(CODESIGN_CMD)
            add_custom_command(TARGET Agent POST_BUILD
                COMMAND ${CODESIGN_CMD} --force --deep -s - $<TARGET_FILE:Agent>
            )
        endif()

        set_source_files_properties(${CMAKE_SOURCE_DIR}/src/modules/FastCapture.cpp
            PROPERTIES COMPILE_FLAGS "-x objective-c++ -fobjc-arc"
        )

        target_link_libraries(Agent PRIVATE 
            ${SSL_LIB}
            ${CRYPTO_LIB}
            ${SCREEN_CAPTURE_KIT}
            ${CORE_MEDIA}
            "-framework IOKit"
            "-framework ApplicationServices"
            "-framework Carbon"
            "-framework Foundation"
            "-framework CoreFoundation"
            "-framework CoreGraphics"
            "-framework AppKit"
            "-framework ImageIO"
            "pthread"
            "dl"
        )

        message(STATUS "SUCCESS: macOS configured (Boost: Header-only, OpenSSL: Linked)")
    endif()
endmacro()