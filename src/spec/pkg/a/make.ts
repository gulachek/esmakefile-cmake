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
import { platform } from 'node:os';

cli((make) => {
	const d = new Distribution(make, {
		name: 'a',
		version: '0.1.0',
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

	const genC = Path.build('src/gen.c');

	make.add(genC, (args) => {
		return writeFile(args.abs(genC), 'int gen12() { return 12; }');
	});

	const e1cOpts: string[] = [];
	const e1lOpts: string[] = [];

	switch (platform()) {
		case 'win32':
			e1cOpts.push('/D', 'MY_COMPILE_OPT=1');
			e1lOpts.push('Rpcrt4.lib');
			break;
		case 'darwin':
			e1cOpts.push('-DMY_COMPILE_OPT=1', '-framework', 'CoreFoundation');
			e1lOpts.push('-framework', 'CoreFoundation');
			break;
		case 'linux':
			e1cOpts.push('-DMY_COMPILE_OPT=1');
			e1lOpts.push('-ldl');
			break;
		default:
			throw new Error('platform not supported');
	}

	d.addExecutable({
		name: 'e1',
		src: ['src/e1.c', genC],
		linkTo: [zero, one, two, hello],
		compileOpts: e1cOpts,
		linkOpts: e1lOpts,
	});

	d.addTest({
		name: 't1',
		src: ['test/t1.c'],
	});

	d.addLibrary({
		name: 'a',
		src: ['src/a.c'],
	});

	const linkOpts: string[] = [];
	const compileOpts: string[] = [];

	switch (platform()) {
		case 'win32':
			linkOpts.push('Rpcrt4.lib');
			break;
		case 'darwin':
			compileOpts.push('-framework', 'CoreFoundation');
			linkOpts.push('-framework', 'CoreFoundation');
			break;
		case 'linux':
			linkOpts.push('-luuid');
			break;
		default:
			throw new Error('Unsupported platform!');
	}

	d.addLibrary({
		name: 'mkuuid',
		src: ['src/mkuuid.c'],
		compileOpts,
		linkOpts,
	});
});
