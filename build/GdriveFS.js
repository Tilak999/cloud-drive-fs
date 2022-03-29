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
                    fields: "files(id, name, mimeType, size, createdTime, " +
                        "modifiedTime, parents, fileExtension, description, properties)",
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