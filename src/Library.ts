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

export interface IImportedLibrary {
	pkgconfig?: string;
	cmake?: ICMakeImport;
	crossDistro?: boolean;
}

export interface ICMakeImport {
	packageName: string;
	component?: string;
	version?: string;
	libraryTarget: string;
}

/**
 * Type returned from addLibrary
 */
export class Library {
	/** The name of the library */
	readonly name: string;

	/** The binary built by the development build system */
	readonly binary: IBuildPath;

	// TODO - reconcile this w/ CMake's concept of import library
	/** On Windows, the import library */
	readonly importLibrary?: IBuildPath;

	/** The type of the library */
	readonly type: ResolvedLibraryType;

	/** The name of the Distribution this Library belongs to */
	readonly distName: string;

	/** The version of the Distribution this Library belongs to */
	readonly distVersion: string;

	private _includes: Path[] = [];
	private _libs: Library[] = [];

	constructor(
		name: string,
		type: ResolvedLibraryType,
		distName: string,
		distVersion: string,
		includes: Path[],
		libs: Library[],
		binary: IBuildPath,
		importLib?: IBuildPath,
	) {
		this.name = name;
		this.type = type;
		this.distName = distName;
		this.distVersion = distVersion;
		this._includes = includes;
		this._libs = libs;
		this.binary = binary;
		this.importLibrary = importLib;
	}

	/** The directories directly included by the library */
	includes(): Path[] {
		return this._includes;
	}

	/** The libraries, local to the distribution, that are
	 * directly linked to this library. Does not include
	 * external libraries from findPackage
	 */
	linkedLibraries(): Library[] {
		return this._libs;
	}
}

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
	distName: string;
	distVersion: string;
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
		const { pkgconfig, cmake, crossDistro } = p;
		if (!pkgconfig) {
			if (crossDistro) continue;

			throw new Error(
				`'${c.name}' is linked to a findPackage that has no pkgconfig name specified (cmake: '${cmake}')`,
			);
		}

		names.push(pkgconfig);
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

export function makeLibrary(
	lib: ILibrary,
	binary: IBuildPath,
	importLibrary?: IBuildPath,
): Library {
	const out = new Library(
		lib.name,
		lib.type,
		lib.distName,
		lib.distVersion,
		lib.includeDirs,
		lib.linkTo,
		binary,
		importLibrary,
	);

	return out;
}
