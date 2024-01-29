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
            return auth;
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
                    yield drive.files.delete({
                        auth: yield this.authorize(),
                        fileId: data.id,
                    });
                    return { id };
                }
                else {
                    yield this.deleteFile(data);
                    return { id };
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiR2RyaXZlRlMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvR2RyaXZlRlMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7QUFBQSwyQ0FBOEM7QUFFOUMsTUFBTSxLQUFLLEdBQUcsbUJBQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7QUFXakMsTUFBcUIsUUFBUTtJQXFCNUIsWUFBWSxNQUF3RDtRQXBCM0Qsd0JBQW1CLEdBQUcsb0NBQW9DLENBQUM7UUFDM0QsbUJBQWMsR0FBRyxzQ0FBc0MsQ0FBQztRQUd6RCxxQkFBZ0IsR0FBWSxLQUFLLENBQUM7UUFJbEMsUUFBRyxHQUFHO1lBQ2IsS0FBSyxFQUFFLENBQUMsR0FBRyxJQUFXLEVBQUUsRUFBRTtnQkFDekIsSUFBSSxDQUFDLGdCQUFnQixJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMsWUFBWSxFQUFFLEdBQUcsSUFBSSxDQUFDLENBQUM7WUFDN0QsQ0FBQztZQUNELElBQUksRUFBRSxDQUFDLEdBQUcsSUFBVyxFQUFFLEVBQUU7Z0JBQ3hCLE9BQU8sQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLEdBQUcsSUFBSSxDQUFDLENBQUM7WUFDckMsQ0FBQztZQUNELEtBQUssRUFBRSxDQUFDLEdBQUcsSUFBVyxFQUFFLEVBQUU7Z0JBQ3pCLE9BQU8sQ0FBQyxLQUFLLENBQUMsWUFBWSxFQUFFLEdBQUcsSUFBSSxDQUFDLENBQUM7WUFDdEMsQ0FBQztTQUNELENBQUM7UUFxWkYsZ0JBQVcsR0FBRyxDQUFPLEtBQWEsRUFBRSxFQUFFO1lBQ3JDLEtBQUssTUFBTSxJQUFJLElBQUksS0FBSyxFQUFFLENBQUM7Z0JBQzFCLElBQUksSUFBSSxDQUFDLEVBQUUsRUFBRSxDQUFDO29CQUNiLElBQUksSUFBSSxDQUFDLFFBQVEsSUFBSSxJQUFJLENBQUMsbUJBQW1CLEVBQUUsQ0FBQzt3QkFDL0MsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFF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