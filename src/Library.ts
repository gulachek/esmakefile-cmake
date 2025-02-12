import { IBuildPath, Path } from 'esmakefile';

export enum ResolvedLibraryType {
	static = 'static',
	dynamic = 'dynamic',
}

export interface ILibrary {
	name: string;
	outDir: IBuildPath;
	src: Path[];
	includeDirs: Path[];
	linkTo: Library[];
	type: ResolvedLibraryType;
}

export interface IImportedLibrary {
	name: string;
}

export class Library {
	name: string;
	binary: IBuildPath;
	// TODO - reconcile this w/ CMake's concept of import library
	importLibrary?: IBuildPath;
	type: ResolvedLibraryType;

	constructor(name: string, binary: IBuildPath) {
		this.name = name;
		this.binary = binary;
	}
}

export function isImported(
	lib: IImportedLibrary | Library,
): lib is IImportedLibrary {
	return typeof (lib as Library).binary === 'undefined';
}
