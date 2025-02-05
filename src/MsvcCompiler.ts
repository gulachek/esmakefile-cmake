import { ICompiler } from './Compiler.js';
import { Executable, IExecutable } from './Executable.js';
import { ILibrary, Library } from './Library.js';
import { Makefile, Path, IBuildPath } from 'esmakefile';

export class MsvcCompiler implements ICompiler {
	private make: Makefile;
	private cc: string;
	private lib: string;

	constructor(make: Makefile) {
		this.make = make;
		this.cc = 'cl.exe';
		this.lib = 'lib.exe';
	}

	public addExecutable(exe: IExecutable): Executable {
		const includeFlags: string[] = [];
		for (const i of exe.includeDirs) {
			includeFlags.push('/I', this.make.abs(i));
		}

		const objs: IBuildPath[] = [];

		for (const s of exe.src) {
			const obj = Path.gen(s, { ext: '.obj' });
			objs.push(obj);

			this.make.add(obj, [s], (args) => {
				return args.spawn(this.cc, [
					'/nologo',
					'/c',
					...includeFlags,
					`/Fo${args.abs(obj)}`,
					args.abs(s),
				]);
			});
		}

		const e = new Executable(exe.outDir.join(exe.name + '.exe'));

		const linkFlags: string[] = [];
		const libDeps = [];
		if (exe.linkTo.length > 0) {
			linkFlags.push(`/L${this.make.abs(exe.outDir)}`);
			for (const l of exe.linkTo) {
				// TODO handle dynamic & import
				linkFlags.push(this.make.abs(l.binary));
				libDeps.push(l.binary);
			}
		}

		this.make.add(e.binary, [...libDeps, ...objs], (args) => {
			const objsAbs = args.absAll(...objs);
			return args.spawn(this.cc, [
				'/nologo',
				`/Fe${args.abs(e.binary)}`,
				...linkFlags,
				...objsAbs,
			]);
		});

		return e;
	}

	public addLibrary(lib: ILibrary): Library {
		const includeFlags: string[] = [];
		for (const i of lib.includeDirs) {
			includeFlags.push('/I', this.make.abs(i));
		}

		const objs: IBuildPath[] = [];

		for (const s of lib.src) {
			const obj = Path.gen(s, { ext: '.obj' });
			objs.push(obj);

			this.make.add(obj, [s], (args) => {
				return args.spawn(this.cc, [
					'/nologo',
					'/c',
					...includeFlags,
					`/Fo${args.abs(obj)}`,
					args.abs(s),
				]);
			});
		}

		// TODO dynamic libraries
		const path = lib.outDir.join(lib.name + '.lib');
		const l = new Library(lib.name, path);

		this.make.add(path, objs, (args) => {
			const objsAbs = args.absAll(...objs);
			return args.spawn(this.lib, ['/nologo', `/OUT:${args.abs(path)}`, ...objsAbs]);
		});

		return l;
	}
}
