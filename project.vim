set path=., " current file's directory and current directory
set path+=src/**
set path+=.github/**
set path+=vim/**

nnoremap <Leader>b :!npm run build<CR>
nnoremap <Leader>d :!npx mocha --inspect-brk -- dist/spec/DistributionSpec.js<CR>

nnoremap <Leader>t :!npm test<CR>
"Use below to test specific case. Can make this better later
"nnoremap <Leader>t :!npx mocha -f external -- dist/spec<CR>

augroup esmakefilecmake
	autocmd!
	autocmd BufNewFile *.ts :0r <sfile>:h/vim/templates/skeleton.ts
augroup END

" Automatically attempt to set CLANG_CHECK
if empty($CLANG_CHECK)
	let clangCheck = ''
	if has('win32')
		" Windows
		let clangCheck = $ProgramFiles . '\LLVM\bin\clang-check.exe'
	else
		let uname = trim(system('uname'))
		if uname == 'Darwin'
			" macOS
			let llvm = trim(system('brew --prefix llvm'))
			let clangCheck = llvm . '/bin/clang-check'
		elseif uname == 'Linux'
			" Linux
			let clangCheck = trim(system('which clang-check-18'))
		endif
	endif
	if executable(clangCheck)
		let $CLANG_CHECK = clangCheck
	else
		echo "WARNING! Make sure clang-check is installed and set the CLANG_CHECK environment variable"
	endif
endif
