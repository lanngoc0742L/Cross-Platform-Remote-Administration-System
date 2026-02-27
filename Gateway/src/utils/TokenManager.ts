import jwt from 'jsonwebtoken';
import { Logger } from './Logger';
import { Config } from '../config';

export interface TokenPayload {
    sessionId: string;
    machineId: string;
    role: 'CLIENT';  
    name: string;
    ip: string;
    iat?: number;
    exp?: number;
}

export class TokenManager {
    private readonly secret: string;
    private readonly expiresIn: string; 
    private readonly refreshExpiresIn: string;

    constructor() {
        const secret = Config.JWT_SECRET || Config.AUTH_SECRET;
        if (!secret) {
            throw new Error('JWT_SECRET or AUTH_SECRET must be set');
        }
        this.secret = secret;
        this.expiresIn = Config.JWT_EXPIRES_IN || '24h';
        this.refreshExpiresIn = Config.JWT_REFRESH_EXPIRES_IN || '7d';

        if (this.secret.length < 32) {
            Logger.warn('[TokenManager] JWT_SECRET is weak. Using AUTH_SECRET as fallback.');
            if (this.secret.length < 16) {
                Logger.error('[TokenManager] Secret is too short. Please set JWT_SECRET in .env (min 32 chars)');
            }
        }
    }

    public generateAccessToken(payload: Omit<TokenPayload, 'iat' | 'exp'>): string {
        try {
            const tokenPayload: TokenPayload = {
                ...payload,
            };

            const token = jwt.sign(
                tokenPayload, 
                this.secret, 
                {
                    expiresIn: this.expiresIn,
                    issuer: 'gateway-server',
                    audience: 'client'
                } as jwt.SignOptions
            );

            Logger.debug(`[TokenManager] Generated access token for ${payload.name} (${payload.sessionId})`);
            return token;
        } catch (error) {
            Logger.error(`[TokenManager] Failed to generate token: ${error}`);
            throw new Error('Token generation failed');
        }
    }

    public generateRefreshToken(payload: Omit<TokenPayload, 'iat' | 'exp'>): string {
        try {
            const tokenPayload: TokenPayload = {
                ...payload,
            };

            const token = jwt.sign(
                tokenPayload, 
                this.secret, 
                {
                    expiresIn: this.refreshExpiresIn,
                    issuer: 'gateway-server',
                    audience: 'client'
                } as jwt.SignOptions
            );

            return token;
        } catch (error) {
            Logger.error(`[TokenManager] Failed to generate refresh token: ${error}`);
            throw new Error('Refresh token generation failed');
        }
    }

    public verifyToken(token: string): TokenPayload | null {
        try {
            const decoded = jwt.verify(token, this.secret, {
                issuer: 'gateway-server',
                audience: 'client'
            }) as TokenPayload;

            if (decoded.role !== 'CLIENT') {
                Logger.warn(`[TokenManager] Token has invalid role: ${decoded.role}`);
                return null;
            }

            return decoded;
        } catch (error: any) {
            if (error?.name === 'TokenExpiredError') {
                Logger.warn(`[TokenManager] Token expired: ${error.message}`);
            } else if (error?.name === 'JsonWebTokenError') {
                Logger.warn(`[TokenManager] Invalid token: ${error.message}`);
            } else {
                Logger.error(`[TokenManager] Token verification error: ${error?.message || error}`);
            }
            return null;
        }
    }

    public decodeToken(token: string): TokenPayload | null {
        try {
            return jwt.decode(token) as TokenPayload | null;
        } catch (error) {
            Logger.error(`[TokenManager] Token decode error: ${error}`);
            return null;
        }
    }

    public getTokenExpiration(token: string): number | null {
        const decoded = this.decodeToken(token);
        return decoded?.exp ? decoded.exp * 1000 : null;
    }

    public isTokenExpired(token: string): boolean {
        const exp = this.getTokenExpiration(token);
        if (!exp) return true;
        return Date.now() >= exp;
    }

    public refreshAccessToken(refreshToken: string): string | null {
        const payload = this.verifyToken(refreshToken);
        if (!payload) {
            return null;
        }

        return this.generateAccessToken({
            sessionId: payload.sessionId,
            machineId: payload.machineId,
            role: payload.role,
            name: payload.name,
            ip: payload.ip
        });
    }
}

