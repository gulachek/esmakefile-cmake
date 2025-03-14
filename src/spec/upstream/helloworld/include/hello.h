#ifndef HELLO_H
#define HELLO_H

#ifdef _WIN32
#define HELLO_EXPORT __declspec(dllexport)
#else
#define HELLO_EXPORT
#endif

void hello();

#endif
