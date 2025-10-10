/*
 * Copyright (C) 2025 Nicholas Gulachek
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License as
 * published by the Free Software Foundation; either version 2 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 59 Temple Place - Suite 330, Boston, MA
 * 02111-1307, USA.
 */
import { platform } from 'node:os';
import { ICompiler, ICompilerArgs } from './Compiler.js';
import { Executable, IExecutable } from './Executable.js';
import {
	ILibrary,
	Library,
	ResolvedLibraryType,
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
import {
	CompileCommandIndex,
	dumpCompileCommands,
	ICompileCommand,
	parseCompileCommands,
} from './CompileCommands.js';
import { writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path/posix';
import { cwd } from 'node:process';
import { parsePrereqs } from './makeDepfile.js';

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
	private _commands = new Map<string, CompileCommandIndex>();
	private _cflags: string[];
	private _cxxflags: string[];

	constructor(args: ICompilerArgs) {
		this.make = args.make;
		this.cc = 'cc';
		this.cxx = 'c++';
		this.ar = 'ar';
		this._pkg = args.pkg;
		this._cStd = args.cStd;
		this._cxxStd = args.cxxStd;
		this._cflags = args.cflags;
		this._cxxflags = [];

		if (platform() === 'darwin') {
			this._dylibExt = '.dylib';
		} else {
			this._dylibExt = '.so';
			this.requiresRpath = true;
		}
	}

	private _compile(
		c: ILinkedCompilation,
		fPIC: boolean,
		pkgDeps: IPkgDeps,
	): IBuildPath[] {
		const compileCommands = c.compileCommands;

		this.make.add(compileCommands, pkgDeps.prereqs, async (args) => {
			const index: CompileCommandIndex = new Map<string, ICompileCommand>();

			const includeFlags = c.includeDirs.map((i) => {
				return `-I${this.make.abs(i)}`;
			});

			for (const pi of c.privateIncludeDirs) {
				includeFlags.push(`-I${this.make.abs(pi)}`);
			}

			// TODO postreqs
			const { flags: pkgCflags } = await this._pkg.cflags(pkgDeps.names);

			for (const s of c.src) {
				const flags = ['-c'];
				if (fPIC) flags.push('-fPIC');

				let cc: string;
				let cflags: string[];
				if (isCxxSrc(s)) {
					cc = 'clang++';
					cflags = this._cxxflags;
					if (this._cxxStd) flags.push(`-std=c++${this._cxxStd}`);
				} else {
					cc = 'clang';
					cflags = this._cflags;
					if (this._cStd) flags.push(`-std=c${this._cStd}`);
				}

				const file = args.abs(s);
				const directory = resolve(cwd());
				index.set(file, {
					directory,
					file,
					arguments: [
						cc,
						...flags,
						...includeFlags,
						...cflags,
						...pkgCflags,
						args.abs(s),
					],
				});
			}

			// Reset cache!
			this._commands.set(c.name, index);
			await dumpCompileCommands(args.abs(compileCommands), index);
		});

		const objs: IBuildPath[] = [];

		for (const s of c.src) {
			const obj = Path.gen(s, { ext: '.o' });
			objs.push(obj);

			this.make.add(obj, [s, compileCommands], async (args) => {
				let index: CompileCommandIndex = this._commands.get(c.name);
				if (!index) {
					index = await parseCompileCommands(args.abs(compileCommands));
					this._commands.set(c.name, index);
				}

				const cmd = index.get(args.abs(s));
				if (!cmd) {
					args.logStream.write(`${s} not found in ${compileCommands}`);
					return false;
				}

				let cc: string;
				if (isCxxSrc(s)) {
					cc = this.cxx;
				} else {
					cc = this.cc;
				}

				const deps = args.abs(Path.gen(s, { ext: '.deps' }));

				const result = await args.spawn(cc, [
					...cmd.arguments.slice(1),
					'-o',
					args.abs(obj),
					'-MD',
					'-MF',
					deps,
				]);

				if (!result) {
					return false;
				}

				const depfileContents = await readFile(deps, 'utf8');
				for (const p of parsePrereqs(depfileContents)) {
					args.addPostreq(p);
				}

				return true;
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

				const { flags: pkgLibs } = await this._pkg.libs(pkgDeps.names, {
					static: true,
				});

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
		const pkgDeps = allPkgDeps(exe);

		const objs = this._compile(exe, false, pkgDeps);

		const e = new Executable(exe.name, exe.outDir.join(exe.name));

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
			contents.push(`Requires.private: ${reqs}`);

			await writeFile(args.abs(pcFile), contents.join('\n'), 'utf8');
		});

		const objs = this._compile(lib, true, pkgDeps);

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
