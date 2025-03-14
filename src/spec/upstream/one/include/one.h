#ifndef ONE_H
#define ONE_H

#ifdef _WIN32
#define ONE_EXPORT __declspec(dllexport)
#else
#define ONE_EXPORT
#endif

ONE_EXPORT int one();

#endif
