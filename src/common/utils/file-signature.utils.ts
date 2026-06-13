import { promises as fs } from 'fs';

// Firmas conocidas (magic bytes) de los tipos que aceptamos
const SIGNATURES: { ext: string; bytes: number[] }[] = [
    { ext: 'jpg', bytes: [0xff, 0xd8, 0xff] },
    { ext: 'png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
    { ext: 'pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // %PDF-
];

// Lee los primeros bytes del archivo y devuelve el tipo real, o null si no coincide
export async function detectFileType(filePath: string): Promise<string | null> {
    const fileHandle = await fs.open(filePath, 'r');
    try {
        const buffer = Buffer.alloc(8);
        await fileHandle.read(buffer, 0, 8, 0);

        for (const sig of SIGNATURES) {
            const matches = sig.bytes.every((byte, i) => buffer[i] === byte);
            if (matches) return sig.ext;
        }
        return null;
    } finally {
        await fileHandle.close(); // cerramos el descriptor
    }
}