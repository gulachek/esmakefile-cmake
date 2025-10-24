## CMake Quoting

There are some features like `compileOpts` that
require rendering raw CMake arguments from strings.
This requires `esmakefile-cmake` to quote these
strings such that they'll be parsed by CMake as a
single argument.

The behavior was tested against cmake with the
`CMakeLists.txt` file in this directory.
