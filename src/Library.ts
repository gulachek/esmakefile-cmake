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
import { IBuildPath, Path } from 'esmakefile';

export interface ILinkedCompilation {
	name: string;
	outDir: IBuildPath;
	src: Path[];
	includeDirs: Path[];
	linkTo: Library[];
	pkgs: IImportedLibrary[];
	compileCommands: IBuildPath;
	// not included in actual distribution
	devOnly: boolean;
}

function transitiveLibs(c: ILinkedCompilation): Library[] {
	const libs: Library[] = [];
	for (const l of c.linkTo) {
		for (const t of libTransitiveLibs(l)) {
			libs.push(t);
		}
	}

	return libs;
}

function libTransitiveLibs(l: Library): Library[] {
	const libs: Library[] = [];
	for (const dep of l.linkedLibraries()) {
		for (const t of libTransitiveLibs(dep)) {
			libs.push(t);
		}
	}

	libs.push(l);
	return libs;
}

export function allLibs(c: ILinkedCompilation): IBuildPath[] {
	const libs: IBuildPath[] = [];
	for (const l of transitiveLibs(c)) {
		libs.push(l.binary);
	}

	return libs;
}

export interface IPkgDeps {
	/** Names of all mods (linkTo/pkgs an LC needs) */
	names: string[];

	/** Built paths of pc files required for pc computation */
	prereqs: Path[];
}

export function allPkgDeps(c: ILinkedCompilation): IPkgDeps {
	const names: string[] = [];
	for (const l of c.linkTo) {
		names.push(l.name);
	}

	for (const p of c.pkgs) {
		names.push(p.name);
	}

	const prereqs: Path[] = [];
	for (const l of transitiveLibs(c)) {
		prereqs.push(pkgLibFile(l.name));
	}

	return { names, prereqs };
}

export function pkgLibFile(name: string): IBuildPath {
	return Path.build(`pkgconfig/${name}.pc`);
}

export enum ResolvedLibraryType {
	static = 'static',
	dynamic = 'dynamic',
}

export interface ILibrary extends ILinkedCompilation {
	type: ResolvedLibraryType;
}

export interface IImportedLibrary {
	name: string;
}

export function makeLibrary(
	lib: ILibrary,
	binary: IBuildPath,
	importLibrary?: IBuildPath,
): Library {
	const out = new Library(
		lib.name,
		lib.type,
		lib.includeDirs,
		lib.linkTo,
		binary,
		importLibrary,
	);

	return out;
}

export class Library {
	readonly name: string;
	readonly binary: IBuildPath;
	// TODO - reconcile this w/ CMake's concept of import library
	readonly importLibrary?: IBuildPath;
	readonly type: ResolvedLibraryType;

	private _includes: Path[] = [];
	private _libs: Library[] = [];

	constructor(
		name: string,
		type: ResolvedLibraryType,
		includes: Path[],
		libs: Library[],
		binary: IBuildPath,
		importLib?: IBuildPath,
	) {
		this.name = name;
		this.type = type;
		this._includes = includes;
		this._libs = libs;
		this.binary = binary;
		this.importLibrary = importLib;
	}

	includes(): Path[] {
		return this._includes;
	}

	linkedLibraries(): Library[] {
		return this._libs;
	}
}

export function isImported(
	lib: IImportedLibrary | Library,
): lib is IImportedLibrary {
	return typeof (lib as Library).binary === 'undefined';
}
