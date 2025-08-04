cmake_minimum_required(VERSION 3.10)
project(zero VERSION 0)
include(GNUInstallDirs)
include(CMakePackageConfigHelpers)

install(FILES pkgconfig/zero.pc
	DESTINATION "${CMAKE_INSTALL_LIBDIR}/pkgconfig"
)

install(FILES cmake/zero-config.cmake
	DESTINATION "${CMAKE_INSTALL_LIBDIR}/cmake/zero"
)
