import { platform } from 'node:os';
import { ICompiler } from './Compiler.js';
import { Executable, IExecutable } from './Executable.js';
import {
	ILibrary,
	Library,
	ResolvedLibraryType,
	allIncludes,
	makeLibrary,
} from './Library.js';
import { Makefile, Path, IBuildPath } from 'esmakefile';
import { PkgConfig } from 'espkg-config';
import { isCxxSrc, isCxxLink } from './Source.js';

export class GccCompiler implements ICompiler {
	private make: Makefile;
	private _dylibExt: string;
	private cc: string;
	private cxx: string;
	private ar: string;
	private requiresRpath: boolean = false;
	private _pkg: PkgConfig;

	constructor(make: Makefile, pkg: PkgConfig) {
		this.make = make;
		this.cc = 'cc';
		this.cxx = 'c++';
		this.ar = 'ar';
		this._pkg = pkg;

		if (platform() === 'darwin') {
			this._dylibExt = '.dylib';
		} else {
			this._dylibExt = '.so';
			this.requiresRpath = true;
		}
	}

	public addExecutable(exe: IExecutable): Executable {
		const includeFlags = allIncludes(exe).map((i) => {
			return `-I${this.make.abs(i)}`;
		});

		const objs: IBuildPath[] = [];

		const pkgNames = exe.pkgs.map((p) => p.name);

		for (const s of exe.src) {
			const obj = Path.gen(s, { ext: '.o' });
			objs.push(obj);

			this.make.add(obj, [s], async (args) => {
				let cc = this.cc;
				if (isCxxSrc(s)) {
					cc = this.cxx;
				}

				const { flags: pkgCflags } = await this._pkg.cflags(pkgNames);
				return args.spawn(cc, [
					'-c',
					...pkgCflags,
					...includeFlags,
					'-o',
					args.abs(obj),
					args.abs(s),
				]);
			});
		}

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

		this.make.add(e.binary, [...libDeps, ...objs], async (args) => {
			let cc = this.cc;
			if (linkCxx) {
				cc = this.cxx;
			}

			// TODO - dynamic linking too
			const { flags: pkgLibs } = await this._pkg.staticLibs(pkgNames);

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
		const includeFlags = allIncludes(lib).map((i) => {
			return `-I${this.make.abs(i)}`;
		});

		const objs: IBuildPath[] = [];

		for (const s of lib.src) {
			const obj = Path.gen(s, { ext: '.o' });
			objs.push(obj);

			this.make.add(obj, [s], (args) => {
				return args.spawn(this.cc, [
					'-c',
					'-fPIC',
					...includeFlags,
					'-o',
					args.abs(obj),
					args.abs(s),
				]);
			});
		}

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
