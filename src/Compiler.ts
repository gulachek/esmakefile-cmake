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
	cflags: string[]; // Additional C flags (CMake does C_DEFINES, C_INCLUDES, **C_FLAGS**)
	cxxflags: string[]; // Additional C++ flags (Same ordering as cflags)
}

export interface ICompiler {
	addExecutable(exe: IExecutable): Executable;
	addLibrary(lib: ILibrary): Library;
}
