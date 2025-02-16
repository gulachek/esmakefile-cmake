import { IBuildPath } from 'esmakefile';
import { ILinkedCompilation } from './Library.js';

export interface IExecutable extends ILinkedCompilation {}

export class Executable {
	readonly name: string;
	readonly binary: IBuildPath;

	constructor(name: string, binary: IBuildPath) {
		this.name = name;
		this.binary = binary;
	}
}
