import { IExecutable, Executable } from './Executable.js';
import { ILibrary, Library } from './Library.js';

export interface ICompiler {
	addExecutable(exe: IExecutable): Executable;
	addLibrary(lib: ILibrary): Library;
}
