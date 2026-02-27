import * as path from 'path';

export function getDirname(): string {
    if ((process as any).pkg) {
        return path.dirname(process.execPath);
    }
    
    const envDir = process.env.GATEWAY_DIR;
    if (envDir) {
        return envDir;
    }

    return process.cwd();
}


