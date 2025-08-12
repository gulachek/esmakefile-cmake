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

import { cli, Path } from 'esmakefile';
import { cmake } from './cmake.js';
import { installUpstream } from './upstream.js';
import { resolve, join } from 'node:path';
import { writeFile } from 'node:fs/promises';

const nodeExe = process.execPath;
const vendorDir = resolve('vendor');
const vendorBuild = join(vendorDir, 'build');

cli((make) => {
	const aTarball = Path.build('pkg/a/a-0.1.0.tgz');
	const aCmake = Path.build('vendor/src/a/CMakeLists.txt');

	make.add('test', ['package-consumption']);

	make.add('install-upstream', (args) => {
		return installUpstream(vendorBuild, vendorDir);
	});

	make.add('distribution-spec', ['install-upstream'], (args) => {
		const mochaJs = 'node_modules/mocha/bin/mocha.js';
		return args.spawn(nodeExe, [mochaJs, 'dist/spec/DistributionSpec.js']);
	});

	// TODO: make this independent from distribution-spec by not deleting .test dir over and over again in that spec
	make.add(aTarball, /*['distribution-spec'],*/ (args) => {
		return args.spawn(nodeExe, ['dist/spec/pkg/a/make.js', '--srcdir', 'src/spec/pkg/a', '--outdir', args.abs(aTarball.dir()), aTarball.basename]);
	});

	make.add(aCmake, [aTarball], async (args) => {
		return args.spawn('tar', ['xzf', args.abs(aTarball), '-C', args.abs(aCmake.dir()), '--strip-components=1']);
	});

	make.add('package-install', [aCmake], async (args) => {
		const cmakeTxt = Path.build('vendor/src/CMakeLists.txt');
		const cmakeBuildDir = Path.build('pkg-cmake-build');
		await writeFile(args.abs(cmakeTxt), [
			'cmake_minimum_required(VERSION 3.10)',
			'project(E2E)',
			'add_subdirectory(a)'
		].join('\n'));

		await cmake.configure({
			src: args.abs(cmakeTxt.dir()),
			build: args.abs(cmakeBuildDir),
			prefixPath: [args.abs(Path.build('vendor'))]
		});

		await cmake.build(args.abs(cmakeBuildDir), { config: 'Release' });
		await cmake.install(args.abs(cmakeBuildDir), { prefix: args.abs(Path.build('vendor')) });
	});

	make.add('package-consumption', ['install-upstream', 'package-install'], (args) => {
		// run packageConsumption script
		// it runs cmake on all downstream packages
		// it creates a distribution for different downstream
		// packages and tests esmakefile functionality
	});
});
