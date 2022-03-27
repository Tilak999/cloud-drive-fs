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
            for (const key of Object.keys(this._keyFile)) {
                const svcAccount = this._keyFile[key];
                if (!(alreadySharedEmails === null || alreadySharedEmails === void 0 ? void 0 : alreadySharedEmails.includes(svcAccount.client_email)) && data.id) {
                    yield this.shareRootFolderWith(svcAccount.client_email, data.id);
                }
            }
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
    findById(folderId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { data } = yield drive.files.get({
                    auth: yield this.authorize(),
                    fields: "*",
                    fileId: folderId,
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
            parentFolderId = parentFolderId || (yield this.setupRootFolder());
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
                    fields: "*",
                    q: `${query ? query + " and" : ""}  '${folderId}' in parents`,
                    orderBy: `folder, name, modifiedTime`,
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
                    role: "writer",
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
                            if (file.mimeType == this.MIME_TYPE_DIRECTORY)
                                yield this.delete(file.id);
                            else
                                yield this.deleteFile(file);
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
}
exports.default = GdriveFS;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiR2RyaXZlRlMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvR2RyaXZlRlMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7QUFBQSwyQ0FBOEM7QUFDOUMsTUFBTSxLQUFLLEdBQUcsbUJBQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7QUFZakMsTUFBcUIsUUFBUTtJQW9CekIsWUFBWSxNQUF3RDtRQW5CM0Qsd0JBQW1CLEdBQUcsb0NBQW9DLENBQUM7UUFDM0QsbUJBQWMsR0FBRyxzQ0FBc0MsQ0FBQztRQUd6RCxxQkFBZ0IsR0FBWSxLQUFLLENBQUM7UUFHbEMsUUFBRyxHQUFHO1lBQ1YsS0FBSyxFQUFFLENBQUMsR0FBRyxJQUFXLEVBQUUsRUFBRTtnQkFDdEIsSUFBSSxDQUFDLGdCQUFnQixJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMsWUFBWSxFQUFFLEdBQUcsSUFBSSxDQUFDLENBQUM7WUFDaEUsQ0FBQztZQUNELElBQUksRUFBRSxDQUFDLEdBQUcsSUFBVyxFQUFFLEVBQUU7Z0JBQ3JCLE9BQU8sQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLEdBQUcsSUFBSSxDQUFDLENBQUM7WUFDeEMsQ0FBQztZQUNELEtBQUssRUFBRSxDQUFDLEdBQUcsSUFBVyxFQUFFLEVBQUU7Z0JBQ3RCLE9BQU8sQ0FBQyxLQUFLLENBQUMsWUFBWSxFQUFFLEdBQUcsSUFBSSxDQUFDLENBQUM7WUFDekMsQ0FBQztTQUNKLENBQUM7UUFHRSxJQUFJLENBQUMsUUFBUSxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDO1FBQzNDLElBQUksQ0FBQyxvQkFBb0IsR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQztRQUNyRCxJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ3RELElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxNQUFNLENB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