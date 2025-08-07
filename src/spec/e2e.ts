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

const nodeExe = process.execPath;
const vendorDir = resolve('vendor');
const vendorBuild = join(vendorDir, 'build');

cli((make) => {
	const aTarball = Path.build('pkg/a/a-0.1.0.tgz');

	make.add('test', ['package-consumption']);

	make.add('install-upstream', (args) => {
		return installUpstream(vendorBuild, vendorDir);
	});

	make.add('distribution-spec', ['install-upstream'], (args) => {
		const mochaJs = 'node_modules/mocha/bin/mocha.js';
		return args.spawn(nodeExe, [mochaJs, 'dist/spec/DistributionSpec.js']);
	});

	make.add(aTarball, async (args) => {
		return await args.spawn(nodeExe, ['dist/spec/pkg/a/make.js', '--srcdir', 'src/spec/pkg/a', '--outdir', args.abs(aTarball.dir()), aTarball.basename]);
	});

	make.add('package-consumption', [aTarball], (args) => {
		// run packageConsumption script
		// it runs cmake on all downstream packages
		// it creates a distribution for different downstream
		// packages and tests esmakefile functionality
	});
});
