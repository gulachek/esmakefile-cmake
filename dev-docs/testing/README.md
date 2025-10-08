# Testing Strategy

Due to the complex integrated nature of this project, automated
testing is somewhat challenging to accomplish via normal unit
tests alone. Instead, integration tests are heavily relied on.

The entry point for testing can be found in `src/spec/e2e.ts`
and should be the source of truth for _how_ tests are run.

The inteded test cases should all be documented in
`src/spec/plan.yaml` with IDs and descriptions of features being
tested. They are organized based on the outputs of
`esmakefile-cmake`.

1. `dev`: Development Builds

   The development builds are tested by programmatically
   generating C/C++ source and building with `esmakefile` by
   running `node`. The compiled outputs are run and tested to
   ensure that `esmakefile-cmake` is behaving properly as a
   development environment.

2. `dist`: Generated Distribution

   The generated distribution is what a developer would generate to
   ship a release, and what a user would download when building
   from source. It is tested by verifying the correct contents
   exist and by building/installing with CMake to ensure things are
   functioning properly at a basic level.

3. `cm-pkg`: CMake Package

   After installing a distribution that contains a library, each
   library should generate a CMake package file such that users
   could link to it in a `CMakeLists.txt` file by using
   `find_package`. The generated package files are tested by
   installing libraries and using downstream CMake projects with
   `find_package` directives to exercise the generated package.

4. `pc-pkg`: pkg-config Package

   Similar to the CMake packages, a distribution with a library
   should also install `.pc` files that are compatible with
   `pkg-config` to link to the installed library. This is tested by
   installing libraries and using downstream esmakefile-cmake projects
   with `findPackage` calls to link to the installed library to
   exercise functionality.
