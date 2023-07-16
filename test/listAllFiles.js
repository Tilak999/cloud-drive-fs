const GdriveFS = require("../build/GdriveFS").default;
const googleapis = require("googleapis");
const drive = googleapis.google.drive("v3");

async function getall(gfs, folderId="root", parents="") {
    const params = {
        auth: await gfs.authorize(),
        fields: '*',
        q: `'${folderId}' in parents`,
        orderBy: `folder, name, modifiedTime`,
        pageSize: 1000
    }
    const { data } = await drive.files.list(params);
    if(data && data.files.length > 0) {
        for(let i =0 ; i < data.files.length; i++) {
            const file = data.files[i]
            if(!file.mimeType.endsWith("folder")) {
                const json = JSON.parse(file.description)
                const output = [file.mimeType, parents, file.name, file.id, json.description]
                console.log(output.join("|"))
            } else {
                await getall(gfs, file.id, parents + "/" + file.name)
            }
        }
    }
}

getall(
    new GdriveFS({
        key: require("../masterKey.json"),
    })
);