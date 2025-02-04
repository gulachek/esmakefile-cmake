import { Makefile, PathLike, Path, IBuildPath } from 'esmakefile';
import { ICompiler } from './Compiler.js';
import { GccCompiler } from './GccCompiler.js';
import { Executable, IExecutable } from './Executable.js';
import { ILibrary, Library } from './Library.js';
import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import { chdir, cwd } from 'node:process';

export interface IDistributionOpts {
	name: string;
	version: string;
}

export interface IAddExecutableOpts {
	name: string;
	src: PathLike[];
	linkTo?: Library[];
}

export interface IAddLibraryOpts {
	name: string;
	src: PathLike[];
}

export class Distribution {
	readonly make: Makefile;
	readonly name: string;
	readonly version: string;
	readonly outDir: IBuildPath;
	readonly dist: IBuildPath;

	private _executables: IExecutable[] = [];
	private _libraries: ILibrary[] = [];
	private _compiler: ICompiler;

	constructor(make: Makefile, opts: IDistributionOpts) {
		this.make = make;
		this.name = opts.name;
		this.version = opts.version;
		this.outDir = Path.build(this.name);
		this.dist = Path.build(`${this.name}-${this.version}.tgz`);
		this._compiler = new GccCompiler(make);

		this._addDist();
	}

	addExecutable(opts: IAddExecutableOpts): Executable {
		// TODO validate opts
		const exe: IExecutable = {
			name: opts.name,
			outDir: this.outDir,
			src: opts.src.map((s) => Path.src(s)),
			includeDirs: [Path.src('include')],
			linkTo: opts.linkTo || [],
		};

		this._executables.push(exe);

		return this._compiler.addExecutable(exe);
	}

	addLibrary(opts: IAddLibraryOpts): Library {
		// TODO validate opts
		const lib: ILibrary = {
			name: opts.name,
			outDir: this.outDir,
			src: opts.src.map((s) => Path.src(s)),
			includeDirs: [Path.src('include')],
			linkTo: [],
		};

		this._libraries.push(lib);

		return this._compiler.addLibrary(lib);
	}

	private _addDist(): void {
		this.make.add('dist-' + this.name, [this.dist]);
		// must add follow-up rules to make dist depend on source
		this.make.add(this.dist, [], async (args) => {
			const cmake: string[] = [
				'cmake_minimum_required(VERSION 3.8)',
				`project(${this.name} VERSION ${this.version})`,
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
					// Not actually necessary to await. TODO evaluate
					// performance of this. Probably could blow up
					cmake.push(`\t${s.rel()}`);
					const dest = dir.join(s.rel());
					args.logStream.write(`Copy ${s} -> ${dest}\n`);
					await mkdir(args.abs(dest.dir()), { recursive: true });
					await copyFile(args.abs(s), args.abs(dest));
					args.logStream.write(`(done) Copy ${s} -> ${dest}\n`);
				}
				cmake.push(')');
				cmake.push(`install(TARGETS ${exe.name})`);
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
