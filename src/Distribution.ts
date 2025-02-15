import { Makefile, PathLike, Path, IBuildPath } from 'esmakefile';
import { ICompiler } from './Compiler.js';
import { GccCompiler } from './GccCompiler.js';
import { MsvcCompiler } from './MsvcCompiler.js';
import { Executable, IExecutable } from './Executable.js';
import {
	ILibrary,
	Library,
	ResolvedLibraryType,
	IImportedLibrary,
	isImported,
} from './Library.js';
import { mkdir, copyFile, writeFile, cp } from 'node:fs/promises';
import { chdir, cwd } from 'node:process';
import { platform } from 'node:os';
import { readFileSync } from 'node:fs';
import { PkgConfig } from 'espkg-config';
import { resolve } from 'node:path';

export interface IDistributionOpts {
	name: string;
	version: string;
}

export interface IAddExecutableOpts {
	name: string;
	src: PathLike[];
	linkTo?: (Library | IImportedLibrary)[];
}

export interface IAddTestOpts extends IAddExecutableOpts {}

export interface ITest {
	exe: Executable;
	run: IBuildPath;
}

export enum LibraryType {
	default = 'default',
	static = 'static',
	dynamic = 'dynamic',
}

export interface IAddLibraryOpts {
	name: string;
	src: PathLike[];
	includeDirs?: PathLike[];
	type?: LibraryType;
}

export class Distribution {
	readonly make: Makefile;
	readonly name: string;
	readonly version: string;
	readonly outDir: IBuildPath;
	readonly dist: IBuildPath;
	readonly test: IBuildPath;

	private _executables: IExecutable[] = [];
	private _libraries: ILibrary[] = [];
	private _installedTargets: string[] = [];

	private _compiler: ICompiler;
	private _defaultLibraryType: ResolvedLibraryType = ResolvedLibraryType.static;
	private _pkg: PkgConfig;

	constructor(make: Makefile, opts: IDistributionOpts) {
		this.make = make;
		this.name = opts.name;
		this.version = opts.version;
		this.outDir = Path.build(this.name);
		this.dist = Path.build(`${this.name}-${this.version}.tgz`);
		this.test = Path.build(`test-${this.name}`);

		this._pkg = new PkgConfig({
			// TODO - relative to cwd or srcdir or what?
			searchPaths: [resolve('vendor/lib/pkgconfig')],
		});

		if (platform() === 'win32') {
			this._compiler = new MsvcCompiler(make);
		} else {
			this._compiler = new GccCompiler(make, this._pkg);
		}

		this._parseConfig();
		this._addDist();
	}

	addExecutable(opts: IAddExecutableOpts): Executable {
		// TODO validate opts
		const linkTo: Library[] = [];
		const pkgs: IImportedLibrary[] = [];
		if (opts.linkTo) {
			for (const l of opts.linkTo) {
				if (isImported(l)) {
					pkgs.push(l);
				} else {
					linkTo.push(l);
				}
			}
		}

		const exe: IExecutable = {
			name: opts.name,
			outDir: this.outDir,
			src: opts.src.map((s) => Path.src(s)),
			includeDirs: [Path.src('include')],
			linkTo,
			pkgs,
		};

		this._executables.push(exe);

		return this._compiler.addExecutable(exe);
	}

	addLibrary(opts: IAddLibraryOpts): Library {
		// TODO validate opts
		const includeDirs: Path[] = [];
		if (opts.includeDirs) {
			for (const i of opts.includeDirs) {
				includeDirs.push(Path.src(i));
			}
		} else {
			includeDirs.push(Path.src('include'));
		}

		const lib: ILibrary = {
			name: opts.name,
			outDir: this.outDir,
			src: opts.src.map((s) => Path.src(s)),
			includeDirs,
			linkTo: [],
			type: this._resolveLibraryType(opts.type || LibraryType.default),
		};

		this._libraries.push(lib);

		return this._compiler.addLibrary(lib);
	}

	install(target: Executable | Library): void {
		this._installedTargets.push(target.name);
	}

	findPackage(name: string): IImportedLibrary {
		return { name };
	}

	// TODO - exclude from distribution
	addTest(opts: IAddTestOpts): ITest {
		const exe = this.addExecutable(opts);

		const run = Path.gen(exe.binary, { ext: '.run' });
		this.make.add(run, [exe.binary], (args) => {
			return args.spawn(args.abs(exe.binary), []);
		});

		this.make.add(this.test, [run]);

		return { exe, run };
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
		const configFile = `${this.name}-config.json`;
		let configContents: string = '';
		try {
			configContents = readFileSync(configFile, 'utf8');
		} catch {
			// TODO add error to Makefile if anything other than file not existing
		}

		if (configContents) {
			// this can throw. TODO to add error to Makefile
			const config = JSON.parse(configContents);
			const buildSharedLibs = config['build-shared-libs'];
			switch (typeof buildSharedLibs) {
				case 'boolean':
				case 'undefined':
					break;
				default:
					throw new Error(
						`(${configFile}): build-shared-libs can only be boolean type`,
					);
			}

			if (buildSharedLibs) {
				this._defaultLibraryType = ResolvedLibraryType.dynamic;
			}
		}
	}

	private _addDist(): void {
		this.make.add('dist-' + this.name, [this.dist]);
		// must add follow-up rules to make dist depend on source
		this.make.add(this.dist, [], async (args) => {
			const cmake: string[] = [
				'# GENERATED BY esmakefile-cmake',
				'cmake_minimum_required(VERSION 3.8)',
				`project(${this.name} VERSION ${this.version})`,
				'include(GNUInstallDirs)',
				'',
			];

			// copy all source
			const dir = Path.build(`${this.name}-${this.version}`);
			const dirAbs = args.abs(dir);

			args.logStream.write(`Making ${dirAbs}\n`);
			await mkdir(dirAbs, { recursive: true });
			args.logStream.write(`Done making ${dirAbs}\n`);

			for (const exe of this._executables) {
				cmake.push(`add_executable(${exe.name}`);
				for (const s of exe.src) {
					// Not actually necessary to await at individual
					// iteration level. TODO evaluate performance of this.
					// Probably could blow up
					cmake.push(`\t${s.rel()}`);
					const dest = dir.join(s.rel());
					args.logStream.write(`Copy ${s} -> ${dest}\n`);
					await mkdir(args.abs(dest.dir()), { recursive: true });
					await copyFile(args.abs(s), args.abs(dest));
					args.logStream.write(`(done) Copy ${s} -> ${dest}\n`);
				}
				cmake.push(')');

				// Copy all includes into dist/include
				for (const i of exe.includeDirs) {
					const dest = dir.join('include');
					args.logStream.write(`Copy ${i} -> ${dest}\n`);
					await cp(args.abs(i), args.abs(dest), { recursive: true });
					args.logStream.write(`(done) Copy ${i} -> ${dest}\n`);
				}

				if (exe.includeDirs.length > 0) {
					cmake.push(
						`\ntarget_include_directories(${exe.name} PRIVATE include)`,
					);
				}
			}

			cmake.push('');

			const pkgconfig = dir.join('pkgconfig');

			if (this._libraries.length > 0) {
				args.logStream.write(`Creating ${pkgconfig}`);
				await mkdir(args.abs(pkgconfig), { recursive: true });

				// TODO only if installed
				cmake.push('\ninstall(DIRECTORY include/ TYPE INCLUDE)');
			}

			for (const lib of this._libraries) {
				cmake.push(`add_library(${lib.name}`);
				for (const s of lib.src) {
					cmake.push(`\t${s.rel()}`);
					const dest = dir.join(s.rel());
					args.logStream.write(`Copy ${s} -> ${dest}\n`);
					await mkdir(args.abs(dest.dir()), { recursive: true });
					await copyFile(args.abs(s), args.abs(dest));
					args.logStream.write(`(done) Copy ${s} -> ${dest}\n`);
				}
				cmake.push(')');

				// Copy all includes into dist/include
				for (const i of lib.includeDirs) {
					const dest = dir.join('include');
					args.logStream.write(`Copy ${i} -> ${dest}\n`);
					await cp(args.abs(i), args.abs(dest), { recursive: true });
					args.logStream.write(`(done) Copy ${i} -> ${dest}\n`);
				}

				if (lib.includeDirs.length > 0) {
					cmake.push(
						`\ntarget_include_directories(${lib.name} PRIVATE include)`,
					);
				}

				// Install .pc file
				// TODO Libs.private: -lc++ for c++ library?
				const pc: string[] = [
					'prefix=${pcfiledir}/../..',
					'libdir=${prefix}/lib',
					'includedir=${prefix}/include',
					'',
					`Name: ${lib.name}`,
					`Version: ${this.version}`,
					'Description: generated by esmakefile-cmake',
					'Cflags: -I${includedir}',
					`Libs: -L\${libdir} -l${lib.name}`,
				]; // TODO Requires

				const pcFile = `${lib.name}.pc`;
				const dest = pkgconfig.join(pcFile);
				args.logStream.write(`Writing ${dest}`);
				await writeFile(args.abs(dest), pc.join('\n'), 'utf8');

				// TODO - only if installed
				cmake.push(
					`\ninstall(FILES pkgconfig/${pcFile}`,
					'\tDESTINATION "${CMAKE_INSTALL_LIBDIR}/pkgconfig"',
					')',
				);
			}

			cmake.push('');

			for (const name of this._installedTargets) {
				cmake.push(`install(TARGETS ${name})`);
			}

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
