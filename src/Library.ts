import { IBuildPath, Path } from 'esmakefile';

export interface ILibrary {
	name: string;
	outDir: IBuildPath;
	src: Path[];
	includeDirs: Path[];
	linkTo: Library[];
}

export class Library {
	name: string;
	binary: IBuildPath;
	importLibrary?: IBuildPath;

	constructor(name: string, binary: IBuildPath) {
		this.name = name;
		this.binary = binary;
	}
}
