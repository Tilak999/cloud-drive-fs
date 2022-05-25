/// <reference types="node" />
import { drive_v3 } from "googleapis";
import { Stream } from "stream";
declare type File = drive_v3.Schema$File;
export interface FileConfig {
    name: string;
    size: number;
    progress?: (progressEvent: any) => void;
    parentId?: string;
}
export default class GdriveFS {
    readonly MIME_TYPE_DIRECTORY = "application/vnd.google-apps.folder";
    readonly MIME_TYPE_LINK = "application/vnd.google-apps.shortcut";
    private _indexServiceAccount;
    private _keyFile;
    private _enableDebugLogs;
    private _rootOK;
    private _lastUsedServiceAccountName;
    private log;
    constructor(config: {
        debug: boolean;
        key: any;
        driveName?: string;
    });
    private authorize;
    private setupRootFolder;
    private resolveFileData;
    findById(objectId: string): Promise<null | File>;
    findByName(name: string, folderId?: string): Promise<null | File>;
    createFolder(name: string, parentFolderId?: string): Promise<File>;
    list(folderId?: string, query?: string): Promise<File[]>;
    getStorageInfo(serviceAuth?: any): Promise<{
        limit: number;
        usage: number;
        usageInDrive: number;
    }>;
    private validate;
    shareFileWith(email: string, id: string, auth?: any): Promise<any>;
    uploadFile(filestream: Stream, config: FileConfig): Promise<File>;
    private createShortcut;
    move(srcId: string, destFolderId: string): Promise<File>;
    rename(id: string, name: string): Promise<File>;
    deleteFile(file: File): Promise<void>;
    delete(id: string): Promise<void | import("gaxios").GaxiosResponse<void>>;
    download(fileId: string): Promise<{
        name: string | null | undefined;
        length: number;
        data: import("stream").Readable;
    } | undefined>;
}
export {};
