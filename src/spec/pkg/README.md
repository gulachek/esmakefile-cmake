# `pkg` Packages

These are "upstream" packages that test installation behavior of
`esmakefile-cmake`. They are intended to be automatically
packaged as part of an automated test and installed. Tests that
depend on these packages being installed should go in the
`downstream` directory. These `pkg` packages may depend on
`upstream` packages that rely not on `esmakefile-cmake` to be
installed.

# Structure

Every child directory of `pkg` should have a `make.ts` file who
has a named `Distribution` to be packaged.

The following are the packages:

| name | version |
| ---- | ------- |
| a    | 0.1.0   |
|      |         |
