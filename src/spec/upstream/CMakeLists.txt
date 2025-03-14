cmake_minimum_required(VERSION 3.10)
project(TestUpstream)

# This is meant to be installed as a pretend set of pre
# installed libraries on a system. It is used by the
# 'installation' suite of our Distribution specs so that
# we don't need to cram all of this into our spec file, and
# to exercise depending on CMake packages that may use
# features that aren't offered by esmakefile-cmake installs.
# For example, having a different <name> between
# 	find_package(<name>)
# 	target_link_libraries(myexe <name>)
# Which are the same for esmakefile-cmake packages

#
# CMake find_package name permutations
#
# -----+-------------+-----------
# Name | .pc = cmake | pkg = lib
# -----+-------------+-----------
# zero | x           | x
# -----+-------------+-----------
# one  |             | x
# -----+-------------+-----------
# two  |             |
# -----+-------------+-----------
#
# .pc = cmake means pkgconfig lookup name is same
# as cmake find_package lookup
#
# pkg = lib means cmake find_package lookup name is
# same as target_link_libraries argument
#

add_subdirectory(one)
add_subdirectory(two)

# Tests COMPONENTS in CMake package (for find_package testing)
add_subdirectory(helloworld)
