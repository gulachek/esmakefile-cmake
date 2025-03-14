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

import { cmake } from './cmake.js';
import { join, dirname } from 'node:path';

export async function installUpstream(
	buildDir: string,
	vendorDir: string,
): Promise<void> {
	// start off in esmakefile-cmake/dist/spec/
	const prjRoot = dirname(dirname(import.meta.dirname));
	const src = join(prjRoot, 'src', 'spec', 'upstream');

	await cmake.configure({ src, build: buildDir, prefixPath: [vendorDir] });

	await cmake.build(buildDir, { config: 'Release' });
	await cmake.install(buildDir, { prefix: vendorDir });
}
