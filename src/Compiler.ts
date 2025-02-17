import { IExecutable, Executable } from './Executable.js';
import { ILibrary, Library } from './Library.js';
import { CStandard, CxxStandard } from './Source.js';
import { Makefile } from 'esmakefile';
import { PkgConfig } from 'espkg-config';

export interface ICompilerArgs {
	make: Makefile;
	pkg: PkgConfig;
	cStd?: CStandard;
	cxxStd?: CxxStandard;
}

export interface ICompiler {
	addExecutable(exe: IExecutable): Executable;
	addLibrary(lib: ILibrary): Library;
}
