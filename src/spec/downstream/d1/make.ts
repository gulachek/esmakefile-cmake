import { Distribution } from '../../../index.js';
import { cli } from 'esmakefile';

cli((make) => {
	const d = new Distribution(make, {
		name: 'd1',
		version: '1.0.0'
	});

	const a = d.findPackage('a');

	d.addExecutable({
		name: 'd1',
		src: ['src/d1.c'],
		linkTo: [a]
	});
});
