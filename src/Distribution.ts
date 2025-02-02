import { Makefile, PathLike, Path, IBuildPath } from 'esmakefile';
import { platform } from 'node:os';

export interface IDistributionOpts {
	name: string;
	version: string;
}

export interface IAddExecutableOpts {
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
}

class WindowsDevPlatform implements DevPlatform {
	exeName(name: string): string {
		return name + '.exe';
	}
}

class PosixDevPlatform implements DevPlatform {
	exeName(name: string): string {
		return name;
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

interface IDistribution {
	name: string;
	version: string;

	// Translates to find_package or pkg_check_modules
	// At dev time, only uses pkg-config
	pkgRefs: IPackageImport[];

	// Translates to add_executable
	executables: IExecutable[];

	// Translates to add_library
	libraries: ILibrary[];
}

export class Distribution {
	readonly make: Makefile;
	readonly name: string;
	readonly version: string;
	readonly outDir: IBuildPath;
	readonly devCmakeLists: IBuildPath;

	private _devPlatform: DevPlatform;
	private _executables: IExecutable[] = [];

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
			linkTo: [],
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

		const devOutName = this._devPlatform.exeName(exe.name);
		const t = new Target(this.outDir.join(devOutName));

		this.make.add(t.path, objs, (args) => {
			const objsAbs = args.absAll(...objs);
			return args.spawn('cc', ['-o', args.abs(t.path), ...objsAbs]);
		});

		return t;
	}
}
