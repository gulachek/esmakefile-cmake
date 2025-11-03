# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0]

### Breaking Changes

- Changed the name of the config file from a per-`Distribution` file to `esmakefile-cmake.config.json`.

### Added

- Support _private include directories_. This is only currently supported with a special `@src/private/include` directory.
- Support `compileOpts` property to accept arbitrary compiler flags for executables and libraries.
- Support `linkOpts` property to accept arbitrary linker flags for executables and libraries.
- Support `cflags` configuration file option for arbitrary compiler flags during development builds.
- Support `cxxflags` configuration file option for arbitrary compiler flags during development builds.
- Support `addPkgConfigSearchPaths` `string[]` config property to accept paths to include in `pkg-config` search.

### Fixed

- Fixed CMake distribution output format to properly include newlines.

## [0.1.7]

### Fixed

- Distributed `pkg-config` files now include `Requires.private` entries for libraries linked from other `Distribution` instances.

## [0.1.6]

### Added

- Started allowing passing `Library` instances for different `Distribution` instances to `linkTo`. Previously they had to be the same `Distribution`.
- Added a `binary` property to the object returned by `addTest` so that rules can depend on the executable instead of a successful run.

[0.1.6]: https://github.com/gulachek/catui/compare/v0.1.5...v0.1.6
[0.1.7]: https://github.com/gulachek/catui/compare/v0.1.6...v0.1.7
[0.2.0]: https://github.com/gulachek/catui/compare/v0.1.7...v0.2.0
