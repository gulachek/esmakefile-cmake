import { platform } from 'node:os';
import { ICompiler } from './Compiler.js';
import { Executable, IExecutable } from './Executable.js';
import { ILibrary, Library, ResolvedLibraryType } from './Library.js';
import { Makefile, Path, IBuildPath } from 'esmakefile';

export class GccCompiler implements ICompiler {
	private make: Makefile;
	private _dylibExt: string;
	private cc: string;
	private ar: string;
	private requiresRpath: boolean = false;

	constructor(make: Makefile) {
		this.make = make;
		this.cc = 'cc';
		this.ar = 'ar';

		if (platform() === 'darwin') {
			this._dylibExt = '.dylib';
		} else {
			this._dylibExt = '.so';
			this.requiresRpath = true;
		}
	}

	public addExecutable(exe: IExecutable): Executable {
		const includeFlags = exe.includeDirs.map((i) => {
			return `-I${this.make.abs(i)}`;
		});

		const objs: IBuildPath[] = [];

		for (const s of exe.src) {
			const obj = Path.gen(s, { ext: '.o' });
			objs.push(obj);

			this.make.add(obj, [s], (args) => {
				return args.spawn(this.cc, [
					'-c',
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

		this.make.add(e.binary, [...libDeps, ...objs], (args) => {
			const objsAbs = args.absAll(...objs);
			return args.spawn(this.cc, [
				'-o',
				args.abs(e.binary),
				...objsAbs,
				...linkFlags,
			]);
		});

		return e;
	}

	public addLibrary(lib: ILibrary): Library {
		const includeFlags = lib.includeDirs.map((i) => {
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
			const l = new Library(lib.name, path);

			this.make.add(path, objs, (args) => {
				const objsAbs = args.absAll(...objs);
				return args.spawn(this.ar, ['rcs', args.abs(path), ...objsAbs]);
			});
			return l;
		} else {
			const path = lib.outDir.join(`lib${lib.name}${this._dylibExt}`);
			const l = new Library(lib.name, path);

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
