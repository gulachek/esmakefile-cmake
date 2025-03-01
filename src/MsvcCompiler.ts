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
	allIncludes
} from './Library.js';
import { CStandard, CxxStandard, isCxxSrc } from './Source.js';
import { Makefile, Path, IBuildPath } from 'esmakefile';
import { PkgConfig } from 'espkg-config';

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

	private _compile(c: ILinkedCompilation): IBuildPath[] {
		const includeFlags: string[] = [];
		for (const i of allIncludes(c)) {
			includeFlags.push('/I', this.make.abs(i));
		}

		const objs: IBuildPath[] = [];

		// TODO transitive deps
		const pkgNames = c.pkgs.map((p) => p.name);

		for (const s of c.src) {
			const obj = Path.gen(s, { ext: '.obj' });
			objs.push(obj);

			this.make.add(obj, [s], async (args) => {
				const flags = ['/nologo', '/c'];
				if (isCxxSrc(s)) {
					if (this._cxxStd) flags.push(`/std:c++${this._cxxStd}`);
				} else {
					if (this._cStd) flags.push(`/std:c${this._cStd}`);
				}

				const { flags: pkgCflags } = await this._pkg.cflags(pkgNames);

				return args.spawn(this.cc, [
					...flags,
					...pkgCflags,
					...includeFlags,
					`/Fo${args.abs(obj)}`,
					args.abs(s),
				]);
			});
		}

		return objs;
	}

	public addExecutable(exe: IExecutable): Executable {
		const objs = this._compile(exe);
		const e = new Executable(exe.name, exe.outDir.join(exe.name + '.exe'));

		const pkgNames = exe.pkgs.map(p => p.name);

		const linkFlags: string[] = [];
		const libDeps = [];
		if (exe.linkTo.length > 0) {
			for (const l of exe.linkTo) {
				const libFile = l.importLibrary || l.binary; // only dll will have importLibrary
				linkFlags.push(this.make.abs(libFile));
				libDeps.push(libFile);
			}
		}

		this.make.add(e.binary, [...libDeps, ...objs], async (args) => {
			const objsAbs = args.absAll(...objs);

			// TODO - dynamic linking too
			const { flags: pkgLibs } = await this._pkg.libs(pkgNames, { static: true });

			return args.spawn(this.cc, [
				'/nologo',
				`/Fe${args.abs(e.binary)}`,
				...linkFlags,
				...objsAbs,
				...pkgLibs
			]);
		});

		return e;
	}

	public addLibrary(lib: ILibrary): Library {
		const objs = this._compile(lib);

		if (lib.type === ResolvedLibraryType.static) {
			const path = lib.outDir.join(lib.name + '.lib');
			const l = makeLibrary(lib, path);

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
			const l = makeLibrary(lib, path, importPath);

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
