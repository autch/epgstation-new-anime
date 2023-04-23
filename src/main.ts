import { EpgStationClient, OpenAPIConfig as EpgStationConfig } from './clients/epgstation';
import { ChannelType, MirakurunClient, OpenAPIConfig as MirakurunConfig } from './clients/mirakurun';
import { filterPrograms } from "./filter";
import { formatForMail, prepareRenderPair } from './format';
import fs = require('fs');
import yargs = require('yargs');
import nodemailer = require('nodemailer');

function loadIgnoreConditions(filename: string) {
    const quote = (str: string) => str.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');

    const text = fs.readFileSync(filename, 'utf8');
    const re = text.split(/\r?\n/).filter(i => i.trim().length > 0).map(quote).join("|");
    return new RegExp(re);
}

interface MailTransportConfig {
    host: string,
    port: number,
    name: string,
    auth: {
        user: string,
        pass: string
    }
}

interface MailEnvelopeConfig {
    from: string,
    to: string,
    subject: string
}

interface ConfigFile {
    epgstation: EpgStationConfig,
    mirakurun: MirakurunConfig,
    channelType: Array<ChannelType>,

    transport: MailTransportConfig,
    envelope: MailEnvelopeConfig
}

async function sendMail(message: string, transport: MailTransportConfig, envelope: MailEnvelopeConfig) {
    let transporter = nodemailer.createTransport(transport);

    let envelopeToSend = {
        ...envelope,
        text: message
    }

    return transporter.sendMail(envelopeToSend);
}

async function main() {
    const args = (yargs(process.argv.slice(2))
        .option('config', {
            alias: 'c',
            type: 'string',
            description: 'Path to config file',
            default: 'config.json'
        })
        .option('ignore', {
            alias: 'i',
            type: 'string',
            description: 'Path to ignore keywords file',
            default: 'ignore_keywords.txt'
        })
        .option('mirakurun', {
            type: 'string',
            description: 'Mirakurun API endpoint'
        })
        .option('epgstation', {
            type: 'string',
            description: 'EPGStation API endpoint'
        })
        .option('only-new', {
            type: 'boolean',
            description: 'Filter out non-new programs (for debugging)',
            default: true
        })
        .option('mail', {
            alias: 'm',
            type: 'string',
            description: 'Path to mail template',
            default: 'mail.liquid'
        })
        .option('nosend', {
            alias: 'n',
            type: 'boolean',
            description: 'Do not send mail, just print to stdout'
        })
        .option('channels', {
            description: 'Comma-separated list of channels to filter',
            type: 'string'
        })
        .help()
        .parseSync());

    const config: ConfigFile = JSON.parse(fs.readFileSync(args.config, 'utf8')) as ConfigFile;


    const mirakurun = new MirakurunClient({
        BASE: args.mirakurun || config.mirakurun.BASE
    });
    const epgstation = new EpgStationClient({
        BASE: args.epgstation || config.epgstation.BASE
    });
    const services = await mirakurun.services.getServices();
    if (!('length' in services)) {
        console.error('Failed to get services', services);
        return;
    }
    const programs = await mirakurun.programs.getPrograms();
    if (!('length' in programs)) {
        console.error('Failed to get programs', programs);
        return;
    }
    const reserves = await epgstation.reserves.getReserves(false);
    if ('code' in reserves) {
        console.error('Failed to get reserves', reserves);
        return;
    }

    const conditions = loadIgnoreConditions(args.ignore || 'ignore_keywords.txt');

    let channels: Array<ChannelType> = config.channelType || ['GR', 'BS'];
    if (args.channels) {
        const ch_names = args.channels.split(',').map(i => i.trim()).map(i => i.toUpperCase());
        if (ch_names.some(i => !['GR', 'BS', 'CS', 'SKY'].includes(i))) {
            console.error('Invalid channel type', ch_names);
            return;
        }
        channels = ch_names as Array<ChannelType>;
    }

    let filtered = filterPrograms(new Date(), programs, services, channels, conditions, args.onlyNew);
    if (filtered.length === 0) {
        if (args.nosend)
            console.info('No programs found');
        return;
    }

    const renderPair = prepareRenderPair(filtered, reserves, services);
    const text = formatForMail(renderPair, args.mail);

    if (args.nosend) {
        process.stdout.write(text + "\n");
    } else {
        await sendMail(text, config.transport, config.envelope);
    }
}

main();
