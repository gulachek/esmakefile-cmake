#ifndef WORLD_H
#define WORLD_H

#ifdef _WIN32
#define WORLD_EXPORT __declspec(dllexport)
#else
#define WORLD_EXPORT
#endif

void world();

#endif
