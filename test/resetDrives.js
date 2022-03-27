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
    const { data } = await drive.files.list({
        auth: await authorize(keys["cloud-drive-72-svcaccnt-96"]),
        fields: "*",
    });
    console.log(data.files.length);
    /*data.files.map((f) => {
        console.log(f.name, f.id, f.owners);
    });
    data.files.map(async (f) => {
        await drive.files
            .delete({
                auth: await authorize(keys["cloud-drive-72-svcaccnt-97"]),
                fileId: f.id,
            })
            .catch(console.error);
    });*/
}

main();
