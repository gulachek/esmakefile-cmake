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
import { Path } from 'esmakefile';

/** C language versions, like CMAKE_C_STANDARD */
export type CStandard = 90 | 99 | 11 | 17 | 23;

/** C++ language versions, like CMAKE_CXX_STANDARD */
export type CxxStandard = 98 | 11 | 14 | 17 | 20 | 23 | 26;

// TODO - unit test the crap out of this. File extensions
export function isCxxSrc(src: Path): boolean {
	return src.extname !== '.c';
}

export function isCxxLink(srcs: Path[]): boolean {
	for (const s of srcs) {
		if (isCxxSrc(s)) return true;
	}

	return false;
}
