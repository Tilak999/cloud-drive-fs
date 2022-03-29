const api = require("googleapis");
const drive = api.google.drive("v3");
const keys = require("../masterKey.json").serviceAccounts;

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
    for (const key of Object.keys(keys)) {
        const { data } = await drive.files.list({
            auth: await authorize(keys[key]),
            fields: "*",
        });
        data.files.map(async (f) => {
            let auth = await authorize(keys[key]);
            if (f.description && f.description != "") {
                auth = await authorize(keys[f.description]);
            }
            await drive.files.delete({
                auth,
                fileId: f.id,
            });
        });
    }
}

main();
