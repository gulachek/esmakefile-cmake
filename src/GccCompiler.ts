import { ICompiler } from './Compiler.js';
import { Executable, IExecutable } from './Executable.js';
import { ILibrary, Library } from './Library.js';
import { Makefile, Path, IBuildPath } from 'esmakefile';

export class GccCompiler implements ICompiler {
	private make: Makefile;
	constructor(make: Makefile) {
		this.make = make;
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
				return args.spawn('cc', [
					'-c',
					...includeFlags,
					'-o',
					args.abs(obj),
					args.abs(s),
				]);
			});
		}

		const e = new Executable(exe.outDir.join(exe.name));

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

		this.make.add(e.binary, [...libDeps, ...objs], (args) => {
			const objsAbs = args.absAll(...objs);
			return args.spawn('cc', [
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
		const devOutName = `lib${lib.name}.a`;
		const path = lib.outDir.join(devOutName);
		const l = new Library(lib.name, path);

		this.make.add(path, objs, (args) => {
			const objsAbs = args.absAll(...objs);
			return args.spawn('ar', ['rcs', args.abs(path), ...objsAbs]);
		});

		return l;
	}
}
