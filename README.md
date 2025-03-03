# esmakefile-cmake

This is intended to provide basic functionality for
generating CMakeLists.txt for both development and
distribution.

_This is in very early stages. Expect bugs and kinks._

## License

I'm starting off with GPLv2 because this depends on `espkg-config`
which is a derivative work of freedesktop's `pkgconfig`, and
I am assuming this is a combined work out of caution. It probably
technically isn't because no redistribution of `espkg-config` takes
place.

## Usage

_This section needs significant work._

```js
import { Distribution, addCompileCommands } from 'esmakefile-cmake';

cli((make) => {
    const d = new Distribution(make, {
        name: 'my-dist',
        version: '1.2.3'
    });

    const add = d.addLibrary({
        name: 'add',
        src: ['src/add.c'],
    });

    const gtest = d.findPackage('gtest');

    d.addTest({
        name: 'add_test',
        src: ['test/add_test.cpp']
        linkTo: [gtest, add]
    });

    // generate compile_commands.json
    addCompileCommands(make, d);
});
```

The central concept of this package is a C/C++ `Distribution`. You
add executables, libraries, and tests (executables with some
additional properties) to the distribution.

The ultimate goal of the distribution is to package up a set of
source files and headers, along with a CMakeLists.txt file that
can easily be configured to install the executables and libraries
in the distribution. This is nice because most C/C++ ecosystems
already support CMake. No new infrastructure is needed to support
`esmakefile-cmake` - users who install the distribution generally
would never even know that it wasn't developed with CMake in the primary
development environment.

The reason `esmakefile-cmake` is nice is because it has a stronger
build system than CMake at development time. It's much easier
to generate source files than navigating CMake's odd syntax and
semantic complexity that runs at configuration time as opposed to being a
standalone powerful build system.

All of the sources are copied into the distribution before being packaged,
meaning that users will not need to install your development tools to
generate the same source. They just need a compiler and CMake, which if
they're already developing C/C++, is almost a given.

For more detailed information, see `src/spec/DistributionSpec.ts` and
`src/index.ts` along with the exported classes and their documentation
for more specifics. Eventually, there should be stronger documentation
than this, but this will have to do until that happens.
