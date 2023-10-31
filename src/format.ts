import { Reserves } from 'clients/epgstation';
import { findService } from './filter';
import { Liquid } from 'liquidjs';
import { DateTime } from 'luxon';
import { Program, Service } from './clients/mirakurun';
import fs = require('fs');

function bogus_wrap(text: string, columns: number) {
    let output = [];
    const is1Byte = (s: string, i: number) => (s.codePointAt(i) ?? 0) < 0x80;
    const kinsoku = (s: string, i: number) => /[、。ーぁぃぅぇぉゃゅょゎっ「」｛｝『』【】]/.test(s.charAt(i));

    for (let line of text.split(/\r?\n/)) {
        let width = 0;
        let out_line = "";
        for (let col = 0; col < line.length; col++) {
            let width_incr = is1Byte(line, col) ? 1 : 2;

            if (width + width_incr > columns && !kinsoku(line, col)) {
                output.push(out_line);
                out_line = "";
                width = 0;
            }

            out_line += line[col];
            width += width_incr;
        }
        output.push(out_line);
    }
    return output.join("\n");
}

const format_date = (i: number) =>
    DateTime.fromMillis(i, { zone: 'Asia/Tokyo' }).setLocale('ja-JP').toFormat("MM/dd (ccc) HH:mm");

export type RenderPair = {
    program: Program,
    service: Service | undefined,
    startAt: string,
    reserved: boolean,
    extended: Array<{ title: string, value: string }>,
}

export function prepareRenderPair(filtered: Array<Program>, reserves: Reserves, services: Array<Service>): Array<RenderPair> {
    return filtered.map(i => {
        let info: any = {};
        info['service'] = findService(services ?? [], i.serviceId, i.networkId);
        info['startAt'] = format_date(i.startAt);
        info['endAt'] = format_date(i.startAt + i.duration)
        info['reserved'] = reserves.reserves.some(r => r.programId === i.id);
        if ('extended' in i) {
            let extended: any = [];
            for (let [k, v] of Object.entries(i.extended)) {
                extended.push({ title: k, value: v });
            }
            info['extended'] = extended;
        } else {
            info['extended'] = [];
        }

        return { 'program': i, ...info };
    });
}

export function formatForMail(renderPair: Array<RenderPair>, template: string) {
    const liquid = new Liquid({ strictVariables: true, jsTruthy: true });
    liquid.registerFilter('bogus_wrap', bogus_wrap);
    const context = {
        'items': renderPair,
        'hr': new Array(76).fill('=').join('')
    };
    return liquid.parseAndRenderSync(fs.readFileSync(template, 'utf8'), context);
}
