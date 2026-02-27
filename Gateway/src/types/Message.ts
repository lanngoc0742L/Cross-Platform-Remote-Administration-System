import {CommandType} from './Protocols'

export interface Message {
    type: CommandType | string;
    data: any;
    from?: string;
    to?: string;
}

export const createMessage = (
    type: CommandType,
    data: any = {},
    to?: string,
    from?: string,
) : Message => {
    return { type, data, to, from };
};