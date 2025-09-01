# Test Plan

This project focuses primarily on end-to-end tests to catch
regressions and exercise functionality. This is because it's too
often the case that something isn't quite as simple as it seems
based on documentation, and it's important to prove that users
will be able to compile, link, and run programs on supported
compilers and operating systems.

With the complexity of

- A development time build system
- CMake package generation with parallel functionality to the
  dev build system
- Downstream package consumption of these generated packages
  needing testing

The tests are broken into a few different classifications as
outlined below.

## Development Only

These tests _only_ apply to the development time build system,
which should be a small bit of functionality. The test code
currently resides in `src/spec/DistributionSpec.ts`.

The functionality that should go here is

- Build system dependency management (prereqs/postreqs update
  build appropriately)
- `compile-commands.json` generation
- Unit test configuration

## Upstream Packages

These are test packages that the tests assume are installed in
the system prior to being run. They live in `src/spec/upstream`
and are installed with `cmake`.

If specific upstream configuration is needed, such as exercising
the variations of `findPackage`, that should be added here.

## Package Creation

Functionality that impacts the generated package is part of
this. These tests should exercise both development-time and
package functionality of the equivalent feature, such as which
directories are included in a build. which packages to find,
which libraries to link, etc.

These tests require that the upstream packages are installed on
the system.

The tests currently live in `src/spec/DistributionSpec.ts`.

> **TODO**: This should be reorganized (issue 30).

## Package Consumption

The packages we generated must be usable from esmakefile-cmake
and CMake, so these tests have both an esmakefile-cmake build
and a `CMakeLists.txt` file to test downstream consumption.

These tests currently live in `src/spec/DistributionSpec.ts`.

> **TODO**: This should be reorganized (issue 30).

## Structure

Due to the large number of files that are generated, this file
serves to document the output structure of the `.test`
directory.

The main `src/spec/e2e.ts` script is run with the current
directory (git repo root) as the `--srcdir` and the `.test`
directory as the `--outdir`.

The `.test` dir has the following structure:

```
vendor/ <-- place for upstream packages to be installed
  include/
  lib/
  build/ <-- place for upstream packages to be built
  ...
.test/ <-- disposable generated files
  vendor/ <-- place for generated packages to be installed
  pkg/
outdir)
    pack/ <-- generating a package (esmake --outdir)
      pkg1/
      ...
    unpack/ <-- unpack generated tar here
      pkg1/
      ...
    build/ <-- cmake build dir pre-install
      pkg1/
      ...
  downstream/ <-- place for downstream builds to go
    d1/
      esmake/ <-- for esmakefile builds
      cmake/ <-- for cmake builds
    ...
```

Upstream packages are copied from `vendor` to `.test/vendor` to
put everything in one directory (since that's a current
limitation **TODO**) and rebuilding/reinstalling the upstream
packages is a waste of time because these packages are
independent of `esmakefile-cmake`.
