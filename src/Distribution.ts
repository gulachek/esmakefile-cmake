import { Makefile, PathLike, Path, IBuildPath } from 'esmakefile';
import { platform } from 'node:os';

export interface IDistributionOpts {
	name: string;
	version: string;
}

export interface IAddExecutableOpts {
	name: string;
	src: PathLike[];
	linkTo?: ILinkable[];
}

export interface IAddLibraryOpts {
	name: string;
	src: PathLike[];
}

export class Target {
	constructor(p: IBuildPath) {
		this.path = p;
	}

	readonly path: IBuildPath;
}

interface DevPlatform {
	/** Turn a name from addExecutable into a file name */
	exeName(name: string): string;
	libName(name: string, isDynamic: boolean): string;
}

class WindowsDevPlatform implements DevPlatform {
	exeName(name: string): string {
		return name + '.exe';
	}

	libName(name: string, _isDynamic: boolean): string {
		return name + '.lib'; // todo dll
	}
}

class PosixDevPlatform implements DevPlatform {
	private _dylibSuffix;

	constructor() {
		if (platform() === 'darwin') {
			this._dylibSuffix = '.dylib';
		} else {
			this._dylibSuffix = '.so';
		}
	}

	exeName(name: string): string {
		return name;
	}

	libName(name: string, isDynamic: boolean): string {
		if (isDynamic) {
			return `lib${name}${this._dylibSuffix}`;
		} else {
			return `lib${name}.a`;
		}
	}
}

interface IExecutable {
	name: string;
	src: Path[];
	includeDirs: Path[];
	linkTo: ILinkable[];
}

interface ILinkable {}

interface ILibrary extends ILinkable {
	name: string;
	src: Path[];
	includeDirs: Path[];
	linkTo: ILinkable[];
}

interface IPkgConfigImport {
	name: string;
	constraint?: string;
}

interface ICmakePackageImport {
	name: string;
	version?: string;
	required: boolean;
}

interface IPackageImport extends ILinkable {
	pkgConfig?: IPkgConfigImport;
	cmake?: ICmakePackageImport;
}

export class Distribution {
	readonly make: Makefile;
	readonly name: string;
	readonly version: string;
	readonly outDir: IBuildPath;
	readonly devCmakeLists: IBuildPath;

	private _devPlatform: DevPlatform;
	private _executables: IExecutable[] = [];
	private _libraries: ILibrary[] = [];

	constructor(make: Makefile, opts: IDistributionOpts) {
		this.make = make;
		this.name = opts.name;
		this.version = opts.version;
		this.outDir = Path.build(this.name);
		this.devCmakeLists = this.outDir.join('CMakeLists.txt');

		if (platform() === 'win32') {
			this._devPlatform = new WindowsDevPlatform();
		} else {
			this._devPlatform = new PosixDevPlatform();
		}
	}

	addExecutable(opts: IAddExecutableOpts): Target {
		// TODO validate opts
		const exe: IExecutable = {
			name: opts.name,
			src: opts.src.map((s) => Path.src(s)),
			includeDirs: [Path.src('include')],
			linkTo: opts.linkTo || [],
		};

		this._executables.push(exe);

		const includeFlags = exe.includeDirs.map((i) => {
			return `-I${this.make.abs(i)}`;
		});

		const objs: IBuildPath[] = [];

		for (const s of exe.src) {
			const obj = Path.gen(s, { ext: '.o' });
			objs.push(obj);

			this.make.add(obj, [s], (args) => {
				return args.spawn('cc', [
					'-c',
					...includeFlags,
					'-o',
					args.abs(obj),
					args.abs(s),
				]);
			});
		}

		const devOutName = this._devPlatform.exeName(exe.name);
		const t = new Target(this.outDir.join(devOutName));

		const linkFlags: string[] = [];
		const libDeps = [];
		if (exe.linkTo.length > 0) {
			linkFlags.push(`-L${this.make.abs(this.outDir)}`);
			for (const l of exe.linkTo) {
				const lib = l as ILibrary;
				// TODO handle dynamic & import
				const libPath = this.outDir.join(
					this._devPlatform.libName(lib.name, false),
				);
				linkFlags.push(`-l${lib.name}`);
				libDeps.push(libPath);
			}
		}

		this.make.add(t.path, [...libDeps, ...objs], (args) => {
			const objsAbs = args.absAll(...objs);
			return args.spawn('cc', [
				'-o',
				args.abs(t.path),
				...linkFlags,
				...objsAbs,
			]);
		});

		return t;
	}

	addLibrary(opts: IAddLibraryOpts): ILibrary {
		// TODO validate opts
		const lib: ILibrary = {
			name: opts.name,
			src: opts.src.map((s) => Path.src(s)),
			includeDirs: [Path.src('include')],
			linkTo: [],
		};

		this._libraries.push(lib);

		const includeFlags = lib.includeDirs.map((i) => {
			return `-I${this.make.abs(i)}`;
		});

		const objs: IBuildPath[] = [];

		for (const s of lib.src) {
			const obj = Path.gen(s, { ext: '.o' });
			objs.push(obj);

			this.make.add(obj, [s], (args) => {
				debugger;
				return args.spawn('cc', [
					'-c',
					...includeFlags,
					'-o',
					args.abs(obj),
					args.abs(s),
				]);
			});
		}

		// TODO dynamic libraries
		const devOutName = this._devPlatform.libName(lib.name, false);
		const path = this.outDir.join(devOutName);

		this.make.add(path, objs, (args) => {
			const objsAbs = args.absAll(...objs);
			return args.spawn('ar', ['rcs', args.abs(path), ...objsAbs]);
		});

		return lib;
	}
}
