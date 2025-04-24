set path=.
set path+=src
set path+=src/spec
set path+=.github/workflows

nnoremap <Leader>b :!npm run build<CR>
nnoremap <Leader>d :!npx mocha --inspect-brk -- dist/spec<CR>

nnoremap <Leader>t :!npm test<CR>
"Use below to test specific case. Can make this better later
"nnoremap <Leader>t :!npx mocha -f external -- dist/spec<CR>

augroup esmakefilecmake
	autocmd!
	autocmd BufNewFile *.ts :0r <sfile>:h/vim/templates/skeleton.ts
augroup END

" Automatically attempt to set CLANG_CHECK
if empty($CLANG_CHECK)
if has('win32')
	" Windows
	echo "WARNING! Update project.vim to set CLANG_CHECK=%ProgramFiles%\\LLVM\\bin\\clang-check.exe for Windows"
else
	let uname = trim(system('uname'))
	if uname == 'Darwin'
		" macOS
		let llvm = trim(system('brew --prefix llvm'))
		let clangCheck = llvm . '/bin/clang-check'
		if executable(clangCheck)
			let $CLANG_CHECK = clangCheck
		else
			echo "WARNING! Make sure clang-check is installed and set the CLANG_CHECK environment variable"
		endif
	else
		" Linux
		echo "WARNING! Update project.vim to set CLANG_CHECK=/usr/bin/clang-check-18 for Linux"
	endif
endif
endif
