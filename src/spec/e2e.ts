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

import { cli, Path, PathLike, BuildPathLike, RecipeArgs } from 'esmakefile';
import { cmake } from './cmake.js';
import { installUpstream } from './upstream.js';
import { resolve, join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { platform } from 'node:os';
import { spawn } from 'node:child_process';

const nodeExe = process.execPath;

const upstreamVendorDir = resolve('vendor');
const upstreamVendorBuildDir = join(upstreamVendorDir, 'build');
const pkgVendorDir = Path.build('vendor');
const pkgPackDir = Path.build('pkg/pack');
const pkgUnpackDir = Path.build('pkg/unpack');
const pkgBuildDir = Path.build('pkg/build');
const downstreamSrc = Path.src('src/spec/downstream');
const downstreamDist = Path.src('dist/spec/downstream');
const downstreamEsmakeDir = Path.build('downstream/esmake');
const downstreamCmakeDir = Path.build('downstream/cmake');

function exe(path: string): string {
	return platform() === 'win32' ? path + '.exe' : path;
}

interface IRunEsmakefileOpts {
	makeJs: PathLike,
	outDir: BuildPathLike,
	srcDir: PathLike,
	target: string
}

function runEsmake(args: RecipeArgs, opts: IRunEsmakefileOpts): Promise<boolean> {
	const makeJs = Path.src(opts.makeJs);
	const outDir = Path.build(opts.outDir);
	const srcDir = Path.src(opts.srcDir);


	const proc = spawn(nodeExe, [args.abs(makeJs), '--outdir', args.abs(outDir), '--srcdir', args.abs(srcDir), opts.target], { stdio: 'pipe', cwd: '.test' });

	proc.stdout.pipe(args.logStream, { end: false });
	proc.stderr.pipe(args.logStream, { end: false });

	return new Promise<boolean>((res) => {
		proc.on('close', (code) => {
			res(code === 0);
		});
	});
}

cli((make) => {
	const aTarball = pkgPackDir.join('a/a-0.1.0.tgz');
	const aCmake = pkgUnpackDir.join('a/CMakeLists.txt');

	make.add('test', ['dev', 'pkg']);

	make.add('install-upstream', (args) => {
		return installUpstream(upstreamVendorBuildDir, upstreamVendorDir);
	});

	make.add('distribution-spec', ['install-upstream'], (args) => {
		const mochaJs = 'node_modules/mocha/bin/mocha.js';
		return args.spawn(nodeExe, [mochaJs, 'dist/spec/DistributionSpec.js']);
	});

	make.add('dev', ['distribution-spec'], () => {});

	// TODO: make this independent from distribution-spec by not deleting .test dir over and over again in that spec
	make.add(aTarball, ['distribution-spec'], (args) => {
		return runEsmake(args, {
			makeJs: 'dist/spec/pkg/a/make.js',
			srcDir: 'src/spec/pkg/a',
			outDir: aTarball.dir(),
			target: aTarball.basename
		});
	});

	make.add(aCmake, [aTarball], async (args) => {
		return args.spawn('tar', ['xzf', args.abs(aTarball), '-C', args.abs(aCmake.dir()), '--strip-components=1']);
	});

	make.add('package-install', [aCmake], async (args) => {
		const pkgBuild = args.abs(pkgBuildDir);

		const cmakeTxt = pkgUnpackDir.join('CMakeLists.txt');
		await writeFile(args.abs(cmakeTxt), [
			'cmake_minimum_required(VERSION 3.10)',
			'project(E2E)',
			'add_subdirectory(a)'
		].join('\n'));

		await cmake.configure({
			src: args.abs(cmakeTxt.dir()),
			build: pkgBuild,
			prefixPath: [args.abs(pkgVendorDir)]
		});

		await cmake.build(pkgBuild, { config: 'Release' });
		await cmake.install(pkgBuild, { prefix: args.abs(pkgVendorDir) });
	});

	const d1Esmake = downstreamEsmakeDir.join(exe('d1/d1/d1'));
	const d1Cmake = downstreamCmakeDir.join(exe('d1/d1'));

	make.add(d1Esmake, ['install-upstream', 'package-install'], async (args) => {
		const success = await runEsmake(args, {
			makeJs: downstreamDist.join('d1/make.js'),
			srcDir: downstreamSrc.join('d1'),
			outDir: d1Esmake.dir().dir(),
			target: exe('d1/d1')
		});

		if (!success)
			return false;

		return args.spawn(args.abs(d1Esmake), []);
	});

	make.add('pkg', [d1Esmake], () => {});
});
