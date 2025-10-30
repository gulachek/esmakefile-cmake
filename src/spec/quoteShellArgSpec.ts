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

import { expect } from 'chai';
import { quoteShellArg } from '../quoteShellArg.js';

describe('quoteShellArg', () => {
	it('puts single quotes around a simple option', () => {
		expect(quoteShellArg('-f')).to.equal("'-f'");
	});

	it('escapes a single quote', () => {
		expect(quoteShellArg("-d' '")).to.equal("'-d'\\'' '\\'''");
	});

	it('does not touch typical escape sequences since single quoted', () => {
		expect(quoteShellArg('hello\\nworld')).to.equal("'hello\\nworld'");
	});

	// potential issue with newlines in pkg-config file, but this is a really
	// odd use case. Don't really care right now about attempting to implement
	// since it doesn't seem like pkg-config really supports newlines embedded
	// in flags. Would need some really deep investigation to prove that wrong
	// but doesn't seem worth doing at the moment.
});
