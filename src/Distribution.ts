import { Makefile, PathLike, Path, IBuildPath } from 'esmakefile';
import { ICompiler } from './Compiler.js';
import { GccCompiler } from './GccCompiler.js';
import { platform } from 'node:os';
import { Executable, IExecutable } from './Executable.js';
import { ILibrary, Library } from './Library.js';

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

type CompilerFrontEnd = 'gcc' | 'msvc';
type TargetPlatform = 'native'; // can be extended to wasm, cross compiling for specific platform, etc

export class Distribution {
	readonly make: Makefile;
	readonly name: string;
	readonly version: string;
	readonly outDir: IBuildPath;
	readonly devCmakeLists: IBuildPath;

	private _executables: IExecutable[] = [];
	private _libraries: ILibrary[] = [];
	private _compiler: ICompiler;

	constructor(make: Makefile, opts: IDistributionOpts) {
		this.make = make;
		this.name = opts.name;
		this.version = opts.version;
		this.outDir = Path.build(this.name);
		this.devCmakeLists = this.outDir.join('CMakeLists.txt');
		this._compiler = new GccCompiler(make);

		/*
		let frontEnd: CompilerFrontEnd = 'gcc';
		const targetPlatform: TargetPlatform = 'native';

		if (platform() === 'win32' && targetPlatform === 'native') {
			// TODO: mingw / gcc front end. Probably explicit
			// configuration. Maybe can detect
			frontEnd = 'msvc';
		}
	 */
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
}
