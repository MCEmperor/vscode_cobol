import path from "path";
import fs from 'fs';
import { extensions, FileType, Uri, workspace } from "vscode";
import { getWorkspaceFolders } from "./cobolfolders";
import { ScanData, ScanDataHelper } from "./cobscannerdata";
import { VSCOBOLConfiguration } from "./configuration";
import { logChannelHide, logChannelSetPreserveFocus, logException, logMessage } from "./extension";
import { ICOBOLSettings } from "./iconfiguration";
import { COBOLFileUtils } from "./opencopybook";
import VSCOBOLSourceScanner from "./vscobolscanner";
import { fork, ForkOptions } from 'child_process';
import { GlobalCachesHelper } from "./globalcachehelper";

class ScanStats {
    filesIgnored = 0;
    directoriesScanned = 0;
    directoryDepth = 0;
    maxDirectoryDepth = 0;
    fileCount = 0;
    showMessage = false;
    directoriesScannedMap: Map<string, Uri> = new Map<string, Uri>();
}

export class VSCobScanner {
    private static readonly scannerDir = VSCobScanner.getCobScannerDirectory();

    public static async processSavedFile(fsPath: string, settings: ICOBOLSettings): Promise<void> {
        if (VSCOBOLConfiguration.isOnDiskCachingEnabled() === false) {
            return;
        }

        if (COBOLFileUtils.isValidCopybookExtension(fsPath, settings) || COBOLFileUtils.isValidProgramExtension(fsPath, settings)) {
            const sf = new ScanData();
            sf.showStats = false;
            sf.Files.push(fsPath);
            sf.parse_copybooks_for_references = settings.parse_copybooks_for_references;
            sf.showMessage = settings.cache_metadata_show_progress_messages;
            await this.forkScanner(sf);
        }

    }

    private static getCobScannerDirectory(): string {
        const thisExtension = extensions.getExtension("bitlang.cobol");
        if (thisExtension !== undefined) {
            const extPath = `${thisExtension.extensionPath}`;
            return path.join(extPath, "cobscanner");
        }
        return "";
    }
    private static activePid = 0;

    public static isAlive(pid: number): boolean {
        try {
            return process.kill(pid, 0);
        }
        catch (e) {
            return e.code === 'EPERM';
        }
    }

    public static IsScannerActive(cacheDirectory: string): boolean {
        const jsonFile = path.join(cacheDirectory, "cobscanner.json");
        const jsonFileExists = fs.existsSync(jsonFile);

        if (VSCobScanner.activePid === 0) {
            return jsonFileExists;
        }

        // if the file exists.. then leave early
        if (jsonFileExists) {
            return jsonFileExists;
        }

        return this.isAlive(VSCobScanner.activePid);
    }

    public static async forkScanner(sf: ScanData): Promise<void> {
        const cacheDirectory = VSCOBOLSourceScanner.getCacheDirectory();
        if (cacheDirectory !== undefined) {
            sf.cacheDirectory = cacheDirectory;
            ScanDataHelper.save(cacheDirectory, sf);

            const jcobscanner_js = path.join(VSCobScanner.scannerDir, "cobscanner.js");
            const jsonFile = path.join(cacheDirectory, "cobscanner.json");

            const options: ForkOptions = {
                stdio: [0, 1, 2, "ipc"],
                cwd : VSCobScanner.scannerDir
            };

            const child = fork(jcobscanner_js, [jsonFile], options);

            VSCobScanner.activePid = child.pid;

            child.on('error', err => {
                logException("Fork caused", err);
            });

            child.on('exit', code => {
                VSCobScanner.activePid = 0;
                if (code !== 0) {
                    if (sf.showMessage) {
                        logMessage(`External scan completed (Exit Code=${code})`);
                    }
                } else {
                    GlobalCachesHelper.loadGlobalSymbolCache(cacheDirectory);
                }
            });

            child.on('message', (msg) => {
                logMessage(msg as string);
            });

            if (child.stdout !== null) {
                for await (const data of child.stdout) {
                    // compress the output
                    const lines: string = data.toString();
                    for (const line of lines.split("\n")) {
                        const lineTrimmed = line.trim();
                        if (lineTrimmed.length !== 0) {
                            logMessage(` ${line}`);
                        }
                    }
                }
            }
        }
    }

    public static async processAllFilesInWorkspaceOutOfProcess(viaCommand: boolean): Promise<void> {
        if (VSCOBOLConfiguration.isOnDiskCachingEnabled() === false) {
            logMessage("Metadata cache is off, no action taken");
            return;
        }

        const cacheDirectory = VSCOBOLSourceScanner.getCacheDirectory();
        if (cacheDirectory !== undefined && VSCobScanner.IsScannerActive(cacheDirectory)) {
            logMessage("Source scanner already active, no action taken");
            return;
        }

        const settings = VSCOBOLConfiguration.get();
        const ws = getWorkspaceFolders();
        const stats = new ScanStats();
        const files: string[] = [];

        if (ws === undefined) {
            logMessage(`No workspace folders available`);
            return;
        }

        if (!viaCommand) {
            logChannelHide();
        } else {
            logChannelSetPreserveFocus(!viaCommand);
        }
        logMessage("");
        logMessage("Starting to process metadata from workspace folders (" + (viaCommand ? "on demand" : "startup") + ")");

        if (ws !== undefined) {
            for (const folder of ws) {
                try {
                    await VSCobScanner.generateCOBScannerData(settings, folder.uri, stats, files);
                } catch {
                    continue;
                }
            }

        }

        const sf = new ScanData();
        sf.directoriesScanned = stats.directoriesScanned;
        sf.maxDirectoryDepth = stats.maxDirectoryDepth;
        sf.fileCount = stats.fileCount;

        sf.parse_copybooks_for_references = settings.parse_copybooks_for_references;
        sf.Files = files;
        sf.showMessage = settings.cache_metadata_show_progress_messages;
        for (const [, uri] of stats.directoriesScannedMap) {
            sf.Directories.push(uri.fsPath);
        }

        await VSCobScanner.forkScanner(sf);
    }

    private static async generateCOBScannerData(settings: ICOBOLSettings, folder: Uri, stats: ScanStats, files2scan: string[]): Promise<boolean> {
        const entries = await workspace.fs.readDirectory(folder);
        stats.directoriesScanned++;
        if (stats.directoriesScannedMap.has(folder.fsPath)) {
            return true;
        }

        if (stats.showMessage) {
            const spaces = " ".repeat(stats.directoryDepth);
            logMessage(` ${spaces}Directory : ${folder.fsPath}`);
        }
        stats.directoriesScannedMap.set(folder.fsPath, folder);

        const dir2scan: Uri[] = [];

        for (const [entry, fileType] of entries) {
            switch (fileType) {
                case FileType.File | FileType.SymbolicLink:
                    {
                        const spaces4file = " ".repeat(1 + stats.directoryDepth);
                        logMessage(`${spaces4file} File : ${entry} in ${folder.fsPath} is a symbolic link which may cause duplicate data to be cached`);
                    }
                // eslint-disable-next-line no-fallthrough
                case FileType.File:
                    {
                        const fullPath = path.join(folder.fsPath, entry);
                        if (COBOLFileUtils.isValidProgramExtension(fullPath, settings) || COBOLFileUtils.isValidCopybookExtension(fullPath, settings)) {
                            files2scan.push(fullPath);
                            stats.fileCount++;
                        } else {
                            stats.filesIgnored++;
                        }
                    }
                    break;
                case FileType.Directory | FileType.SymbolicLink:
                    {
                        const spaces4dir = " ".repeat(1 + stats.directoryDepth);
                        logMessage(`${spaces4dir} Directory : ${entry} in ${folder.fsPath} is a symbolic link which may cause duplicate data to be cached`);
                    }
                // eslint-disable-next-line no-fallthrough
                case FileType.Directory:
                    if (!VSCOBOLSourceScanner.ignoreDirectory(entry)) {
                        const fullDirectory = path.join(folder.fsPath, entry);
                        if (!VSCOBOLSourceScanner.ignoreDirectory(entry)) {
                            try {
                                dir2scan.push(Uri.file(fullDirectory));
                            } catch (ex) {
                                logMessage(` Uri.file failed with ${fullDirectory} from ${folder.fsPath} + ${entry}`);
                                if (ex instanceof Error) {
                                    logException("Unexpected abort during Uri Parse", ex as Error);
                                } else {
                                    logMessage(ex);
                                }
                            }
                        }
                    }
                    break;
            }
        }

        if (dir2scan.length !== 0) {
            if (1 + stats.directoryDepth <= settings.cache_metadata_max_directory_scan_depth) {
                stats.directoryDepth++;
                for (const directoryUri of dir2scan) {
                    try {
                        await VSCobScanner.generateCOBScannerData(settings, directoryUri, stats, files2scan);
                    } catch {
                        continue;       // file not found
                    }
                }
                if (stats.directoryDepth > stats.maxDirectoryDepth) {
                    stats.maxDirectoryDepth = stats.directoryDepth;
                }
                stats.directoryDepth--;
            } else {
                logMessage(` Directories below : ${folder.fsPath} has not been scanned (depth limit is ${settings.cache_metadata_max_directory_scan_depth})`);
            }

        }

        return true;
    }
}