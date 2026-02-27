export class Logger {
    public static info(msg: string, ...args: any[]) {
        console.log(`[${new Date().toISOString()}] [INFO] ${msg}`, ...args);
    }

    public static warn(msg: string, ...args: any[]) {
        console.warn(`[${new Date().toISOString()}] [WARN] ${msg}`, ...args);
    }

    public static error(msg: string, ...args: any[]) {
        console.error(`[${new Date().toISOString()}] [ERROR] ${msg}`, ...args);
    }

    public static debug(msg: string, ...args: any[]) {
        if (process.env.NODE_ENV === 'development' || process.env.DEBUG === 'true') {
            console.log(`[${new Date().toISOString()}] [DEBUG] ${msg}`, ...args);
        }
    }
}