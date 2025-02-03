import { IBuildPath, Path } from 'esmakefile';
import { Library } from './Library.js';

export interface IExecutable {
	name: string;
	outDir: IBuildPath;
	src: Path[];
	includeDirs: Path[];
	linkTo: Library[];
}

export class Executable {
	readonly binary: IBuildPath;

	constructor(binary: IBuildPath) {
		this.binary = binary;
	}
}
