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
import { quoteCmakeArg } from '../quoteCmakeArg.js';

describe('quoteCmakeArg', () => {
	it('returns identity for -f', () => {
		expect(quoteCmakeArg('-f')).to.equal('-f');
	});

	it('quotes a space', () => {
		expect(quoteCmakeArg('single arg')).to.equal('"single arg"');
	});

	it('quotes a #', () => {
		expect(quoteCmakeArg('single#arg')).to.equal('"single#arg"');
	});

	it('quotes parens', () => {
		expect(quoteCmakeArg('single()arg')).to.equal('"single()arg"');
	});

	it('escapes a semicolon', () => {
		expect(quoteCmakeArg('single;arg')).to.equal('"single\\;arg"');
	});

	it('escapes a double quote', () => {
		expect(quoteCmakeArg('single"arg')).to.equal('"single\\"arg"');
	});

	it('escapes a backslash', () => {
		expect(quoteCmakeArg('single\\arg')).to.equal('"single\\\\arg"');
	});

	it('escapes a tab', () => {
		expect(quoteCmakeArg('single\targ')).to.equal('"single\\targ"');
	});

	it('escapes a newline', () => {
		expect(quoteCmakeArg('single\narg')).to.equal('"single\\narg"');
	});

	it('escapes a carriage return', () => {
		expect(quoteCmakeArg('single\rarg')).to.equal('"single\\rarg"');
	});

	it('escapes a variable reference', () => {
		expect(quoteCmakeArg('${single_arg}')).to.equal('"\\${single_arg}"');
	});
});
