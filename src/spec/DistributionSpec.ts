import { expect } from 'chai';
import { Distribution } from '../index.js';

describe('Distribution', () => {
	it('has foo', () => {
		const d = new Distribution();
		expect(d.foo()).to.equal('foo');
	});
});
