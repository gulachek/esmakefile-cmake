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

import { run } from './run.js';

interface ICMakeConfigureOpts {
	src: string;
	build: string;
	prefixPath: string[];
}

interface ICMakeBuildOpts {
	config: string;
}

interface ICMakeInstallOpts {
	prefix: string;
}

/*
		await run('cmake', [
			'-B',
			stageDir,
			'-S',
			join(testDir, `${d.name}-${d.version}`),
			`-DCMAKE_PREFIX_PATH=${vendorDir}`,
		]);
		// Specify config b.c. default for MS is Debug for --build and Release for --install
		await run('cmake', ['--build', stageDir, '--config', 'Release']);
		await run('cmake', ['--install', stageDir, '--prefix', vendorDir]);
	 */
class CMake {
	public configure(opts: ICMakeConfigureOpts): Promise<void> {
		return run('cmake', [
			'-B',
			opts.build,
			'-S',
			opts.src,
			`-DCMAKE_PREFIX_PATH=${opts.prefixPath.join(';')}`,
		]);
	}

	public build(buildDir: string, opts?: ICMakeBuildOpts): Promise<void> {
		const args: string[] = ['--build', buildDir];
		if (opts?.config) {
			args.push('--config', opts.config);
		}

		return run('cmake', args);
	}

	public install(buildDir: string, opts: ICMakeInstallOpts): Promise<void> {
		return run('cmake', ['--install', buildDir, '--prefix', opts.prefix]);
	}
}

export const cmake = new CMake();
