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
	allLibs
} from './Library.js';
import { CStandard, CxxStandard, isCxxSrc } from './Source.js';
import { Makefile, Path, IBuildPath, RecipeArgs } from 'esmakefile';
import { PkgConfig } from 'espkg-config';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

export class MsvcCompiler implements ICompiler {
	private make: Makefile;
	private cc: string;
	private lib: string;
	private _cStd?: CStandard;
	private _cxxStd?: CxxStandard;
	private _pkg: PkgConfig;

	constructor(args: ICompilerArgs) {
		this.make = args.make;
		this._cStd = args.cStd;
		this._cxxStd = args.cxxStd;
		this._pkg = args.pkg;
		this.cc = 'cl.exe';
		this.lib = 'lib.exe';
	}

	private _compile(c: ILinkedCompilation, pkgDeps: IPkgDeps): IBuildPath[] {
		const includeFlags: string[] = [];
		for (const i of c.includeDirs) {
			includeFlags.push('/I', this.make.abs(i));
		}

		const objs: IBuildPath[] = [];

		for (const s of c.src) {
			const obj = Path.gen(s, { ext: '.obj' });
			objs.push(obj);

			this.make.add(obj, [s, ...pkgDeps.prereqs], async (args) => {
				const flags = ['/nologo', '/c', '/showIncludes'];
				if (isCxxSrc(s)) {
					if (this._cxxStd) flags.push(`/std:c++${this._cxxStd}`);
				} else {
					if (this._cStd) flags.push(`/std:c${this._cStd}`);
				}

				const { flags: pkgCflags } = await this._pkg.cflags(pkgDeps.names);

				return runCl(this.cc, [
					...flags,
					...pkgCflags,
					...includeFlags,
					`/Fo${args.abs(obj)}`,
					args.abs(s),
				], args);
			});
		}

		return objs;
	}

	private _link(
		c: ILinkedCompilation,
		path: IBuildPath,
		importPath: IBuildPath|null,
		objs: IBuildPath[],
		pkgDeps: IPkgDeps,
	): void {
		const libs = allLibs(c);

		const targets: IBuildPath[] = [path];
		const flags: string[] = ['/nologo'];

		if (importPath) {
			targets.push(importPath);
			flags.push('/LD');
		}

		this.make.add(
			targets,
			[...objs, ...pkgDeps.prereqs, ...libs],
			async (args) => {
				const objsAbs = args.absAll(...objs);

				const { flags: pkgLibs } = await this._pkg.libs(pkgDeps.names);

				return args.spawn(this.cc, [
					...flags,
					`/Fe${args.abs(path)}`,
					...objsAbs,
					...pkgLibs,
				]);
			},
		);

	}

	public addExecutable(exe: IExecutable): Executable {
		const pkgDeps = allPkgDeps(exe);

		const objs = this._compile(exe, pkgDeps);
		const e = new Executable(exe.name, exe.outDir.join(exe.name + '.exe'));

		this._link(exe, e.binary, null, objs, pkgDeps);

		return e;
	}

	public addLibrary(lib: ILibrary): Library {
		const pkgDeps = allPkgDeps(lib);

		const objs = this._compile(lib, pkgDeps);
		let l: Library;

		if (lib.type === ResolvedLibraryType.static) {
			const path = lib.outDir.join(lib.name + '.lib');
			l = makeLibrary(lib, path);

			this.make.add(path, objs, (args) => {
				const objsAbs = args.absAll(...objs);
				return args.spawn(this.lib, [
					'/nologo',
					`/OUT:${args.abs(path)}`,
					...objsAbs,
				]);
			});
		} else {
			const path = lib.outDir.join(lib.name + '.dll');
			const importPath = lib.outDir.join(lib.name + '.lib');
			l = makeLibrary(lib, path, importPath);

			this._link(lib, l.binary, l.importLibrary, objs, pkgDeps);
		}

		const pcFile = pkgLibFile(lib.name);

		this.make.add(pcFile, async (args) => {
				const contents: string[] = [
					`Name: ${lib.name}`,
					'Version:',
					'Description:',
				];

				const cflags: string[] = [];
				for (const i of lib.includeDirs) {
					cflags.push('/I', pcEscPath(args.abs(i)));
				}
				contents.push(`Cflags: ${cflags.join(' ')}`);

				const importPath = pcEscPath(args.abs(l.importLibrary || l.binary));
				contents.push(`Libs: ${importPath}`);

				const reqs = pkgDeps.names.join(' ');
				if (lib.type === ResolvedLibraryType.dynamic) {
					contents.push(`Requires.private: ${reqs}`);
				} else {
					contents.push(`Requires: ${reqs}`);
				}

				await writeFile(args.abs(pcFile), contents.join('\r\n'), 'utf8');
		});

		return l;
	}
}

async function runCl(cl: string, clArgs: string[], recipeArgs: RecipeArgs): Promise<boolean> {
	const stdout: Buffer[] = [];
	const proc = spawn(cl, clArgs, { stdio: 'pipe' });
	proc.stdout.on('data', (chunk) => {
		stdout.push(chunk);
	});
	proc.stderr.on('data', (chunk) => {
		recipeArgs.logStream.write(chunk);
	});
	const result = await new Promise<boolean>((res) => {
		proc.on('close', (code) => {
			res(code === 0);
		});
	});

	const content = Buffer.concat(stdout).toString('utf8');
	const lines = content.split('\r\n');
	let printCRLF = false;

	for (const line of lines) {
		const match = line.match(/^Note: including file:\s+(.*)/);
		if (match) {
			recipeArgs.addPostreq(match[1]);
		} else {
			if (printCRLF) {
				recipeArgs.logStream.write('\r\n');
			}

			recipeArgs.logStream.write(line);
			printCRLF = true;
		}
	}

	return result;
}

function pcEscPath(path: string): string {
	return path.replace(/\\/g, '\\\\');
}
