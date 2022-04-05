const api = require("googleapis");
const drive = api.google.drive("v3");
const keys = require("/Users/tilak/Documents/cloud-drive/org-masterKey.json").serviceAccounts;

async function authorize(key) {
    const svcKey = key;
    const auth = new api.google.auth.GoogleAuth({
        credentials: svcKey,
        scopes: [
            "https://www.googleapis.com/auth/cloud-platform",
            "https://www.googleapis.com/auth/drive",
        ],
    });
    return await auth.getClient();
}

async function main() {
    const { data } = await drive.files.list({
        auth: await authorize(keys["cloud-drive-72-svcaccnt-0"]),
        fields: "*",
        q: "mimeType != 'application/vnd.google-apps.folder'",
    });
    //const reduced = data.files.filter((f) => f.permission.length == 2);

    return console.log(data);
    console.log("Files with dup permissions:", reduced.length);
    reduced.forEach(async (f) => {
        await drive.permissions.delete({
            auth: await authorize(keys["cloud-drive-72-svcaccnt-0"]),
            permissionId: "11603101081067292186",
            fileId: f.id,
        });
    });
}

main();
