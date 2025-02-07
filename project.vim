set path+=.
set path+=src
set path+=src/spec

nnoremap <Leader>b :!npm run build<CR>
nnoremap <Leader>t :!npm test<CR>
nnoremap <Leader>d :!npx mocha --inspect-brk -- dist/spec<CR>
