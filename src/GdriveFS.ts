import { drive_v3, google } from "googleapis";
import { join } from "path";
const drive = google.drive("v3");
import { Stream } from "stream";

type File = drive_v3.Schema$File;

export interface FileConfig {
    name: string;
    size: number;
    progress?: (progressEvent: any) => void;
    parentId?: string;
}

export default class GdriveFS {
    readonly MIME_TYPE_DIRECTORY = "application/vnd.google-apps.folder";
    readonly MIME_TYPE_LINK = "application/vnd.google-apps.shortcut";
    private _indexServiceAccount: string;
    private _keyFile: any;
    private _enableDebugLogs: boolean = false;
    private _rootOK: Promise<any>;

    private log = {
        debug: (...args: any[]) => {
            this._enableDebugLogs && console.log(`[grive-fs]`, ...args);
        },
        info: (...args: any[]) => {
            console.info(`[grive-fs]`, ...args);
        },
        error: (...args: any[]) => {
            console.error(`[grive-fs]`, ...args);
        },
    };

    constructor(config: { debug: boolean; key: any; driveName?: string }) {
        this._keyFile = config.key.serviceAccounts;
        this._indexServiceAccount = config.key.indexStoreKey;
        this._rootOK = this.setupRootFolder(config.driveName);
        this._enableDebugLogs = config.debug;
    }

    private async authorize(key?: object) {
        const svcKey = key || this._keyFile[this._indexServiceAccount];
        const auth = new google.auth.GoogleAuth({
            credentials: svcKey,
            scopes: [
                "https://www.googleapis.com/auth/cloud-platform",
                "https://www.googleapis.com/auth/drive",
            ],
        });
        return await auth.getClient();
    }

    /*private async shareRootWithServiceAccount(data: File): Promise<void> {
        const alreadySharedEmails = data.permissions?.map((p) => p.emailAddress);
        const promises = [];
        for (const key of Object.keys(this._keyFile)) {
            const svcAccount = this._keyFile[key];
            if (!alreadySharedEmails?.includes(svcAccount.client_email) && data.id) {
                this.log.debug("Sharing root with: ", key);
                const p = this.shareRootFolderWith(svcAccount.client_email, data.id);
                promises.push(p);
            }
        }
        await Promise.all(promises)
    }*/

    private async setupRootFolder(driveName?: string): Promise<string> {
        driveName = driveName || "gdrive-fs";
        if (this._rootOK) {
            const result = await Promise.all([this._rootOK]);
            return result[0];
        } else {
            try {
                const auth = await this.authorize();
                const { data } = await drive.files.list({
                    auth,
                    fields: "*",
                    q: `name='${driveName}' and 'root' in parents`,
                });
                if (data.files && data.files.length == 0) {
                    this.log.debug("creating root directory");
                    const { data } = await drive.files.create({
                        auth,
                        fields: "*",
                        requestBody: {
                            name: driveName,
                            mimeType: this.MIME_TYPE_DIRECTORY,
                            parents: ["root"],
                        },
                    });
                    //await this.shareRootWithServiceAccount(data);
                    return data.id || "";
                }
                const rootFile = (data.files && data.files[0]) || {};
                //await this.shareRootWithServiceAccount(rootFile);
                return rootFile.id || "";
            } catch (e) {
                this.log.error("[setupRootFolder]", e);
                throw e;
            }
        }
    }

    private resolveFileData(file: File): File {
        if (file.mimeType === this.MIME_TYPE_DIRECTORY) {
            return file;
        } else if (file.description && file.description !== "") {
            const original = JSON.parse(file.description);
            const fileData = { ...original, ...file };
            fileData.description = original.description;
            return fileData;
        } else {
            this.log.error("Unknow file: ", file.name, file.mimeType);
            return file;
        }
    }

    public async findById(objectId: string): Promise<null | File> {
        try {
            if (objectId === "root") return null;
            const { data } = await drive.files.get({
                auth: await this.authorize(),
                fields: "*",
                fileId: objectId,
            });
            return this.resolveFileData(data);
        } catch (e) {
            this.log.debug("findById", e);
            return null;
        }
    }

    public async findByName(name: string, folderId?: string): Promise<null | File> {
        try {
            folderId = folderId || (await this.setupRootFolder());
            const { data } = await drive.files.list({
                auth: await this.authorize(),
                fields: "*",
                q: `name='${name.replace("'", "\\'")}' and '${folderId}' in parents`,
            });
            if (data.files) {
                return data.files.length == 0 ? null : this.resolveFileData(data.files[0]);
            } else {
                this.log.error("[findByName]", "no data.files exist");
                throw new Error("Failed probe object exist: no data.files exist");
            }
        } catch (e) {
            this.log.debug("findById", e);
            return null;
        }
    }

    public async createFolder(name: string, parentFolderId?: string): Promise<File> {
        if (!parentFolderId || parentFolderId === "root")
            parentFolderId = await this.setupRootFolder();
        this.log.debug("Creating folder:", name, "in", parentFolderId);
        if ((await this.findByName(name, parentFolderId)) == null) {
            const { data } = await drive.files.create({
                auth: await this.authorize(),
                requestBody: {
                    name: name,
                    mimeType: this.MIME_TYPE_DIRECTORY,
                    parents: [`${parentFolderId}`],
                },
            });
            return data;
        } else {
            this.log.error("[createFolder]", "folder already exist");
            throw "folder already exist";
        }
    }

    public async list(folderId?: string, query: string = ""): Promise<File[]> {
        folderId = folderId || (await this.setupRootFolder());
        this.log.debug("List folder:", folderId);
        try {
            const { data } = await drive.files.list({
                auth: await this.authorize(),
                fields: "*",
                q: `${query ? query + " and" : ""}  '${folderId}' in parents`,
                orderBy: `folder, name, modifiedTime`,
                pageSize: 1000,
            });
            if (data && data.files) {
                this.log.debug("[list] Items fetched:", data.files.length);
                const files = data.files.map((f) => this.resolveFileData(f));
                return files;
            } else {
                return [];
            }
        } catch (e: any) {
            if (e.code == 404) return [];
            else throw e;
        }
    }

    public async getStorageInfo(serviceAuth?: any) {
        const action = async (serviceAuth: any) => {
            const auth = await this.authorize(serviceAuth);
            const resp = await drive.about.get({
                auth,
                fields: "storageQuota",
            });
            const storageInfo = resp.data.storageQuota;
            if (storageInfo != null) {
                const { limit, usage, usageInDrive } = storageInfo;
                return {
                    limit: parseFloat(limit || "0"),
                    usage: parseFloat(usage || "0"),
                    usageInDrive: parseFloat(usageInDrive || "0"),
                };
            } else {
                throw `Failed to fetch storage information for service account ${serviceAuth.client_email}`;
            }
        };
        if (serviceAuth) return action(serviceAuth);
        const promises = Object.keys(this._keyFile).map((serviceAccountName) =>
            action(this._keyFile[serviceAccountName])
        );
        const info = await Promise.all(promises);
        return info.reduce((prev, curr) => {
            return {
                limit: prev.limit + curr.limit,
                usage: prev.usage + curr.usage,
                usageInDrive: prev.usageInDrive + curr.usageInDrive,
            };
        });
    }

    private async validate(config: FileConfig) {
        if (config.name == null || config.name == "") {
            throw "File name is required.";
        }
        if (config.size == null) {
            throw "File size is required.";
        }
        if (config.parentId) {
            const file = await this.findByName(config.name, config.parentId);
            if (file != null) throw "File with same name already present";
        } else {
            throw "Parent folder id is required.";
        }
    }

    public async shareFileWith(email: string, id: string, auth?: any): Promise<any> {
        if (id === "root" || id === "") return;
        return drive.permissions.create({
            auth: auth || (await this.authorize()),
            requestBody: {
                type: "user",
                role: email.includes("gserviceaccount") ? "writer" : "reader",
                emailAddress: email,
            },
            fileId: id,
            sendNotificationEmail: false,
        });
    }

    public async uploadFile(filestream: Stream, config: FileConfig): Promise<File> {
        config.parentId = config.parentId || (await this.setupRootFolder());
        await this.validate(config);
        for (const serviceAccountName of Object.keys(this._keyFile)) {
            if (this._indexServiceAccount === serviceAccountName) continue;
            const serviceAccountAuth = this._keyFile[serviceAccountName];
            const info = await this.getStorageInfo(serviceAccountAuth);
            const freeSpace = info.limit - info.usage;
            if (freeSpace >= config.size) {
                this.log.info(`Uploading [${serviceAccountName}][free space: ${freeSpace}]`);
                const svcAuth = await this.authorize(serviceAccountAuth);
                const payload = {
                    auth: svcAuth,
                    fields: "*",
                    media: { body: filestream },
                    requestBody: {
                        name: `${config.name}`,
                        description: serviceAccountName,
                        properties: {
                            parentId: config.parentId,
                        },
                    },
                };
                try {
                    const { data } = await drive.files.create(payload, {
                        onUploadProgress: config.progress,
                    });
                    if (data && data.id) {
                        const email = this._keyFile[this._indexServiceAccount].client_email;
                        await this.shareFileWith(email, data.id, svcAuth);
                        const file = await this.createShortcut(data, config);
                        return this.resolveFileData(file);
                    } else {
                        throw "Missing `id` in file data";
                    }
                } catch (e) {
                    this.log.error("Error while uploading:", config.name, e);
                }
            }
        }
        throw "Either all service accounts are full or file is greater than 15GB";
    }

    private async createShortcut(data: File, config: FileConfig) {
        if (typeof data.id === "string" && typeof data.mimeType === "string") {
            const payload = {
                auth: await this.authorize(),
                fields: "*",
                requestBody: {
                    name: `${config.name}`,
                    mimeType: this.MIME_TYPE_LINK,
                    parents: [`${config.parentId}`],
                    description: JSON.stringify(data),
                    shortcutDetails: {
                        targetId: data.id,
                        targetMimeType: data.mimeType,
                    },
                },
            };
            const response = await drive.files.create(payload);
            return response.data;
        } else {
            throw "[createShortcut] invalid file data object: " + data;
        }
    }

    public async move(srcId: string, destFolderId: string): Promise<File> {
        if (!srcId || srcId == "") throw "Invalid sourceId";
        if (!destFolderId || destFolderId == "") throw "Invalid destFolderId";
        if (destFolderId === "root") destFolderId = await this.setupRootFolder();

        const src = await this.findById(srcId);
        const dest = await this.findById(destFolderId);
        if (src && dest) {
            if (dest.mimeType != this.MIME_TYPE_DIRECTORY) {
                throw "destFolderId is not a directory.";
            }
            let auth = await this.authorize();
            const { data } = await drive.files.update({
                auth,
                removeParents: `${src.parents && src.parents[0]}`,
                addParents: `${destFolderId}`,
                fileId: `${src.id}`,
            });
            return data;
        } else {
            throw "Invalid sourceId or destinationId";
        }
    }

    public async rename(id: string, name: string): Promise<File> {
        if (!id || id == "") throw "Invalid id: should be folder id or file id";
        const item = await this.findById(id);
        let auth = await this.authorize();
        const { data } = await drive.files.update({
            auth,
            fileId: id,
            requestBody: { name },
        });
        return data;
    }

    public async deleteFile(file: File) {
        if (file && file.description) {
            const auth = this._keyFile[file.description];
            this.log.info("Delete File: ", file.name, file.id);
            await drive.files.delete({
                auth: await this.authorize(auth),
                fileId: file.shortcutDetails?.targetId || "",
            });
            await drive.files.delete({
                auth: await this.authorize(),
                fileId: file.id || "",
            });
        } else {
            throw "File description missing: required for identifying serviceAccountName";
        }
    }

    public async delete(id: string) {
        if (!id || id == "") throw `[delete] Invalid id: ${id}`;
        const data = await this.findById(id);
        if (data && data.id) {
            if (data.mimeType == this.MIME_TYPE_DIRECTORY) {
                this.log.info("Deleting folder: " + data.name);
                const files = await this.list(data.id);
                for (const file of files) {
                    if (file.id) {
                        if (file.mimeType == this.MIME_TYPE_DIRECTORY) {
                            await this.delete(file.id);
                        } else {
                            await this.deleteFile(file);
                        }
                    }
                }
                return drive.files.delete({
                    auth: await this.authorize(),
                    fileId: data.id,
                });
            } else {
                return this.deleteFile(data);
            }
        } else {
            throw "No file or folder with this id:" + id;
        }
    }

    async download(fileId: string) {
        if (fileId && fileId.trim() != "") {
            const fileData = await this.findById(fileId);
            if (fileData && fileData.description) {
                const auth = await this.authorize(this._keyFile[fileData.description]);
                const resp = await drive.files.get(
                    { auth, fileId: fileData.shortcutDetails?.targetId, alt: "media" },
                    { responseType: "stream" }
                );
                return {
                    name: fileData.name,
                    length: parseInt(resp.headers["content-length"]),
                    data: resp.data,
                };
            }
        } else {
            throw "File with id = '" + fileId + "'not found";
        }
    }
}
