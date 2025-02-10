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

export class Library {
	name: string;
	binary: IBuildPath;
	importLibrary?: IBuildPath;
	type: ResolvedLibraryType;

	constructor(name: string, binary: IBuildPath) {
		this.name = name;
		this.binary = binary;
	}
}
