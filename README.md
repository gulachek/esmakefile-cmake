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

## Linking External Packages

One complex area of any build system is integrating external
code outside of the project. `esmakefile-cmake` handles this
with the `Distribution`'s `findPackage` function which is
given a package name to be looked up at development time via
`pkg-config` and in the distribution's `CMakeLists.txt` file
via `find_package`.

### Limitations

For the development builds, it's worth noting that all
library links, both from `addLibrary` and `findPackage`,
use `pkg-config` to compute necessary compiler and
linker flags. This is largely to avoid redesigning a
solution to the problem that `pkg-config` already
solves. For libraries created with `addLibrary`, a
generated `.pc` file will contain the `Cflags` and
`Libs` flags to link to the library.
The file will also have a `Requires.private`
field listing all dependencies directly given to `linkTo`.
For each link of an executable or dynamic library, there
is a single invocation to `pkg-config --libs --static` that is
given all of the _direct_ dependencies given to
`linkTo`, and `pkg-config` computes the flags necessary
for the _transitive_ dependencies. The reader may notice
that this results in unnecessary libraries being listed
as link flags when dynamic libraries are involved, since
the `--static` behavior will traverse the
`Requires.private` dependencies for linking, yet dynamic
libraries already have their dependencies linked to
them, rendering this unnecessary. **In the worst case, an
extra library containing a conflicting symbol could be
linked into an image instead of the library intended to
provide this symbol.** This is not expected to be a
common issue, though it is possible, and the user will
either need to rename symbols to avoid conflicts or
potentially handwrite one or more `.pc` files to
explicitly configure the link. The reason this
`--static` flag is necessary is because dynamic and
static libraries can coexist in the builds, and by not
listing transitive dependencies for static libraries,
the reverse problem will exist, meaning some necessary
libraries will be omitted, which breaks links and is
expected to be far worse than the limitation listed
above. While tailored solutions inspecting library types
and which flags to specifically include could be done,
it is currently out of scope due to the anticipated
frequency of this being a problem.

