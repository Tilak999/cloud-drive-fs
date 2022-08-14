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
        this.deleteFiles = (files) => __awaiter(this, void 0, void 0, function* () {
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
        });
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
    list(folderId, query = "", pageToken = '') {
        return __awaiter(this, void 0, void 0, function* () {
            if (folderId === "root" || folderId == null)
                folderId = yield this.setupRootFolder();
            this.log.debug("List folder:", folderId);
            try {
                const params = {
                    auth: yield this.authorize(),
                    fields: '*',
                    q: `${query ? query + ' and' : ''}  '${folderId}' in parents`,
                    orderBy: `folder, name, modifiedTime`,
                    pageSize: 1000
                };
                if (pageToken) {
                    params['pageToken'] = pageToken;
                }
                const { data } = yield drive.files.list(params);
                if (data && data.files) {
                    this.log.debug('[list] Items fetched:', data.files.length);
                    const result = {
                        files: []
                    };
                    result['files'] = data.files.map((f) => this.resolveFileData(f));
                    this.log.debug('[list] nextPageToken:', data.nextPageToken);
                    if (data.nextPageToken)
                        result['nextPageToken'] = data.nextPageToken;
                    return result;
                }
                else {
                    return { files: [], nextPageToken: '', incompleteSearch: false };
                }
            }
            catch (e) {
                if (e.code == 404)
                    return { files: [] };
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
            // Added optimisation to cache last used service account to reduce looking
            // up every account's storage space from start
            let serviceAccountAuth;
            if (this._lastUsedServiceAccountName != null) {
                serviceAccountAuth = this._keyFile[this._lastUsedServiceAccountName];
                const info = yield this.getStorageInfo(serviceAccountAuth);
                const freeSpace = info.limit - info.usage;
                if (freeSpace < config.size) {
                    this._lastUsedServiceAccountName = null;
                }
            }
            if (this._lastUsedServiceAccountName == null) {
                for (const serviceAccountName of Object.keys(this._keyFile)) {
                    if (this._indexServiceAccount === serviceAccountName)
                        continue;
                    serviceAccountAuth = this._keyFile[serviceAccountName];
                    const info = yield this.getStorageInfo(serviceAccountAuth);
                    const freeSpace = info.limit - info.usage;
                    if (freeSpace >= config.size) {
                        this._lastUsedServiceAccountName = serviceAccountName;
                        break;
                    }
                }
            }
            if (this._lastUsedServiceAccountName != null) {
                this.log.info(`Uploading to svc account [${this._lastUsedServiceAccountName}]`);
                const svcAuth = yield this.authorize(serviceAccountAuth);
                const payload = {
                    auth: svcAuth,
                    fields: "*",
                    media: { body: filestream },
                    requestBody: {
                        name: `${config.name}`,
                        description: this._lastUsedServiceAccountName,
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
                    let folderData = {};
                    do {
                        folderData = yield this.list(data.id, '', folderData.nextPageToken);
                        yield this.deleteFiles(folderData.files);
                    } while (folderData.nextPageToken);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiR2RyaXZlRlMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvR2RyaXZlRlMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7QUFBQSwyQ0FBOEM7QUFFOUMsTUFBTSxLQUFLLEdBQUcsbUJBQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7QUFXakMsTUFBcUIsUUFBUTtJQXFCNUIsWUFBWSxNQUF3RDtRQXBCM0Qsd0JBQW1CLEdBQUcsb0NBQW9DLENBQUM7UUFDM0QsbUJBQWMsR0FBRyxzQ0FBc0MsQ0FBQztRQUd6RCxxQkFBZ0IsR0FBWSxLQUFLLENBQUM7UUFJbEMsUUFBRyxHQUFHO1lBQ2IsS0FBSyxFQUFFLENBQUMsR0FBRyxJQUFXLEVBQUUsRUFBRTtnQkFDekIsSUFBSSxDQUFDLGdCQUFnQixJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMsWUFBWSxFQUFFLEdBQUcsSUFBSSxDQUFDLENBQUM7WUFDN0QsQ0FBQztZQUNELElBQUksRUFBRSxDQUFDLEdBQUcsSUFBVyxFQUFFLEVBQUU7Z0JBQ3hCLE9BQU8sQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLEdBQUcsSUFBSSxDQUFDLENBQUM7WUFDckMsQ0FBQztZQUNELEtBQUssRUFBRSxDQUFDLEdBQUcsSUFBVyxFQUFFLEVBQUU7Z0JBQ3pCLE9BQU8sQ0FBQyxLQUFLLENBQUMsWUFBWSxFQUFFLEdBQUcsSUFBSSxDQUFDLENBQUM7WUFDdEMsQ0FBQztTQUNELENBQUM7UUFtWkYsZ0JBQVcsR0FBRyxDQUFPLEtBQWEsRUFBRSxFQUFFO1lBQ3JDLEtBQUssTUFBTSxJQUFJLElBQUksS0FBSyxFQUFFO2dCQUN6QixJQUFJLElBQUksQ0FBQyxFQUFFLEVBQUU7b0JBQ1osSUFBSSxJQUFJLENBQUMsUUFBUSxJQUFJLElBQUksQ0FBQyxtQkFBbUIsRUFBRTt3QkFDOUMsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztxQkFD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