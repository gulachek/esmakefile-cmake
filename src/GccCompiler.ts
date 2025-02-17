import { platform } from 'node:os';
import { ICompiler } from './Compiler.js';
import { Executable, IExecutable } from './Executable.js';
import {
	ILibrary,
	Library,
	ResolvedLibraryType,
	allIncludes,
	makeLibrary,
	ILinkedCompilation,
} from './Library.js';
import { Makefile, Path, IBuildPath } from 'esmakefile';
import { PkgConfig } from 'espkg-config';
import { isCxxSrc, isCxxLink, CStandard, CxxStandard } from './Source.js';

export class GccCompiler implements ICompiler {
	private make: Makefile;
	private _dylibExt: string;
	private cc: string;
	private cxx: string;
	private ar: string;
	private requiresRpath: boolean = false;
	private _pkg: PkgConfig;
	private _cStd?: CStandard;
	private _cxxStd?: CxxStandard;

	constructor(
		make: Makefile,
		pkg: PkgConfig,
		cStd?: CStandard,
		cxxStd?: CxxStandard,
	) {
		this.make = make;
		this.cc = 'cc';
		this.cxx = 'c++';
		this.ar = 'ar';
		this._pkg = pkg;
		this._cStd = cStd;
		this._cxxStd = cxxStd;

		if (platform() === 'darwin') {
			this._dylibExt = '.dylib';
		} else {
			this._dylibExt = '.so';
			this.requiresRpath = true;
		}
	}

	private _compile(c: ILinkedCompilation): IBuildPath[] {
		const includeFlags = allIncludes(c).map((i) => {
			return `-I${this.make.abs(i)}`;
		});

		const objs: IBuildPath[] = [];

		// TODO transitive deps
		const pkgNames = c.pkgs.map((p) => p.name);

		for (const s of c.src) {
			const obj = Path.gen(s, { ext: '.o' });
			objs.push(obj);

			this.make.add(obj, [s], async (args) => {
				const flags = ['-c'];

				let cc: string;
				if (isCxxSrc(s)) {
					cc = this.cxx;
					if (this._cxxStd) flags.push(`-std=c++${this._cxxStd}`);
				} else {
					cc = this.cc;
					if (this._cStd) flags.push(`-std=c${this._cStd}`);
				}

				const { flags: pkgCflags } = await this._pkg.cflags(pkgNames);
				return args.spawn(cc, [
					...flags,
					...pkgCflags,
					...includeFlags,
					'-o',
					args.abs(obj),
					args.abs(s),
				]);
			});
		}

		return objs;
	}

	public addExecutable(exe: IExecutable): Executable {
		const objs = this._compile(exe);

		const e = new Executable(exe.name, exe.outDir.join(exe.name));

		const linkFlags: string[] = [];
		const libDeps = [];
		if (exe.linkTo.length > 0) {
			linkFlags.push(`-L${this.make.abs(exe.outDir)}`);
			for (const l of exe.linkTo) {
				// TODO handle dynamic & import
				linkFlags.push(`-l${l.name}`);
				libDeps.push(l.binary);
			}
		}

		if (this.requiresRpath) {
			linkFlags.push(`-Wl,-rpath=$ORIGIN`);
		}

		const linkCxx = isCxxLink(exe.src);
		const pkgNames = exe.pkgs.map((p) => p.name);

		this.make.add(e.binary, [...libDeps, ...objs], async (args) => {
			let cc = this.cc;
			if (linkCxx) {
				cc = this.cxx;
			}

			// TODO - dynamic linking too
			const { flags: pkgLibs } = await this._pkg.libs(pkgNames, {
				static: true,
			});

			const objsAbs = args.absAll(...objs);
			return args.spawn(cc, [
				'-o',
				args.abs(e.binary),
				...objsAbs,
				...linkFlags,
				...pkgLibs,
			]);
		});

		return e;
	}

	public addLibrary(lib: ILibrary): Library {
		const objs = this._compile(lib);

		if (lib.type === ResolvedLibraryType.static) {
			const path = lib.outDir.join(`lib${lib.name}.a`);
			const l = makeLibrary(lib, path);

			this.make.add(path, objs, (args) => {
				const objsAbs = args.absAll(...objs);
				return args.spawn(this.ar, ['rcs', args.abs(path), ...objsAbs]);
			});
			return l;
		} else {
			const path = lib.outDir.join(`lib${lib.name}${this._dylibExt}`);
			const l = makeLibrary(lib, path);

			this.make.add(path, objs, (args) => {
				const objsAbs = args.absAll(...objs);
				return args.spawn(this.cc, [
					'-shared',
					'-o',
					args.abs(path),
					...objsAbs,
				]);
			});
			return l;
		}
	}
}
