cmake_minimum_required(VERSION 3.10)
project(two VERSION 2)
include(GNUInstallDirs)
include(CMakePackageConfigHelpers)

install(DIRECTORY include/ TYPE INCLUDE)
add_library(two
	two.c
)

target_include_directories(two PUBLIC
$<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
$<INSTALL_INTERFACE:include>
)

if (MSVC)
	install(FILES "pkgconfig/msvc/two.pc"
		DESTINATION "${CMAKE_INSTALL_LIBDIR}/pkgconfig"
	)
else()
	install(FILES pkgconfig/two.pc
		DESTINATION "${CMAKE_INSTALL_LIBDIR}/pkgconfig"
	)
endif()

set(TWO_CONFIG_INSTALL_DIR "${CMAKE_INSTALL_LIBDIR}/cmake/Two2")
install(TARGETS two EXPORT two-targets)
install(EXPORT two-targets DESTINATION "${TWO_CONFIG_INSTALL_DIR}")
configure_package_config_file("cmake/Two2Config.cmake.in"
	"${CMAKE_CURRENT_BINARY_DIR}/Two2Config.cmake"
INSTALL_DESTINATION "${TWO_CONFIG_INSTALL_DIR}"
PATH_VARS TWO_CONFIG_INSTALL_DIR
)

write_basic_package_version_file(
	"${CMAKE_CURRENT_BINARY_DIR}/Two2ConfigVersion.cmake"
	COMPATIBILITY SameMajorVersion
)

install(FILES
	"${CMAKE_CURRENT_BINARY_DIR}/Two2Config.cmake"
	"${CMAKE_CURRENT_BINARY_DIR}/Two2ConfigVersion.cmake"
	DESTINATION "${TWO_CONFIG_INSTALL_DIR}"
)
