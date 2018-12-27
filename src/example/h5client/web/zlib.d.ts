

declare namespace Zlib{
    class Inflate{
        constructor(buffer: Uint8Array);
        decompress(): Uint8Array;
    }
} 