# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.6]

### Added

- Started allowing passing `Library` instances for different `Distribution` instances to `linkTo`. Previously they had to be the same `Distribution`.
- Added a `binary` property to the object returned by `addTest` so that rules can depend on the executable instead of a successful run.

[0.1.6]: https://github.com/gulachek/catui/compare/v0.1.5...v0.1.6
