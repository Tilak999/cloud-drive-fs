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
    shareRootWithServiceAccount(data) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const alreadySharedEmails = (_a = data.permissions) === null || _a === void 0 ? void 0 : _a.map((p) => p.emailAddress);
            const promises = [];
            for (const key of Object.keys(this._keyFile)) {
                const svcAccount = this._keyFile[key];
                if (!(alreadySharedEmails === null || alreadySharedEmails === void 0 ? void 0 : alreadySharedEmails.includes(svcAccount.client_email)) && data.id) {
                    this.log.debug("Sharing root with: ", key);
                    const p = this.shareRootFolderWith(svcAccount.client_email, data.id);
                    promises.push(p);
                }
            }
            yield Promise.all(promises);
        });
    }
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
                        yield this.shareRootWithServiceAccount(data);
                        return data.id || "";
                    }
                    const rootFile = (data.files && data.files[0]) || {};
                    yield this.shareRootWithServiceAccount(rootFile);
                    return rootFile.id || "";
                }
                catch (e) {
                    this.log.error("[setupRootFolder]", e);
                    throw e;
                }
            }
        });
    }
    findById(objectId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (objectId === "root")
                    return null;
                const { data } = yield drive.files.get({
                    auth: yield this.authorize(),
                    fields: "*",
                    fileId: objectId,
                });
                return data;
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
                folderId = folderId || (yield this.setupRootFolder());
                const { data } = yield drive.files.list({
                    auth: yield this.authorize(),
                    fields: "*",
                    q: `name='${name.replace("'", "\\'")}' and '${folderId}' in parents`,
                });
                if (data.files) {
                    return data.files.length == 0 ? null : data.files[0];
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
            folderId = folderId || (yield this.setupRootFolder());
            this.log.debug("List folder:", folderId);
            try {
                const { data } = yield drive.files.list({
                    auth: yield this.authorize(),
                    fields: "files(id, name, mimeType, size, createdTime, modifiedTime, parents, fileExtension)",
                    q: `${query ? query + " and" : ""}  '${folderId}' in parents`,
                    orderBy: `folder, name, modifiedTime`,
                    pageSize: 1000,
                });
                if (data && data.files) {
                    this.log.debug("[list] Items fetched:", data.files.length);
                    return data.files;
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
    shareRootFolderWith(email, id) {
        return __awaiter(this, void 0, void 0, function* () {
            if (id === "root" || id === "")
                return;
            return drive.permissions.create({
                auth: yield this.authorize(),
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
            config.parentId = config.parentId || (yield this.setupRootFolder());
            yield this.validate(config);
            for (const serviceAccountName of Object.keys(this._keyFile)) {
                if (this._indexServiceAccount === serviceAccountName)
                    continue;
                const serviceAccountAuth = this._keyFile[serviceAccountName];
                const info = yield this.getStorageInfo(serviceAccountAuth);
                const freeSpace = info.limit - info.usage;
                if (freeSpace >= config.size) {
                    this.log.info(`Uploading [${serviceAccountName}][free space: ${freeSpace}]`);
                    const payload = {
                        auth: yield this.authorize(serviceAccountAuth),
                        fields: "*",
                        media: { body: filestream },
                        requestBody: {
                            name: `${config.name}`,
                            parents: [config.parentId],
                            description: serviceAccountName,
                            properties: {
                                parentId: config.parentId,
                            },
                        },
                    };
                    const response = yield drive.files.create(payload, {
                        onUploadProgress: config.progress,
                    });
                    return response.data;
                }
            }
            throw "Either all service accounts are full or file is greater than 15GB";
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
                if (src.mimeType !== this.MIME_TYPE_DIRECTORY) {
                    if (src.description) {
                        auth = yield this.authorize(this._keyFile[src.description]);
                    }
                    else {
                        throw "Service Account file can't be found for: " + src.description;
                    }
                }
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
            if (item && item.mimeType !== this.MIME_TYPE_DIRECTORY) {
                if (item.description && item.description !== "")
                    auth = yield this.authorize(this._keyFile[item.description]);
                else
                    throw "Service Account file can't be found for: " + item.description;
            }
            const { data } = yield drive.files.update({
                auth,
                fileId: id,
                requestBody: { name },
            });
            return data;
        });
    }
    deleteFile(file) {
        return __awaiter(this, void 0, void 0, function* () {
            if (file && file.description) {
                const auth = this._keyFile[file.description];
                this.log.info("Delete File: ", file.name, file.id);
                yield drive.files.delete({
                    auth: yield this.authorize(auth),
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
                if (fileData && fileData.description && fileData.id) {
                    const auth = yield this.authorize(this._keyFile[fileData.description]);
                    const resp = yield drive.files.get({ auth, fileId: fileData.id, alt: "media" }, { responseType: "stream" });
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