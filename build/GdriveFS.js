"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const googleapis_1 = require("googleapis");
const drive = googleapis_1.google.drive("v3");
class GdriveFS {
    constructor(config) {
        this.MIME_TYPE_DIRECTORY = "application/vnd.google-apps.folder";
        this.MIME_TYPE_LINK = "application/vnd.google-apps.shortcut";
        this._enableDebugLogs = false;
        this.log = {
            debug: (...args) => {
                this._enableDebugLogs && console.log(`[grive-fs]`, ...args);
            },
            info: (...args) => {
                console.info(`[grive-fs]`, ...args);
            },
            error: (...args) => {
                console.error(`[grive-fs]`, ...args);
            },
        };
        this._keyFile = config.key.serviceAccounts;
        this._indexServiceAccount = config.key.indexStoreKey;
        this._rootOK = this.setupRootFolder(config.driveName);
        this._enableDebugLogs = config.debug;
    }
    authorize(key) {
        return __awaiter(this, void 0, void 0, function* () {
            const svcKey = key || this._keyFile[this._indexServiceAccount];
            const auth = new googleapis_1.google.auth.GoogleAuth({
                credentials: svcKey,
                scopes: [
                    "https://www.googleapis.com/auth/cloud-platform",
                    "https://www.googleapis.com/auth/drive",
                ],
            });
            return yield auth.getClient();
        });
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
    setupRootFolder(driveName) {
        return __awaiter(this, void 0, void 0, function* () {
            driveName = driveName || "gdrive-fs";
            if (this._rootOK) {
                const result = yield Promise.all([this._rootOK]);
                return result[0];
            }
            else {
                try {
                    const auth = yield this.authorize();
                    const { data } = yield drive.files.list({
                        auth,
                        fields: "*",
                        q: `name='${driveName}' and 'root' in parents`,
                    });
                    if (data.files && data.files.length == 0) {
                        this.log.debug("creating root directory");
                        const { data } = yield drive.files.create({
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
                }
                catch (e) {
                    this.log.error("[setupRootFolder]", e);
                    throw e;
                }
            }
        });
    }
    resolveFileData(file) {
        if (file.mimeType === this.MIME_TYPE_DIRECTORY) {
            return file;
        }
        else if (file.description && file.description !== "") {
            const original = JSON.parse(file.description);
            const fileData = Object.assign(Object.assign({}, original), file);
            fileData.description = original.serviceAccountName || original.description;
            return fileData;
        }
        else {
            this.log.error("Unknow file: ", file.name, file.mimeType);
            return file;
        }
    }
    findById(objectId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (objectId === "root")
                    objectId = yield this.setupRootFolder();
                const { data } = yield drive.files.get({
                    auth: yield this.authorize(),
                    fields: "*",
                    fileId: objectId,
                });
                if (objectId === "root")
                    data.parents = null;
                return this.resolveFileData(data);
            }
            catch (e) {
                this.log.debug("findById", e);
                return null;
            }
        });
    }
    findByName(name, folderId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (folderId === "root" || folderId == null)
                    folderId = yield this.setupRootFolder();
                const { data } = yield drive.files.list({
                    auth: yield this.authorize(),
                    fields: "*",
                    q: `name='${name.replace("'", "\\'")}' and '${folderId}' in parents`,
                });
                if (data.files) {
                    return data.files.length == 0 ? null : this.resolveFileData(data.files[0]);
                }
                else {
                    this.log.error("[findByName]", "no data.files exist");
                    throw new Error("Failed probe object exist: no data.files exist");
                }
            }
            catch (e) {
                this.log.debug("findById", e);
                return null;
            }
        });
    }
    createFolder(name, parentFolderId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!parentFolderId || parentFolderId === "root")
                parentFolderId = yield this.setupRootFolder();
            this.log.debug("Creating folder:", name, "in", parentFolderId);
            if ((yield this.findByName(name, parentFolderId)) == null) {
                const { data } = yield drive.files.create({
                    auth: yield this.authorize(),
                    requestBody: {
                        name: name,
                        mimeType: this.MIME_TYPE_DIRECTORY,
                        parents: [`${parentFolderId}`],
                    },
                });
                return data;
            }
            else {
                this.log.error("[createFolder]", "folder already exist");
                throw "folder already exist";
            }
        });
    }
    list(folderId, query = "") {
        return __awaiter(this, void 0, void 0, function* () {
            if (folderId === "root" || folderId == null)
                folderId = yield this.setupRootFolder();
            this.log.debug("List folder:", folderId);
            try {
                const { data } = yield drive.files.list({
                    auth: yield this.authorize(),
                    fields: "*",
                    q: `${query ? query + " and" : ""}  '${folderId}' in parents`,
                    orderBy: `folder, name, modifiedTime`,
                    pageSize: 1000,
                });
                if (data && data.files) {
                    this.log.debug("[list] Items fetched:", data.files.length);
                    const files = data.files.map((f) => this.resolveFileData(f));
                    return files;
                }
                else {
                    return [];
                }
            }
            catch (e) {
                if (e.code == 404)
                    return [];
                else
                    throw e;
            }
        });
    }
    getStorageInfo(serviceAuth) {
        return __awaiter(this, void 0, void 0, function* () {
            const action = (serviceAuth) => __awaiter(this, void 0, void 0, function* () {
                const auth = yield this.authorize(serviceAuth);
                const resp = yield drive.about.get({
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
                }
                else {
                    throw `Failed to fetch storage information for service account ${serviceAuth.client_email}`;
                }
            });
            if (serviceAuth)
                return action(serviceAuth);
            const promises = Object.keys(this._keyFile).map((serviceAccountName) => action(this._keyFile[serviceAccountName]));
            const info = yield Promise.all(promises);
            return info.reduce((prev, curr) => {
                return {
                    limit: prev.limit + curr.limit,
                    usage: prev.usage + curr.usage,
                    usageInDrive: prev.usageInDrive + curr.usageInDrive,
                };
            });
        });
    }
    validate(config) {
        return __awaiter(this, void 0, void 0, function* () {
            if (config.name == null || config.name == "") {
                throw "File name is required.";
            }
            if (config.size == null) {
                throw "File size is required.";
            }
            if (config.parentId) {
                const file = yield this.findByName(config.name, config.parentId);
                if (file != null)
                    throw "File with same name already present";
            }
            else {
                throw "Parent folder id is required.";
            }
        });
    }
    shareFileWith(email, id, auth) {
        return __awaiter(this, void 0, void 0, function* () {
            if (id === "root" || id === "")
                return;
            return drive.permissions.create({
                auth: auth || (yield this.authorize()),
                requestBody: {
                    type: "user",
                    role: email.includes("gserviceaccount") ? "writer" : "reader",
                    emailAddress: email,
                },
                fileId: id,
                sendNotificationEmail: false,
            });
        });
    }
    uploadFile(filestream, config) {
        return __awaiter(this, void 0, void 0, function* () {
            if (config.parentId == null || config.parentId === "root")
                config.parentId = yield this.setupRootFolder();
            yield this.validate(config);
            for (const serviceAccountName of Object.keys(this._keyFile)) {
                if (this._indexServiceAccount === serviceAccountName)
                    continue;
                const serviceAccountAuth = this._keyFile[serviceAccountName];
                const info = yield this.getStorageInfo(serviceAccountAuth);
                const freeSpace = info.limit - info.usage;
                if (freeSpace >= config.size) {
                    this.log.info(`Uploading [${serviceAccountName}][free space: ${freeSpace}]`);
                    const svcAuth = yield this.authorize(serviceAccountAuth);
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
                        const { data } = yield drive.files.create(payload, {
                            onUploadProgress: config.progress,
                        });
                        if (data && data.id) {
                            const email = this._keyFile[this._indexServiceAccount].client_email;
                            yield this.shareFileWith(email, data.id, svcAuth);
                            const file = yield this.createShortcut(data, config);
                            return this.resolveFileData(file);
                        }
                        else {
                            throw "Missing `id` in file data";
                        }
                    }
                    catch (e) {
                        this.log.error("Error while uploading:", config.name, e);
                    }
                }
            }
            throw "Either all service accounts are full or file is greater than 15GB";
        });
    }
    createShortcut(data, config) {
        return __awaiter(this, void 0, void 0, function* () {
            if (typeof data.id === "string" && typeof data.mimeType === "string") {
                const payload = {
                    auth: yield this.authorize(),
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
                const response = yield drive.files.create(payload);
                return response.data;
            }
            else {
                throw "[createShortcut] invalid file data object: " + data;
            }
        });
    }
    move(srcId, destFolderId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!srcId || srcId == "")
                throw "Invalid sourceId";
            if (!destFolderId || destFolderId == "")
                throw "Invalid destFolderId";
            if (destFolderId === "root")
                destFolderId = yield this.setupRootFolder();
            const src = yield this.findById(srcId);
            const dest = yield this.findById(destFolderId);
            if (src && dest) {
                if (dest.mimeType != this.MIME_TYPE_DIRECTORY) {
                    throw "destFolderId is not a directory.";
                }
                let auth = yield this.authorize();
                const { data } = yield drive.files.update({
                    auth,
                    removeParents: `${src.parents && src.parents[0]}`,
                    addParents: `${destFolderId}`,
                    fileId: `${src.id}`,
                });
                return data;
            }
            else {
                throw "Invalid sourceId or destinationId";
            }
        });
    }
    rename(id, name) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!id || id == "")
                throw "Invalid id: should be folder id or file id";
            const item = yield this.findById(id);
            let auth = yield this.authorize();
            const { data } = yield drive.files.update({
                auth,
                fileId: id,
                requestBody: { name },
            });
            return data;
        });
    }
    deleteFile(file) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            if (file && file.description) {
                const auth = this._keyFile[file.description];
                this.log.info("Delete File: ", file.name, file.id);
                yield drive.files.delete({
                    auth: yield this.authorize(auth),
                    fileId: ((_a = file.shortcutDetails) === null || _a === void 0 ? void 0 : _a.targetId) || "",
                });
                yield drive.files.delete({
                    auth: yield this.authorize(),
                    fileId: file.id || "",
                });
            }
            else {
                throw "File description missing: required for identifying serviceAccountName";
            }
        });
    }
    delete(id) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!id || id == "")
                throw `[delete] Invalid id: ${id}`;
            const data = yield this.findById(id);
            if (data && data.id) {
                if (data.mimeType == this.MIME_TYPE_DIRECTORY) {
                    this.log.info("Deleting folder: " + data.name);
                    const files = yield this.list(data.id);
                    for (const file of files) {
                        if (file.id) {
                            if (file.mimeType == this.MIME_TYPE_DIRECTORY) {
                                yield this.delete(file.id);
                            }
                            else {
                                yield this.deleteFile(file);
                            }
                        }
                    }
                    return drive.files.delete({
                        auth: yield this.authorize(),
                        fileId: data.id,
                    });
                }
                else {
                    return this.deleteFile(data);
                }
            }
            else {
                throw "No file or folder with this id:" + id;
            }
        });
    }
    download(fileId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (fileId && fileId.trim() != "") {
                const fileData = yield this.findById(fileId);
                if (fileData && fileData.shortcutDetails) {
                    const auth = yield this.authorize();
                    this.log.debug("downloading id:", fileData.shortcutDetails.targetId);
                    const resp = yield drive.files.get({ auth, fileId: fileData.shortcutDetails.targetId, alt: "media" }, { responseType: "stream" });
                    return {
                        name: fileData.name,
                        length: parseInt(resp.headers["content-length"]),
                        data: resp.data,
                    };
                }
            }
            else {
                throw "File with id = '" + fileId + "'not found";
            }
        });
    }
}
exports.default = GdriveFS;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiR2RyaXZlRlMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvR2RyaXZlRlMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7QUFBQSwyQ0FBOEM7QUFDOUMsTUFBTSxLQUFLLEdBQUcsbUJBQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7QUFZakMsTUFBcUIsUUFBUTtJQW9CekIsWUFBWSxNQUF3RDtRQW5CM0Qsd0JBQW1CLEdBQUcsb0NBQW9DLENBQUM7UUFDM0QsbUJBQWMsR0FBRyxzQ0FBc0MsQ0FBQztRQUd6RCxxQkFBZ0IsR0FBWSxLQUFLLENBQUM7UUFHbEMsUUFBRyxHQUFHO1lBQ1YsS0FBSyxFQUFFLENBQUMsR0FBRyxJQUFXLEVBQUUsRUFBRTtnQkFDdEIsSUFBSSxDQUFDLGdCQUFnQixJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMsWUFBWSxFQUFFLEdBQUcsSUFBSSxDQUFDLENBQUM7WUFDaEUsQ0FBQztZQUNELElBQUksRUFBRSxDQUFDLEdBQUcsSUFBVyxFQUFFLEVBQUU7Z0JBQ3JCLE9BQU8sQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLEdBQUcsSUFBSSxDQUFDLENBQUM7WUFDeEMsQ0FBQztZQUNELEtBQUssRUFBRSxDQUFDLEdBQUcsSUFBVyxFQUFFLEVBQUU7Z0JBQ3RCLE9BQU8sQ0FBQyxLQUFLLENBQUMsWUFBWSxFQUFFLEdBQUcsSUFBSSxDQUFDLENBQUM7WUFDekMsQ0FBQztTQUNKLENBQUM7UUFHRSxJQUFJLENBQUMsUUFBUSxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDO1FBQzNDLElBQUksQ0FBQyxvQkFBb0IsR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQztRQUNyRCxJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ3RELElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxNQUFNLENB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