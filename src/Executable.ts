import { IBuildPath, Path } from 'esmakefile';
import { Library, IImportedLibrary } from './Library.js';

export interface IExecutable {
	name: string;
	outDir: IBuildPath;
	src: Path[];
	includeDirs: Path[];
	linkTo: Library[];
	pkgs: IImportedLibrary[];
}

export class Executable {
	readonly name: string;
	readonly binary: IBuildPath;

	constructor(name: string, binary: IBuildPath) {
		this.name = name;
		this.binary = binary;
	}
}
