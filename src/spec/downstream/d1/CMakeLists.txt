cmake_minimum_required(VERSION 3.10)
project(d1)

find_package(a REQUIRED)

add_executable(d1 src/d1.c)
target_link_libraries(d1 PRIVATE a)
