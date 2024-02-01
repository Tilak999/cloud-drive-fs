const GdriveFS = require("../build/GdriveFS").default;

export async function deleteFile(id) {
    const fs = new GdriveFS({
        key: require("../masterKey.json"),
        debug: true,
    })
    fs.delete(id).then(console.log);
}

if (process.argv[2]) {
    deleteFile(process.argv[2])
} else {
    console.log("pass file id as argument")
}
