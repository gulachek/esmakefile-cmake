import { ICompiler } from './Compiler.js';
import { Executable, IExecutable } from './Executable.js';
import { ILibrary, Library, ResolvedLibraryType } from './Library.js';
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

		const e = new Executable(exe.name, exe.outDir.join(exe.name + '.exe'));

		const linkFlags: string[] = [];
		const libDeps = [];
		if (exe.linkTo.length > 0) {
			for (const l of exe.linkTo) {
				const libFile = l.importLibrary || l.binary; // only dll will have importLibrary
				linkFlags.push(this.make.abs(libFile));
				libDeps.push(libFile);
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

		if (lib.type === ResolvedLibraryType.static) {
			const path = lib.outDir.join(lib.name + '.lib');
			const l = new Library(lib.name, path);

			this.make.add(path, objs, (args) => {
				const objsAbs = args.absAll(...objs);
				return args.spawn(this.lib, [
					'/nologo',
					`/OUT:${args.abs(path)}`,
					...objsAbs,
				]);
			});
			return l;
		} else {
			const path = lib.outDir.join(lib.name + '.dll');
			const importPath = lib.outDir.join(lib.name + '.lib');
			const l = new Library(lib.name, path);
			l.importLibrary = importPath;

			this.make.add([path, importPath], objs, (args) => {
				const objsAbs = args.absAll(...objs);
				return args.spawn(this.cc, [
					'/nologo',
					'/LD',
					`/Fe${args.abs(path)}`,
					...objsAbs,
				]);
			});
			return l;
		}
	}
}
