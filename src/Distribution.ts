/*
 * Copyright (C) 2025 Nicholas Gulachek
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License as
 * published by the Free Software Foundation; either version 2 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 59 Temple Place - Suite 330, Boston, MA
 * 02111-1307, USA.
 */
import { Makefile, PathLike, Path, IBuildPath } from 'esmakefile';
import { ICompiler, ICompilerArgs } from './Compiler.js';
import { GccCompiler } from './GccCompiler.js';
import { MsvcCompiler } from './MsvcCompiler.js';
import { Executable, IExecutable } from './Executable.js';
import { CStandard, CxxStandard } from './Source.js';
import {
	ILibrary,
	Library,
	ResolvedLibraryType,
	IImportedLibrary,
	ILinkedCompilation,
} from './Library.js';
import { readConfigFile } from './Config.js';
import { mkdir, copyFile, writeFile, cp } from 'node:fs/promises';
import { chdir, cwd } from 'node:process';
import { platform } from 'node:os';
import { PkgConfig } from 'espkg-config';
import { dirname, resolve } from 'node:path';

/**
 * Options to create a Distribution
 */
export interface IDistributionOpts {
	/** The name of the distribution, as given to CMake project() */
	name: string;

	/** The version of the distribution, as given to CMake project() */
	version: string;

	/** The C language version, like CMAKE_C_STANDARD */
	cStd?: CStandard;

	/** The C++ language version, like CMAKE_CXX_STANDARD */
	cxxStd?: CxxStandard;
}

/**
 * Options for addExecutable
 */
export interface IAddExecutableOpts {
	/** Name of executable */
	name: string;

	/** Source C/C++ files */
	src: PathLike[];

	/** Directories to include in header search paths */
	includeDirs?: PathLike[];

	/** Libraries to link to */
	linkTo?: (Library | IFindPackageResult)[];
}

/**
 * Options for addTest
 */
export interface IAddTestOpts extends IAddExecutableOpts {}

/**
 * Type returned from addTest
 */
export interface ITest {
	/** Target that, when updated, runs the test executable */
	run: IBuildPath;

	/** Path to the built binary of the test executable */
	binary: IBuildPath;
}

/**
 * Library type given to addLibrary
 */
export enum LibraryType {
	/** The default - static by default and respect CMake BUILD_SHARED_LIBS */
	default = 'default',

	/** Always build a static library */
	static = 'static',

	/** Always build a dynamic library */
	dynamic = 'dynamic',
}

/** Options given to addLibrary */
export interface IAddLibraryOpts extends IAddExecutableOpts {
	/** Specify the type of the library */
	type?: LibraryType;
}

export interface IFindPackageCMakeOpts {
	/** As in find_package(<packageName> ...) */
	packageName: string;

	/** As in find_package(<packageName> COMPONENTS <component>) */
	component?: string;

	/** As in find_package(<packageName> <version>) */
	version?: string;

	/** As in target_link_libraries(... <libraryTarget>) */
	libraryTarget: string;
}

/** Options given to findPackage */
export interface IFindPackageOpts {
	/** The name of the pkgconfig package to link at development time */
	pkgconfig?: string;

	/** The name of the cmake package to link in the distribution */
	cmake?: string | IFindPackageCMakeOpts;
}

/** Opaque object that can be given to linkTo */
export interface IFindPackageResult {
	/** Unique identifier for distribution's package lookup */
	id: number;

	/** Unstable, potentially not unique name useful for debugging only */
	debugName: string;
}

/**
 * Class that represents a packaged distribution of C/C++
 * libraries and executables
 */
export class Distribution {
	readonly make: Makefile;
	readonly name: string;
	readonly version: string;
	readonly outDir: IBuildPath;
	readonly dist: IBuildPath;
	readonly test: IBuildPath;
	readonly cStd?: CStandard;
	readonly cxxStd?: CxxStandard;

	private _license: Path;
	private _fileMap: [Path, string][] = [];
	private _executables: IExecutable[] = [];
	private _libraries: ILibrary[] = [];
	private _installedTargets: string[] = [];
	private _imports: IImportedLibrary[] = [];

	private _compiler: ICompiler;
	private _defaultLibraryType: ResolvedLibraryType = ResolvedLibraryType.static;
	private _pkgSearchPaths: string[] = [];
	private _pkg: PkgConfig;

	constructor(make: Makefile, opts: IDistributionOpts) {
		this.make = make;
		this.name = opts.name;
		this.version = opts.version;
		this.outDir = Path.build(this.name);
		this.dist = Path.build(`${this.name}-${this.version}.tgz`);
		this._license = Path.src('LICENSE.txt');
		this.test = Path.build(`test-${this.name}`);
		this.cStd = opts.cStd;
		this.cxxStd = opts.cxxStd;

		this._pkgSearchPaths.push(
			// TODO - this.make.abs(Path.src('pkgconfig')) for
			// override
			this.make.abs(Path.build('pkgconfig')),
			resolve('vendor/lib/pkgconfig'),
		);

		this._parseConfig();

		this._pkg = new PkgConfig({
			searchPaths: this._pkgSearchPaths,
		});

		const compilerArgs: ICompilerArgs = {
			make,
			pkg: this._pkg,
			cStd: this.cStd,
			cxxStd: this.cxxStd,
		};

		if (platform() === 'win32') {
			this._compiler = new MsvcCompiler(compilerArgs);
		} else {
			this._compiler = new GccCompiler(compilerArgs);
		}

		this._addFile(this._license, this._license.rel());
		this._addDist();
	}

	private _addFile(src: Path, relDist: string): void {
		this._fileMap.push([src, relDist]);
		this.make.add(this.dist, [src]);
	}

	private _addSrc(c: ILinkedCompilation): void {
		for (const src of c.src) {
			this._addFile(src, src.rel());
		}
	}

	private _createLinkedComp(opts: IAddExecutableOpts): ILinkedCompilation {
		const includeDirs: Path[] = [];
		if (opts.includeDirs) {
			for (const i of opts.includeDirs) {
				includeDirs.push(Path.src(i));
			}
		} else {
			includeDirs.push(Path.src('include'));
		}

		const linkTo: Library[] = [];
		const pkgs: IImportedLibrary[] = [];
		if (opts.linkTo) {
			for (const l of opts.linkTo) {
				if (isImported(l)) {
					const { id } = l;
					if (typeof id !== 'number' || id < 0 || id >= this._imports.length) {
						throw new Error(
							`Invalid option given to findPackage (${JSON.stringify(l)})`,
						);
					}

					pkgs.push(this._imports[id]);
				} else {
					if (l.distName !== this.name) {
						// from another Distribution!
						pkgs.push({
							cmake: {
								packageName: l.name,
								libraryTarget: l.name,
								version: l.distVersion,
							},
							crossDistro: true,
						});
					}

					linkTo.push(l);
				}
			}
		}

		return {
			name: opts.name,
			outDir: this.outDir,
			src: opts.src.map((s) => Path.src(s)),
			includeDirs,
			linkTo,
			pkgs,
			compileCommands: this.outDir.join(`.${opts.name}-compile_commands.json`),
			devOnly: false,
			distName: this.name,
			distVersion: this.version,
		};
	}

	private _addExecutable(
		opts: IAddExecutableOpts,
		devOnly: boolean,
	): Executable {
		// TODO validate opts
		const exe = this._createLinkedComp(opts);
		exe.devOnly = devOnly;
		this._executables.push(exe);

		const out = this._compiler.addExecutable(exe);

		if (!devOnly) {
			this._addSrc(exe);

			// TODO - remove this dependency.
			// Hold back right now is that current approach for
			// generated headers is to make them prereqs for object
			// files that need them. If we only copy file/dir, then
			// the headers will be missed when copying to dist.
			// Ideally upstream esmakefile change would allow for
			// enumerating targets and watching newly added targets.
			// Then we could see all generated header files for
			// added include directories to copy in. Maybe that's
			// not worth it.
			this.make.add(this.dist, [out.binary]);
		}

		return out;
	}

	/**
	 * Add an executable like CMake's add_executable
	 */
	addExecutable(opts: IAddExecutableOpts): Executable {
		return this._addExecutable(opts, false);
	}

	/**
	 * Add a test executable and run
	 */
	addTest(opts: IAddTestOpts): ITest {
		const exe = this._addExecutable(opts, true);

		const run = Path.gen(exe.binary, { ext: '.run' });
		this.make.add(run, [exe.binary], (args) => {
			return args.spawn(args.abs(exe.binary), []);
		});

		this.make.add(this.test, [run]);

		return { run, binary: exe.binary };
	}

	/**
	 * Add a library like CMake's add_library
	 */
	addLibrary(opts: IAddLibraryOpts): Library {
		// TODO validate opts
		const lib: ILibrary = {
			...this._createLinkedComp(opts),
			type: this._resolveLibraryType(opts.type || LibraryType.default),
		};

		this._libraries.push(lib);

		const out = this._compiler.addLibrary(lib);
		this.make.add(this.dist, [out.binary]);
		this._addSrc(lib);
		return out;
	}

	/**
	 * Install a target. Not 1:1 with CMake's install().
	 * For executables, will install the binary to the
	 * bin folder. For libraries, it will install binaries
	 * to lib and bin folders as appropriate (bin for
	 * Windows' DLL). In addition, libraries will have
	 * packages usable by find_package installed to
	 * lib/cmake/<name>/<name>-config.cmake, and a pkgconfig
	 * file will be installed to lib/pkgconfig/<name>.pc.
	 */
	install(target: Executable | Library): void {
		this._installedTargets.push(target.name);
	}

	/**
	 * Find an external package to link to. At development
	 * time, this will search pkgconfig in vendor/lib/pkgconfig
	 * relative to the esmakefile srcRoot. In the distribution,
	 * it will result in a required find_package() statement
	 * to find a CMake module to link to.
	 * @param name The name of the pkgconfig and cmake package to link to
	 * @returns An object that can be given to a linkTo option
	 */
	findPackage(name: string): IFindPackageResult;
	/**
	 * Find an external package to link to. At development
	 * time, this will search pkgconfig in vendor/lib/pkgconfig
	 * relative to the esmakefile srcRoot. In the distribution,
	 * it will result in a required find_package() statement
	 * to find a CMake module to link to.
	 * @param opts Options to specify which package to link to
	 * @returns An object that can be given to a linkTo option
	 */
	findPackage(opts: IFindPackageOpts): IFindPackageResult;
	findPackage(nameOrOpts: string | IFindPackageOpts): IFindPackageResult {
		const lib: IImportedLibrary = {};
		let debugName = 'invalid';

		if (typeof nameOrOpts === 'string') {
			const nm = nameOrOpts;
			debugName = nm;
			lib.pkgconfig = nm;
			lib.cmake = {
				packageName: nm,
				libraryTarget: nm,
			};
		} else {
			const { pkgconfig, cmake } = nameOrOpts;
			if (typeof pkgconfig === 'string') {
				debugName = pkgconfig;
				lib.pkgconfig = pkgconfig;
			}

			if (cmake) {
				if (typeof cmake === 'string') {
					debugName = cmake;
					lib.cmake = {
						packageName: cmake,
						libraryTarget: cmake,
					};
				} else {
					const { packageName, component, version, libraryTarget } = cmake;
					debugName = libraryTarget;
					lib.cmake = { packageName, component, version, libraryTarget };
				}
			}
		}

		const id = this._imports.length;
		this._imports.push(lib);
		return { id, debugName };
	}

	/** clangd compilation databases for all libraries/executables. Use addCompileCommands instead. */
	compileCommandsComponents(): IBuildPath[] {
		const out: IBuildPath[] = [];
		for (const e of this._executables) out.push(e.compileCommands);

		for (const l of this._libraries) out.push(l.compileCommands);

		return out;
	}

	private _resolveLibraryType(type: LibraryType): ResolvedLibraryType {
		switch (type) {
			case LibraryType.static:
				return ResolvedLibraryType.static;
			case LibraryType.dynamic:
				return ResolvedLibraryType.dynamic;
			case LibraryType.default:
				return this._defaultLibraryType;
			default:
				throw new Error(`Unexpected LibraryType '${type}'`);
		}
	}

	private _parseConfig(): void {
		// TODO add error to Makefile if anything other than file not existing
		const config = readConfigFile(resolve('esmakefile-cmake.config.json'));

		if (config) {
			if (config.buildSharedLibs) {
				this._defaultLibraryType = ResolvedLibraryType.dynamic;
			}

			if (config.addPkgConfigSearchPaths) {
				this._pkgSearchPaths.push(...config.addPkgConfigSearchPaths);
			}
		}
	}

	private _addDist(): void {
		this.make.add('dist-' + this.name, [this.dist]);
		// must add follow-up rules to make dist depend on source
		this.make.add(this.dist, [], async (args) => {
			const dir = Path.build(`${this.name}-${this.version}`);
			const dirAbs = args.abs(dir);

			const cmake: string[] = [
				'# GENERATED BY esmakefile-cmake',
				'cmake_minimum_required(VERSION 3.10)',
				`project(${this.name} VERSION ${this.version})`,
				'include(GNUInstallDirs)',
				'include(CMakePackageConfigHelpers)',
				'',
			];

			for (const [src, relDest] of this._fileMap) {
				args.logStream.write(`Copy ${src} -> ${relDest}\n`);
				const absDest = resolve(dirAbs, relDest);
				await mkdir(dirname(absDest), { recursive: true });
				await copyFile(args.abs(src), absDest);
			}

			const distExes = this._executables.filter((e) => !e.devOnly);
			const distLibs = this._libraries.filter((l) => !l.devOnly);

			const targets: ILinkedCompilation[] = [...distExes, ...distLibs];

			type Pkg = { version?: string; components?: Set<string> };
			const pkgs = new Map<string, Pkg>();

			// Get unique packages that are used by distributed targets
			for (const c of targets) {
				for (const p of c.pkgs) {
					const { cmake, pkgconfig } = p;
					if (!cmake) {
						args.logStream.write(
							`'${c.name}' depends on a package without a cmake lookup name defined in findPackage (pkgconfig name: '${pkgconfig}')`,
						);
						return false;
					}

					const { packageName, version, component } = cmake;
					let pkg = pkgs.get(packageName);
					if (!pkg) {
						pkg = { version };
						pkgs.set(packageName, pkg);
					}

					if (version && pkg.version && version !== pkg.version) {
						args.logStream.write(
							`Warning: CMake package '${packageName}' was given conflicting versions in findPackage(). '${version}' vs '${pkg.version}'. Using '${pkg.version}'\n`,
						);
					}

					if (component) {
						let c = pkg.components;
						if (!c) {
							c = new Set<string>();
							pkg.components = c;
						}
						c.add(component);
					}
				}

				// Copy all includes into dist/include
				for (const i of c.includeDirs) {
					const dest = dir.join('include');
					args.logStream.write(`Copy ${i} -> ${dest}\n`);
					await cp(args.abs(i), args.abs(dest), { recursive: true });
					args.logStream.write(`(done) Copy ${i} -> ${dest}\n`);
				}
			}

			for (const [name, deets] of pkgs) {
				const { version, components } = deets;
				const line = [`find_package(${name}`];
				if (version) {
					line.push(version);
				}

				if (components) {
					line.push('COMPONENTS', ...components);
				}

				line.push('REQUIRED)');
				cmake.push(line.join(' '));
			}

			if (this.cStd) {
				cmake.push(`set(CMAKE_C_STANDARD ${this.cStd})`);
				cmake.push('set(CMAKE_C_STANDARD_REQUIRED TRUE)');
			}

			if (this.cxxStd) {
				cmake.push(`set(CMAKE_CXX_STANDARD ${this.cxxStd})`);
				cmake.push('set(CMAKE_CXX_STANDARD_REQUIRED TRUE)');
			}

			args.logStream.write(`Making ${dirAbs}\n`);
			await mkdir(dirAbs, { recursive: true });
			args.logStream.write(`Done making ${dirAbs}\n`);

			const cmakeDir = dir.join('cmake');
			args.logStream.write(`Creating directory ${cmakeDir}\n`);
			await mkdir(args.abs(cmakeDir), { recursive: true });

			for (const exe of distExes) {
				cmake.push(`add_executable(${exe.name}`);
				for (const s of exe.src) {
					cmake.push(`\t${s.rel()}`);
				}
				cmake.push(')');

				if (exe.includeDirs.length > 0) {
					cmake.push(`target_include_directories(${exe.name} PRIVATE include)`);
				}

				for (const p of exe.pkgs) {
					cmake.push(
						`target_link_libraries(${exe.name} PRIVATE ${p.cmake.libraryTarget})`,
					);
				}

				cmake.push(`install(TARGETS ${exe.name})`);
			}

			cmake.push('');

			const pkgconfig = dir.join('pkgconfig');
			const msvcPkgconfig = pkgconfig.join('msvc');

			if (distLibs.length > 0) {
				args.logStream.write(`Creating ${msvcPkgconfig}`);
				await mkdir(args.abs(msvcPkgconfig), { recursive: true });

				// TODO only if installed
				cmake.push('\ninstall(DIRECTORY include/ TYPE INCLUDE)');
			}

			for (const lib of distLibs) {
				cmake.push(`add_library(${lib.name}`);
				for (const s of lib.src) {
					cmake.push(`\t${s.rel()}`);
				}
				cmake.push(')');

				if (lib.includeDirs.length > 0) {
					cmake.push(
						`\ntarget_include_directories(${lib.name} PUBLIC`,
						'$<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>',
						'$<INSTALL_INTERFACE:include>',
						')',
					);
				}

				const pcReqs: string[] = [];
				for (const p of lib.pkgs) {
					cmake.push(
						`target_link_libraries(${lib.name} PRIVATE ${p.cmake.libraryTarget})`,
					);
					pcReqs.push(p.pkgconfig);
				}

				for (const l of lib.linkTo) {
					if (l.distName !== this.name) {
						pcReqs.push(l.name);
					}
				}

				// Install .pc file
				const pc: string[] = [
					'# Generated by esmakefile-cmake',
					'prefix=${pcfiledir}/../..',
					'libdir=${prefix}/lib',
					'includedir=${prefix}/include',
					'',
					`Name: ${lib.name}`,
					`Version: ${this.version}`,
					'Description: generated by esmakefile-cmake',
					'Cflags: "-I${includedir}"',
					`Libs: "-L\${libdir}" "-l${lib.name}"`,
				];

				const msvcPc: string[] = [
					'# Generated by esmakefile-cmake',
					'prefix=${pcfiledir}\\\\..\\\\..',
					'libdir=${prefix}\\\\lib',
					'includedir=${prefix}\\\\include',
					'',
					`Name: ${lib.name}`,
					`Version: ${this.version}`,
					'Description: generated by esmakefile-cmake',
					'Cflags: "/I${includedir}"',
					`Libs: "\${libdir}\\\\${lib.name}.lib"`,
				];

				if (pcReqs.length > 0) {
					const req = `Requires.private: ${pcReqs.join(' ')}`;
					pc.push(req);
					msvcPc.push(req);
				}

				const pcFile = pkgconfig.join(`${lib.name}.pc`);
				args.logStream.write(`Writing ${pcFile}`);
				await writeFile(args.abs(pcFile), pc.join('\n'), 'utf8');

				const msvcPcFile = msvcPkgconfig.join(`${lib.name}.pc`);
				args.logStream.write(`Writing ${msvcPcFile}`);
				await writeFile(args.abs(msvcPcFile), msvcPc.join('\r\n'), 'utf8');

				// TODO - only if installed
				cmake.push(
					'',
					'if (MSVC)',
					`\tinstall(FILES "pkgconfig/msvc/${msvcPcFile.basename}"`,
					'\t\tDESTINATION "${CMAKE_INSTALL_LIBDIR}/pkgconfig"',
					'\t)',
					'else()',
					`\tinstall(FILES pkgconfig/${pcFile.basename}`,
					'\t\tDESTINATION "${CMAKE_INSTALL_LIBDIR}/pkgconfig"',
					'\t)',
					'endif()',
				);

				const targetName = `${lib.name}-targets`;
				const configDirVar = `${lib.name.toUpperCase()}_CONFIG_INSTALL_DIR`;
				cmake.push(
					`set(${configDirVar} "\${CMAKE_INSTALL_LIBDIR}/cmake/${lib.name}")`,
					`install(TARGETS ${lib.name} EXPORT ${targetName})`,
					`install(EXPORT ${targetName} DESTINATION "\${${configDirVar}}")`,
				);

				// write package config input file
				const configContents = [
					'# Generated by esmakefile-cmake',
					'@PACKAGE_INIT@',
					`include("@PACKAGE_${configDirVar}@/${targetName}.cmake")`,
					'include(CMakeFindDependencyMacro)',
				];

				for (const p of lib.pkgs) {
					configContents.push(`find_dependency(${p.cmake.packageName})`);
				}

				configContents.push(`check_required_components(${lib.name})`);

				const configFile = cmakeDir.join(`${lib.name}-config.cmake.in`);
				args.logStream.write(`Generating ${configFile}`);
				await writeFile(
					args.abs(configFile),
					configContents.join('\n'),
					'utf8',
				);

				cmake.push(
					`configure_package_config_file("cmake/${configFile.basename}"`,
					`"\${CMAKE_CURRENT_BINARY_DIR}/${lib.name}-config.cmake"`,
					`INSTALL_DESTINATION "\${${configDirVar}}"`,
					`PATH_VARS ${configDirVar}`,
					')',
					'',
					'write_basic_package_version_file(',
					`"\${CMAKE_CURRENT_BINARY_DIR}/${lib.name}-config-version.cmake"`,
					'COMPATIBILITY SameMajorVersion',
					')',
					'',
					'install(FILES',
					`"\${CMAKE_CURRENT_BINARY_DIR}/${lib.name}-config.cmake"`,
					`"\${CMAKE_CURRENT_BINARY_DIR}/${lib.name}-config-version.cmake"`,
					`DESTINATION "\${${configDirVar}}"`,
					')',
				);
			}

			cmake.push('');

			// create CMakeLists.txt
			const cmakeLists = dir.join('CMakeLists.txt');
			args.logStream.write(`Write ${cmakeLists}\n`);
			await writeFile(args.abs(cmakeLists), cmake.join('\n'), 'utf8');

			// create archive
			const oldCwd = cwd();
			try {
				chdir(args.abs(dir.dir()));
				await args.spawn('tar', ['cfz', args.abs(this.dist), dir.basename]);
			} finally {
				chdir(oldCwd);
			}
		});
	}
}

function isImported(
	lib: IFindPackageResult | Library,
): lib is IFindPackageResult {
	return lib && typeof (lib as Library).binary === 'undefined';
}
