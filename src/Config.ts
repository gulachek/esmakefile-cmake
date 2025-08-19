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

import { resolve, dirname } from 'node:path';
import { readFileSync } from 'node:fs';

/** Build-time configuration for a Distribution */
export interface IConfig {
	/** Additional paths to search for .pc files */
	addPkgConfigSearchPaths?: string[];

	/** Build shared libraries by default */
	buildSharedLibs?: boolean;
}

// TODO this needs logging to inform user of invalid config /
// and/or warnings
// TODO good candidate for unit testing
export function parseConfig(config: unknown, basePath?: string): config is IConfig {
	if (!isJsObject(config)) {
		return false;
	}

	for (const p in config) {
		if (!config.hasOwnProperty(p)) {
			continue;
		}

		if (p === 'addPkgConfigSearchPaths') {
			const paths = config[p];

			if (!Array.isArray(paths)) {
				return false;
			}

			for (let i = 0; i < paths.length; ++i) {
				if (typeof(paths[i]) !== 'string') {
					return false;
				}

				paths[i] = basePath ? resolve(paths[i], basePath) : resolve(paths[i]);
			}
		} else if (p === 'buildSharedLibs') {
			if (typeof config[p] !== 'boolean') {
				return false;
			}
		} else {
			// invalid property
			return false;
		}
	}

	return true;
}

export function readConfigFile(path: string): IConfig | null {
	if (!path.endsWith('.json')) {
		throw new Error(`esmakefile-cmake config file '${path}' must have a '.json' extension`);
	}

	let contents: string;

	try {
		contents = readFileSync(path, 'utf8');
	} catch {
		return null;
	}

	const obj = JSON.parse(contents);
	if (!parseConfig(obj)) {
		throw new Error(`esmakefile-config file '${path}' is invalid.`);
	}

	return obj;
}

function isJsObject(value: unknown): value is Record<string, unknown> {
	if (!(value && typeof(value) === 'object')) {
		return false;
	}

	if (typeof(value.hasOwnProperty) !== 'function') {
		return false;
	}

	return true;
}
