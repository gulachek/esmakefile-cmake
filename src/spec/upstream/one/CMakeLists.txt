cmake_minimum_required(VERSION 3.10)
project(one VERSION 1)
include(GNUInstallDirs)
include(CMakePackageConfigHelpers)

install(DIRECTORY include/ TYPE INCLUDE)
add_library(one
	one.c
)

target_include_directories(one PUBLIC
$<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
$<INSTALL_INTERFACE:include>
)

if (MSVC)
	install(FILES "pkgconfig/msvc/libone.pc"
		DESTINATION "${CMAKE_INSTALL_LIBDIR}/pkgconfig"
	)
else()
	install(FILES pkgconfig/libone.pc
		DESTINATION "${CMAKE_INSTALL_LIBDIR}/pkgconfig"
	)
endif()

set(ONE_CONFIG_INSTALL_DIR "${CMAKE_INSTALL_LIBDIR}/cmake/one")
install(TARGETS one EXPORT one-targets)
install(EXPORT one-targets DESTINATION "${ONE_CONFIG_INSTALL_DIR}")
configure_package_config_file("cmake/one-config.cmake.in"
	"${CMAKE_CURRENT_BINARY_DIR}/one-config.cmake"
	INSTALL_DESTINATION "${ONE_CONFIG_INSTALL_DIR}"
	PATH_VARS ONE_CONFIG_INSTALL_DIR
)

write_basic_package_version_file(
	"${CMAKE_CURRENT_BINARY_DIR}/one-config-version.cmake"
	COMPATIBILITY SameMajorVersion
)

install(FILES
	"${CMAKE_CURRENT_BINARY_DIR}/one-config.cmake"
	"${CMAKE_CURRENT_BINARY_DIR}/one-config-version.cmake"
	DESTINATION "${ONE_CONFIG_INSTALL_DIR}"
)
