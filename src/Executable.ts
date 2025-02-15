import { IBuildPath } from 'esmakefile';
import { IImportedLibrary, ILinkedCompilation } from './Library.js';

export interface IExecutable extends ILinkedCompilation {
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
