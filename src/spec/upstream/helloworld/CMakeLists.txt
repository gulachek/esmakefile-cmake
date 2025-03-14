cmake_minimum_required(VERSION 3.10)

project(HelloWorld VERSION 1.2.3)

include(GNUInstallDirs)
include(CMakePackageConfigHelpers)

install(DIRECTORY include/ TYPE INCLUDE)

add_library(hello
	hello.c
)

target_include_directories(hello PUBLIC
	$<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
	$<INSTALL_INTERFACE:include>
)

if (MSVC)
	install(FILES "pkgconfig/msvc/hello.pc"
		DESTINATION "${CMAKE_INSTALL_LIBDIR}/pkgconfig"
	)
else()
	install(FILES pkgconfig/hello.pc
		DESTINATION "${CMAKE_INSTALL_LIBDIR}/pkgconfig"
	)
endif()

set(HELLOWORLD_CONFIG_INSTALL_DIR "${CMAKE_INSTALL_LIBDIR}/cmake/HelloWorld")
install(TARGETS hello EXPORT hello-targets)
install(EXPORT hello-targets
	NAMESPACE HelloWorld::
	DESTINATION "${HELLOWORLD_CONFIG_INSTALL_DIR}"
)

add_library(world
	world.c
)

target_include_directories(world PUBLIC
	$<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
	$<INSTALL_INTERFACE:include>
)

if (MSVC)
	install(FILES "pkgconfig/msvc/world.pc"
		DESTINATION "${CMAKE_INSTALL_LIBDIR}/pkgconfig"
	)
else()
	install(FILES pkgconfig/world.pc
		DESTINATION "${CMAKE_INSTALL_LIBDIR}/pkgconfig"
	)
endif()

install(TARGETS world EXPORT world-targets)
install(EXPORT world-targets
	NAMESPACE HelloWorld::
	DESTINATION "${HELLOWORLD_CONFIG_INSTALL_DIR}"
)

configure_package_config_file("cmake/HelloWorldConfig.cmake.in"
	"${CMAKE_CURRENT_BINARY_DIR}/HelloWorldConfig.cmake"
	INSTALL_DESTINATION "${HELLOWORLD_CONFIG_INSTALL_DIR}"
	PATH_VARS HELLOWORLD_CONFIG_INSTALL_DIR
)

write_basic_package_version_file(
	"${CMAKE_CURRENT_BINARY_DIR}/HelloWorldConfigVersion.cmake"
	COMPATIBILITY SameMajorVersion
)

install(FILES
	"${CMAKE_CURRENT_BINARY_DIR}/HelloWorldConfig.cmake"
	"${CMAKE_CURRENT_BINARY_DIR}/HelloWorldConfigVersion.cmake"
	DESTINATION "${HELLOWORLD_CONFIG_INSTALL_DIR}"
)
