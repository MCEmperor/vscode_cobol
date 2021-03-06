/* eslint-disable @typescript-eslint/no-explicit-any */
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

import { Hash } from "crypto";
import { COBOLSymbol, COBOLSymbolTable, InMemoryGlobalSymbolCache, InMemorySymbolCache } from './cobolglobalcache';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const lzjs = require('lzjs');

// JSON callbacks to Map to something that can be serialised
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function replacer(this: any, key: any, value: any): any {
    const originalObject = this[key];
    if (originalObject instanceof Map) {
        return {
            dataType: 'Map',
            value: Array.from(originalObject.entries()), // or with spread: value: [...originalObject]
        };
    } else {
        return value;
    }
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function reviver(key: any, value: any): any {
    if (typeof value === 'object' && value !== null) {
        if (value.dataType === 'Map') {
            if (key === 'sourceFilenameModified') {
                return new Map<string, number>(value.value);
            }
            return new Map<string, COBOLSymbol>(value.value);
        }
    }
    return value;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function logMessage(mesg: string) {
    return;
}

export class COBOLSymbolTableHelper {

    private static isFileT(sdir: string): [boolean, fs.Stats|undefined] {
        try {
            if (fs.existsSync(sdir)) {
                const f = fs.statSync(sdir);
                if (f && f.isFile()) {
                    return [true, f];
                }
            }
        }
        catch {
            return [false, undefined];
        }
        return [false, undefined];
    }

    private static getHashForFilename(filename: string) {
        const hash: Hash = crypto.createHash('sha256');
        hash.update(filename);
        return hash.digest('hex');
    }

    public static saveToFile(cacheDirectory: string, st: COBOLSymbolTable): void {
        const fn = path.join(cacheDirectory, this.getHashForFilename(st.fileName) + ".sym");

        fs.writeFileSync(fn, lzjs.compress(JSON.stringify(st, replacer)));
    }

    public static cacheUpdateRequired(cacheDirectory: string, nfilename: string): boolean {
        const filename = path.normalize(nfilename);

        const cachedMtime = InMemoryGlobalSymbolCache.sourceFilenameModified.get(filename);
        if (cachedMtime !== undefined) {
            const stat4src = fs.statSync(filename);
            if (cachedMtime < stat4src.mtimeMs) {
                return true;
            }
            return false;
        }

        // check memory first
        if (InMemorySymbolCache.has(filename)) {
            const cachedTable: COBOLSymbolTable | undefined = InMemorySymbolCache.get(filename);
            if (cachedTable !== undefined) {

                /* is the cache table still valid? */
                const stat4src = fs.statSync(filename);
                if (stat4src.mtimeMs === cachedTable.lastModifiedTime) {
                    return false;
                }
                return true;
            }
        }

        const fn: string = path.join(cacheDirectory, this.getHashForFilename(filename) + ".sym");
        const fnStat = COBOLSymbolTableHelper.isFileT(fn);
        if (fnStat[0]) {
            const stat4cache = fnStat[1];
            const stat4src = fs.statSync(filename);
            if (stat4cache !== undefined && stat4cache.mtimeMs < stat4src.mtimeMs) {
                return true;
            }
            return false;
        }

        return true;
    }

    public static getSymbolTableGivenFile(cacheDirectory: string, nfilename: string): COBOLSymbolTable | undefined {
        const filename = path.normalize(nfilename);
        if (InMemorySymbolCache.has(filename)) {
            const cachedTable: COBOLSymbolTable | undefined = InMemorySymbolCache.get(filename);
            if (cachedTable !== undefined) {

                /* is the cache table still valid? */
                const stat4src = fs.statSync(filename);
                if (stat4src.mtimeMs === cachedTable.lastModifiedTime) {
                    return cachedTable;
                }
                InMemorySymbolCache.delete(filename);       /* drop the invalid cache */
            }
        }

        const fn: string = path.join(cacheDirectory, this.getHashForFilename(filename) + ".sym");
        const fnStat = COBOLSymbolTableHelper.isFileT(fn);
        if (fnStat[0]) {
            const stat4cache = fnStat[1];
            const stat4src = fs.statSync(filename);
            if (stat4cache !== undefined && stat4cache.mtimeMs < stat4src.mtimeMs) {
                // never return a out of date cache
                fs.unlinkSync(fn);
                return undefined;
            }

            const str: string = fs.readFileSync(fn).toString();
            try {
                const cachableTable = JSON.parse(lzjs.decompress(str), reviver);
                InMemorySymbolCache.set(filename, cachableTable);
                return cachableTable;
            } catch {
                try {
                    fs.unlinkSync(fn);
                } catch {
                    logMessage(`Unable to remove symbol file : ${fn}`);
                }
                logMessage(` Symbol file removed : ${fn}`);

                return undefined;
            }
        }
        return undefined;
    }

    public static getSymbolTable_direct(nfilename: string): COBOLSymbolTable | undefined {
        const str: string = fs.readFileSync(nfilename).toString();
        try {
            return JSON.parse(lzjs.decompress(str), reviver);
        } catch {
            try {
                fs.unlinkSync(nfilename);
            } catch {
                logMessage(`Unable to remove symbol file : ${nfilename}`);
            }
            logMessage(`Symbol file removed ${nfilename}`);
        }
    }

}
