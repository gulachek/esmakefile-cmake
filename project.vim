set path=.
set path+=src
set path+=src/spec

nnoremap <Leader>b :!npm run build<CR>
nnoremap <Leader>d :!npx mocha --inspect-brk -- dist/spec<CR>

nnoremap <Leader>t :!npm test<CR>
"Use below to test specific case. Can make this better later
"nnoremap <Leader>t :!npx mocha -f 'compile_commands' -- dist/spec<CR>

augroup esmakefilecmake
	autocmd!
	autocmd BufNewFile *.ts :0r <sfile>:h/vim/templates/skeleton.ts
augroup END
