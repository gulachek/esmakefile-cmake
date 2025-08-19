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

import { Distribution } from '../../../index.js';
import { cli, Path } from 'esmakefile';
import { writeFile } from 'node:fs/promises';

cli((make) => {
	const d = new Distribution(make, {
		name: 'a',
		version: '0.1.0'
	});

	const zero = d.findPackage('zero');

	const one = d.findPackage({
		pkgconfig: 'libone',
		cmake: 'one',
	});

	const two = d.findPackage({
		pkgconfig: 'two',
		cmake: {
			packageName: 'Two2',
			libraryTarget: 'two',
		},
	});

	const hello = d.findPackage({
		pkgconfig: 'hello',
		cmake: {
			packageName: 'HelloWorld',
			component: 'hello',
			libraryTarget: 'HelloWorld::hello',
		},
	});

	const genC = Path.build('gen.c');

	make.add(genC, (args) => {
		return writeFile(args.abs(genC), 'int gen12() { return 12; }');
	});

	d.addExecutable({
		name: 'e1',
		src: ['src/e1.c', genC],
		linkTo: [zero, one, two, hello]
	});

	d.addLibrary({
		name: 'a',
		src: ['src/a.c']
	});
});
