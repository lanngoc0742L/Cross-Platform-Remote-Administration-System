cmake_minimum_required(VERSION 3.14)

if(WIN32)
    if(DEFINED ENV{VCPKG_ROOT} AND NOT DEFINED CMAKE_TOOLCHAIN_FILE)
        set(CMAKE_TOOLCHAIN_FILE "$ENV{VCPKG_ROOT}/scripts/buildsystems/vcpkg.cmake" CACHE STRING "")
    endif()
endif()

project(AgentClient LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if(WIN32)
    include(cmake/windows.cmake)
elseif(APPLE)
    include(cmake/macos.cmake)
else()
    include(cmake/linux.cmake)
endif()

file(GLOB_RECURSE AGENT_SOURCES "${CMAKE_SOURCE_DIR}/src/*.cpp")

add_executable(Agent ${AGENT_SOURCES})

if(MSVC)
    target_compile_options(Agent PRIVATE /bigobj)
endif()

target_include_directories(Agent PRIVATE
    ${CMAKE_SOURCE_DIR}/include
    ${CMAKE_SOURCE_DIR}/include/core
    ${CMAKE_SOURCE_DIR}/include/handlers
    ${CMAKE_SOURCE_DIR}/include/modules
    ${CMAKE_SOURCE_DIR}/include/network
    ${CMAKE_SOURCE_DIR}/include/utils
    ${CMAKE_SOURCE_DIR}/config
)

apply_platform_config()