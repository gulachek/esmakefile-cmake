cmake_minimum_required(VERSION 3.10)

function(print_args_encoded)
  list(LENGTH ARGN count)
  message(STATUS "Argument count: ${count}")

  find_program(XXD_EXECUTABLE xxd REQUIRED)

  set(i 0)
  foreach(arg IN LISTS ARGN)
    math(EXPR i "${i} + 1")
    message(STATUS "----- Argument ${i} -----")
		file(WRITE "${CMAKE_CURRENT_LIST_DIR}/arg.txt" "${arg}")
    execute_process(
      COMMAND "${XXD_EXECUTABLE}"
			INPUT_FILE "${CMAKE_CURRENT_LIST_DIR}/arg.txt"
      OUTPUT_VARIABLE hex_output
      ERROR_VARIABLE hex_error
      RESULT_VARIABLE hex_result
    )
    if(NOT hex_result EQUAL 0)
      message(WARNING "xxd failed for argument ${i}: ${hex_error}")
    else()
      message("${hex_output}")
    endif()
  endforeach()
endfunction()

message(STATUS SPACE)
print_args_encoded(hello world)
print_args_encoded("hello world")

message(STATUS SEMICOLON)
print_args_encoded(hello;world)
print_args_encoded("hello\;world")

message(STATUS POUND)
print_args_encoded("hello#world")

message(STATUS QUOTE)
print_args_encoded("hello\"world")

message(STATUS BACKSLASH)
print_args_encoded("hello\\world")

message(STATUS PARENS)
print_args_encoded(hello()world)
print_args_encoded("hello()world")

message(STATUS FORMFEED)
print_args_encoded(helloworld)
print_args_encoded("helloworld")

message(STATUS SIGINT)
print_args_encoded(helloworld)
print_args_encoded("helloworld")
