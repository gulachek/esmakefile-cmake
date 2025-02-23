import { platform } from 'node:os';
import { ICompiler, ICompilerArgs } from './Compiler.js';
import { Executable, IExecutable } from './Executable.js';
import {
	ILibrary,
	Library,
	ResolvedLibraryType,
	allIncludes,
	makeLibrary,
	ILinkedCompilation,
	allPkgDeps,
	pkgLibFile,
	IPkgDeps,
	allLibs,
} from './Library.js';
import { Makefile, Path, IBuildPath } from 'esmakefile';
import { PkgConfig } from 'espkg-config';
import { isCxxSrc, isCxxLink, CStandard, CxxStandard } from './Source.js';
import { writeFile } from 'node:fs/promises';

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

	constructor(args: ICompilerArgs) {
		this.make = args.make;
		this.cc = 'cc';
		this.cxx = 'c++';
		this.ar = 'ar';
		this._pkg = args.pkg;
		this._cStd = args.cStd;
		this._cxxStd = args.cxxStd;

		if (platform() === 'darwin') {
			this._dylibExt = '.dylib';
		} else {
			this._dylibExt = '.so';
			this.requiresRpath = true;
		}
	}

	private _compile(c: ILinkedCompilation, fPIC: boolean): IBuildPath[] {
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
				if (fPIC) flags.push('-fPIC');

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

	private _link(
		c: ILinkedCompilation,
		isLib: boolean,
		path: IBuildPath,
		objs: IBuildPath[],
		pkgDeps: IPkgDeps,
	): void {
		const libs = allLibs(c);

		this.make.add(
			path,
			[...objs, ...pkgDeps.prereqs, ...libs],
			async (args) => {
				let cc = this.cc;
				if (isCxxLink(c.src)) {
					cc = this.cxx;
				}

				const objsAbs = args.absAll(...objs);

				const { flags: pkgLibs } = await this._pkg.libs(pkgDeps.names);

				const flags: string[] = [];
				if (isLib) {
					flags.push('-shared');
				}

				if (this.requiresRpath) {
					flags.push(`-Wl,-rpath=$ORIGIN`);
				}

				return args.spawn(cc, [
					...flags,
					'-o',
					args.abs(path),
					...objsAbs,
					...pkgLibs,
				]);
			},
		);
	}

	public addExecutable(exe: IExecutable): Executable {
		const objs = this._compile(exe, false);

		const e = new Executable(exe.name, exe.outDir.join(exe.name));

		const pkgDeps = allPkgDeps(exe);

		this._link(exe, false, e.binary, objs, pkgDeps);

		return e;
	}

	public addLibrary(lib: ILibrary): Library {
		const pkgDeps = allPkgDeps(lib);

		// TODO - Distribution-specific pkgconfig dir?
		const pcFile = pkgLibFile(lib.name);

		this.make.add(pcFile, async (args) => {
			const contents: string[] = [
				`Name: ${lib.name}`,
				'Version:',
				'Description:',
			];

			const cflags = lib.includeDirs.map((p) => `-I${args.abs(p)}`);
			contents.push(`Cflags: ${cflags.join(' ')}`);

			const libs = `-L${args.abs(lib.outDir)} -l${lib.name}`;
			contents.push(`Libs: ${libs}`);

			const reqs = pkgDeps.names.join(' ');
			if (lib.type === ResolvedLibraryType.dynamic) {
				contents.push(`Requires.private: ${reqs}`);
			} else {
				contents.push(`Requires: ${reqs}`);
			}

			await writeFile(args.abs(pcFile), contents.join('\n'), 'utf8');
		});

		const objs = this._compile(lib, true);

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

			this._link(lib, true, l.binary, objs, pkgDeps);

			return l;
		}
	}
}
