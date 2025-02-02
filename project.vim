set path+=.
set path+=src
set path+=src/spec

nnoremap <Leader>b :!npm run build<CR>
nnoremap <Leader>t :!npm test<CR>
nnoremap <Leader>d :!node --inspect-brk node_modules/mocha/bin/mocha.js -- dist/spec<CR>
