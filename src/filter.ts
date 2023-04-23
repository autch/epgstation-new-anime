import { ChannelType, Program, ProgramGenre, Service } from './clients/mirakurun';

const checkGenre = (genre: ProgramGenre[]) => genre.some(value => value.lv1 === 0x7);
const checkNew = (name: string) => name.indexOf('🈟') > -1;

export const findService = (services: Array<Service>, serviceId: number, networkId: number): Service | undefined =>
    services.find(s => s.serviceId === serviceId && s.networkId === networkId);

/// Check if the program is available on the specified channel type
const checkService = (program: Program, services: Array<Service>, validOnly: Array<ChannelType>): boolean => {
    const service = findService(services, program.serviceId, program.networkId);
    if(service === undefined) {
        return false;
    }
    if(service.channel === undefined) {
        return false;
    }

    return validOnly.includes(service.channel.type);
}

export function filterPrograms(
    now: Date, 
    programs: Array<Program>, 
    services: Array<Service>, 
    validChannels: Array<ChannelType>, 
    ignoreConditions: RegExp,
    onlyNewPrograms: boolean = true
): Array<Program>
{
    const now_i = now.getTime();
    return programs.filter(i =>
        (i.startAt >= now_i 
            && checkGenre(i.genres ?? []) 
            && checkService(i, services, validChannels) 
            && i.isFree
            && (onlyNewPrograms ? checkNew(i.name ?? "") : true)
        )).filter(i => !ignoreConditions.test(i.name ?? "")).sort((a, b) => a.startAt - b.startAt);
}

